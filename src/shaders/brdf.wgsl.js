// One physically based shading model for every lit surface (docs/realism-plan.md R1). Before it,
// each shader rolled its own Blinn lobe (`pow(N·H, 24)·0.04`) and nothing reflected the sky, so
// stone, bark, leaves and grass read chalky and matte: real dielectrics always carry a Fresnel sheen
// of the sky, strongest at grazing angles.
//
//   brdfSunSpec(N, V, L, rough, f0)    sun specular × N·L (GGX, height-correlated Smith, Schlick);
//                                      multiply by key × shadow like the diffuse term
//   skySpec(N, V, rough, f0, ao)       the sky's specular reflection: radiance from the sky-view LUT
//                                      (sharp) blending into the SH irradiance (rough), the split-sum
//                                      environment BRDF (Karis's analytic fit, no LUT) and specular
//                                      occlusion from the AO (Lagarde); multiply by the sky scale
//   diffuseEnergy(f0, rough, N, V)     the share left for the diffuse term (1 − the specular albedo)
//   aggregateOcc(N, V, Nm)             foliage: the reflection's share that escapes the sward / crown
//   aggregateMask(V, L, Nm)            foliage: the sun highlight's share not masked by the other blades
//
// Units follow the existing shaders: the key light is irradiance (diffuse = albedo·key·N·L/π), and
// shIrradiance() returns irradiance/π, i.e. radiance for a uniform sky. Needs COMMON_WGSL (PI) and
// ATMO_MATERIAL_WGSL (atmoSky, shIrradiance) before it.
// On Low the sharp sky lookup is skipped: the SH alone stands in for the reflected sky.

import { boot } from '../core/graphics.js';

// A/B in look-dev: ?skyspec=0 / ?sunspec=0 take each term out.
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const SKY_K = Q.get('skyspec') === '0' ? '0.0' : '1.0', SUN_K = Q.get('sunspec') === '0' ? '0.0' : '1.0';

export const BRDF_WGSL = () => /* wgsl */ `
fn brdfD(nh: f32, a2: f32) -> f32 { let d = nh * nh * (a2 - 1.0) + 1.0; return a2 / (PI * d * d + 1e-7); }
fn brdfV(nv: f32, nl: f32, a2: f32) -> f32 {
  let gv = nl * sqrt(nv * nv * (1.0 - a2) + a2);
  let gl = nv * sqrt(nl * nl * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-5);
}
fn brdfF(f0: vec3f, vh: f32) -> vec3f { let f = pow(1.0 - vh, 5.0); return f0 + (vec3f(1.0) - f0) * f; }
/** Sun specular, already × N·L. rough is perceptual (α = rough²), clamped so the sun never pins. */
fn brdfSunSpec(N: vec3f, V: vec3f, L: vec3f, rough: f32, f0: vec3f) -> vec3f {
  let nl = dot(N, L);
  if (nl <= 0.0) { return vec3f(0.0); }
  let H = normalize(L + V);
  let a = max(rough * rough, 0.0064); let a2 = a * a;
  let nv = max(dot(N, V), 1e-4);
  return ${SUN_K} * brdfD(max(dot(N, H), 0.0), a2) * brdfV(nv, nl, a2) * brdfF(f0, max(dot(V, H), 0.0)) * nl;
}
/** Split-sum environment BRDF, analytic (Karis, "Physically Based Shading on Mobile"). */
fn envBrdf(f0: vec3f, rough: f32, nv: f32) -> vec3f {
  let r = rough * vec4f(-1.0, -0.0275, -0.572, 0.022) + vec4f(1.0, 0.0425, 1.04, -0.04);
  let a004 = min(r.x * r.x, exp2(-9.28 * nv)) * r.x + r.y;
  let ab = vec2f(-1.04, 1.04) * a004 + r.zw;
  return f0 * ab.x + ab.y;
}
/** Specular occlusion from ambient occlusion (Lagarde & de Rousiers 2014). */
fn specOcclusion(nv: f32, ao: f32, rough: f32) -> f32 {
  return clamp(pow(nv + ao, exp2(-16.0 * rough - 1.0)) - 1.0 + ao, 0.0, 1.0);
}
/** The share of light the diffuse term keeps once the specular has taken its part. */
fn diffuseEnergy(f0: vec3f, rough: f32, N: vec3f, V: vec3f) -> vec3f {
  return vec3f(1.0) - envBrdf(f0, rough, max(dot(N, V), 1e-4));
}
/** Sky radiance seen along the reflection, prefiltered by roughness (approximate). */
fn skyRefl(N: vec3f, V: vec3f, rough: f32) -> vec3f {
  let R = reflect(-V, N);
  // The lobe's dominant direction leans toward the normal as it widens (Lagarde).
  let a = rough * rough;
  let Rd = normalize(mix(N, R, (1.0 - a) * (sqrt(1.0 - a) + a)));
  let wide = shIrradiance(Rd);
  ${boot.names.shadows === 'low' ? 'return wide;' : `
  // (Past 0.48 the lobe is wide enough that the SH stands in: grass, leaves, turf and most rock skip
  // the two LUT taps — the meadow's biggest pixel counts; perf pass 2026-11-14.)
  if (rough > 0.48) { return wide; }
  // Below the horizon the reflection sees ground, not sky: the SH's own lower half (it is lit by
  // the ground's bounce) stands in, fading in as the ray dips.
  let sharp = atmoSky(normalize(vec3f(Rd.x, max(Rd.y, 0.015), Rd.z)));
  let s = mix(sharp, wide, smoothstep(0.02, -0.12, Rd.y));
  return mix(s, wide, smoothstep(0.15, 0.48, rough));`}
}
/** Foliage is a porous aggregate: a reflection that heads back into the sward or the crown (below the
 *  aggregate's own surface normal Nm) meets another blade or leaf, not the sky. */
fn aggregateOcc(N: vec3f, V: vec3f, Nm: vec3f) -> f32 {
  return smoothstep(0.05, 0.75, dot(reflect(-V, N), Nm));
}
/** …and its sun highlight is masked at the aggregate scale: seen at a grazing angle (or lit from one)
 *  a sward or crown shows the sides of its blades, not the tops the microfacet lobe assumes. Without
 *  this a meadow looking toward the sun glares white (GGX's forward lobe at grazing, ×16 the diffuse). */
fn aggregateMask(V: vec3f, L: vec3f, Nm: vec3f) -> f32 {
  return smoothstep(0.0, 0.55, dot(V, Nm)) * smoothstep(0.0, 0.35, dot(L, Nm));
}
fn skySpec(N: vec3f, V: vec3f, rough: f32, f0: vec3f, ao: f32) -> vec3f {
  let nv = max(dot(N, V), 1e-4);
  return ${SKY_K} * skyRefl(N, V, rough) * envBrdf(f0, rough, nv) * specOcclusion(nv, ao, rough);
}
`;
