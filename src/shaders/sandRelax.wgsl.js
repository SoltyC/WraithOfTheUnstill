// Bounded D2 talus diffusion. Ping-pong snapshots prevent neighbour write races; every
// undirected interior edge has exactly equal/opposite flux. No flux crosses the tile boundary.
import { DRY_REPOSE, WET_REPOSE, RELAX_RATE, RELAX_TILE } from '../terrain/state/relaxation.js';
import { FINE_N, FINE_PER_M, WORLD_HALF } from '../terrain/state/layout.js';
import { CLIPMAP_N, CLIPMAP_LEVELS } from '../terrain/clipmapLayout.js';
const V = CLIPMAP_N + 1;
const common = /* wgsl */ `
struct Job { tile: vec2i, origin: vec2i, enabled: u32, pad0: u32, pad1: u32, pad2: u32 };
@group(0) @binding(0) var<storage, read_write> fine0: array<u32>;
@group(0) @binding(1) var<storage, read> fine1: array<u32>;
@group(0) @binding(2) var<storage, read> surface: array<u32>;
@group(0) @binding(3) var<storage, read> job: Job;
@group(0) @binding(4) var<storage, read_write> a: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> b: array<vec4f>;
@group(0) @binding(6) var<storage, read> levels: array<vec4f>;
@group(0) @binding(7) var<storage, read> cp: array<vec4f>;
@group(0) @binding(8) var<storage, read_write> fine2: array<u32>;
const N = ${RELAX_TILE}u;
fn key(p: vec2i) -> u32 {
  let q = ((p % ${FINE_N}) + ${FINE_N}) % ${FINE_N};
  return u32(q.y * ${FINE_N} + q.x);
}
fn baseHeight(p: vec2f) -> f32 {
  for (var l = 0u; l < ${CLIPMAP_LEVELS}u; l++) {
    let s = cp[l].z;
    if (s <= 0.0) { continue; }
    let uv = (p - cp[l].xy) / s + vec2f(${CLIPMAP_N / 2}.0);
    if (any(uv < vec2f(0.0)) || any(uv >= vec2f(${CLIPMAP_N}.0))) { continue; }
    let cell = vec2u(floor(uv)); let f = fract(uv);
    let k = (l * ${V}u + cell.y) * ${V}u + cell.x;
    return mix(mix(levels[k].x, levels[k + 1u].x, f.x), mix(levels[k + ${V}u].x, levels[k + ${V + 1}u].x, f.x), f.y);
  }
  return 0.0;
}
`;
export const sandRelaxLoadWGSL = /* wgsl */ `${common}
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (job.enabled == 0u || id.x >= N || id.y >= N) { return; }
  let p = job.tile + vec2i(id.xy); let k = key(p);
  let h = unpack2x16float(fine0[k]); let state = unpack4x8unorm(fine1[k]);
  let wp = (vec2f(p) + vec2f(0.5)) / ${FINE_PER_M}.0;
  let col = u32(clamp((wp.x + ${WORLD_HALF}.0) * 0.25, 0.0, 2047.0));
  let row = u32(clamp((${WORLD_HALF}.0 - wp.y) * 0.25, 0.0, 2047.0));
  let mat = surface[row * 2048u + col] & 255u;
  let movable = (mat == 1u || mat == 6u) && state.z == 0.0 && state.w == 0.0;
  a[id.y * N + id.x] = vec4f(h.y - h.x + unpack2x16float(fine2[k]).y, baseHeight(wp), state.y, select(0.0, 1.0, movable));
}
`;
const step = (src, dst) => /* wgsl */ `${common}
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (job.enabled == 0u || id.x >= N || id.y >= N) { return; }
  let i = id.y * N + id.x; let p = vec2i(id.xy); let v = ${src}[i];
  var delta = 0.0;
  if (v.w > 0.5) {
    for (var z = -1; z <= 1; z++) { for (var x = -1; x <= 1; x++) {
      if (x == 0 && z == 0) { continue; }
      let q = p + vec2i(x,z);
      if (any(q < vec2i(0)) || any(q >= vec2i(i32(N)))) { continue; }
      let other = ${src}[u32(q.y) * N + u32(q.x)];
      if (other.w < 0.5) { continue; }
      let repose = mix(${DRY_REPOSE}, ${WET_REPOSE}, max(v.z, other.z));
      let limit = repose * length(vec2f(f32(x),f32(z))) / ${FINE_PER_M}.0;
      let dh = (v.x - other.x) + (v.y - other.y);
      delta -= sign(dh) * max(0.0, abs(dh) - limit) * ${RELAX_RATE};
    } }
  }
  ${dst}[i] = vec4f(v.x + delta, v.yzw);
}
`;
export const sandRelaxABWGSL = step('a','b');
export const sandRelaxBAWGSL = step('b','a');
export const sandRelaxStoreWGSL = /* wgsl */ `${common}
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (job.enabled == 0u || id.x >= N || id.y >= N) { return; }
  let v = a[id.y * N + id.x];
  if (v.w < 0.5) { return; }
  let p = job.tile + vec2i(id.xy);
  let k = key(p);
  let packed = pack2x16float(vec2f(max(-v.x,0.0), max(v.x,0.0)));
  let rounded = unpack2x16float(packed);
  // Error feedback: f16 packing must not repeatedly erase small exchanged masses. The fine
  // word-2 spare half stores the remainder, folded into height when scrolling to coarse pages.
  let remainder = v.x - (rounded.y - rounded.x);
  fine0[k] = packed;
  fine2[k] = (fine2[k] & 65535u) | (pack2x16float(vec2f(0.0,remainder)) & 4294901760u);
}
`;
