// Shared quarter-resolution march and rare depth-discontinuity fallback in compose.
// Consumers declare P (PostParams) and sandBiomeA (existing 8m packed biome weights).
import {SANDSTORM_FRONT_WGSL} from '../sandstormFront.wgsl.js';
export const SANDSTORM_VOLUME_WGSL=/* wgsl */ `
${SANDSTORM_FRONT_WGSL}
fn stormBiome(p:vec2f)->f32{
  if(any(abs(p)>vec2f(4096.0))){return 0.0;}
  let uv=vec2f((p.x+4096.0)/8.0-.5,(4096.0-p.y)/8.0-.5);
  let a=clamp(vec2i(floor(uv)),vec2i(0),vec2i(1023));let b=min(a+1,vec2i(1023));let f=fract(uv);
  return mix(mix(unpack4x8unorm(sandBiomeA[u32(a.y*1024+a.x)]).w,unpack4x8unorm(sandBiomeA[u32(a.y*1024+b.x)]).w,f.x),
    mix(unpack4x8unorm(sandBiomeA[u32(b.y*1024+a.x)]).w,unpack4x8unorm(sandBiomeA[u32(b.y*1024+b.x)]).w,f.x),f.y);
}
fn stormOpticalDepth(cam:vec3f,dir:vec3f,dist:f32)->f32{
  let A=P.desert[0];let B=P.desert[1];let C=P.desert[2];
  if(A.w<=0.0){return 0.0;}
  let q=dot(cam.xz,A.xy)-A.z;let k=dot(dir.xz,A.xy);
  let lower=-B.w-B.z;let upper=B.z+65.0;
  var near=0.0;var far=dist;
  if(abs(k)<1e-5){if(q<lower||q>upper){return 0.0;}}
  else{let a=(lower-q)/k;let b=(upper-q)/k;near=max(0.0,min(a,b));far=min(dist,max(a,b));}
  if(far<=near){return 0.0;}
  // Dense near samples resolve the face; farther intervals grow quadratically. 4km is
  // >60 optical depths at full ground density, with early termination only past tau12.
  let span=min(far-near,4000.0);var tau=0.0;
  for(var i=0u;i<16u;i++){
    let a=f32(i)/16.0;let b=f32(i+1u)/16.0;
    let t0=near+a*a*span;let t1=near+b*b*span;let p=cam+dir*((t0+t1)*.5);
    tau+=sandstormDensity(p,A,B,C)*stormBiome(p.xz)*(t1-t0)*C.y;
    if(tau>12.0){break;}
  }
  return min(tau,16.0);
}
`;
