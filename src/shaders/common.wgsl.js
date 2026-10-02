// Shared WGSL functions: lighting environment, sky gradient, height fog / aerial perspective,
// detail noise, and the display transform. Concatenated into each shader source.
//
// Phase 0 note: this is an analytic stand-in. Phase 1 replaces skyColor/applyFog with the
// Hillaire LUT atmosphere, and Phase 6 moves tonemapping into the post chain.

/** Uniforms every lit material declares (names must match render/environment.js). */
export const ENV_UNIFORMS = ['keyDir', 'keyColor', 'skyZenith', 'skyHorizon', 'groundBounce', 'sunDir', 'sunHalo', 'fogParams', 'cameraPosition', 'envMisc', 'screenInfo', 'artParams'];

export const ENV_DECL = /* wgsl */ `
uniform keyDir: vec3f;
uniform keyColor: vec3f;
uniform skyZenith: vec3f;
uniform skyHorizon: vec3f;
uniform groundBounce: vec3f;
uniform sunDir: vec3f;
uniform sunHalo: vec3f;
uniform fogParams: vec4f;
uniform cameraPosition: vec3f;
uniform envMisc: vec4f;
uniform screenInfo: vec4f;
uniform artParams: vec4f; // x = glint intensity
`;

export const COMMON_WGSL = /* wgsl */ `
const PI: f32 = 3.14159265;

fn hash12(p: vec2f) -> f32 {
  var q = fract(p * vec2f(0.1031, 0.1030));
  q += dot(q, q.yx + 33.33);
  return fract((q.x + q.y) * q.x);
}

// Value noise with analytic derivatives: returns (value in [-1,1], d/dx, d/dy).
fn noised(p: vec2f) -> vec3f {
  let i = floor(p);
  let f = p - i;
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  let a = hash12(i);
  let b = hash12(i + vec2f(1.0, 0.0));
  let c = hash12(i + vec2f(0.0, 1.0));
  let d = hash12(i + vec2f(1.0, 1.0));
  let k1 = b - a;
  let k2 = c - a;
  let k4 = a - b - c + d;
  let v = a + k1 * u.x + k2 * u.y + k4 * u.x * u.y;
  return vec3f(v * 2.0 - 1.0, 2.0 * du * vec2f(k1 + k4 * u.y, k2 + k4 * u.x));
}

// Sky radiance along a direction (linear HDR, pre-exposure).
fn skyColor(dir: vec3f, sunDir: vec3f, zenith: vec3f, horizon: vec3f, halo: vec3f) -> vec3f {
  let y = dir.y;
  let up = clamp(y, 0.0, 1.0);
  // Horizon band thickness widens as the sky darkens.
  let t = pow(up, 0.42);
  var col = mix(horizon, zenith, t);
  // Below the horizon: fade toward a darker, slightly warmer ground haze.
  let below = clamp(-y * 6.0, 0.0, 1.0);
  col = mix(col, horizon * 0.62, below);
  // Forward scattering around the sun: wide glow plus tighter aureole.
  let mu = max(dot(dir, sunDir), 0.0);
  let horizonBoost = 1.0 + 2.5 * pow(1.0 - up, 4.0);
  col += halo * (0.22 * pow(mu, 6.0) * horizonBoost + 0.55 * pow(mu, 64.0));
  return col;
}

// Exponential height fog with aerial perspective. fogParams = (density, heightFalloff, exposure, time).
fn applyFog(col: vec3f, worldPos: vec3f, camPos: vec3f, sunDir: vec3f, zenith: vec3f, horizon: vec3f, halo: vec3f, fogParams: vec4f) -> vec3f {
  let ray = worldPos - camPos;
  let dist = length(ray);
  let dir = ray / max(dist, 1e-4);
  let density = fogParams.x * 0.0009;
  let falloff = fogParams.y;
  // Optical depth through fog whose density falls off exponentially with height.
  let k = falloff * ray.y;
  let base = density * exp(-falloff * (camPos.y - 8.0));
  var depth: f32;
  if (abs(k) > 1e-4) {
    depth = base * dist * (1.0 - exp(-k)) / k;
  } else {
    depth = base * dist;
  }
  let ext = exp(-depth * vec3f(0.80, 0.92, 1.10));
  // Inscattered light: horizon sky in the view direction, warmed toward the sun.
  let flat = normalize(vec3f(dir.x, max(dir.y, 0.0) * 0.35 + 0.02, dir.z));
  let ins = skyColor(flat, sunDir, zenith, horizon, halo);
  return col * ext + ins * (1.0 - ext);
}

// Display transform: exposure → ACES (Narkowicz fit) with a soft shoulder → sRGB.
fn displayTransform(hdr: vec3f, exposure: f32) -> vec3f {
  let x = hdr * exposure;
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  let mapped = clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
  // Linear → sRGB.
  let lo = mapped * 12.92;
  let hi = 1.055 * pow(mapped, vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, mapped <= vec3f(0.0031308));
}

// Interleaved gradient noise for dithering away 8-bit banding in the gradients.
fn ditherNoise(fragCoord: vec2f) -> f32 {
  return fract(52.9829189 * fract(dot(fragCoord, vec2f(0.06711056, 0.00583715)))) - 0.5;
}
`;
