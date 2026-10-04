// Physically based atmosphere after Hillaire 2020 ("A Scalable and Production Ready Sky and
// Atmosphere Rendering Technique"). Units: kilometres. Planet centre at the origin; the camera
// sits at (0, groundRadius + altitude, 0) and the world's x/z are treated as tangent-plane offsets
// (curvature over the 16 km view radius is negligible).
//
// LUTs (all rgba16float storage textures):
//   transmittance   256×64   once      (r, μ) → transmittance to the top of the atmosphere
//   multiScattering  32×32   once      (μ_sun, r) → isotropic multiple-scattering contribution
//   skyView         192×108  per frame  view direction (around the camera) → sky radiance
//   aerialPersp    1024×32   per frame  32×32 screen froxels × 32 depth slices (atlas) →
//                                       rgb in-scattered radiance, a = mean transmittance
// The sun and the moon both light the sky (moon at a small fraction), so night stays blue.

export const ATMO = {
  groundRadius: 6360, topRadius: 6460,
  rayleighScattering: [5.802e-3, 13.558e-3, 33.1e-3], rayleighScaleHeight: 8,
  mieScattering: 3.996e-3, mieExtinction: 4.44e-3, mieScaleHeight: 1.2, mieG: 0.8,
  ozoneAbsorption: [0.65e-3, 1.881e-3, 0.085e-3], ozoneCenter: 25, ozoneHalfWidth: 15,
};
export const AP_SLICES = 32, AP_RES = 32, AP_MAX_KM = 32;
export const SKYVIEW_W = 192, SKYVIEW_H = 108;

/** Params block shared by every atmosphere pass (one storage buffer, written once per frame). */
export const ATMO_PARAMS_WGSL = /* wgsl */ `
struct AtmoParams {
  invViewProj: mat4x4f,
  camPos: vec4f,        // world metres (xyz), w = altitude km above the ground radius
  sunDir: vec4f,        // xyz unit, w = sun illuminance
  moonDir: vec4f,       // xyz unit, w = moon illuminance
  misc: vec4f,          // x = haze (Mie) multiplier, y = night floor, z = dt (s), w = 1 → snap exposure
  weather: vec4f,       // x = cloud cover 0..1, y = undimmed sun illuminance (sunDir.w is dimmed by
                        //     the cloud deck), z = undimmed moon illuminance, w = snowfall 0..1
};
`;

export const ATMO_COMMON_WGSL = /* wgsl */ `
const PI_A: f32 = 3.14159265;
const R_GROUND: f32 = ${ATMO.groundRadius}.0;
const R_TOP: f32 = ${ATMO.topRadius}.0;
const RAY_SCAT: vec3f = vec3f(${ATMO.rayleighScattering.join(', ')});
const MIE_SCAT: f32 = ${ATMO.mieScattering};
const MIE_EXT: f32 = ${ATMO.mieExtinction};
const OZONE_ABS: vec3f = vec3f(${ATMO.ozoneAbsorption.join(', ')});
const MIE_G: f32 = ${ATMO.mieG};
const MOON_TINT: vec3f = vec3f(0.55, 0.72, 1.0);

struct Medium { scattering: vec3f, extinction: vec3f, rayleigh: vec3f, mie: vec3f };

fn medium(hKm: f32, haze: f32) -> Medium {
  let h = max(hKm, 0.0);
  let dR = exp(-h / ${ATMO.rayleighScaleHeight}.0);
  let dM = exp(-h / ${ATMO.mieScaleHeight}) * haze;
  let dO = max(0.0, 1.0 - abs(h - ${ATMO.ozoneCenter}.0) / ${ATMO.ozoneHalfWidth}.0);
  var m: Medium;
  m.rayleigh = RAY_SCAT * dR;
  m.mie = vec3f(MIE_SCAT * dM);
  m.scattering = m.rayleigh + m.mie;
  m.extinction = m.rayleigh + vec3f(MIE_EXT * dM) + OZONE_ABS * dO;
  return m;
}

fn rayleighPhase(c: f32) -> f32 { return 3.0 / (16.0 * PI_A) * (1.0 + c * c); }
fn miePhase(c: f32) -> f32 {
  // Cornette-Shanks
  let g = MIE_G; let g2 = g * g;
  let k = 3.0 / (8.0 * PI_A) * (1.0 - g2) / (2.0 + g2);
  return k * (1.0 + c * c) / pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5);
}

// Distance to the nearest positive intersection with a sphere at the origin, or -1.
fn raySphere(ro: vec3f, rd: vec3f, radius: f32) -> f32 {
  let b = dot(ro, rd);
  let c = dot(ro, ro) - radius * radius;
  let disc = b * b - c;
  if (disc < 0.0) { return -1.0; }
  let s = sqrt(disc);
  let t0 = -b - s; let t1 = -b + s;
  if (t0 > 0.0) { return t0; }
  if (t1 > 0.0) { return t1; }
  return -1.0;
}

// Bruneton/Hillaire transmittance LUT parameterisation.
fn transmittanceUv(r: f32, mu: f32) -> vec2f {
  let H = sqrt(R_TOP * R_TOP - R_GROUND * R_GROUND);
  let rho = sqrt(max(r * r - R_GROUND * R_GROUND, 0.0));
  let disc = r * r * (mu * mu - 1.0) + R_TOP * R_TOP;
  let d = max(0.0, -r * mu + sqrt(max(disc, 0.0)));
  let dMin = R_TOP - r; let dMax = rho + H;
  return vec2f((d - dMin) / (dMax - dMin), rho / H);
}
fn transmittanceRMu(uv: vec2f) -> vec2f {
  let H = sqrt(R_TOP * R_TOP - R_GROUND * R_GROUND);
  let rho = H * uv.y;
  let r = sqrt(rho * rho + R_GROUND * R_GROUND);
  let dMin = R_TOP - r; let dMax = rho + H;
  let d = dMin + uv.x * (dMax - dMin);
  var mu = 1.0;
  if (d > 0.0) { mu = clamp((H * H - rho * rho - d * d) / (2.0 * r * d), -1.0, 1.0); }
  return vec2f(r, mu);
}

// Multiple-scattering LUT parameterisation: x = sun zenith cos, y = altitude.
fn msUv(r: f32, muSun: f32) -> vec2f {
  return vec2f(clamp(muSun * 0.5 + 0.5, 0.0, 1.0), clamp((r - R_GROUND) / (R_TOP - R_GROUND), 0.0, 1.0));
}

// Sky-view LUT: non-linear latitude around the horizon, azimuth relative to the sun (squared).
fn skyViewUvToDir(uv: vec2f, r: f32) -> vec2f { // returns (viewZenithCos, lightViewCos)
  let vHoriz = sqrt(max(r * r - R_GROUND * R_GROUND, 0.0));
  let beta = acos(clamp(vHoriz / r, -1.0, 1.0));
  let zenithHorizonAngle = PI_A - beta;
  var viewZenithAngle: f32;
  if (uv.y < 0.5) {
    var c = 1.0 - 2.0 * uv.y; c = c * c; c = 1.0 - c;
    viewZenithAngle = zenithHorizonAngle * c;
  } else {
    var c = uv.y * 2.0 - 1.0; c = c * c;
    viewZenithAngle = zenithHorizonAngle + beta * c;
  }
  let lightViewAngle = uv.x * uv.x * PI_A;
  return vec2f(cos(viewZenithAngle), cos(lightViewAngle));
}
fn skyViewDirToUv(viewZenithCos: f32, lightViewCos: f32, r: f32) -> vec2f {
  let vHoriz = sqrt(max(r * r - R_GROUND * R_GROUND, 0.0));
  let beta = acos(clamp(vHoriz / r, -1.0, 1.0));
  let zenithHorizonAngle = PI_A - beta;
  let vza = acos(clamp(viewZenithCos, -1.0, 1.0));
  var v: f32;
  if (vza < zenithHorizonAngle) {
    var c = vza / zenithHorizonAngle; c = 1.0 - c; c = sqrt(max(c, 0.0)); c = 1.0 - c;
    v = c * 0.5;
  } else {
    var c = (vza - zenithHorizonAngle) / beta; c = sqrt(max(c, 0.0));
    v = c * 0.5 + 0.5;
  }
  let u = sqrt(max(acos(clamp(lightViewCos, -1.0, 1.0)) / PI_A, 0.0));
  return vec2f(u, v);
}

// Aerial-perspective depth slice distribution (quadratic: fine near the camera).
fn apSliceToKm(slice: f32) -> f32 { let t = slice / ${AP_SLICES}.0; return t * t * ${AP_MAX_KM}.0; }
fn apKmToSlice(km: f32) -> f32 { return sqrt(clamp(km / ${AP_MAX_KM}.0, 0.0, 1.0)) * ${AP_SLICES}.0; }
`;
