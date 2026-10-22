// Shared WGSL functions: lighting environment, sky gradient, height fog / aerial perspective,
// detail noise, and the display transform. Concatenated into each shader source.
//
// Phase 0 note: skyColor/applyFog are the analytic stand-ins Phase 1 replaced with the Hillaire
// LUT atmosphere; since Phase 6 tonemapping lives in the post chain.

import { GRID_N, GRID_CELL, MAX_PER_CELL, LIGHTS_VEC4 } from '../render/lightGrid.js';

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
uniform artParams: vec4f; // x = glint intensity; y, z, w = grade (desaturate, warmth, flatten); 0 = neutral
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

// Scene output (Phase 6): materials write pre-exposed linear HDR into the scene target. Tonemap,
// grade (the stilled/restored LUT) and the sRGB encode happen in the post chain (src/post/).
// Non-finite or overflowing values are clamped so a hot pixel never spreads through bloom/TAA.
fn displayTransform(hdr: vec3f, exposure: f32) -> vec3f {
  let x = hdr * exposure;
  return clamp(select(x, vec3f(0.0), x != x), vec3f(0.0), vec3f(30000.0));
}

// Interleaved gradient noise for dithering away 8-bit banding in the gradients.
fn ditherNoise(fragCoord: vec2f) -> f32 {
  return fract(52.9829189 * fract(dot(fragCoord, vec2f(0.06711056, 0.00583715)))) - 0.5;
}
`;

/** Point lights, two sets. (1) LIGHT_SLOTS "spell" slots in the uniform `spellLights` (the verbs'
 *  and the carried lantern's; render/clipmap.js owns the array). (2) The world-light grid: fires,
 *  candles, lanterns, braziers, windows — hundreds, binned into 4 m cells around the camera by
 *  systems/lights.js into ONE storage buffer, `lightGrid` (layout in render/lightGrid.js).
 *  Display-referred like the terrain's: spellLit returns light to add before the display transform
 *  (already divided by exposure). */
export const LIGHT_SLOTS = 4;
export const GRID_LIGHT_DECL = /* wgsl */ `
var<storage, read> lightGrid: array<vec4f>;
`;
/** Grid access (needs only GRID_LIGHT_DECL): gridBase(wp) → the cell's first vec4 (0 = outside the
 *  grid); gridId(base, s) → light id + 1 of the cell's s-th light (0 = end of list);
 *  gridPos / gridCol(id) → (pos.xyz, radius) / (colour.rgb, intensity). gridLit matches spellLit's
 *  units: albedo × Σ light × 0.55 / exposure. */
export const GRID_LIGHT_WGSL = /* wgsl */ `
const GRID_N: i32 = ${GRID_N};
const GRID_LIGHTS_BASE: u32 = ${LIGHTS_VEC4}u;
fn gridBase(wp: vec3f) -> u32 {
  let h = lightGrid[0];
  let c = vec2i(floor((wp.xz - h.xy) / ${GRID_CELL.toFixed(1)}));
  if (c.x < 0 || c.y < 0 || c.x >= GRID_N || c.y >= GRID_N) { return 0u; }
  return 1u + u32(c.y * GRID_N + c.x) * 2u;
}
fn gridId(base: u32, s: u32) -> u32 {
  return u32(lightGrid[base + (s >> 2u)][s & 3u]);
}
fn gridPos(id: u32) -> vec4f { return lightGrid[GRID_LIGHTS_BASE + (id - 1u) * 2u]; }
fn gridCol(id: u32) -> vec4f { return lightGrid[GRID_LIGHTS_BASE + (id - 1u) * 2u + 1u]; }
fn gridAcc(wp: vec3f, N: vec3f, wrap: f32) -> vec3f {
  var acc = vec3f(0.0);
  let gb = gridBase(wp);
  if (gb == 0u) { return acc; }
  for (var s = 0u; s < ${MAX_PER_CELL}u; s++) {
    let id = gridId(gb, s);
    if (id == 0u) { break; }
    let lp = gridPos(id); let lc = gridCol(id);
    let lv = lp.xyz - wp; let d = max(length(lv), 0.35);
    if (d >= lp.w) { continue; }
    let fall = (1.0 - d / lp.w) * (1.0 - d / lp.w) / (1.0 + d * d * 0.35);
    let nl = clamp((dot(N, lv / d) + wrap) / (1.0 + wrap), 0.0, 1.0);
    acc += lc.rgb * lc.w * fall * nl;
  }
  return acc;
}
fn gridLit(wp: vec3f, N: vec3f, albedo: vec3f, wrap: f32, ex: f32) -> vec3f {
  return albedo * gridAcc(wp, N, wrap) * 0.55 / max(ex, 1e-6);
}
`;
export const SPELL_LIGHT_DECL = /* wgsl */ `
uniform spellLights: array<vec4f,${LIGHT_SLOTS * 2}>;   // LIGHT_SLOTS × (pos.xyz, radius), (colour.rgb, intensity)
${GRID_LIGHT_DECL}
`;
export const SPELL_LIGHT_WGSL = /* wgsl */ `
${GRID_LIGHT_WGSL}
fn spellLit(wp: vec3f, N: vec3f, albedo: vec3f, wrap: f32, ex: f32) -> vec3f {
  var acc = vec3f(0.0);
  for (var li = 0u; li < ${LIGHT_SLOTS}u; li++) {
    let lp = uniforms.spellLights[li * 2u]; let lc = uniforms.spellLights[li * 2u + 1u];
    if (lc.w <= 0.0) { continue; }
    let lv = lp.xyz - wp; let d = max(length(lv), 0.35);
    if (d >= lp.w) { continue; }
    let fall = (1.0 - d / lp.w) * (1.0 - d / lp.w) / (1.0 + d * d * 0.35);
    let nl = clamp((dot(N, lv / d) + wrap) / (1.0 + wrap), 0.0, 1.0);
    acc += lc.rgb * lc.w * fall * nl;
  }
  return albedo * acc * 0.55 / max(ex, 1e-6) + gridLit(wp, N, albedo, wrap, ex);
}
`;

/** The frost↔meadow border (Phase 8): the snowline breaks into patches instead of a cross-fade.
 *  frost = the frost share of frost + meadow (0..1, 8 m bilinear); returns (snow 0/1-ish, melt
 *  band around the patches). Shared by the terrain, the grass and the ground cover so nothing
 *  grows out of the snow. Self-contained (its own hash). */
export const BORDER_WGSL = /* wgsl */ `
fn bdHash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn bdNoise(p: vec2f) -> f32 {
  let i = floor(p); let f = p - i; let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(bdHash(i), bdHash(i + vec2f(1.0, 0.0)), u.x), mix(bdHash(i + vec2f(0.0, 1.0)), bdHash(i + vec2f(1.0, 1.0)), u.x), u.y);
}
fn borderSnow(p: vec2f, frost: f32) -> vec2f {
  // Large lobes, then ever finer raggedness at the edge (a snowline is crisp and torn, not soft).
  let n = bdNoise(p * 0.018) * 0.5 + bdNoise(p * 0.07 + 3.1) * 0.28 + bdNoise(p * 0.31 + 7.7) * 0.14
        + bdNoise(p * 1.3 + 1.9) * 0.06 + bdNoise(p * 4.1 + 5.3) * 0.02;
  let v = frost + (n - 0.5) * 0.75;
  let snow = smoothstep(0.494, 0.506, v);
  return vec2f(snow, smoothstep(0.38, 0.494, v) * (1.0 - snow));
}
`;
