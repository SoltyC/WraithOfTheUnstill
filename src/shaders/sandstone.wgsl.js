// Height-aligned strata share the bake's ledge pitch; unresolved bedding fades away.
import { SANDSTONE_STRATA } from '../terrain/geology.js';
export const SANDSTONE_WGSL=/* wgsl */ `
var rockMask:texture_2d<f32>;
var rockMaskSampler:sampler;
fn sandstoneLight(wp:vec3f,N:vec3f,L:vec3f,key:vec3f,vis:f32,skyScale:f32,skyUp:vec3f,fp:f32)->vec3f{
  let warp=noised(wp.xz*0.012+vec2f(23.0,71.0)).x*0.4;
  let bedding=(wp.y+warp)/${SANDSTONE_STRATA}.0;
  let layer=floor(bedding);let phase=fract(bedding);
  // Geological beds share the ledge pitch, but not an alternating sine-wave colour.
  // Irregular neighbouring tones and occasional pale seams avoid barcode slopes at range.
  let tone=hash12(vec2f(layer,19.7));let previous=hash12(vec2f(layer-1.0,19.7));
  let bed=mix(previous,tone,smoothstep(0.02,0.2,phase));
  let seam=smoothstep(0.82,0.88,phase)*(1.0-smoothstep(0.92,0.99,phase))*step(0.68,tone);
  let fine=noised(vec2f(wp.y*1.6,17.0)).x*(1.0-smoothstep(0.2,1.0,fp));
  var layered=mix(vec3f(0.52,0.37,0.25),vec3f(0.58,0.43,0.3),bed);
  layered=mix(layered,vec3f(0.65,0.54,0.4),seam*0.12)*(1.0+0.012*fine);
  let albedo=mix(vec3f(0.55,0.4,0.28),layered,1.0-smoothstep(0.6,3.5,fp));
  let nl=dot(N,L);let diff=clamp((nl+0.08)/1.08,0.0,1.0);
  let shade=1.0-clamp(vis*smoothstep(0.0,0.4,nl),0.0,1.0);
  let sky=shIrradiance(N)*skyScale;
  return albedo*(key*diff*vis/PI+sky+skyUp*vec3f(0.72,0.9,1.2)*shade*0.32);
}
`;
