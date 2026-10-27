// Bounded D2 talus diffusion. Ping-pong snapshots prevent neighbour write races; every
// undirected interior edge has exactly equal/opposite flux. No flux crosses the tile boundary.
import { HEIGHT_REMAINDER_WGSL } from './heightRemainder.wgsl.js';
import { DRY_REPOSE, WET_REPOSE, RELAX_RATE, RELAX_TILE } from '../terrain/state/relaxation.js';
import { FINE_N, FINE_PER_M, WORLD_HALF } from '../terrain/state/layout.js';
import { CLIPMAP_SAMPLE_WGSL } from './clipmapSample.wgsl.js';
const common = /* wgsl */ `
${HEIGHT_REMAINDER_WGSL}
struct Job { tile: vec2i, origin: vec2i, enabled: u32, slot: u32, generation: u32, warm: u32 };
@group(0) @binding(0) var<storage, read_write> fine0: array<u32>;
@group(0) @binding(1) var<storage, read> fine1: array<u32>;
@group(0) @binding(2) var<storage, read> surface: array<u32>;
@group(0) @binding(3) var<storage, read> job: Job;
@group(0) @binding(4) var<storage, read_write> a: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> b: array<vec4f>;
@group(0) @binding(6) var<storage, read> levels: array<vec4f>;
@group(0) @binding(7) var<storage, read> cp: array<vec4f>;
@group(0) @binding(8) var<storage, read_write> fine2: array<u32>;
@group(0) @binding(9) var<storage, read_write> activity: array<atomic<u32>>;
const N = ${RELAX_TILE}u;
fn key(p: vec2i) -> u32 {
  let q = ((p % ${FINE_N}) + ${FINE_N}) % ${FINE_N};
  return u32(q.y * ${FINE_N} + q.x);
}
${CLIPMAP_SAMPLE_WGSL}
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
      if (abs(v.x) + abs(other.x) < 0.000001) { continue; }
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
// Four exact Jacobi steps per dispatch. A four-cell halo supplies every dependency of the
// 16² output; errors at the closed workgroup halo cannot reach that output in four steps.
// 576 vec4 + two 576-float planes = 13.5 KiB shared memory, within the default 16 KiB limit.
const batch = (src, dst) => /* wgsl */ `${common}
var<workgroup> fixedData: array<vec4f,576>;
var<workgroup> localA: array<f32,576>;
var<workgroup> localB: array<f32,576>;
@compute @workgroup_size(16,16,1)
fn main(@builtin(workgroup_id) group: vec3u, @builtin(local_invocation_id) lid: vec3u,
        @builtin(local_invocation_index) lane: u32) {
  if (job.enabled == 0u) { return; }
  let origin = vec2i(group.xy * 16u) - vec2i(4);
  for (var k = lane; k < 576u; k += 256u) {
    let p = origin + vec2i(i32(k % 24u),i32(k / 24u));
    var v = vec4f(0.0);
    if (all(p >= vec2i(0)) && all(p < vec2i(i32(N)))) { v = ${src}[u32(p.y) * N + u32(p.x)]; }
    fixedData[k] = v; localA[k] = v.x;
  }
  workgroupBarrier();
  for (var iteration = 0u; iteration < 4u; iteration++) {
    for (var k = lane; k < 576u; k += 256u) {
      let p = vec2i(i32(k % 24u),i32(k / 24u)); let v = fixedData[k];
      var h = localA[k]; if ((iteration & 1u) != 0u) { h = localB[k]; }
      var delta = 0.0;
      if (v.w > 0.5) {
        for (var z = -1; z <= 1; z++) { for (var x = -1; x <= 1; x++) {
          if (x == 0 && z == 0) { continue; }
          let q = p + vec2i(x,z);
          if (any(q < vec2i(0)) || any(q >= vec2i(24))) { continue; }
          let j = u32(q.y) * 24u + u32(q.x); let other = fixedData[j];
          var hh = localA[j]; if ((iteration & 1u) != 0u) { hh = localB[j]; }
          if (other.w < 0.5 || abs(h) + abs(hh) < 0.000001) { continue; }
          let repose = mix(${DRY_REPOSE}, ${WET_REPOSE}, max(v.z, other.z));
          let limit = repose * length(vec2f(f32(x),f32(z))) / ${FINE_PER_M}.0;
          let dh = (h - hh) + (v.y - other.y);
          delta -= sign(dh) * max(0.0, abs(dh) - limit) * ${RELAX_RATE};
        } }
      }
      if ((iteration & 1u) == 0u) { localB[k] = h + delta; } else { localA[k] = h + delta; }
    }
    workgroupBarrier();
  }
  let k = (lid.y + 4u) * 24u + lid.x + 4u; let p = group.xy * 16u + lid.xy;
  ${dst}[p.y * N + p.x] = vec4f(localA[k],fixedData[k].yzw);
}
`;
export const sandRelax4ABWGSL = batch('a','b');
export const sandRelax4BAWGSL = batch('b','a');
export const sandRelaxStoreWGSL = /* wgsl */ `${common}
var<workgroup> occupied: atomic<u32>;
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) id: vec3u, @builtin(local_invocation_index) lane: u32) {
  if (job.enabled == 0u) { return; }
  if (lane == 0u) { atomicStore(&occupied,0u); }
  workgroupBarrier();
  let v = a[id.y * N + id.x];
  if (abs(v.x) >= 0.000001) { atomicOr(&occupied,1u); }
  if (v.w > 0.5 && job.warm == 0u) {
    let p = job.tile + vec2i(id.xy);
    let k = key(p);
    let packed = pack2x16float(vec2f(max(-v.x,0.0), max(v.x,0.0)));
    let rounded = unpack2x16float(packed);
    // Word-2 carries the rounding remainder through scrolling and saves.
    let remainder = v.x - (rounded.y - rounded.x);
    fine0[k] = packed;
    fine2[k] = (fine2[k] & 65535u) | packHeightRemainder(remainder);
  }
  workgroupBarrier();
  if (lane == 0u && job.generation != 0u) {
    let flag = select(1u,2u,atomicLoad(&occupied) != 0u);
    atomicMax(&activity[job.slot],(job.generation << 2u) | flag);
  }
}
`;
