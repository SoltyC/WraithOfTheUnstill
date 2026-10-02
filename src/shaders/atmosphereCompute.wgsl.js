// Compute passes for the Hillaire atmosphere (see atmosphere.wgsl.js for the model and LUT
// layouts). Binding names are mapped by src/render/atmosphere.js. Babylon binds a texture's
// sampler at (texture binding − 1), so every sampler is declared right before its texture.

import { ATMO_PARAMS_WGSL, ATMO_COMMON_WGSL, AP_SLICES, AP_RES, SKYVIEW_W, SKYVIEW_H } from './atmosphere.wgsl.js';

const HEAD = /* wgsl */ `
${ATMO_PARAMS_WGSL}
@group(0) @binding(0) var<storage, read> P: AtmoParams;
${ATMO_COMMON_WGSL}
`;

// Shared LUT readers (sampled textures).
const LUT_READ = /* wgsl */ `
fn sampleTransmittance(r: f32, mu: f32) -> vec3f {
  return textureSampleLevel(transmittanceLut, transmittanceLutSampler, transmittanceUv(r, mu), 0.0).rgb;
}
fn sampleMS(r: f32, muSun: f32) -> vec3f {
  return textureSampleLevel(multiScatLut, multiScatLutSampler, msUv(r, muSun), 0.0).rgb;
}
`;

export const transmittanceCS = /* wgsl */ `
${HEAD}
@group(0) @binding(1) var outTex: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let size = vec2u(256u, 64u);
  if (id.x >= size.x || id.y >= size.y) { return; }
  let uv = (vec2f(id.xy) + 0.5) / vec2f(size);
  let rm = transmittanceRMu(uv);
  let ro = vec3f(0.0, rm.x, 0.0);
  let rd = vec3f(sqrt(max(1.0 - rm.y * rm.y, 0.0)), rm.y, 0.0);
  let tMax = max(raySphere(ro, rd, R_TOP), 0.0);
  let N = 40;
  let dt = tMax / f32(N);
  var od = vec3f(0.0);
  for (var i = 0; i < N; i++) {
    let p = ro + rd * (f32(i) + 0.5) * dt;
    od += medium(length(p) - R_GROUND, P.misc.x).extinction * dt;
  }
  textureStore(outTex, id.xy, vec4f(exp(-od), 1.0));
}
`;

export const multiScatCS = /* wgsl */ `
${HEAD}
@group(0) @binding(1) var outTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var transmittanceLutSampler: sampler;
@group(0) @binding(3) var transmittanceLut: texture_2d<f32>;
fn sampleTransmittance(r: f32, mu: f32) -> vec3f {
  return textureSampleLevel(transmittanceLut, transmittanceLutSampler, transmittanceUv(r, mu), 0.0).rgb;
}
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= 32u || id.y >= 32u) { return; }
  let uv = (vec2f(id.xy) + 0.5) / 32.0;
  let muSun = uv.x * 2.0 - 1.0;
  let r = R_GROUND + uv.y * (R_TOP - R_GROUND);
  let ro = vec3f(0.0, r, 0.0);
  let sun = vec3f(sqrt(max(1.0 - muSun * muSun, 0.0)), muSun, 0.0);
  var lSum = vec3f(0.0);
  var fSum = vec3f(0.0);
  let SQ = 8;
  for (var a = 0; a < SQ; a++) {
    for (var b = 0; b < SQ; b++) {
      // Uniform sphere directions.
      let u = (f32(a) + 0.5) / f32(SQ);
      let v = (f32(b) + 0.5) / f32(SQ);
      let cosT = 1.0 - 2.0 * v;
      let sinT = sqrt(max(1.0 - cosT * cosT, 0.0));
      let phi = 2.0 * PI_A * u;
      let rd = vec3f(sinT * cos(phi), cosT, sinT * sin(phi));
      let tGround = raySphere(ro, rd, R_GROUND);
      let tTop = raySphere(ro, rd, R_TOP);
      let hitsGround = tGround > 0.0;
      let tMax = select(max(tTop, 0.0), tGround, hitsGround);
      let N = 20;
      let dt = tMax / f32(N);
      var T = vec3f(1.0);
      var L = vec3f(0.0);
      var f = vec3f(0.0);
      for (var i = 0; i < N; i++) {
        let p = ro + rd * (f32(i) + 0.5) * dt;
        let h = length(p);
        let m = medium(h - R_GROUND, P.misc.x);
        let ext = max(m.extinction, vec3f(1e-6));
        let stepT = exp(-ext * dt);
        let sunT = sampleTransmittance(h, dot(p / h, sun));
        let S = sunT * m.scattering * (1.0 / (4.0 * PI_A));
        L += T * (S - S * stepT) / ext;
        f += T * (m.scattering - m.scattering * stepT) / ext;
        T *= stepT;
      }
      if (hitsGround) {
        let pg = ro + rd * tGround;
        let n = normalize(pg);
        L += T * sampleTransmittance(R_GROUND, dot(n, sun)) * max(dot(n, sun), 0.0) * (0.3 / PI_A);
      }
      lSum += L; fSum += f;
    }
  }
  let invN = 1.0 / f32(SQ * SQ);
  let L2 = lSum * invN;
  let fms = fSum * invN;
  textureStore(outTex, id.xy, vec4f(L2 / (1.0 - min(fms, vec3f(0.99))), 1.0));
}
`;

// Single-light in-scattering integral along a ray (used by sky view and aerial perspective).
const INTEGRATE = /* wgsl */ `
fn scatterAlong(ro: vec3f, rd: vec3f, tMax: f32, N: i32, light: vec3f, transmittanceOut: ptr<function, vec3f>) -> vec3f {
  let dt = tMax / f32(N);
  var T = vec3f(1.0);
  var L = vec3f(0.0);
  let c = dot(rd, light);
  let pR = rayleighPhase(c);
  let pM = miePhase(c);
  for (var i = 0; i < N; i++) {
    let p = ro + rd * (f32(i) + 0.5) * dt;
    let h = length(p);
    let up = p / h;
    let mu = dot(up, light);
    let m = medium(h - R_GROUND, P.misc.x);
    let ext = max(m.extinction, vec3f(1e-6));
    let stepT = exp(-ext * dt);
    // Earth shadow: no direct light once the light is below this point's horizon.
    let sunT = sampleTransmittance(h, mu) * select(1.0, 0.0, raySphere(p, light, R_GROUND) > 0.0);
    let S = (m.rayleigh * pR + m.mie * pM) * sunT + m.scattering * sampleMS(h, mu);
    L += T * (S - S * stepT) / ext;
    T *= stepT;
  }
  *transmittanceOut = T;
  return L;
}
`;

export const skyViewCS = /* wgsl */ `
${HEAD}
@group(0) @binding(1) var outSun: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var transmittanceLutSampler: sampler;
@group(0) @binding(3) var transmittanceLut: texture_2d<f32>;
@group(0) @binding(4) var multiScatLutSampler: sampler;
@group(0) @binding(5) var multiScatLut: texture_2d<f32>;
@group(0) @binding(6) var outMoon: texture_storage_2d<rgba16float, write>;
${LUT_READ}
${INTEGRATE}
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= ${SKYVIEW_W}u || id.y >= ${SKYVIEW_H}u) { return; }
  let uv = (vec2f(id.xy) + 0.5) / vec2f(${SKYVIEW_W}.0, ${SKYVIEW_H}.0);
  let r = R_GROUND + max(P.camPos.w, 0.01);
  let ro = vec3f(0.0, r, 0.0);
  let vl = skyViewUvToDir(uv, r);
  let sinV = sqrt(max(1.0 - vl.x * vl.x, 0.0));
  let sinL = sqrt(max(1.0 - vl.y * vl.y, 0.0));
  let rd = vec3f(sinV * vl.y, vl.x, sinV * sinL);
  let tGround = raySphere(ro, rd, R_GROUND);
  let tTop = raySphere(ro, rd, R_TOP);
  let tMax = select(max(tTop, 0.0), tGround, tGround > 0.0);
  // Light in the LUT's frame: in the x-y plane at its zenith angle (z = 0).
  let isMoon = id.z == 1u;
  let Ld = select(P.sunDir, P.moonDir, isMoon);
  let mu = Ld.y;
  let light = vec3f(sqrt(max(1.0 - mu * mu, 0.0)), mu, 0.0);
  var T = vec3f(1.0);
  // Moonlight is stylised cool (the brief wants night to read deep blue, never black).
  let tint = select(vec3f(1.0), MOON_TINT, isMoon);
  let L = scatterAlong(ro, rd, tMax, 30, light, &T) * Ld.w * tint;
  if (isMoon) { textureStore(outMoon, id.xy, vec4f(L, 1.0)); }
  else { textureStore(outSun, id.xy, vec4f(L, 1.0)); }
}
`;

export const aerialCS = /* wgsl */ `
${HEAD}
@group(0) @binding(1) var outTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var transmittanceLutSampler: sampler;
@group(0) @binding(3) var transmittanceLut: texture_2d<f32>;
@group(0) @binding(4) var multiScatLutSampler: sampler;
@group(0) @binding(5) var multiScatLut: texture_2d<f32>;
${LUT_READ}
${INTEGRATE}
@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= ${AP_RES}u || id.y >= ${AP_RES}u || id.z >= ${AP_SLICES}u) { return; }
  // Froxel centre direction from the camera (NDC y up; texture row 0 = top of screen).
  let ndc = vec2f((f32(id.x) + 0.5) / ${AP_RES}.0 * 2.0 - 1.0, 1.0 - (f32(id.y) + 0.5) / ${AP_RES}.0 * 2.0);
  let wp = P.invViewProj * vec4f(ndc, 1.0, 1.0);
  let rd = normalize(wp.xyz / wp.w - P.camPos.xyz);
  let dKm = apSliceToKm(f32(id.z) + 1.0);
  let r = R_GROUND + max(P.camPos.w, 0.01);
  let ro = vec3f(0.0, r, 0.0);
  let steps = 4 + i32(id.z) / 2;
  var Ts = vec3f(1.0);
  var Tm = vec3f(1.0);
  let Ls = scatterAlong(ro, rd, dKm, steps, P.sunDir.xyz, &Ts) * P.sunDir.w;
  let Lm = scatterAlong(ro, rd, dKm, steps, P.moonDir.xyz, &Tm) * P.moonDir.w * MOON_TINT;
  let T = dot(Ts, vec3f(0.3333));
  textureStore(outTex, vec2u(id.x + id.z * ${AP_RES}u, id.y), vec4f(Ls + Lm, T));
}
`;

/** Ambient and key-light colour at the camera, integrated from the sky-view LUTs. Output buffer:
 *  [0] key light colour (sun or moon illuminance × transmittance at the camera)
 *  [1] sky irradiance on an up-facing surface / π  (hemispheric ambient top)
 *  [2] sky irradiance on a horizontal-facing surface / π (hemispheric ambient side)
 *  [3] sky colour at the horizon (for fog fallback / grading) */
export const ambientCS = /* wgsl */ `
${HEAD}
@group(0) @binding(1) var<storage, read_write> outLight: array<vec4f, 4>;
@group(0) @binding(2) var transmittanceLutSampler: sampler;
@group(0) @binding(3) var transmittanceLut: texture_2d<f32>;
@group(0) @binding(4) var skySunSampler: sampler;
@group(0) @binding(5) var skySun: texture_2d<f32>;
@group(0) @binding(6) var skyMoonSampler: sampler;
@group(0) @binding(7) var skyMoon: texture_2d<f32>;
fn sampleTransmittance(r: f32, mu: f32) -> vec3f {
  return textureSampleLevel(transmittanceLut, transmittanceLutSampler, transmittanceUv(r, mu), 0.0).rgb;
}
fn skyRadiance(dir: vec3f, r: f32) -> vec3f {
  var L = vec3f(0.0);
  // Sun LUT: azimuth relative to the sun.
  let sd = normalize(vec2f(P.sunDir.x, P.sunDir.z) + vec2f(1e-6, 0.0));
  let dh = normalize(vec2f(dir.x, dir.z) + vec2f(1e-6, 0.0));
  L += textureSampleLevel(skySun, skySunSampler, skyViewDirToUv(dir.y, dot(sd, dh), r), 0.0).rgb;
  let md = normalize(vec2f(P.moonDir.x, P.moonDir.z) + vec2f(1e-6, 0.0));
  L += textureSampleLevel(skyMoon, skyMoonSampler, skyViewDirToUv(dir.y, dot(md, dh), r), 0.0).rgb;
  return L;
}
@compute @workgroup_size(1, 1, 1)
fn main() {
  let r = R_GROUND + max(P.camPos.w, 0.01);
  // Key light: whichever of sun and moon is brighter after transmittance.
  let sunC = sampleTransmittance(r, P.sunDir.y) * P.sunDir.w * select(0.0, 1.0, P.sunDir.y > -0.02);
  let moonC = sampleTransmittance(r, P.moonDir.y) * P.moonDir.w * MOON_TINT * select(0.0, 1.0, P.moonDir.y > -0.02);
  outLight[0] = vec4f(select(moonC, sunC, dot(sunC, vec3f(1.0)) >= dot(moonC, vec3f(1.0))), 0.0);
  // Cosine-weighted irradiance over the upper hemisphere (up normal) and a side normal.
  var up = vec3f(0.0);
  var side = vec3f(0.0);
  let NA = 16; let NE = 8;
  var wUp = 0.0; var wSide = 0.0;
  for (var a = 0; a < NA; a++) {
    let phi = (f32(a) + 0.5) / f32(NA) * 2.0 * PI_A;
    for (var e = 0; e < NE; e++) {
      let ct = (f32(e) + 0.5) / f32(NE);           // cos(zenith) in (0,1)
      let st = sqrt(1.0 - ct * ct);
      let dir = vec3f(st * cos(phi), ct, st * sin(phi));
      let L = skyRadiance(dir, r);
      up += L * ct; wUp += ct;
      let cs = max(dir.x, 0.0);                    // side normal +x, averaged over azimuth by symmetry of the loop
      side += L * cs; wSide += cs;
    }
  }
  // Night floor (misc.y): a faint deep-blue ambient so night and late dusk never go black.
  let floorC = vec3f(0.30, 0.45, 1.0) * P.misc.y;
  outLight[1] = vec4f(up / wUp + floorC, 0.0);
  outLight[2] = vec4f(side / max(wSide, 1e-4) + floorC * 0.8, 0.0);
  let hz = vec3f(cos(0.3), 0.06, sin(0.3));
  // Eye adaptation (BRIEF §5.8: tight limits). Adapt to a blend of key-lit and sky-lit ground,
  // clamp to a narrow range, and ease over time (misc.z = dt; 0 in captures → hold).
  let lumW = vec3f(0.2126, 0.7152, 0.0722);
  let adapt = dot(outLight[0].xyz, lumW) * (0.5 / PI_A) + dot(outLight[1].xyz, lumW) + 1e-5;
  let wanted = clamp(0.42 / adapt, 0.22, 7.5);
  let prev = outLight[3].w;
  let k = select(1.0 - exp(-P.misc.z / 1.2), 1.0, prev <= 0.0 || P.misc.w > 0.5);
  outLight[3] = vec4f(skyRadiance(normalize(hz), r), mix(prev, wanted, k));
}
`;
