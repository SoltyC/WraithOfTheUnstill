// Height-aligned strata share the bake's ledge pitch; unresolved bedding fades away.
import { SANDSTONE_STRATA } from '../terrain/geology.js';
export const SANDSTONE_WGSL=/* wgsl */ `
var rockMask:texture_2d<f32>;
var rockMaskSampler:sampler;
fn sandstoneLight(wp:vec3f,N:vec3f,L:vec3f,key:vec3f,vis:f32,skyScale:f32,skyUp:vec3f,fp:f32)->vec3f{
  let warp=noised(wp.xz*0.012+vec2f(23.0,71.0)).x*0.4;
  let bed=0.5+0.5*sin((wp.y+warp)*6.283185/${SANDSTONE_STRATA}.0);
  let cream=smoothstep(0.72,0.94,bed);
  let fine=(0.5+0.5*sin((wp.y+warp*0.45)*5.4))*(1.0-smoothstep(0.2,1.0,fp));
  var layered=mix(vec3f(0.48,0.32,0.21),vec3f(0.57,0.42,0.29),smoothstep(0.08,0.8,bed));
  layered=mix(layered,vec3f(0.65,0.54,0.4),cream*0.24)*(0.96+0.04*fine);
  let albedo=mix(vec3f(0.55,0.4,0.28),layered,1.0-smoothstep(0.6,3.5,fp));
  let nl=dot(N,L);let diff=clamp((nl+0.08)/1.08,0.0,1.0);
  let shade=1.0-clamp(vis*smoothstep(0.0,0.4,nl),0.0,1.0);
  let sky=shIrradiance(N)*skyScale;
  return albedo*(key*diff*vis/PI+sky+skyUp*vec3f(0.72,0.9,1.2)*shade*0.32);
}
`;
