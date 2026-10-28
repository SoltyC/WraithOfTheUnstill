// Sunlit powder follows the same CPU-owned caster/devil poses as the damaging bodies.
export const duneCasterDustVertexWGSL=/* wgsl */ `
attribute position: vec3f;
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform whirls: array<vec4f,32>;
varying vUv:vec2f;
varying vAlpha:f32;
varying vWorldPos:vec3f;
varying vSeed:f32;
@vertex
fn main(input:VertexInputs)->FragmentInputs{
  let id=u32(vertexInputs.position.x+0.5);let slot=id/48u;let k=id%48u;
  let A=uniforms.whirls[slot*2u];let B=uniforms.whirls[slot*2u+1u];
  let seed=fract(f32(k)*0.6180339+f32(slot)*0.37);
  let h=(f32(k)+0.5)/48.0;
  let angle=B.x+h*15.0+seed*1.4;
  let radius=B.z*(0.4+h*1.2)*(1.0-B.w*0.18);
  let centre=A.xyz+vec3f(cos(angle)*radius,h*B.y,sin(angle)*radius);
  let view=normalize(uniforms.cameraPosition-centre+vec3f(0.0001));
  let right=normalize(cross(view,vec3f(0.0,1.0,0.0))+vec3f(0.00001));
  let up=normalize(cross(right,view));
  let corner=vertexInputs.position.yz;
  let size=(0.20+0.24*seed)*(0.65+h*0.6);
  let wp=centre+right*corner.x*size+up*corner.y*size*1.4;
  vertexOutputs.position=uniforms.viewProjection*vec4f(wp,1.0);
  if(A.w<0.001){vertexOutputs.position=vec4f(0.0,0.0,-2.0,1.0);}
  vertexOutputs.vUv=corner;vertexOutputs.vAlpha=A.w*(0.14+0.09*B.w)*sin(h*3.14159);
  vertexOutputs.vWorldPos=wp;vertexOutputs.vSeed=seed;
}
`;
