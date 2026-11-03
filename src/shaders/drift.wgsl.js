// The robes on the water (render/drift.js; game/drift.js is their shape and places): empty cloth face down, sleeves spread,
// riding the swell — or, under the water, rising slowly past the camera, hood first, settling flat as they reach the light.
// Wet wool: dark, the dye deepened by the water, a sheen where the sky catches its folds, darker where it lies under.

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';

export const robesVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // the robe's own shape (local, lying face down)
attribute normal: vec3f;
attribute robe: vec4f;              // world x, z, yaw, scale
attribute robe2: vec4f;             // dye (0..5), seed, —, —
uniform viewProjection: mat4x4f;
uniform robesParams: vec4f;         // x = time (s), y = the water's level (world y), z = shown, w = rising 0 (afloat) … 1 (the rise: shot 16)
uniform robesRise: vec4f;           // x = seconds into the rise
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vRobe: vec4f;               // dye, seed, how far under (m), edge
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let P = uniforms.robesParams; let R = vertexInputs.robe; let R2 = vertexInputs.robe2;
  var p = vertexInputs.position * R.w; var n = vertexInputs.normal;
  let seed = R2.y;
  // Rising (under the water): each starts deep and comes up over ~14 s, staggered; hood up while it rises, laid flat at the top.
  var under = 0.0;
  if (P.w > 0.5) {
    let k = clamp((uniforms.robesRise.x - seed * 8.0) / 12.0, 0.0, 1.0);
    let e = k * k * (3.0 - 2.0 * k);
    under = (5.0 + 17.0 * fract(seed * 7.13)) * (1.0 - e);
    let pitch = 1.1 * (1.0 - e) * (0.7 + 0.3 * sin(P.x * 0.4 + seed * 20.0));
    let c = cos(pitch); let s = sin(pitch);
    p = vec3f(p.x, p.y * c + p.z * s, -p.y * s + p.z * c);
    n = vec3f(n.x, n.y * c + n.z * s, -n.y * s + n.z * c);
    // The cloth trails and flutters as it rises.
    p.y += 0.12 * sin(p.z * 3.0 - P.x * 1.7 + seed * 30.0) * (1.0 - e);
    p.x += 0.08 * sin(p.z * 2.3 - P.x * 1.3 + seed * 11.0) * (1.0 - e);
  }
  let cy = cos(R.z); let sy = sin(R.z);
  var wp = vec3f(R.x + p.x * cy + p.z * sy, P.y + p.y - under, R.y - p.x * sy + p.z * cy);
  // The swell: slow, long, a small chop on top; the cloth rides it.
  let sw = 0.06 * sin(wp.x * 0.09 + P.x * 0.7) + 0.05 * sin(wp.z * 0.13 - P.x * 0.55 + 1.3) + 0.015 * sin((wp.x + wp.z) * 0.9 + P.x * 1.9);
  wp.y += sw * (1.0 - min(under, 1.0));
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (P.z < 0.5) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vNormal = vec3f(n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy);
  vertexOutputs.vRobe = vec4f(R2.x, seed, under, p.y);
}
`;

export const robesFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform robesParams: vec4f;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vRobe: vec4f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
fn rHash(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453); }
fn rNoise(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rHash(i), rHash(i + vec3f(1.0, 0.0, 0.0)), u.x), mix(rHash(i + vec3f(0.0, 1.0, 0.0)), rHash(i + vec3f(1.0, 1.0, 0.0)), u.x), u.y),
             mix(mix(rHash(i + vec3f(0.0, 0.0, 1.0)), rHash(i + vec3f(1.0, 0.0, 1.0)), u.x), mix(rHash(i + vec3f(0.0, 1.0, 1.0)), rHash(i + vec3f(1.0, 1.0, 1.0)), u.x), u.y), u.z);
}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos; let cam = uniforms.cameraPosition;
  let V = normalize(cam - wp);
  var N = normalize(fragmentInputs.vNormal);
  if (dot(N, V) < 0.0) { N = -N; }
  let r = fragmentInputs.vRobe;
  // Wet wool: the Wraith's charcoal for most, the city's dyes deepened by the water for some.
  var dye = vec3f(0.035, 0.034, 0.038);
  let d = i32(r.x + 0.5);
  if (d == 1) { dye = vec3f(0.09, 0.045, 0.03); }      // madder, gone to rust
  else if (d == 2) { dye = vec3f(0.04, 0.06, 0.045); } // kelp
  else if (d == 3) { dye = vec3f(0.07, 0.065, 0.058); } // bone, greyed and soaked
  else if (d == 4) { dye = vec3f(0.04, 0.05, 0.07); }  // slate
  let weave = 0.85 + 0.3 * rNoise(wp * 38.0) * rNoise(wp * 9.0 + 3.0);
  // Where it lies under the surface the water darkens and greens it.
  let wet = smoothstep(0.02, -0.04, r.w);
  var albedo = dye * weave * mix(1.0, 0.55, wet);
  albedo = mix(albedo, albedo * vec3f(0.7, 0.95, 0.9), wet);
  let L = uniforms.keyDir;
  let vis = shadowVisibilityFast(wp, cam);
  let key = atmoKeyColor();
  let nl = max(dot(N, L), 0.0);
  var col = albedo * (key * nl * vis / PI + shIrradiance(N) * uniforms.envMisc.w);
  // The sheen of soaked cloth: the sky and the low sun along its ridges.
  let NV = max(dot(N, V), 0.0); let F = 0.04 + 0.96 * pow(1.0 - NV, 5.0);
  col += shIrradiance(reflect(-V, N)) * uniforms.envMisc.w * F * 0.35;
  let H = normalize(L + V);
  col += key * vis * pow(max(dot(N, H), 0.0), 60.0) * 0.12 * step(0.0, dot(N, L));
  let lit = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(cam - wp) * 0.001);
  fragmentOutputs.color = vec4f(displayTransform(lit, uniforms.fogParams.z * atmoExposure()), 0.0);
}
`;
