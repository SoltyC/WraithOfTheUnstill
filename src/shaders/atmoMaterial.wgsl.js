// Atmosphere access for ShaderMaterials (sky, terrain, characters): LUT textures, the GPU-computed
// light buffer, and helpers for sky radiance, the sun disc and aerial perspective.
// Bind with bindAtmosphere() from src/render/atmosphereBindings.js.

import { ATMO_PARAMS_WGSL, ATMO_COMMON_WGSL, AP_RES, AP_SLICES } from './atmosphere.wgsl.js';

export const ATMO_MATERIAL_TEXTURES = ['transmittanceLut', 'skyViewSun', 'skyViewMoon', 'aerialLut', 'canopyTex'];
export const ATMO_MATERIAL_BUFFERS = ['atmoParams', 'atmoLight'];

export const ATMO_MATERIAL_WGSL = /* wgsl */ `
${ATMO_PARAMS_WGSL}
var transmittanceLut: texture_2d<f32>;
var transmittanceLutSampler: sampler;
var skyViewSun: texture_2d<f32>;
var skyViewSunSampler: sampler;
var skyViewMoon: texture_2d<f32>;
var skyViewMoonSampler: sampler;
var aerialLut: texture_2d<f32>;
var aerialLutSampler: sampler;
var canopyTex: texture_2d<f32>;
var canopyTexSampler: sampler;
var<storage, read> atmoParams: AtmoParams;
var<storage, read> atmoLight: array<vec4f,13>;
${ATMO_COMMON_WGSL}

fn atmoCamR() -> f32 { return R_GROUND + max(atmoParams.camPos.w, 0.01); }
fn atmoKeyColor() -> vec3f { return atmoLight[0].xyz; }
fn atmoSkyUp() -> vec3f { return atmoLight[1].xyz; }
fn atmoSkySide() -> vec3f { return atmoLight[2].xyz; }
/** Sky IBL: irradiance/π arriving at a surface with normal n (L2 SH from the ambient pass). */
fn shIrradiance(n: vec3f) -> vec3f {
  let x = n.x; let y = n.y; let z = n.z;
  let e = atmoLight[4].xyz * 0.282095
        + atmoLight[5].xyz * 0.488603 * y + atmoLight[6].xyz * 0.488603 * z + atmoLight[7].xyz * 0.488603 * x
        + atmoLight[8].xyz * 1.092548 * x * y + atmoLight[9].xyz * 1.092548 * y * z
        + atmoLight[10].xyz * 0.315392 * (3.0 * z * z - 1.0) + atmoLight[11].xyz * 1.092548 * x * z
        + atmoLight[12].xyz * 0.546274 * (x * x - y * y);
  return max(e / PI_A, vec3f(0.0));
}
/** Crown cover over a world point, 0..1 (render/trees.js builds the world map at 4 m: 0 off the
 *  meadow and in the open, ~1 in a grove). */
fn canopyAt(p: vec2f) -> f32 {
  return textureSampleLevel(canopyTex, canopyTexSampler, (p + 4096.0) / 8192.0, 0.0).r;
}
/** Under the crowns the open sky is partly hidden (scale the sky IBL by this)… */
fn canopySky(c: f32) -> f32 { return 1.0 - 0.45 * c; }
/** …and the sunlit leaves above and around send down a warm-green fill: irradiance/π like the
 *  sky term (add to it). The reference's forest is never black in the shade. */
fn canopyFill(c: f32, N: vec3f) -> vec3f {
  return atmoKeyColor() * c * (0.6 + 0.4 * clamp(N.y, 0.0, 1.0)) * vec3f(0.85, 1.0, 0.58) * (0.13 / PI_A);
}
/** Eye-adaptation exposure computed by the ambient pass (multiply with the user exposure bias). */
fn atmoExposure() -> f32 { return atmoLight[3].w; }

fn atmoTransmittance(r: f32, mu: f32) -> vec3f {
  return textureSampleLevel(transmittanceLut, transmittanceLutSampler, transmittanceUv(r, mu), 0.0).rgb;
}

// Sky radiance in a world direction, from both sky-view LUTs (sun and moon).
fn atmoSky(dir: vec3f) -> vec3f {
  let r = atmoCamR();
  let dh = normalize(vec2f(dir.x, dir.z) + vec2f(1e-6, 0.0));
  let sd = normalize(vec2f(atmoParams.sunDir.x, atmoParams.sunDir.z) + vec2f(1e-6, 0.0));
  let md = normalize(vec2f(atmoParams.moonDir.x, atmoParams.moonDir.z) + vec2f(1e-6, 0.0));
  let a = textureSampleLevel(skyViewSun, skyViewSunSampler, skyViewDirToUv(dir.y, dot(sd, dh), r), 0.0).rgb;
  let b = textureSampleLevel(skyViewMoon, skyViewMoonSampler, skyViewDirToUv(dir.y, dot(md, dh), r), 0.0).rgb;
  return a + b;
}

// Sun disc radiance (attenuated by the atmosphere; zero below the ground).
fn atmoSunDisc(dir: vec3f) -> vec3f {
  let s = atmoParams.sunDir.xyz;
  let c = dot(dir, s);
  let disc = smoothstep(0.99990, 0.99995, c);
  if (disc <= 0.0) { return vec3f(0.0); }
  let r = atmoCamR();
  if (raySphere(vec3f(0.0, r, 0.0), dir, R_GROUND) > 0.0) { return vec3f(0.0); }
  return atmoTransmittance(r, dir.y) * atmoParams.sunDir.w * 2500.0 * disc;
}

// Aerial perspective: in-scattering (rgb) and transmittance (a) between the camera and a point
// at distance distKm, looked up at screen position uv (0..1, y down).
fn atmoAerial(uv: vec2f, distKm: f32) -> vec4f {
  let slice = apKmToSlice(distKm) - 1.0;          // slice k stores distance apSliceToKm(k + 1)
  let s0 = clamp(floor(slice), 0.0, ${AP_SLICES - 1}.0);
  let s1 = min(s0 + 1.0, ${AP_SLICES - 1}.0);
  let f = clamp(slice - s0, 0.0, 1.0);
  let cu = clamp(uv.x, 0.5 / ${AP_RES}.0, 1.0 - 0.5 / ${AP_RES}.0);
  let cv = clamp(uv.y, 0.5 / ${AP_RES}.0, 1.0 - 0.5 / ${AP_RES}.0);
  let a = textureSampleLevel(aerialLut, aerialLutSampler, vec2f((cu + s0) / ${AP_SLICES}.0, cv), 0.0);
  let b = textureSampleLevel(aerialLut, aerialLutSampler, vec2f((cu + s1) / ${AP_SLICES}.0, cv), 0.0);
  var ap = mix(a, b, f);
  // Before the first slice, fade from no atmosphere at the camera.
  if (slice < 0.0) {
    let w = clamp(apKmToSlice(distKm), 0.0, 1.0);
    ap = vec4f(ap.rgb * w, mix(1.0, ap.a, w));
  }
  return ap;
}

fn atmoApply(col: vec3f, uv: vec2f, distKm: f32) -> vec3f {
  let ap = atmoAerial(uv, distKm);
  return col * ap.a + ap.rgb;
}
`;
