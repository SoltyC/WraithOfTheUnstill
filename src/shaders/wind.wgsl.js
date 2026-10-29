import {WIND_VECTORS} from '../world/wind.js';
import {SANDSTORM_GUST} from '../world/sandstormFront.js';
import {SANDSTORM_FRONT_WGSL} from './sandstormFront.wgsl.js';
// The wind field on the GPU (world/wind.js is the CPU twin: keep the two in step). Materials that
// declare WIND_DECL get the shared uniform block (render side: mat.setArray4('windField', wind.block)).

export const WIND_DECL = /* wgsl */ `
uniform windField: array<vec4f,${WIND_VECTORS}>;  // world/wind.js block: [0] dir, base, time; [1] gustiness, front speed; [2..5] bursts, [6..8] storm front
`;

/** The field from its first two block entries (fronts and eddies; no bursts) — usable anywhere,
 *  e.g. the post chain's SSR, given the two vec4s. */
export const WIND_CORE_WGSL = /* wgsl */ `
fn wfFront(ph: f32) -> f32 { let s = 0.5 + 0.5 * sin(ph); return s * s * s * s; }
fn windCore(p: vec2f, W0: vec4f, W1: vec4f) -> vec2f {
  let d = W0.xy; let base = W0.z; let t = W0.w; let c = W1.y;
  let along = dot(p, d); let across = -p.x * d.y + p.y * d.x;
  let f1 = wfFront((along - c * t) * 0.045 + sin(across * 0.013 + t * 0.05) * 1.2);
  let f2 = wfFront((along - c * 1.2 * t) * 0.11 + 1.7 + sin(across * 0.031 - t * 0.07) * 0.9);
  let eddy = 0.12 * sin(p.x * 0.21 + t * 1.3) * sin(p.y * 0.17 - t * 1.1);
  let g = 0.55 + W1.x * (0.9 * f1 + 0.5 * f2) + eddy;
  return d * base * g;
}
`;

export const WIND_STORM_WGSL=/* wgsl */ `
${SANDSTORM_FRONT_WGSL}
fn windStorm(p:vec2f,W0:vec4f,W1:vec4f,A:vec4f,B:vec4f,C:vec4f)->vec2f{
  var v=windCore(p,W0,W1);
  if(A.w>0.0){
    let density=sandstormDensity(vec3f(p.x,B.x,p.y),A,B,C);
    let a=dot(p,A.xy);let across=dot(p,vec2f(-A.y,A.x));let t=W0.w;
    let p1=wfFront(a*.21-t*2.4+sin(across*.07)*.8);let p2=wfFront(a*.43-t*4.1+1.7);
    let gain=.55+1.05*p1+.55*p2;let lateral=.18*sin(a*.17-t*3.2+across*.11)*(.4+.6*p1);
    v+=(A.xy*gain+vec2f(-A.y,A.x)*lateral)*W0.z*${SANDSTORM_GUST}*density;
  }
  return v;
}
`;

export const WIND_WGSL = /* wgsl */ `
${WIND_CORE_WGSL}
${WIND_STORM_WGSL}
/** The wind at (x, z): xy = direction (unit), z = speed factor (≈ strength × gusts; 0 when still). */
fn windField(p: vec2f) -> vec3f {
  let W0 = uniforms.windField[0]; let W1 = uniforms.windField[1];
  let d = W0.xy; let t = W0.w;
  var v = windStorm(p,W0,W1,uniforms.windField[6],uniforms.windField[7],uniforms.windField[8]);
  for (var i = 2u; i < 6u; i++) {
    let B = uniforms.windField[i];
    if (B.w <= 0.0) { continue; }
    let age = t - B.z;
    if (age < 0.0 || age > 2.2) { continue; }
    let r = p - B.xy; let dist = length(r);
    let q = (dist - 14.0 * age) / 5.0;
    let fade = (1.0 - age / 2.2) * (1.0 - age / 2.2) / (1.0 + dist * 0.02);
    v += r * (B.w * exp(-q * q) * fade / max(dist, 0.5));
  }
  let sp = length(v);
  return vec3f(select(d, v / sp, sp > 1e-5), sp);
}
`;
