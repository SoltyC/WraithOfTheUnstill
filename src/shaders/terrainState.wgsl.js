// Terrain state compute (BRIEF §4.3). See src/terrain/state/layout.js for the addressing.
// Every pass reads its jobs from one params buffer written once per frame (dispatches recorded
// in a frame all see the last write, so per-dispatch params would collide); workgroup_id.z picks
// the job.

import { FINE_N, RATIO, PAGE_N, PAGES, WORLD_HALF, COARSE_PER_M, FINE_PER_M, NO_SLOT, TRANSFORM } from '../terrain/state/layout.js';
import { DECAY, MATERIAL_COUNT } from '../terrain/state/healing.js';

export const MAX_BRUSHES = 48;
// StateParams layout (u32 words; floats bitcast): see terrainState.js writeParams().
export const MAX_IN = 4;
export const PARAM_WORDS = 4 + 8 + MAX_IN * 4 + 4 + 4 + 4 + 4 + MAX_BRUSHES * 4 * 4;
/** Brush programs (terrainState.stamp: field bk). */
export const BRUSH = { PRESS: 0, PLOUGH: 1, SCORE: 2, FREEZE: 3, WET: 4 };

const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

export const STATE_COMMON_WGSL = /* wgsl */ `
const FINE_N: u32 = ${FINE_N}u;
const RATIO: i32 = ${RATIO};
const PAGE_N: u32 = ${PAGE_N}u;
const PAGES: u32 = ${PAGES}u;
const COARSE_OFF: i32 = ${WORLD_HALF * COARSE_PER_M};
const FINE_PER_M: f32 = ${f(FINE_PER_M)};
const NO_SLOT: u32 = ${NO_SLOT}u;

struct StateParams {
  origin: vec4i,                    // fine window origin (world fine texels) i, j
  outRects: array<vec4i,2>,         // coarse texel rects [c0, d0, c1, d1)
  inRects: array<vec4i,${MAX_IN}>,          // fine texel rects
  healRect: vec4i,                  // fine texel band healed this frame
  healDt: vec4f,                    // x = fine band dt (s), y = coarse slot dt (s)
  healSlot: vec4i,                  // x = slot (−1 none), y/z = page origin (world coarse texels)
  counts: vec4u,                    // out rects, in rects, brushes
  brushes: array<vec4f,${MAX_BRUSHES}>,     // centre x, z (m), half length (m), depth (m)
  brushDirs: array<vec4f,${MAX_BRUSHES}>,   // direction x, z (unit), half width (m), compaction
  brushRects: array<vec4i,${MAX_BRUSHES}>,  // fine texel bbox
  brushEx: array<vec4f,${MAX_BRUSHES}>,     // program (BRUSH), wetness, side bias (−1..1), berm scale
  pageTable: array<u32>,            // slot per page key (NO_SLOT = none), after the fixed part
};

fn wrapN(v: i32) -> u32 { let n = i32(FINE_N); return u32(((v % n) + n) % n); }
fn fineIdx(i: i32, j: i32) -> u32 { return wrapN(j) * FINE_N + wrapN(i); }

// Channels (layout.js): h = depression, displaced | s = compaction, wetness, frozen, transform |
// m = molten, flatten, spare, spare.
struct Texel { h: vec2f, s: vec4f, m: vec4f };
fn unpackTexel(w0: u32, w1: u32, w2: u32) -> Texel {
  var t: Texel;
  t.h = unpack2x16float(w0);
  t.s = unpack4x8unorm(w1);
  t.m = unpack4x8unorm(w2);
  return t;
}
fn zeroTexel() -> Texel { var t: Texel; t.h = vec2f(0.0); t.s = vec4f(0.0); t.m = vec4f(0.0); return t; }
// Unbiased (dithered) 8-bit packing for healing: a decaying value never sticks one step above
// rest. The transform id is exact (its dither stays inside ±½ step).
fn packDither(v: vec4f, n: f32) -> u32 { return pack4x8unorm(clamp(v + (n - 0.5) / 255.0, vec4f(0.0), vec4f(1.0))); }
fn ditherHash(i: i32, j: i32, seed: f32) -> f32 {
  return fract(sin(f32(i) * 12.9898 + f32(j) * 78.233 + seed * 37.719) * 43758.5453);
}
`;

const DECAY_WGSL = `const DECAY = array<f32, ${MATERIAL_COUNT * 6}>(${Array.from(DECAY, (v) => v.toExponential(6)).join(', ')});`;

// Healing toward rest for one texel; m = bake material id.
const HEAL_FN = /* wgsl */ `
${DECAY_WGSL}
fn healTexel(t: Texel, m: u32, dt: f32) -> Texel {
  let o = min(m, ${MATERIAL_COUNT - 1}u) * 6u;
  var r = t;
  r.h = t.h * exp(-vec2f(DECAY[o], DECAY[o + 1u]) * dt);
  // Compaction, wetness, frozen heal; the transform id never does.
  r.s = vec4f(t.s.xyz * exp(-vec3f(DECAY[o + 2u], DECAY[o + 3u], DECAY[o + 4u]) * dt), t.s.w);
  r.m = vec4f(t.m.x * exp(-DECAY[o + 4u] * dt), t.m.y * exp(-DECAY[o + 5u] * dt), 0.0, 0.0);
  return r;
}
// Bake surface material at world (x, z): surface.rgba8 (4 m texels, row 0 = north), byte 0.
fn materialAt(x: f32, z: f32) -> u32 {
  let col = u32(clamp((x + ${f(WORLD_HALF)}) * 0.25, 0.0, 2047.0));
  let row = u32(clamp((${f(WORLD_HALF)} - z) * 0.25, 0.0, 2047.0));
  return surface[row * 2048u + col] & 0xffu;
}
`;

// Storage bindings by name: access and type. Each pass lists the ones it uses, in binding order.
const BIND = {
  fine0: 'read_write', fine1: 'read_write', fine2: 'read_write',
  atlas0: 'read_write', atlas1: 'read_write', atlas2: 'read_write',
  surface: 'read', sp: 'read',
};
const TYPE = { sp: 'StateParams' };
const decl = (names, access = {}) => names.map((n, i) =>
  `@group(0) @binding(${i}) var<storage, ${access[n] || BIND[n]}> ${n}: ${TYPE[n] || 'array<u32>'};`).join('\n');

const COARSE_IDX_WGSL = /* wgsl */ `
// Slot plane index of world coarse texel (c, d), or 0xffffffff when its page has no slot.
fn coarseIdx(c: i32, d: i32) -> u32 {
  let gc = c + COARSE_OFF; let gd = d + COARSE_OFF;
  if (gc < 0 || gd < 0 || gc >= i32(PAGES * PAGE_N) || gd >= i32(PAGES * PAGE_N)) { return 0xffffffffu; }
  let key = (u32(gd) / PAGE_N) * PAGES + u32(gc) / PAGE_N;
  let slot = sp.pageTable[key];
  if (slot == NO_SLOT) { return 0xffffffffu; }
  return (slot * PAGE_N + (u32(gd) % PAGE_N)) * PAGE_N + (u32(gc) % PAGE_N);
}
`;

export const SCROLL_OUT_BINDINGS = ['fine0', 'fine1', 'fine2', 'atlas0', 'atlas1', 'atlas2', 'sp'];
export const SCROLL_IN_BINDINGS = SCROLL_OUT_BINDINGS;
export const BRUSH_BINDINGS = ['fine0', 'fine1', 'fine2', 'sp'];
export const HEAL_FINE_BINDINGS = ['fine0', 'fine1', 'fine2', 'surface', 'sp'];
export const HEAL_COARSE_BINDINGS = ['atlas0', 'atlas1', 'atlas2', 'surface', 'sp'];
const RO_FINE = { fine0: 'read', fine1: 'read', fine2: 'read' };
const RO_ATLAS = { atlas0: 'read', atlas1: 'read', atlas2: 'read' };

/** Outgoing strips: 12×12 fine texels → one coarse texel of the page under them. */
export const stateScrollOutWGSL = /* wgsl */ `
${STATE_COMMON_WGSL}
${decl(SCROLL_OUT_BINDINGS, RO_FINE)}
${COARSE_IDX_WGSL}
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) g: vec3u, @builtin(workgroup_id) wg: vec3u) {
  let job = wg.z;
  if (job >= sp.counts.x) { return; }
  let r = sp.outRects[job];
  let c = r.x + i32(g.x); let d = r.y + i32(g.y);
  if (c >= r.z || d >= r.w) { return; }
  let ci = coarseIdx(c, d);
  if (ci == 0xffffffffu) { return; }
  var h = vec2f(0.0); var sv = vec4f(0.0); var mv = vec4f(0.0); var transform = 0.0;
  for (var y = 0; y < RATIO; y++) {
    for (var x = 0; x < RATIO; x++) {
      let k = fineIdx(c * RATIO + x, d * RATIO + y);
      let t = unpackTexel(fine0[k], fine1[k], fine2[k]);
      h += t.h; sv += t.s; mv += t.m; transform = max(transform, t.s.w);
    }
  }
  let n = 1.0 / f32(RATIO * RATIO);
  h *= n; sv *= n; mv *= n; sv.w = transform;
  atlas0[ci] = pack2x16float(h);
  atlas1[ci] = pack4x8unorm(sv);
  atlas2[ci] = pack4x8unorm(mv);
}
`;

/** Incoming strips: fine texels take the bilinear coarse record (or rest state). */
export const stateScrollInWGSL = /* wgsl */ `
${STATE_COMMON_WGSL}
${decl(SCROLL_IN_BINDINGS, RO_ATLAS)}
${COARSE_IDX_WGSL}
fn coarseTexel(c: i32, d: i32) -> Texel {
  let k = coarseIdx(c, d);
  if (k == 0xffffffffu) { return zeroTexel(); }
  return unpackTexel(atlas0[k], atlas1[k], atlas2[k]);
}
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) g: vec3u, @builtin(workgroup_id) wg: vec3u) {
  let job = wg.z;
  if (job >= sp.counts.y) { return; }
  let r = sp.inRects[job];
  let i = r.x + i32(g.x); let j = r.y + i32(g.y);
  if (i >= r.z || j >= r.w) { return; }
  // Fine texel centre in coarse texel units, then the four surrounding coarse centres.
  let u = (vec2f(f32(i), f32(j)) + 0.5) / f32(RATIO) - 0.5;
  let c0 = vec2i(floor(u)); let fr = u - floor(u);
  let t00 = coarseTexel(c0.x, c0.y); let t10 = coarseTexel(c0.x + 1, c0.y);
  let t01 = coarseTexel(c0.x, c0.y + 1); let t11 = coarseTexel(c0.x + 1, c0.y + 1);
  let h = mix(mix(t00.h, t10.h, fr.x), mix(t01.h, t11.h, fr.x), fr.y);
  var sv = mix(mix(t00.s, t10.s, fr.x), mix(t01.s, t11.s, fr.x), fr.y);
  let mv = mix(mix(t00.m, t10.m, fr.x), mix(t01.m, t11.m, fr.x), fr.y);
  // Transform ids do not interpolate: nearest.
  sv.w = select(select(t00.s.w, t10.s.w, fr.x >= 0.5), select(t01.s.w, t11.s.w, fr.x >= 0.5), fr.y >= 0.5);
  let k = fineIdx(i, j);
  fine0[k] = pack2x16float(h);
  fine1[k] = pack4x8unorm(sv);
  fine2[k] = pack4x8unorm(mv);
}
`;

/**
 * Brush writer: a swept capsule (segment ± half length along dir, radius = half width). Inside it
 * the surface is pressed down with a near-flat floor; the displaced mass rises as a berm just
 * outside the edge (≈45 % of the depth, so volume roughly balances), and any berm already where
 * the new depression lands is flattened. Footprints are short capsules; Phase 4 grooves are long.
 */
export const stateBrushWGSL = /* wgsl */ `
${STATE_COMMON_WGSL}
${decl(BRUSH_BINDINGS)}
fn cellHash(p: vec2f, size: f32) -> f32 {
  let cell = vec2i(floor(p / size));
  return fract(sin(f32(cell.x) * 12.9898 + f32(cell.y) * 78.233) * 43758.5453);
}
// Smooth value noise (interpolated cell hashes): clumps without height steps (a stepped hash
// over a wide berm lit as zig-zag stripes).
fn smoothHash(p: vec2f, size: f32) -> f32 {
  let u = p / size; let i = floor(u); let f = u - i; let w = f * f * (3.0 - 2.0 * f);
  let h = vec4f(cellHash(i * size, size), cellHash((i + vec2f(1.0, 0.0)) * size, size),
                cellHash((i + vec2f(0.0, 1.0)) * size, size), cellHash((i + vec2f(1.0, 1.0)) * size, size));
  return mix(mix(h.x, h.y, w.x), mix(h.z, h.w, w.x), w.y);
}
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) g: vec3u, @builtin(workgroup_id) wg: vec3u) {
  let job = wg.z;
  if (job >= sp.counts.z) { return; }
  let r = sp.brushRects[job];
  let i = r.x + i32(g.x); let j = r.y + i32(g.y);
  if (i >= r.z || j >= r.w) { return; }
  let br = sp.brushes[job]; let bd = sp.brushDirs[job]; let ex = sp.brushEx[job];
  let p = (vec2f(f32(i), f32(j)) + 0.5) / FINE_PER_M;
  // Distance to the segment, in half widths; side: +1 right of the direction, −1 left.
  let rel = p - br.xy;
  let along = clamp(dot(rel, bd.xy), -br.z, br.z);
  let d = length(rel - bd.xy * along) / bd.z;
  if (d >= 1.9) { return; }
  let side = select(-1.0, 1.0, rel.x * bd.y - rel.y * bd.x > 0.0);
  let k = fineIdx(i, j);
  var t = unpackTexel(fine0[k], fine1[k], fine2[k]);
  let program = u32(ex.x + 0.5);
  let hsh = cellHash(p, 0.03);
  if (program == ${BRUSH.PRESS}u) {
    // Footprint: a near-flat floor; the displaced mass rises as a granular berm (≈45 % of the
    // depth, so volume roughly balances) and any berm where the print lands is flattened.
    let inner = 1.0 - smoothstep(0.55, 1.0, d);
    let rim = smoothstep(0.8, 1.12, d) * (1.0 - smoothstep(1.12, 1.9, d));
    t.h.x = max(t.h.x, br.w * inner);
    t.h.y = max(t.h.y * (1.0 - inner), br.w * 0.45 * rim * (0.75 + 0.5 * hsh));
    t.s.x = max(t.s.x, bd.w * inner);
    t.m.y = max(t.m.y, inner);                       // crushes vegetation
  } else if (program == ${BRUSH.PLOUGH}u) {
    // Groove: a rounded U channel ploughed through the surface; the mass is thrown into high,
    // clumpy berms either side, heavier on the outside (bias) — Sweep's channel, the surf wake.
    let inner = clamp(1.0 - d * d, 0.0, 1.0);
    let floorK = pow(inner, 0.45);
    let rim = smoothstep(0.82, 1.08, d) * (1.0 - smoothstep(1.08, 1.65, d));
    let bias = clamp(1.0 + ex.z * side, 0.15, 1.85);
    let clump = 0.72 + 0.4 * smoothHash(p, 0.11) + 0.18 * smoothHash(p + vec2f(3.7, 1.3), 0.045);
    t.h.x = max(t.h.x, br.w * floorK);
    // The groove's interior is ploughed clean: any berm there (the rounded front of the previous
    // frame's stamp throws one into the path ahead) is cleared, or a ghost ridge would remain at
    // every stamp boundary.
    let cleared = select(t.h.y * (1.0 - floorK), 0.0, d < 0.85);
    t.h.y = max(cleared, br.w * ex.w * rim * bias * clump);
    t.s.x = max(t.s.x, bd.w * floorK);
    t.s.y = max(t.s.y, ex.y * (1.0 - smoothstep(0.6, 1.3, d)));
  } else if (program == ${BRUSH.SCORE}u) {
    // A thin scored line (Ribbon): shallow, wet, with a hairline lip.
    let inner = 1.0 - smoothstep(0.25, 1.0, d);
    let lip = smoothstep(0.9, 1.15, d) * (1.0 - smoothstep(1.15, 1.6, d));
    t.h.x = max(t.h.x, br.w * inner);
    t.h.y = max(t.h.y * (1.0 - inner), br.w * 0.3 * lip);
    t.s.x = max(t.s.x, bd.w * inner);
    t.s.y = max(t.s.y, ex.y * (1.0 - smoothstep(0.4, 1.7, d)));
  } else if (program == ${BRUSH.FREEZE}u) {
    // Crystallize: the surface turns to glossy ice for good (transform), with a ragged edge;
    // wetness freezes out.
    let edge = 1.0 - smoothstep(0.6 + 0.3 * hsh, 1.0, d);
    t.s.z = max(t.s.z, edge);
    t.s.y = t.s.y * (1.0 - edge);
    if (edge > 0.5) { t.s.w = ${TRANSFORM.ICE}.0 / 255.0; }
    t.h.x = max(t.h.x, br.w * edge);
  } else {
    // Wet (spray, meltwater).
    t.s.y = max(t.s.y, ex.y * (1.0 - smoothstep(0.3, 1.0, d)));
  }
  fine0[k] = pack2x16float(t.h);
  fine1[k] = pack4x8unorm(t.s);
  fine2[k] = pack4x8unorm(t.m);
}
`;

/** Fine-window healing over one band per frame (decay toward rest at bake-material rates). */
export const stateHealFineWGSL = /* wgsl */ `
${STATE_COMMON_WGSL}
${decl(HEAL_FINE_BINDINGS)}
${HEAL_FN}
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) g: vec3u) {
  let r = sp.healRect;
  let i = r.x + i32(g.x); let j = r.y + i32(g.y);
  if (i >= r.z || j >= r.w || sp.healDt.x <= 0.0) { return; }
  let k = fineIdx(i, j);
  let w0 = fine0[k]; let w1 = fine1[k]; let w2 = fine2[k];
  if (w0 == 0u && w1 == 0u && w2 == 0u) { return; } // rest state: nothing to heal
  let m = materialAt((f32(i) + 0.5) / FINE_PER_M, (f32(j) + 0.5) / FINE_PER_M);
  let t = healTexel(unpackTexel(w0, w1, w2), m, sp.healDt.x);
  let n = ditherHash(i, j, sp.healDt.x);
  fine0[k] = pack2x16float(t.h);
  fine1[k] = packDither(t.s, n);
  fine2[k] = packDither(t.m, n);
}
`;

/** Coarse healing: one resident page per frame, for the time since it was last healed. */
export const stateHealCoarseWGSL = /* wgsl */ `
${STATE_COMMON_WGSL}
${decl(HEAL_COARSE_BINDINGS)}
${HEAL_FN}
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) g: vec3u) {
  let s = sp.healSlot;
  if (s.x < 0 || g.x >= PAGE_N || g.y >= PAGE_N) { return; }
  let k = (u32(s.x) * PAGE_N + g.y) * PAGE_N + g.x;
  let w0 = atlas0[k]; let w1 = atlas1[k]; let w2 = atlas2[k];
  if (w0 == 0u && w1 == 0u && w2 == 0u) { return; }
  let m = materialAt((f32(s.y + i32(g.x)) + 0.5) * 0.25, (f32(s.z + i32(g.y)) + 0.5) * 0.25);
  let t = healTexel(unpackTexel(w0, w1, w2), m, sp.healDt.y);
  let n = ditherHash(i32(g.x), i32(g.y), sp.healDt.y + f32(s.x));
  atlas0[k] = pack2x16float(t.h);
  atlas1[k] = packDither(t.s, n);
  atlas2[k] = packDither(t.m, n);
}
`;

export const STATE_SAMPLE_BUFFERS = ['stateFine0', 'stateAtlas0', 'stateParams'];

/**
 * Material-side reads (clipmap vertex and fragment). stateParams is the state params buffer seen
 * as words: [0], [1] = fine window origin (i, j); the page table follows the fixed part.
 */
export const STATE_SAMPLE_WGSL = /* wgsl */ `
var<storage, read> stateFine0: array<u32>;
var<storage, read> stateAtlas0: array<u32>;
var<storage, read> stateParams: array<u32>;

// Raw (depression, displaced mass) of fine texel (i, j), or of the coarse texel under it outside
// the window (rest outside claimed pages and outside the bake).
fn stateFineTexel(i: i32, j: i32) -> vec2f {
  let ox = bitcast<i32>(stateParams[0]); let oz = bitcast<i32>(stateParams[1]);
  if (i >= ox && j >= oz && i < ox + ${FINE_N} && j < oz + ${FINE_N}) {
    let n = ${FINE_N};
    return unpack2x16float(stateFine0[u32(((j % n) + n) % n) * ${FINE_N}u + u32(((i % n) + n) % n)]);
  }
  return stateCoarseTexel(i32(floor(f32(i) / ${RATIO}.0)), i32(floor(f32(j) / ${RATIO}.0)));
}
fn stateCoarseTexel(c: i32, d: i32) -> vec2f {
  let gc = c + ${WORLD_HALF * COARSE_PER_M}; let gd = d + ${WORLD_HALF * COARSE_PER_M};
  if (gc < 0 || gd < 0 || gc >= ${PAGES * PAGE_N} || gd >= ${PAGES * PAGE_N}) { return vec2f(0.0); }
  let slot = stateParams[${PARAM_WORDS}u + (u32(gd) / ${PAGE_N}u) * ${PAGES}u + u32(gc) / ${PAGE_N}u];
  if (slot == ${NO_SLOT}u) { return vec2f(0.0); }
  return unpack2x16float(stateAtlas0[(slot * ${PAGE_N}u + u32(gd) % ${PAGE_N}u) * ${PAGE_N}u + u32(gc) % ${PAGE_N}u]);
}
fn stateInWindow(x: f32, z: f32) -> bool {
  let i = i32(floor(x * ${f(FINE_PER_M)})); let j = i32(floor(z * ${f(FINE_PER_M)}));
  let ox = bitcast<i32>(stateParams[0]); let oz = bitcast<i32>(stateParams[1]);
  return i >= ox + 1 && j >= oz + 1 && i < ox + ${FINE_N - 1} && j < oz + ${FINE_N - 1};
}
// Bilinear (depression, displaced) at world (x, z): fine texels in the window, coarse outside.
fn stateHeights(x: f32, z: f32) -> vec2f {
  if (stateInWindow(x, z)) {
    let u = vec2f(x, z) * ${f(FINE_PER_M)} - 0.5;
    let b = vec2i(floor(u)); let t = u - floor(u);
    return mix(mix(stateFineTexel(b.x, b.y), stateFineTexel(b.x + 1, b.y), t.x),
               mix(stateFineTexel(b.x, b.y + 1), stateFineTexel(b.x + 1, b.y + 1), t.x), t.y);
  }
  let u = vec2f(x, z) * ${f(COARSE_PER_M)} - 0.5;
  let b = vec2i(floor(u)); let t = u - floor(u);
  return mix(mix(stateCoarseTexel(b.x, b.y), stateCoarseTexel(b.x + 1, b.y), t.x),
             mix(stateCoarseTexel(b.x, b.y + 1), stateCoarseTexel(b.x + 1, b.y + 1), t.x), t.y);
}
// Surface offset from the state: displaced mass up, depression down (metres).
fn stateOffset(x: f32, z: f32) -> f32 { let h = stateHeights(x, z); return h.y - h.x; }
// Texel size (m) of the state at (x, z): 1/48 m inside the fine window, 0.25 m outside.
fn stateTexel(x: f32, z: f32) -> f32 { return select(${1 / COARSE_PER_M}, ${1 / FINE_PER_M}, stateInWindow(x, z)); }
`;

/** Fragment-only: the surface channels inside the fine window (word 1); rest outside. */
export const STATE_COMPACTION_BUFFERS = ['stateFine1'];
export const STATE_COMPACTION_WGSL = /* wgsl */ `
var<storage, read> stateFine1: array<u32>;
// (compaction, wetness, frozen, transform id) at world (x, z), nearest fine texel.
fn stateSurface(x: f32, z: f32) -> vec4f {
  if (!stateInWindow(x, z)) { return vec4f(0.0); }
  let i = i32(floor(x * ${f(FINE_PER_M)})); let j = i32(floor(z * ${f(FINE_PER_M)}));
  let n = ${FINE_N};
  let v = unpack4x8unorm(stateFine1[u32(((j % n) + n) % n) * ${FINE_N}u + u32(((i % n) + n) % n)]);
  return vec4f(v.xyz, floor(v.w * 255.0 + 0.5));
}
fn stateCompaction(x: f32, z: f32) -> f32 { return stateSurface(x, z).x; }
`;
