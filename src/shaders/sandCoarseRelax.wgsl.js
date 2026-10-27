// Coarse closed-form two-cell projections. Each phase owns disjoint pairs: no atomics,
// ping-pong buffer or neighbour write race. A 32-row band bounds the cost per page visit.
import { DRY_REPOSE, WET_REPOSE } from '../terrain/state/relaxation.js';
import { PAGE_N, COARSE_PER_M, WORLD_HALF } from '../terrain/state/layout.js';
import { CLIPMAP_SAMPLE_WGSL } from './clipmapSample.wgsl.js';
const common = /* wgsl */ `
struct Job { page:vec2i, slot:i32, row:i32, enabled:u32, pad0:u32,pad1:u32,pad2:u32 };
@group(0) @binding(0) var<storage,read_write> h:array<u32>;
@group(0) @binding(1) var<storage,read> state:array<u32>;
@group(0) @binding(2) var<storage,read_write> extra:array<u32>;
@group(0) @binding(3) var<storage,read> surface:array<u32>;
@group(0) @binding(4) var<storage,read> job:Job;
@group(0) @binding(5) var<storage,read> levels:array<vec4f>;
@group(0) @binding(6) var<storage,read> cp:array<vec4f>;
${CLIPMAP_SAMPLE_WGSL}
fn material(p:vec2f)->u32 {
  let col=u32(clamp((p.x+${WORLD_HALF}.0)*0.25,0.0,2047.0));
  let row=u32(clamp((${WORLD_HALF}.0-p.y)*0.25,0.0,2047.0));
  return surface[row*2048u+col]&255u;
}
fn put(k:u32,v:f32){
  let packed=pack2x16float(vec2f(max(-v,0.0),max(v,0.0)));
  let round=unpack2x16float(packed);
  h[k]=packed;
  extra[k]=(extra[k]&65535u)|(pack2x16float(vec2f(0.0,v-(round.y-round.x)))&4294901760u);
}
`;
export const sandCoarseRelaxWGSL = (vertical,phase) => /* wgsl */ `${common}
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) id:vec3u){
  if(job.enabled==0u||job.slot<0){return;}
  let p=vec2i(${vertical ? 'i32(id.x),job.row+i32(id.y)*2' : 'i32(id.x)*2,job.row+i32(id.y)'})+vec2i(${vertical ? `0,${phase}` : `${phase},0`});
  let q=p+vec2i(${vertical ? '0,1' : '1,0'});
  if(any(q>=vec2i(${PAGE_N}))||p.y>=job.row+32){return;}
  let k=(u32(job.slot)*${PAGE_N}u+u32(p.y))*${PAGE_N}u+u32(p.x);
  let j=(u32(job.slot)*${PAGE_N}u+u32(q.y))*${PAGE_N}u+u32(q.x);
  let a=unpack4x8unorm(state[k]);let b=unpack4x8unorm(state[j]);
  if(a.z>0.0||b.z>0.0||a.w>0.0||b.w>0.0){return;}
  let wp=(vec2f(job.page+p)+vec2f(0.5))/${COARSE_PER_M}.0;
  let wq=(vec2f(job.page+q)+vec2f(0.5))/${COARSE_PER_M}.0;
  let ma=material(wp);let mb=material(wq);
  if((ma!=1u&&ma!=6u)||(mb!=1u&&mb!=6u)){return;}
  let ah=unpack2x16float(h[k]);let bh=unpack2x16float(h[j]);
  let av=ah.y-ah.x+unpack2x16float(extra[k]).y;
  let bv=bh.y-bh.x+unpack2x16float(extra[j]).y;
  // Untouched coarse terrain is never made to avalanche just by allocating an empty page.
  if(abs(av)+abs(bv)<0.000001){return;}
  let dh=(av-bv)+(baseHeight(wp)-baseHeight(wq));
  let repose=mix(${DRY_REPOSE},${WET_REPOSE},max(a.y,b.y))/${COARSE_PER_M}.0;
  let flux=sign(dh)*max(0.0,abs(dh)-repose)*0.5;
  put(k,av-flux);put(j,bv+flux);
}
`;
