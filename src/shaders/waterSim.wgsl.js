// The ripple simulation (Phase 10 F1): a wave-equation height field over a 102 m square that
// follows the Wraith, written by its body, splashes and (later) spells, Shaped and the Warden, and
// settling back to a mirror. Toroidal storage: world cell w lives at index w mod N, so moving the
// window copies nothing; cells that enter it start flat (the edges are a sponge, so what wraps
// round is already near zero). Two buffers alternate as current and previous height (Verlet):
// each frame runs two steps, A→B then B→A, so A always holds the newest state for the water
// shaders: (h, dh/dx, dh/dz of the step before, −) per cell. Land and the shallowest margin hold
// the surface at rest: waves reflect off banks and die in the reeds' few centimetres of water.

import { CLIPMAP_N, CLIPMAP_LEVELS } from '../terrain/clipmapLayout.js';

/** Cells across (power of two) and their size (m): ±51.2 m around the Wraith. */
export const WSIM_N = 512;
export const WSIM_DX = 0.2;
/** Discrete impulses per frame (x, z, radius, depth m). */
export const WSIM_SPLATS = 24;
/** Job header vec4s before the splats. */
export const WSIM_HEAD = 4;

/** Sampling for any water shader (needs `waterSim: array<vec4f>` and `waterRipples`, whose slot
 *  WATER_RIPPLES holds the window: min cell x, z, on, −). */
export const WSIM_SAMPLE_WGSL = (infoSlot) => /* wgsl */ `
const WSIM_N: i32 = ${WSIM_N};
const WSIM_DX: f32 = ${WSIM_DX};
fn wsimIndex(c: vec2i) -> u32 { let m = ((c % WSIM_N) + WSIM_N) % WSIM_N; return u32(m.y * WSIM_N + m.x); }
/** Slope (dh/dx, dh/dz), height and weight (0 outside the window) of the simulated ripples at p. */
fn waterSimSample(p: vec2f) -> vec4f {
  let I = waterRipples[${infoSlot}u];
  if (I.z < 0.5) { return vec4f(0.0); }
  let g = p / WSIM_DX - 0.5;
  let hn = f32(WSIM_N) * 0.5;
  let e = max(abs(g.x - I.x - hn), abs(g.y - I.y - hn)) / hn;
  if (e > 0.96) { return vec4f(0.0); }
  let b = floor(g); let f = g - b; let c = vec2i(b);
  let s00 = waterSim[wsimIndex(c)]; let s10 = waterSim[wsimIndex(c + vec2i(1, 0))];
  let s01 = waterSim[wsimIndex(c + vec2i(0, 1))]; let s11 = waterSim[wsimIndex(c + vec2i(1, 1))];
  let s = mix(mix(s00, s10, f.x), mix(s01, s11, f.x), f.y);
  let w = 1.0 - smoothstep(0.8, 0.96, e);
  return vec4f(s.yz * w, s.x * w, w);
}
`;

const GROUND = /* wgsl */ `
const CV: u32 = ${CLIPMAP_N + 1}u;
const CHALF: f32 = ${CLIPMAP_N / 2}.0;
fn simGround(x: f32, z: f32) -> f32 {
  for (var l = 0u; l < ${CLIPMAP_LEVELS}u; l++) {
    let L = cp[l];
    let g = (vec2f(x, z) - L.xy) / L.z + CHALF;
    if (g.x >= 1.0 && g.y >= 1.0 && g.x < 2.0 * CHALF - 1.0 && g.y < 2.0 * CHALF - 1.0) {
      let b = floor(g); let t = g - b; let i = u32(b.x); let j = u32(b.y);
      return mix(mix(levelData[(l * CV + j) * CV + i].x, levelData[(l * CV + j) * CV + i + 1u].x, t.x),
                 mix(levelData[(l * CV + j + 1u) * CV + i].x, levelData[(l * CV + j + 1u) * CV + i + 1u].x, t.x), t.y);
    }
  }
  return 1e4;
}
fn simLevel(x: f32, z: f32) -> f32 {
  return textureLoad(waterTex, vec2i(i32(clamp((x + 4096.0) / 4.0, 0.0, 2047.0)), i32(clamp((4096.0 - z) / 4.0, 0.0, 2047.0))), 0).r;
}
`;

/**
 * One step. `first`: the frame's first step (A→B): it clears cells that entered the window and
 * takes the splats; the body source is applied in both, along its path over the frame.
 * Job: [0] window min cell x, z, previous min x, z; [1] k = (c·dt/dx)², keep (damping per step),
 * dt, splat count; [2] body path x0, z0, x1, z1; [3] body radius, rate (m/s of depression), interior (1), −;
 * then splats (x, z, radius, depth).
 */
export const waterSimStepWGSL = (first) => /* wgsl */ `
@group(0) @binding(0) var<storage, read> job: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> ${first ? 'cur' : 'prev'}: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> ${first ? 'prev' : 'cur'}: array<vec4f>;
@group(0) @binding(3) var<storage, read> levelData: array<vec4f>;
@group(0) @binding(4) var<storage, read> cp: array<vec4f>;
@group(0) @binding(5) var waterTex: texture_2d<f32>;
const N: i32 = ${WSIM_N};
const DX: f32 = ${WSIM_DX};
fn wrap(v: i32) -> i32 { return ((v % N) + N) % N; }
fn at(sx: i32, sy: i32) -> u32 { return u32(wrap(sy) * N + wrap(sx)); }
${GROUND}
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let s = vec2i(gid.xy);
  if (s.x >= N || s.y >= N) { return; }
  let J0 = job[0]; let J1 = job[1];
  let o = vec2i(J0.xy);
  let w = o + vec2i(wrap(s.x - o.x), wrap(s.y - o.y));          // the world cell stored here
  let i = u32(s.y * N + s.x);
  ${first ? `
  let po = vec2i(J0.zw);
  if (any(w < po) || any(w >= po + vec2i(N))) { prev[i] = vec4f(0.0); cur[i] = vec4f(0.0); return; }` : ''}
  let p = (vec2f(w) + 0.5) * DX;
  let h = cur[i].x;
  let hl = cur[at(s.x - 1, s.y)].x; let hr = cur[at(s.x + 1, s.y)].x;
  let hd = cur[at(s.x, s.y - 1)].x; let hu = cur[at(s.x, s.y + 1)].x;
  let slope = vec2f(hr - hl, hu - hd) / (2.0 * DX);
  // Water here? The level map (4 m) and the drawn ground (the clipmap): land and the last few
  // centimetres hold still.
  // (In a sealed interior — job[3].z — there is no level map or terrain: its water is taken as deep throughout.)
  let depth = select(simLevel(p.x, p.y) - simGround(p.x, p.y), 4.0, job[3].z > 0.5);
  let wet = smoothstep(0.02, 0.12, depth);
  // The window's edge is a sponge.
  let e = max(abs(f32(w.x - o.x) - f32(N) * 0.5), abs(f32(w.y - o.y) - f32(N) * 0.5)) / (f32(N) * 0.5);
  let sponge = 1.0 - 0.25 * smoothstep(0.82, 0.98, e);
  // Very shallow water drags the motion out of it.
  let shallow = mix(0.92, 1.0, smoothstep(0.12, 0.45, depth));
  let keep = J1.y * sponge * shallow;
  var hn = h + (h - prev[i].x) * keep + J1.x * (hl + hr + hd + hu - 4.0 * h);
  hn *= 1.0 - 0.35 * J1.z;                                     // the mean level settles back (a body's sink)
  // The body pushing through: a moving soft depression along its path over this step.
  let B = job[2]; let Bq = job[3];
  if (Bq.y > 0.0) {
    let t = select(1.0, 0.5, ${first ? 'true' : 'false'});
    let bp = mix(B.xy, B.zw, t);
    let d = p - bp;
    hn -= Bq.y * J1.z * exp(-dot(d, d) / (Bq.x * Bq.x));
  }
  ${first ? `
  let n = u32(J1.w);
  for (var k = 0u; k < n; k++) {
    let S = job[${WSIM_HEAD}u + k];
    let d = p - S.xy;
    hn -= S.w * exp(-dot(d, d) / (S.z * S.z));
  }` : ''}
  hn = clamp(hn * wet, -0.5, 0.5);
  prev[i] = vec4f(hn, slope, 0.0);
}
`;
