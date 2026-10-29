// Shared TAA pre-reconstruction refraction. World position is reconstructed on the
// unjittered grid; no per-frame random seed. Near/sky/non-sand pixels are exactly unwarped.
export const heatWGSL = /* wgsl */ `
struct HeatParams { controls:vec4f, shape:vec4f, mirage:vec4f };
@group(0) @binding(7) var<storage,read> heat:HeatParams;
@group(0) @binding(8) var<storage,read> heatSurface:array<u32>;
@group(0) @binding(9) var<storage,read> heatWind:array<u32>;
fn heatFlatAt(q:vec2i)->f32 {
  let p=clamp(q,vec2i(0),vec2i(255));return unpack4x8unorm(heatWind[u32(p.y*256+p.x)]).w;
}
fn heatFlat(p:vec2f)->f32 {
  let u=vec2f((p.x+4096.0)/32.0-.5,(4096.0-p.y)/32.0-.5);
  let q=vec2i(floor(u));let f=fract(u);
  return mix(mix(heatFlatAt(q),heatFlatAt(q+vec2i(1,0)),f.x),
    mix(heatFlatAt(q+vec2i(0,1)),heatFlatAt(q+vec2i(1,1)),f.x),f.y);
}
fn heatReflectionUV(q:vec2i,jitter:vec2f,d:f32,offset:vec2f)->vec3f {
  let wp=worldPos((vec2f(q)+.5-jitter)*P.size.zw*2.0-1.0,d,P.invVP);
  let ray=normalize(wp-P.cam.xyz);let reflected=vec3f(ray.x,abs(ray.y),ray.z);
  let clip=P.vp*vec4f(P.cam.xyz+reflected*1e4,1.0);
  if(clip.w<=0.0){return vec3f(0.0);}
  let uv=clip.xy/clip.w*.5+.5+jitter*P.size.zw+offset*P.size.zw*.3;
  if(any(uv<=vec2f(0.0))||any(uv>=vec2f(1.0))){return vec3f(0.0);}
  let p=clamp(vec2i(uv*P.size.xy),vec2i(0),vec2i(P.size.xy)-1);
  let reflectedD=textureLoad(depthTex,p,0);
  // Sky or a substantially more distant shore; never reflect a nearby actor into the flat.
  if(reflectedD>0.0&&reflectedD>d*.6){return vec3f(0.0);}
  return vec3f(uv,1.0);
}
fn heatWarp(q:vec2i,jitter:vec2f)->vec4f {
  if(heat.controls.x<=0.0){return vec4f(0.0);}
  let d=textureLoad(depthTex,q,0);if(d<=0.0){return vec4f(0.0);}
  let uv=(vec2f(q)+.5-jitter)*P.size.zw;
  let wp=worldPos(uv*2.0-1.0,d,P.invVP);let delta=wp-P.cam.xyz;
  let range=length(delta);if(range<=heat.shape.x){return vec4f(0.0);}
  let col=u32(clamp((wp.x+4096.0)*.25,0.0,2047.0));
  let row=u32(clamp((4096.0-wp.z)*.25,0.0,2047.0));
  let mat=heatSurface[row*2048u+col]&255u;
  if(mat!=1u&&mat!=6u){return vec4f(0.0);}
  let grazing=1.0-smoothstep(heat.shape.z,heat.shape.w,abs(delta.y)/max(range,1.0));
  let mask=heat.controls.x*grazing*smoothstep(heat.shape.x,heat.shape.y,range);
  let p=wp.xz*.075;let t=heat.controls.y;
  let wave=vec2f(sin(p.x*.71+p.y*.49+t*.67)+.4*sin(p.y*1.37-t*.91),
    sin(p.y*.83-p.x*.31-t*.53)+.35*sin(p.x*1.61+t*.79))*.7;
  let offset=wave*mask*heat.controls.z*(P.size.y/1440.0);
  var mirror=0.0;
  if(heat.mirage.x>0.0&&delta.y<0.0){
    let flat=smoothstep(heat.mirage.w,1.0,heatFlat(wp.xz));
    mirror=heat.controls.x*heat.mirage.x*flat*smoothstep(heat.mirage.y,heat.mirage.z,range)
      *(1.0-smoothstep(.01,.06,abs(delta.y)/max(range,1.0)));
    if(mirror>0.00001){mirror*=heatReflectionUV(q,jitter,d,offset).z;}
  }
  return vec4f(offset,mask,mirror);
}
`;
