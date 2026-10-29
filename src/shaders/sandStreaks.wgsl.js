// Storm grains use the precipitation column and shared wind. Drawn after volume compose,
// before TAA: their own short optical path is fogged, rather than the opaque background's.
import {PRECIP_COMMON_WGSL} from './snowfall.wgsl.js';
import {WIND_DECL,WIND_WGSL} from './wind.wgsl.js';
import {ENV_DECL,COMMON_WGSL} from './common.wgsl.js';
import {ATMO_MATERIAL_WGSL} from './atmoMaterial.wgsl.js';
import {SHADOW_RECEIVE_WGSL} from './shadows.wgsl.js';

export const sandStreakVertexWGSL=/* wgsl */ `
attribute position:vec3f;
uniform viewProjection:mat4x4f;
uniform cameraPosition:vec3f;
uniform levels:array<vec4f,16>;
uniform grainView:vec4f; // x = world half-length per distance, capped at8reference1440p pixels
uniform grainTravel:vec4f; // integrated x/z travel, fall travel, enabled/dry gate
${WIND_DECL}
${WIND_WGSL}
var<storage,read> levelData:array<vec4f>;
var<storage,read> biomeA:array<u32>;
var<storage,read> windMap:array<u32>;
varying vUv:vec2f;
varying vAlpha:f32;
varying vWorldPos:vec3f;
varying vTau:f32;
${PRECIP_COMMON_WGSL}
// The same bilinear raw8m Dunes mask used by the volume (sandstormVolume.wgsl.js).
fn grainDunes(p:vec2f)->f32{
  if(any(abs(p)>vec2f(4096.0))){return 0.0;}
  let uv=vec2f((p.x+4096.0)/8.0-.5,(4096.0-p.y)/8.0-.5);
  let a=clamp(vec2i(floor(uv)),vec2i(0),vec2i(1023));let b=min(a+1,vec2i(1023));let f=fract(uv);
  return mix(mix(unpack4x8unorm(biomeA[u32(a.y*1024+a.x)]).w,unpack4x8unorm(biomeA[u32(a.y*1024+b.x)]).w,f.x),
    mix(unpack4x8unorm(biomeA[u32(b.y*1024+a.x)]).w,unpack4x8unorm(biomeA[u32(b.y*1024+b.x)]).w,f.x),f.y);
}
fn grainDensity(p:vec3f)->f32{
  return sandstormDensity(p,uniforms.windField[6],uniforms.windField[7],uniforms.windField[8])*grainDunes(p.xz);
}
@vertex
fn main(input:VertexInputs)->FragmentInputs{
  let id=u32(vertexInputs.position.x+.5);let corner=vertexInputs.position.yz;
  let h1=hsh(id*7u);let h2=hsh(id*7u+1u);let h3=hsh(id*7u+2u);let h4=hsh(id*7u+3u);let h5=hsh(id*7u+4u);
  let cam=uniforms.cameraPosition;let travel=uniforms.grainTravel;
  let base=vec2f(h1,h2)*52.0+travel.xy;
  let rel=base-cam.xz;let wrapped=rel-52.0*floor((rel+26.0)/52.0);let p=cam.xz+wrapped;
  let fall=travel.z*(.75+.5*h3);let ycol=h5*18.0-fall;
  let y=ycol-18.0*floor((ycol-(cam.y-6.3))/18.0);
  let wp0=vec3f(p.x,y,p.y);let dist=length(wp0-cam);let density=grainDensity(wp0);
  var alpha=select(0.0,1.0,h3<.5)*density*travel.w*windShelter(p,max(0.0,y-groundAtD(p.x,p.y)))*smoothstep(.0,.3,y-groundAtD(p.x,p.y))
    *(1.0-smoothstep(14.3,24.7,length(wrapped)))*smoothstep(.35,1.2,dist);
  let size=max(.003+.003*h4,dist*.0006);alpha*=min(1.0,.006/size);
  var wf=windField(p);wf.z*=windShelter(p,max(0.0,y-groundAtD(p.x,p.y)))/max(.12,windShelter(p,1.0));let vel=vec3f(wf.x*wf.z*8.0,-.22,wf.y*wf.z*8.0);
  let toCam=normalize(cam-wp0);let vScreen=vel-toCam*dot(vel,toCam);let vl=length(vScreen);
  let stretch=min(clamp(vl*.0075,0.0,.18),dist*uniforms.grainView.x);
  // Stable vertical-view fallback avoids a zero cross product when looking straight down.
  let fallback=normalize(cross(select(vec3f(0.0,1.0,0.0),vec3f(1.0,0.0,0.0),abs(toCam.y)>.98),toCam));
  let ax=select(fallback,vScreen/max(vl,1e-4),vl>.05);let ay=normalize(cross(toCam,ax));
  let wp=wp0+ax*corner.x*(size+stretch)+ay*corner.y*size;
  alpha*=sqrt(size/(size+stretch*.6));
  // Simpson integration over at most the near column, using the actual front and biome.
  let tau=dist*uniforms.windField[8].y*(grainDensity(cam)+4.0*grainDensity((cam+wp0)*.5)+density)/6.0;
  vertexOutputs.position=uniforms.viewProjection*vec4f(wp,1.0);
  if(alpha<.002){vertexOutputs.position=vec4f(0.0,0.0,-2.0,1.0);}
  vertexOutputs.vUv=corner;vertexOutputs.vAlpha=alpha;vertexOutputs.vWorldPos=wp0;vertexOutputs.vTau=tau;
}
`;

export const sandStreakFragmentWGSL=/* wgsl */ `
${ENV_DECL}
varying vUv:vec2f;
varying vAlpha:f32;
varying vWorldPos:vec3f;
varying vTau:f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
@fragment
fn main(input:FragmentInputs)->FragmentOutputs{
  let r2=dot(fragmentInputs.vUv,fragmentInputs.vUv);if(r2>1.0){discard;}
  let wp=fragmentInputs.vWorldPos;let V=normalize(uniforms.cameraPosition-wp);
  let c=dot(-V,uniforms.keyDir);let phase=.25+1.1*pow(max(c,0.0),6.0);
  let vis=shadowVisibilityFast(wp,uniforms.cameraPosition);
  let grain=vec3f(.7,.53,.31)*(atmoKeyColor()*phase*vis*.35+
    (shIrradiance(V)+shIrradiance(vec3f(0.0,1.0,0.0)))*uniforms.envMisc.w*.55);
  let trans=exp(-fragmentInputs.vTau);
  let scatter=vec3f(.8,.55,.3)*(atmoKeyColor()*(.55*.0795775+.45*.1)*.8+atmoSkyUp()*.85);
  let col=displayTransform(grain*trans+scatter*(1.0-trans),uniforms.fogParams.z*atmoExposure());
  let a=fragmentInputs.vAlpha*(1.0-r2)*.5;
  fragmentOutputs.color=vec4f(col*a,a);
}
`;
