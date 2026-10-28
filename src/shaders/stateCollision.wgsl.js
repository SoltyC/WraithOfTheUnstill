// A small collision snapshot of sand-state channels, using the same bilinear fine sampler.
import { FINE_N, FINE_PER_M, WORLD_HALF } from '../terrain/state/layout.js';
import { STATE_GRID_N, STATE_GRID_STEP } from '../world/stateGround.js';
export const stateCollisionWGSL = /* wgsl */ `
struct Job { origin: vec2i, gridMin: vec2i, enabled: u32, pad0:u32, pad1:u32, pad2:u32 };
@group(0) @binding(0) var<storage,read> fine0:array<u32>;
@group(0) @binding(1) var<storage,read> fine2:array<u32>;
@group(0) @binding(2) var<storage,read> surface:array<u32>;
@group(0) @binding(3) var<storage,read> job:Job;
@group(0) @binding(4) var<storage,read_write> output:array<vec4f>;
@group(0) @binding(5) var<storage,read> fine1:array<u32>;
fn texel(p:vec2i)->vec3f {
  let q = ((p % ${FINE_N}) + ${FINE_N}) % ${FINE_N};
  let k = u32(q.y * ${FINE_N} + q.x);
  let h = unpack2x16float(fine0[k]);let r = unpack2x16float(fine2[k]).y;
  return vec3f(h + vec2f(max(-r,0.0),max(r,0.0)),unpack4x8unorm(fine1[k]).z);
}
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) id:vec3u) {
  if(job.enabled==0u || id.x>=${STATE_GRID_N}u || id.y>=${STATE_GRID_N}u){return;}
  let p=job.gridMin+vec2i(id.xy)*${STATE_GRID_STEP * FINE_PER_M};
  let k=id.y*${STATE_GRID_N}u+id.x;
  if(any(p-vec2i(1)<job.origin)||any(p>=job.origin+vec2i(${FINE_N}))){output[k]=vec4f(0.0);return;}
  let wp=vec2f(p)/${FINE_PER_M}.0;
  let col=u32(clamp((wp.x+${WORLD_HALF}.0)*0.25,0.0,2047.0));
  let row=u32(clamp((${WORLD_HALF}.0-wp.y)*0.25,0.0,2047.0));
  let mat=surface[row*2048u+col]&255u;
  let h=(texel(p-vec2i(1,1))+texel(p-vec2i(0,1))+texel(p-vec2i(1,0))+texel(p))*0.25;
  output[k]=vec4f(h.xy,select(0.0,1.0,mat==1u||mat==6u),h.z);
}
`;
