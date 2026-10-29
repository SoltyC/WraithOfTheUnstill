// Shared TAA pre-reconstruction refraction. World position is reconstructed on the
// unjittered grid; no per-frame random seed. Near/sky/non-sand pixels are exactly unwarped.
export const heatWGSL = /* wgsl */ `
struct HeatParams { controls:vec4f, shape:vec4f };
@group(0) @binding(7) var<storage,read> heat:HeatParams;
@group(0) @binding(8) var<storage,read> heatSurface:array<u32>;
fn heatWarp(q:vec2i,jitter:vec2f)->vec3f {
  if(heat.controls.x<=0.0){return vec3f(0.0);}
  let d=textureLoad(depthTex,q,0);if(d<=0.0){return vec3f(0.0);}
  let uv=(vec2f(q)+.5-jitter)*P.size.zw;
  let wp=worldPos(uv*2.0-1.0,d,P.invVP);let delta=wp-P.cam.xyz;
  let range=length(delta);if(range<=heat.shape.x){return vec3f(0.0);}
  let col=u32(clamp((wp.x+4096.0)*.25,0.0,2047.0));
  let row=u32(clamp((4096.0-wp.z)*.25,0.0,2047.0));
  let mat=heatSurface[row*2048u+col]&255u;
  if(mat!=1u&&mat!=6u){return vec3f(0.0);}
  let grazing=1.0-smoothstep(heat.shape.z,heat.shape.w,abs(delta.y)/max(range,1.0));
  let mask=heat.controls.x*grazing*smoothstep(heat.shape.x,heat.shape.y,range);
  let p=wp.xz*.075;let t=heat.controls.y;
  let wave=vec2f(sin(p.x*.71+p.y*.49+t*.67)+.4*sin(p.y*1.37-t*.91),
    sin(p.y*.83-p.x*.31-t*.53)+.35*sin(p.x*1.61+t*.79))*.7;
  return vec3f(wave*mask*heat.controls.z*(P.size.y/1440.0),mask);
}
`;
