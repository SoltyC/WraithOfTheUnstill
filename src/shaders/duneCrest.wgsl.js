// Analytic profile metadata fits in the existing spare levelData.w word as a finite integer.
// 17 phase bits at 1/512 cycle, 6 amplitude bits at 0.5m, one family bit; zero is invalid.
export const DUNE_CREST_CODEC_WGSL=/* wgsl */ `
fn packDuneCrest(c:vec3f)->f32{
  if(c.z<0.0 || c.y<=0.0 || c.x<=-128.0 || c.x>=128.0){return 0.0;}
  let phase=u32(round((c.x+128.0)*512.0));
  let amp=u32(round(clamp(c.y,0.0,31.5)*2.0));let family=select(0u,1u,c.z>0.5);
  return f32(1u+min(phase,131071u)+(amp<<17u)+(family<<23u));
}
fn unpackDuneCrest(code:f32)->vec4f{
  if(code<1.0){return vec4f(0.0);}
  let v=u32(code-1.0);
  return vec4f(f32(v&131071u)/512.0-128.0,f32((v>>17u)&63u)*0.5,f32((v>>23u)&1u),1.0);
}
`;

export const DUNE_CREST_NORMAL_WGSL=/* wgsl */ `
fn duneCrestProfile(phase:f32,family:f32)->f32{
  let p=fract(phase);
  if(family>0.5){let t=1.0-abs(2.0*p-1.0);return 0.5*t*t*(3.0-2.0*t)+0.5*t;}
  if(p<0.72){let t=p/0.72;return t*t*(3.0-2.0*t)*0.92+t*0.08;}
  let t=(p-0.72)/0.28;return 1.0-t*(2.0-t);
}
fn duneCrestSlope(phase:f32,family:f32)->f32{
  let p=fract(phase);
  if(family>0.5){let t=1.0-abs(2.0*p-1.0);return (3.0*t*(1.0-t)+0.5)*select(-2.0,2.0,p<0.5);}
  if(p<0.72){let t=p/0.72;return (6.0*t*(1.0-t)*0.92+0.08)/0.72;}
  return -2.0*(1.0-(p-0.72)/0.28)/0.28;
}
fn duneCrestNormal(N:vec3f,c:vec4f,gradient:vec2f,s:f32,dist:f32,fp:f32)->vec3f{
  let valid=smoothstep(0.9,1.0,c.w);
  let fade=valid*smoothstep(0.5,2.0,s)*smoothstep(50.0,120.0,dist)*(1.0-smoothstep(4.0,12.0,fp));
  if(fade<0.001 || dot(gradient,gradient)>0.01){return N;}
  let field=c.xyz/max(c.w,0.0001);let p=field.x;let amp=field.y;let family=field.z;
  let slope=duneCrestSlope(p,family);
  let ex=gradient.x*s;let ez=gradient.y*s;
  let averaged=vec2f(duneCrestProfile(p+ex,family)-duneCrestProfile(p-ex,family),duneCrestProfile(p+ez,family)-duneCrestProfile(p-ez,family))/(2.0*s);
  var correction=(gradient*slope-averaged)*amp*fade;
  correction*=min(1.0,0.6/max(length(correction),0.0001));
  return normalize(vec3f(N.x-correction.x*N.y,N.y,N.z-correction.y*N.y));
}
`;
