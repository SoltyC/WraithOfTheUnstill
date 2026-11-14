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
import { WSIM_SAMPLE_WGSL } from './waterSim.wgsl.js';
import { WEATHER_FOG_WGSL } from './post/fog.wgsl.js';
import { SOUNDING } from '../world/sounding.js';

/** Under the water (Phase 10 U1; post/compose applies the same): extinction (1/m) and what the
 *  body scatters back per unit of light, for clear water and the mire's tannin. */
export const UNDERWATER_WGSL = /* wgsl */ `
const UW_SIG_CLEAR: vec3f = vec3f(0.30, 0.07, 0.05);
const UW_SIG_TANNIN: vec3f = vec3f(1.0, 1.45, 2.6);
const UW_ALB_CLEAR: vec3f = vec3f(0.05, 0.13, 0.15);
const UW_ALB_TANNIN: vec3f = vec3f(0.035, 0.022, 0.008);
fn uwHash(p: vec2f) -> f32 { var q = fract(p * vec2f(0.1031, 0.1030)); q += dot(q, q.yx + 33.33); return fract((q.x + q.y) * q.x); }
fn uwNoise(p: vec2f) -> f32 {
  let i = floor(p); let f = p - i; let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(uwHash(i), uwHash(i + vec2f(1.0, 0.0)), u.x), mix(uwHash(i + vec2f(0.0, 1.0)), uwHash(i + vec2f(1.0, 1.0)), u.x), u.y) * 2.0 - 1.0;
}
/** Where the rippled surface focuses the sun (0..1): two drifting ridged layers, sharpened. */
fn uwFocus(s: vec2f, t: f32) -> f32 {
  let a = 1.0 - abs(uwNoise(s * 0.42 + vec2f(t * 0.07, t * 0.04)));
  let b = 1.0 - abs(uwNoise(s * 0.61 - vec2f(t * 0.05, -t * 0.06) + 7.3));
  return pow(a * b, 5.0);
}
`;

/** Ripple slots (render/water.js writes them; the SSR pass reads the same buffer). One more vec4
 *  follows them: the ripple simulation's window (shaders/waterSim.wgsl.js). */
export const WATER_RIPPLES = 64;

/**
 * Slope of the water surface at p (dh/dx, dh/dz) and foam, from the wind (direction × speed
 * factor) and the ripples. Needs `waterRipples: array<vec4f>` (x, z, start time, strength),
 * `waterSim: array<vec4f>` (the simulation's current state) and a value noise
 * `wNoised(p) -> vec3f` (value, d/dx, d/dy) declared by the host.
 */
export const WATER_WAVES_WGSL = /* wgsl */ `
${WSIM_SAMPLE_WGSL(WATER_RIPPLES)}
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
  // The Wraith in the water (render/water.js writes a dense trail: x, z, time, w = 8·bin + strength
  // with bin the heading in 64 steps, 64 = a splash). A body moving through water does not throw
  // rings: each trail point sends one soft crest out sideways (none ahead of where the body went),
  // and the crests of a dense trail add up to the two arms of a V wake; straight behind, the water
  // it pushed aside churns (fine broken slopes, foam), settling over a couple of seconds. A
  // splash (going in, a stroke breaking the surface) is the only ring.
  // With the simulation running (High, Medium) it carries the rings and the V: the analytic
  // crests stay off and only the churn and foam below are drawn here.
  var foam = 0.0;
  let simOn = waterRipples[${WATER_RIPPLES}u].z > 0.5;
  let fade = 1.0 - smoothstep(0.05, 0.25, fp);
  let crestK = select(1.0, 0.0, simOn);
  for (var i = 0u; i < ${WATER_RIPPLES}u; i++) {
    let R = waterRipples[i];
    if (R.w <= 0.0) { continue; }
    let age = t - R.z;
    if (age < 0.0 || age > 4.0) { continue; }
    let r = p - R.xy; let dist = length(r);
    let bin = floor(R.w / 8.0); let s = R.w - bin * 8.0;
    // The crest's distance from the point: it runs out at ripple speed (1.1 m/s), so behind a
    // wading body (3 m/s) the crests of the trail line up into arms at about the Kelvin angle.
    let crestR = 0.18 + 1.1 * age;
    if (dist > crestR + 1.2) { continue; }
    let x = dist - crestR;
    let width = 0.05 + 0.07 * age;
    let decay = exp(-age * 0.6) * s;
    let rn = r / max(dist, 0.03);
    if (bin > 63.5) {
      // A splash: a short packet of rings.
      let env = exp(-x * x / width) * decay;
      g += rn * (env * cos(x * 16.0) * 1.1 * fade * crestK);
      foam += env * (1.0 - smoothstep(0.0, 0.6, age)) * smoothstep(0.3, 0.0, x * x) * (0.55 + 0.45 * wNoised(p * 26.0 + R.z * 9.0).x);
      continue;
    }
    let ang = bin * 0.09817477; let d = vec2f(sin(ang), cos(ang));   // heading (x = sin, z = cos)
    let along = dot(r, d); let across = abs(-r.x * d.y + r.y * d.x);
    // A crest only to the sides and behind (|across| over the distance), none ahead.
    let side = smoothstep(0.0, 0.8, across / max(dist, 0.05)) * smoothstep(0.25, -0.15, along / max(dist, 0.05));
    let h = exp(-x * x / width);
    g += rn * (-2.0 * x / width * h * 0.05 * decay * side * fade * crestK);
    // The churned lane straight behind: broken fine slopes and foam, widening and calming.
    let lane = exp(-across * across / (0.06 + 0.05 * age)) * smoothstep(0.1, -0.3, along) * exp(-age * 1.4) * s;
    if (lane > 1e-3) {
      let q = p * 7.0 + vec2f(R.z * 13.1, R.z * 7.3);
      g += wNoised(q).yz * (0.05 * lane * fade);
      // Two octaves, the second turned and offset: one value-noise octave showed its square cells up close.
      // (Fine: froth is many small bubbles; 24 cm cells read as blots with holes up close.)
      let fn2 = wNoised(q * 1.4).x * 0.5 + wNoised(vec2f(q.y, -q.x) * 3.3 + 3.1).x * 0.3 + wNoised(q * 7.0 + 1.7).x * 0.2;
      foam += lane * 0.36 * smoothstep(0.2, 0.85, fn2 * 0.5 + 0.5);
    }
  }
  if (simOn) {
    // The simulated ripples; finer than the pixel, their slope becomes roughness.
    let S = waterSimSample(p);
    let ks = 1.0 - smoothstep(0.3, 1.1, fp);
    g += S.xy * ks;
    lost += dot(S.xy, S.xy) * (1.0 - ks * ks) * 0.5;
  }
  return vec4f(g, foam, lost);
}
`;


/** Rain on the water (wetParams.z = rain 0..1): stateless raindrop rings — two grids of jittered cells,
 *  each ringing out on its own phase — as a surface slope, faded to roughness once a ring is smaller
 *  than the pixel's footprint fp. */
const RAIN_RIPPLES_WGSL = /* wgsl */ `
fn rainRipples(p: vec2f, t: f32, fp: f32) -> vec2f {
  var g = vec2f(0.0);
  for (var layer = 0; layer < 2; layer++) {
    let cell = select(0.62, 0.97, layer == 1);
    let q = p / cell + select(0.0, 17.3, layer == 1);
    let ci = floor(q);
    for (var j = -1; j <= 1; j++) { for (var i = -1; i <= 1; i++) {
      let c = ci + vec2f(f32(i), f32(j));
      let h = fract(sin(vec3f(dot(c, vec2f(127.1, 311.7)), dot(c, vec2f(269.5, 183.3)), dot(c, vec2f(419.2, 371.9)))) * 43758.5453);
      let ph = fract(t * (0.8 + 0.7 * h.z) + h.x * 3.0);
      // Only some cells have a drop this cycle (the density follows the rain).
      if (h.y > uniforms.wetParams.z * 0.95) { continue; }
      let d = length((q - (c + 0.15 + 0.7 * h.xy)) * cell);
      let r = ph * 0.2 * (1.0 + 0.5 * h.x);
      let x = d - r;
      let env = exp(-x * x / 0.00022) * (1.0 - ph) * (1.0 - ph);
      g += (q - (c + 0.15 + 0.7 * h.xy)) * cell / max(d, 0.01) * (env * cos(x * 95.0) * 0.3);
    } }
  }
  return g * (1.0 - smoothstep(0.03, 0.14, fp));
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
attribute flow: vec4f;               // lakes: (0, 0, 0, −1); rivers: flow direction xz, depth, strength
uniform viewProjection: mat4x4f;
uniform levels: array<vec4f,16>;
var<storage, read> levelData: array<vec4f>;
varying vWorldPos: vec3f;
varying vFlow: vec4f;
${GROUND_WGSL}
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  var p = vertexInputs.position;
  let fl = vertexInputs.flow;
  var rapids = 0.0;
  if (fl.w >= 0.0) {
    // A river: its level comes from render/water.js (the channel bed on the real terrain, smoothed
    // downstream); flow.z there is the rapids. Where the ground falls far below it (a bank on a
    // side slope), the sheet would hang in the air: tuck that corner under the ground.
    rapids = fl.z;
    let gnd = wGround(p.x, p.z);
    if (gnd < p.y - 2.2) { p.y = gnd - 0.3; }
  }
  vertexOutputs.position = uniforms.viewProjection * vec4f(p, 1.0);
  vertexOutputs.vWorldPos = p;
  vertexOutputs.vFlow = vec4f(fl.xy * (0.5 + 1.6 * max(fl.w, 0.0)), select(rapids, fl.z, fl.w < -1.5), fl.w);   // interiors keep their depth in z
}
`;

/** Clear highland water: red goes first, then green; a little green-blue body colour. */
const OPTICS = /* wgsl */ `
const W_SIGMA: vec3f = vec3f(0.42, 0.085, 0.075);   // absorption + scattering out (1/m)
const W_BODY: vec3f = vec3f(0.010, 0.026, 0.022);    // what the deep body sends back up (≈ 2–3 %: lakes are dark)
// The mire's black water (Phase 10 F1): humic tannins take the blue first, then the green, so a
// hand's depth is amber, a knee's depth tea, and anything deeper black; it sends back almost
// nothing (a mirror over a dark body). Blended in by the mire's biome weight.
const T_SIGMA: vec3f = vec3f(1.0, 1.45, 2.6);   // a 1.4 m path keeps G at half of R: brown, not red
const T_BODY: vec3f = vec3f(0.006, 0.0032, 0.0012);
var<storage, read> biomeA: array<u32>;
/** The mire's share of the biome weights at p (render/world biome map, 8 m). */
fn wMire(p: vec2f) -> f32 {
  let i = clamp(i32((p.x + 4096.0) / 8.0), 0, 1023); let j = clamp(i32((4096.0 - p.y) / 8.0), 0, 1023);
  let a = unpack4x8unorm(biomeA[j * 1024 + i]);
  // The Sounding is sea water, clear and deep (the descent goes green, then blue).
  let s = length(p - vec2f(${SOUNDING.x}.0, ${SOUNDING.z}.0));
  return smoothstep(0.25, 0.6, a.z / max(a.x + a.y + a.z + a.w, 0.05)) * smoothstep(${SOUNDING.r - 20}.0, ${SOUNDING.r + 80}.0, s);
}
${UNDERWATER_WGSL}
fn wPath(depth: f32, V: vec3f) -> f32 { return min(depth / max(abs(V.y), 0.1), 60.0); }
`;

const HEADER = (absorb) => /* wgsl */ `
${ENV_DECL}
${WIND_DECL}
uniform levels: array<vec4f,16>;
uniform waterParams: vec4f;          // x = time (s), y = caustics strength, z, w = −
${absorb ? '' : `uniform reflVP: mat4x4f;             // the planar reflection's camera (render/waterReflect.js)
uniform reflFog: vec4f;              // the post chain's weather fog (density, 1/height, base, −)
uniform reflHaze: vec4f;             // and its forest haze (density, 1/height, base, −)
var reflTex: texture_2d<f32>;
var reflTexSampler: sampler;`}
var<storage, read> levelData: array<vec4f>;
var<storage, read> waterRipples: array<vec4f>;
var<storage, read> waterSim: array<vec4f>;
varying vWorldPos: vec3f;
varying vFlow: vec4f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${absorb ? '' : SHADOW_RECEIVE_WGSL}
${WIND_WGSL}
${GROUND_WGSL}
fn wNoised(p: vec2f) -> vec3f { return noised(p); }
${WATER_WAVES_WGSL}
${RAIN_RIPPLES_WGSL}
${OPTICS}
/** The surface slope with the current: rivers carry their waves downstream (two phases of a flow
 *  map, cross-faded), roughened by the current; lakes as they are. */
fn waterSlopeF(p: vec2f, t: f32, wind: vec2f, fp: f32, fl: vec4f) -> vec4f {
  if (fl.w < 0.0) { return waterSlope(p, t, wind, fp); }
  let sp = length(fl.xy);
  let w2 = wind + fl.xy * 0.9;            // the current raises its own chop
  let ph = fract(t / 1.6); let ph2 = fract(t / 1.6 + 0.5);
  let a = waterSlope(p - fl.xy * ph * 1.6, t, w2, fp);
  let b = waterSlope(p - fl.xy * ph2 * 1.6 + vec2f(3.7, 1.3), t, w2, fp);
  let k = abs(ph * 2.0 - 1.0);
  return mix(a, b, k) * vec4f(1.0, 1.0, 1.0, 1.0) + vec4f(0.0, 0.0, 0.0, 0.002 * sp);
}
`;

export const waterAbsorbFragmentWGSL = /* wgsl */ `
${HEADER(true)}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let V = normalize(uniforms.cameraPosition - wp);
  // Seen from below (U1): the surface pass draws all of it; nothing of what lies past it is kept.
  if (uniforms.cameraPosition.y < wp.y) { fragmentOutputs.color = vec4f(0.0); return fragmentOutputs; }
  let depth = select(max(wp.y - wGround(wp.x, wp.z), 0.0), fragmentInputs.vFlow.z, fragmentInputs.vFlow.w < -1.5);   // −2: an interior's water of known depth
  let mire = wMire(wp.xz) * select(1.0, 0.0, fragmentInputs.vFlow.w < -1.5);   // an interior's water is clear
  let T = exp(-mix(W_SIGMA, T_SIGMA, mire) * wPath(depth, V));
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
            * clamp(uniforms.keyDir.y * 3.0, 0.0, 1.0) * uniforms.waterParams.y * (1.0 - 0.8 * mire);
  fragmentOutputs.color = vec4f(T * (1.0 - F) * (1.0 + caust), 0.0);
}
`;

export const waterSurfaceFragmentWGSL = /* wgsl */ `
${HEADER(false)}
${WEATHER_FOG_WGSL}
fn wHash3(c: vec2f) -> vec3f { return fract(sin(vec3f(dot(c, vec2f(127.1, 311.7)), dot(c, vec2f(269.5, 183.3)), dot(c, vec2f(419.2, 371.9)))) * 43758.5453); }
// Bog gas (the mire): now and then a bubble rises, swells the surface into a bead and pops into a
// small ring. Stateless: cells of 3 m, a third of them with a vent on its own slow period.
// Out: slope xy, bead (0..1).
fn bogBubbles(p: vec2f, t: f32, fp: f32) -> vec3f {
  let C = 3.0;
  let ci = floor(p / C);
  let h = wHash3(ci + 31.7);
  if (h.y > 0.33 || fp > 0.12) { return vec3f(0.0); }
  let o = (ci + 0.25 + 0.5 * h.xz) * C;
  let r = p - o; let d = length(r);
  let ph = fract(t / (5.0 + 7.0 * h.z) + h.x);
  var g = vec2f(0.0); var bead = 0.0;
  if (ph > 0.94) { let u = (ph - 0.94) / 0.06; bead = exp(-d * d / 0.0016) * u; g = -r / 0.0016 * 0.02 * bead; }
  else if (ph < 0.25) {
    let u = ph / 0.25; let x = d - u * 0.45;
    let env = exp(-x * x / 0.0009) * (1.0 - u) * (1.0 - u);
    g = r / max(d, 0.01) * env * cos(x * 70.0) * 0.18;
  }
  return vec3f(g * (1.0 - smoothstep(0.03, 0.12, fp)), bead);
}
// Floating litter (the mire): leaves and needles gathered into calm patches, drifting slowly
// downwind and nudged by the ripples. Out: albedo, cover (averaged into a tint past the footprint).
fn bogLitter(p0: vec2f, t: f32, fp: f32, drift: vec2f) -> vec4f {
  let p = p0 - drift * t * 0.015;
  let clump = smoothstep(0.35, 0.75, noised(p * 0.045).x * 0.5 + 0.5 + noised(p * 0.15 + 3.0).x * 0.25);
  if (clump <= 0.0) { return vec4f(0.0); }
  let C = 0.42;
  let ci = floor(p / C);
  let h = wHash3(ci);
  let dens = clump * 0.85;
  let col = mix(vec3f(0.075, 0.05, 0.028), vec3f(0.17, 0.125, 0.05), h.z) * mix(0.7, 1.15, h.y);
  let far = dens * 0.09;
  if (fp > 0.06) { return vec4f(col, far); }
  if (h.x > dens) { return vec4f(col, far * smoothstep(0.02, 0.06, fp)); }
  let c = (ci + 0.3 + 0.4 * h.yz) * C;
  let a = h.y * 6.2831853; let ca = cos(a); let sa = sin(a);
  let q = p - c; let lq = vec2f(q.x * ca - q.y * sa, q.x * sa + q.y * ca);
  let len = 0.05 + 0.08 * h.z; let wid = len * mix(0.22, 0.5, h.x / max(dens, 0.01));
  let e = (lq.x * lq.x) / (len * len) + (lq.y * lq.y) / (wid * wid);
  let cov = smoothstep(1.0, 0.6, e);
  return vec4f(col, mix(cov, far, smoothstep(0.02, 0.06, fp)));
}
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
  let fl = fragmentInputs.vFlow;
  var sl = waterSlopeF(wp.xz, t, wf.xy * wf.z, fp, fl);
  if (uniforms.wetParams.z > 0.02) {
    // Rain: rings on the surface, and a pitted, busier water that mirrors less sharply.
    sl = vec4f(sl.xy + rainRipples(wp.xz, t, fp), sl.z, sl.w + 0.0009 * uniforms.wetParams.z);
  }
  // Screen derivatives of the slope (specular AA, below) before any branch: they need uniform flow.
  let dsx = dpdx(sl.xy); let dsy = dpdy(sl.xy);
  let mire = wMire(wp.xz) * select(1.0, 0.0, fragmentInputs.vFlow.w < -1.5);   // an interior's water is clear
  if (camPos.y < wp.y) {
    // The surface from below: Snell's window (the sky and the sun bent in through a cone of about
    // 49° round the vertical) and, outside it, the water itself mirrored by total internal reflection.
    let L0 = uniforms.keyDir; let key0 = atmoKeyColor();
    let ex0 = uniforms.fogParams.z * atmoExposure();
    let Nb = normalize(vec3f(sl.x, -1.0, sl.y));
    // (An interior's water has no sky over it: only a trace of cold light, display-referred.)
    let E = select(key0 * max(L0.y, 0.0) * 0.318 + atmoSkyUp(), vec3f(0.010, 0.016, 0.018) / max(ex0, 1e-6), fragmentInputs.vFlow.w < -1.5);
    let body = mix(UW_ALB_CLEAR, UW_ALB_TANNIN, mire) * E;
    let rr = refract(-V, Nb, 1.333);
    var colB = body;
    if (dot(rr, rr) > 1e-4) {
      let Fr = 0.02 + 0.98 * pow(1.0 - max(dot(normalize(rr), -Nb), 0.0), 5.0);
      let R = normalize(rr);
      let sun = key0 * pow(max(dot(R, L0), 0.0), 900.0) * 40.0;
      colB = select(mix(atmoSky(R) + sun, body, Fr), body, fragmentInputs.vFlow.w < -1.5);
    }
    fragmentOutputs.color = vec4f(displayTransform(colB, ex0), 0.0);
    return fragmentOutputs;
  }
  var bead = 0.0;
  if (mire > 0.05) { let bb = bogBubbles(wp.xz, t, fp) * mire; sl = vec4f(sl.xy + bb.xy, sl.zw); bead = bb.z; }
  var N = normalize(vec3f(-sl.x, 1.0, -sl.y));
  let depth = select(max(wp.y - wGround(wp.x, wp.z), 0.0), fragmentInputs.vFlow.z, fragmentInputs.vFlow.w < -1.5);   // −2: an interior's water of known depth
  let T = exp(-mix(W_SIGMA, T_SIGMA, mire) * wPath(depth, V));
  let shore = smoothstep(0.0, 0.25, depth);   // a believable fade-out width over a gentle bank
  let nv = max(dot(N, V), 0.0);
  let F = (0.02 + 0.98 * pow(1.0 - nv, 5.0)) * shore;
  let canopy = canopyAt(wp.xz);
  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  let vis = shadowVisibilityFast(wp, camPos);
  // Sun glints: GGX on the wave normal, rougher in the gusts; the disc itself where it is calm.
  let r0 = 0.012 + 0.03 * clamp(wf.z, 0.0, 1.6);
  // Specular AA (adapted from web-ocean (Noniv, MIT) ocean.js: dpdx/dpdy of the slope widen the lobe):
  // slope change across the pixel (box-filter variance /12, as GGX alpha² = 2·var) plus the sheen
  // the unresolved ripples add with range. Gated on the footprint so close-up glints stay sharp.
  let aa = (dot(dsx, dsx) + dot(dsy, dsy)) * (1.0 / 6.0) * smoothstep(0.008, 0.05, fp);
  let sheen = 0.007 * smoothstep(30.0, 400.0, dist);
  let rough = sqrt(r0 * r0 + sl.w * 2.0 + min(aa, 0.08) + sheen);
  // Grazing view (web-ocean (Noniv, MIT) ocean.js, reflection tilt): the facets seen lean toward the
  // viewer, so the reflector tilts up and mirrors higher, greyer sky as the roughness grows.
  let sigV = rough * 0.7071;
  let aV = V.y / (max(sqrt(1.0 - V.y * V.y), 1e-3) * 1.4142 * max(sigV, 1e-3));
  let tilt = 0.32 * sigV * (1.0 - smoothstep(0.0, 2.5, aV));
  let nV = normalize(N + normalize(vec3f(V.x, 0.0, V.z) + vec3f(1e-5, 0.0, 0.0)) * tilt);
  var R = reflect(-V, nV); R.y = abs(R.y);
  let ex = uniforms.fogParams.z * atmoExposure();
  let interiorW = fragmentInputs.vFlow.w < -1.5;
  // An interior's water mirrors no sky: the dark of the room (SSR adds the lamps and walls it can see).
  var sky = select(atmoSky(R) * (1.0 - 0.75 * canopy), vec3f(0.004, 0.006, 0.007) / max(ex, 1e-6), interiorW);
  // The planar reflection (trees off screen too), on its plane only, bent by the waves; where it
  // holds a tree the post chain's SSR leaves this pixel to it (alpha below).
  var planar = 0.0;
  if (abs(wp.y - waterRipples[${WATER_RIPPLES}u].w) < 0.05) {
    // A tilted facet turns the reflected ray by twice its slope, so what is mirrored shifts by
    // slope × its own distance: one look for the distance, then the bent look.
    let c0 = uniforms.reflVP * vec4f(wp, 1.0);
    let uv0 = vec2f(c0.x / c0.w * 0.5 + 0.5, 0.5 - c0.y / c0.w * 0.5);
    let a0 = textureSampleLevel(reflTex, reflTexSampler, uv0, 0.0).a;
    let bend = clamp(select(dist * 0.12, (a0 - 1.0) * 1000.0 - dist, a0 > 1.0) * 0.6, 1.5, 40.0);
    let c = uniforms.reflVP * vec4f(wp.x + sl.x * bend, wp.y, wp.z + sl.y * bend, 1.0);
    if (c.w > 0.0 && c0.w > 0.0) {
      let uv = vec2f(c.x / c.w * 0.5 + 0.5, 0.5 - c.y / c.w * 0.5);
      let rf = textureSampleLevel(reflTex, reflTexSampler, uv, 0.0);
      let edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
      planar = clamp(rf.a, 0.0, 1.0) * smoothstep(0.0, 0.03, edge);
      if (planar > 0.0) {
        // The air between the water and the tree: the post chain hazes only the view's path to
        // the water, so the reflected path gets the same weather fog and forest haze here.
        let dR = max((rf.a - 1.0) * 1000.0 - dist, 0.0);
        let cosT = dot(R, L);
        let Tf = exp(-fogOpticalDepth(wp, R, dR, uniforms.reflFog));
        let Th = exp(-fogOpticalDepth(wp, R, min(dR, 200.0), uniforms.reflHaze));
        let insF = (key * mix(hgPhase(cosT, 0.55), 0.0795775, 0.45) * 0.9 + atmoSkyUp() * 0.95) * (1.0 - Tf);
        let insH = (key * mix(hgPhase(cosT, 0.72), 0.0795775, 0.25) * 1.4 + atmoSkyUp() * 0.35) * (1.0 - Th);
        let tree = (rf.rgb / max(ex, 1e-6) * Tf + insF) * Th + insH;
        sky = mix(sky, tree, planar);
      }
    }
  }
  let H = normalize(L + V);
  let nl = max(dot(N, L), 0.0);
  let Fs = 0.02 + 0.98 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  let spec = key * ggxD(max(dot(N, H), 0.0), rough) * Fs * nl / max(4.0 * nv * nl, 0.05) * vis * nl * shore;
  // The water body: light scattered back up out of it (its colour), lit by the sun and the sky.
  let light = key * max(L.y, 0.0) * vis / PI + shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w * canopySky(canopy) + canopyFill(canopy, vec3f(0.0, 1.0, 0.0));
  let body = mix(W_BODY, T_BODY, mire) * light * (1.0 - T);
  // Foam where the ripples are young (the Wraith's splashes), lit like a rough white surface.
  var foam = clamp(sl.z * (0.6 + 0.4 * noised(wp.xz * 9.0 + t).x), 0.0, 1.0);
  // A soft wet fringe where the water thins to nothing (a faint foam line, broken up by noise).
  let fringe = smoothstep(0.0, 0.03, depth) * (1.0 - smoothstep(0.03, 0.16, depth));
  foam = max(foam, fringe * 0.3 * (0.5 + 0.5 * noised(wp.xz * 3.0 + t * 0.1).x));
  // Rivers: white water on the rapids, streaks of foam carried down the current.
  if (fl.w >= 0.0) {
    let q = wp.xz - fl.xy * t * 0.9;
    let streak = smoothstep(0.55, 0.9, noised(q * vec2f(1.6, 1.6) + 4.0).x * 0.6 + noised(q * 5.0).x * 0.4 + 0.25);
    foam = max(foam, clamp(fl.z * (0.5 + 0.5 * streak) + 0.08 * streak * min(length(fl.xy) / 2.0, 1.0), 0.0, 0.85));
  }
  let foamCol = vec3f(0.8) * (key * max(L.y, 0.1) * vis / PI + shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w);
  var col = body * (1.0 - F) + sky * F + select(spec, vec3f(0.0), interiorW);
  col = mix(col, foamCol, foam * 0.8);
  // The mire's surface: litter afloat (nudged by the ripples), the bubbles' wet beads.
  var litter = 0.0;
  if (mire > 0.05 && depth > 0.05) {
    let lt = bogLitter(wp.xz + sl.xy * 0.25, t, fp, wf.xy * wf.z);
    litter = lt.a * mire * shore;
    let Nl = normalize(vec3f(-sl.x * 0.4, 1.0, -sl.y * 0.4));
    let litCol = lt.rgb * (key * max(dot(Nl, L), 0.0) * vis / PI + shIrradiance(Nl) * uniforms.envMisc.w * (1.0 - 0.6 * canopy));
    col = mix(col, litCol, litter);
    col += key * vis * bead * 0.35 * (1.0 - litter);
  }
  // Mist on the still water at dawn, dusk and night (the mire): a thin, drifting veil over the
  // surface, thickest where the air is still, lit from the sun's side.
  if (mire > 0.05) {
    let low = smoothstep(0.45, 0.06, L.y);
    let calm = 1.0 - smoothstep(0.3, 1.4, wf.z);
    let wisps = 0.45 + 0.55 * smoothstep(-0.3, 0.6, noised(wp.xz * 0.018 - wf.xy * t * 0.04).x + 0.5 * noised(wp.xz * 0.07 + t * 0.02).x);
    let mk = min(1.0 - exp(-0.006 * mire * low * calm * wisps * dist), 0.55);
    let mistCol = key * mix(hgPhase(dot(-V, L), 0.6), 0.0795775, 0.5) * 1.6 + atmoSkyUp() * 0.95;
    col = mix(col, mistCol, mk);
  }
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, dist * 0.001);
  // Negative alpha: water (post/ssr bends its ray by these waves); magnitude = reflectance, plus 1
  // where the planar reflection holds a tree (SSR then adds no far fallback over it).
  let mask = max(F * (1.0 - foam) * (1.0 - litter), 0.035);
  fragmentOutputs.color = vec4f(displayTransform(col, ex), -mask - select(0.0, 1.0, planar > 0.5));
}
`;
