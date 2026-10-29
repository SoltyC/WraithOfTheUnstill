// Shared storm density: same packed fields and function as world/sandstormFront.js.
// No resources declared here; consumers supply the fixed three-vec4 block.
export const SANDSTORM_FRONT_WGSL=/* wgsl */ `
fn sandstormDensity(p:vec3f,A:vec4f,B:vec4f,C:vec4f)->f32{
  if(A.w<=0.0){return 0.0;}
  let across=dot(p.xz,vec2f(-A.y,A.x));let q=dot(p.xz,A.xy)-A.z;
  let roll=45.0*sin(across*.018+C.x*.22)+20.0*sin(across*.049-p.y*.02+C.x*.31);
  let lead=1.0-smoothstep(-B.z,B.z,q-roll);
  let tail=smoothstep(-B.w-B.z,-B.w+B.z,q);
  return A.w*lead*tail*exp(-max(0.0,p.y-B.x)/B.y);
}
`;
