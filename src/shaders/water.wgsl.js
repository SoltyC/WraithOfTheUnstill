// Water (PLAN.md Phase 8 M5 look-dev; user: "very realistic looking water with reflections").
// Lakes are flat meshes at their baked level (render/water.js). Two draws per water pixel:
//   1. absorb   multiplies what is already drawn beneath (the lakebed, the Wraith's legs) by the
//               water's transmittance over the view path — clear in the shallows, dark green-blue
//               in the deep — with sun caustics dancing on the bed;
//   2. surface  adds the light the water body scatters, the sky reflection (Fresnel) and the sun's
//               glints, writes depth, and marks the pixel for the post chain's screen-space
//               reflections with a negative alpha (−reflectance): the SSR pass (post/ssr) knows the
//               pixel is water, bends its ray by the same waves, and where the ray finds nothing
//               reflects the distant scene and the clouds (shaders/post/ssr.wgsl.js).
// Waves: a gravity–capillary spectrum aligned with the wind field (world/wind.js) at each point —
// the gust fronts roughen the lake as they cross it; still air leaves a mirror. The Wraith's
// ripples (expanding rings and their wake, render/water.js) add to the same slope function, so
// reflections and glints break up around it too.

import { CLIPMAP_N, CLIPMAP_LEVELS } from './clipmap.wgsl.js';
import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';
import { WIND_DECL, WIND_WGSL } from './wind.wgsl.js';

/** Ripple slots (render/water.js writes them; the SSR pass reads the same buffer). */
export const WATER_RIPPLES = 24;

/**
 * Slope of the water surface at p (dh/dx, dh/dz) and foam, from the wind (direction × speed
 * factor) and the ripples. Needs `waterRipples: array<vec4f>` (x, z, start time, strength) and a
 * value noise `wNoised(p) -> vec3f` (value, d/dx, d/dy) declared by the host.
 */
export const WATER_WAVES_WGSL = /* wgsl */ `
fn waterHash(i: f32) -> f32 { return fract(sin(i * 91.7 + 3.1) * 43758.5453); }
// fp: the pixel's footprint on the water (m). A wave train shorter than the footprint fades out
// and its slope becomes roughness (w: the slope variance it took with it) — no aliasing stripes.
fn waterSlope(p: vec2f, t: f32, wind: vec2f, fp: f32) -> vec4f {
  let wsp = length(wind);
  let wd = select(vec2f(1.0, 0.0), wind / wsp, wsp > 1e-4);
  let calm = clamp(wsp, 0.0, 1.8);
  var g = vec2f(0.0);
  var lost = 0.0;
  // Ten wave trains, 9 cm to 4 m, spread about the wind; short ones answer the wind at once.
  for (var i = 0; i < 10; i++) {
    let fi = f32(i);
    let lam = 0.09 * pow(1.52, fi);
    let k = 6.2831853 / lam;
    let w = sqrt(9.81 * k + 7.4e-5 * k * k * k);       // gravity–capillary dispersion
    let ang = (waterHash(fi) - 0.5) * 2.4;
    let ca = cos(ang); let sa = sin(ang);
    let d = vec2f(wd.x * ca - wd.y * sa, wd.x * sa + wd.y * ca);
    let st0 = 0.05 * smoothstep(0.0, 0.2 + 0.45 * fi / 9.0, calm) * (0.55 + 0.45 * min(calm, 1.0));
    let keep = 1.0 - smoothstep(lam * 0.12, lam * 0.45, fp);
    let st = st0 * keep;
    lost += st0 * st0 * (1.0 - keep * keep);
    let ph = k * dot(d, p) - w * t + waterHash(fi + 17.0) * 6.2831853;
    g += d * (st * cos(ph));
  }
  // Cat's paws: patchy, drifting fine roughness (two octaves of noise, carried downwind).
  let q = p * 2.3 + wd * t * 0.9;
  let kq = 1.0 - smoothstep(0.05, 0.2, fp);
  g += (wNoised(q).yz * 0.010 + wNoised(q * 2.7 + 11.0).yz * 0.006) * calm * kq;
  lost += 0.0001 * calm * (1.0 - kq);
  // The Wraith's ripples: rings running outward, a packet each, fading.
  var foam = 0.0;
  for (var i = 0u; i < ${WATER_RIPPLES}u; i++) {
    let R = waterRipples[i];
    if (R.w <= 0.0) { continue; }
    let age = t - R.z;
    if (age < 0.0 || age > 3.5) { continue; }
    let r = p - R.xy; let dist = length(r);
    let x = dist - 0.08 - 0.8 * age;
    let width = 0.08 + 0.2 * age;
    let env = exp(-x * x / width) * exp(-age * 1.15) * R.w;
    if (env < 1e-4) { continue; }
    g += r / max(dist, 0.03) * (env * cos(x * 17.0) * 1.1 * (1.0 - smoothstep(0.05, 0.2, fp)));
    foam += env * (1.0 - smoothstep(0.0, 0.7, age)) * smoothstep(0.35, 0.0, x * x);
  }
  return vec4f(g, foam, lost);
}
`;

const GROUND_WGSL = /* wgsl */ `
const V: u32 = ${CLIPMAP_N + 1}u;
const HALF: f32 = ${CLIPMAP_N / 2}.0;
fn wGround(x: f32, z: f32) -> f32 {
  for (var l = 0u; l < ${CLIPMAP_LEVELS}u; l++) {
    let L = uniforms.levels[l];
    let g = (vec2f(x, z) - L.xy) / L.z + HALF;
    if (g.x >= 1.0 && g.y >= 1.0 && g.x < 2.0 * HALF - 1.0 && g.y < 2.0 * HALF - 1.0) {
      let b = floor(g); let t = g - b; let i = u32(b.x); let j = u32(b.y);
      return mix(mix(levelData[(l * V + j) * V + i].x, levelData[(l * V + j) * V + i + 1u].x, t.x),
                 mix(levelData[(l * V + j + 1u) * V + i].x, levelData[(l * V + j + 1u) * V + i + 1u].x, t.x), t.y);
    }
  }
  return -1e4;
}
`;

export const waterVertexWGSL = /* wgsl */ `
attribute position: vec3f;
uniform viewProjection: mat4x4f;
varying vWorldPos: vec3f;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  vertexOutputs.position = uniforms.viewProjection * vec4f(vertexInputs.position, 1.0);
  vertexOutputs.vWorldPos = vertexInputs.position;
}
`;

/** Clear highland water: red goes first, then green; a little green-blue body colour. */
const OPTICS = /* wgsl */ `
const W_SIGMA: vec3f = vec3f(0.42, 0.085, 0.075);   // absorption + scattering out (1/m)
const W_BODY: vec3f = vec3f(0.010, 0.026, 0.022);    // what the deep body sends back up (≈ 2–3 %: lakes are dark)
fn wPath(depth: f32, V: vec3f) -> f32 { return min(depth / max(abs(V.y), 0.1), 60.0); }
`;

const HEADER = (absorb) => /* wgsl */ `
${ENV_DECL}
${WIND_DECL}
uniform levels: array<vec4f,16>;
uniform waterParams: vec4f;          // x = time (s), y = caustics strength, z, w = −
var<storage, read> levelData: array<vec4f>;
var<storage, read> waterRipples: array<vec4f>;
varying vWorldPos: vec3f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${absorb ? '' : SHADOW_RECEIVE_WGSL}
${WIND_WGSL}
${GROUND_WGSL}
fn wNoised(p: vec2f) -> vec3f { return noised(p); }
${WATER_WAVES_WGSL}
${OPTICS}
`;

export const waterAbsorbFragmentWGSL = /* wgsl */ `
${HEADER(true)}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let V = normalize(uniforms.cameraPosition - wp);
  let depth = max(wp.y - wGround(wp.x, wp.z), 0.0);
  let T = exp(-W_SIGMA * wPath(depth, V));
  // Light lost at the surface (flat-water Fresnel: the surface pass adds the reflection back).
  let F = 0.02 + 0.98 * pow(1.0 - abs(V.y), 5.0);
  // Caustics on the bed: two drifting cell layers focusing the sun, strongest in the shallows and
  // with wind on the water (a mirror focuses nothing).
  let t = uniforms.waterParams.x;
  let wf = windField(wp.xz);
  let bed = wp.xz - V.xz / max(abs(V.y), 0.15) * depth; // where the view ray meets the bed (no refraction)
  let c1 = 1.0 - abs(noised(bed * 1.6 + vec2f(t * 0.21, t * 0.13)).x);
  let c2 = 1.0 - abs(noised(bed * 2.3 - vec2f(t * 0.17, -t * 0.19) + 7.0).x);
  let caust = pow(c1 * c2, 7.0) * 2.6 * clamp(wf.z, 0.0, 1.0) * exp(-depth * 0.6) * smoothstep(0.02, 0.3, depth)
            * clamp(uniforms.keyDir.y * 3.0, 0.0, 1.0) * uniforms.waterParams.y;
  fragmentOutputs.color = vec4f(T * (1.0 - F) * (1.0 + caust), 0.0);
}
`;

export const waterSurfaceFragmentWGSL = /* wgsl */ `
${HEADER(false)}
fn ggxD(nh: f32, a: f32) -> f32 { let a2 = a * a; let d = nh * nh * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let toCam = camPos - wp; let dist = length(toCam);
  let V = toCam / dist;
  let t = uniforms.waterParams.x;
  let wf = windField(wp.xz);
  let fp = length(fwidth(wp.xz));
  let sl = waterSlope(wp.xz, t, wf.xy * wf.z, fp);
  var N = normalize(vec3f(-sl.x, 1.0, -sl.y));
  let depth = max(wp.y - wGround(wp.x, wp.z), 0.0);
  let T = exp(-W_SIGMA * wPath(depth, V));
  let shore = smoothstep(0.0, 0.05, depth);
  let nv = max(dot(N, V), 0.0);
  let F = (0.02 + 0.98 * pow(1.0 - nv, 5.0)) * shore;
  var R = reflect(-V, N); R.y = abs(R.y);
  let canopy = canopyAt(wp.xz);
  let sky = atmoSky(R) * (1.0 - 0.75 * canopy);
  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  let vis = shadowVisibilityFast(wp, camPos);
  // Sun glints: GGX on the wave normal, rougher in the gusts; the disc itself where it is calm.
  let r0 = 0.012 + 0.03 * clamp(wf.z, 0.0, 1.6);
  let rough = sqrt(r0 * r0 + sl.w * 2.0);
  let H = normalize(L + V);
  let nl = max(dot(N, L), 0.0);
  let Fs = 0.02 + 0.98 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  let spec = key * ggxD(max(dot(N, H), 0.0), rough) * Fs * nl / max(4.0 * nv * nl, 0.05) * vis * nl * shore;
  // The water body: light scattered back up out of it (its colour), lit by the sun and the sky.
  let light = key * max(L.y, 0.0) * vis / PI + shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w * canopySky(canopy) + canopyFill(canopy, vec3f(0.0, 1.0, 0.0));
  let body = W_BODY * light * (1.0 - T);
  // Foam where the ripples are young (the Wraith's splashes), lit like a rough white surface.
  let foam = clamp(sl.z * (0.6 + 0.4 * noised(wp.xz * 9.0 + t).x), 0.0, 1.0);
  let foamCol = vec3f(0.8) * (key * max(L.y, 0.1) * vis / PI + shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w);
  var col = body * (1.0 - F) + sky * F + spec;
  col = mix(col, foamCol, foam * 0.8);
  let ex = uniforms.fogParams.z * atmoExposure();
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, dist * 0.001);
  // Negative alpha: water (post/ssr bends its ray by these waves); magnitude = reflectance.
  let mask = max(F * (1.0 - foam), 0.035);
  fragmentOutputs.color = vec4f(displayTransform(col, ex), -mask);
}
`;
