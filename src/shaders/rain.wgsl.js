// Rain (Phase 8 M11, weather): the falling-snow renderer's sibling. Stateless GPU streaks in a
// camera-centred column — every drop a hashed seed falling through a wrapped column, carried by the
// owner-integrated wind travel — stretched along their fall (and slant, in a storm), thin, faint,
// lit by the sky and the sun, by the lightning's key light and by the world's lamps at night. And
// ground splashes: stateless too, each a hashed seed with a looping life, a small crown of
// droplets on land and an expanding ring where the ground is water (rings on lakes and rivers).
// Premultiplied, no depth write.

import { ENV_DECL, COMMON_WGSL, GRID_LIGHT_DECL, GRID_LIGHT_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL, WATER_LEVEL_DECL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';
import { PRECIP_COMMON_WGSL } from './snowfall.wgsl.js';

export const RAIN_COUNT = 42000;
export const SPLASH_COUNT = 3000;
export const RAIN_R = 22;       // m: half extent of the camera-centred column
export const RAIN_HT = 16;      // m: column height (wrapped)
export const SPLASH_R = 15;     // m: half extent of the splash field
const RT = RAIN_R, HT = RAIN_HT;

export const rainVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = drop id, yz = quad corner (−1..1; y: −1 tail … +1 head)
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform levels: array<vec4f,16>;
uniform rain: vec4f;                // x = fall travel (m), y = density 0..1, zw = wind travel x, z (m, wrapped)
uniform screenInfo: vec4f;
uniform rainWind: vec4f;            // xy = wind direction (unit), z = fall speed (m/s), w = horizontal drift (m/s)
var<storage, read> levelData: array<vec4f>;
var<storage, read> biomeA: array<u32>;
var<storage, read> windMap: array<u32>;
varying vUv: vec2f;
varying vAlpha: f32;
varying vWorldPos: vec3f;

${PRECIP_COMMON_WGSL}
const RT: f32 = ${RT}.0;
const HT: f32 = ${HT}.0;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let id = u32(vertexInputs.position.x + 0.5);
  let corner = vertexInputs.position.yz;
  let cam = uniforms.cameraPosition;
  let h1 = hsh(id * 7u); let h2 = hsh(id * 7u + 1u); let h3 = hsh(id * 7u + 2u); let h4 = hsh(id * 7u + 3u); let h5 = hsh(id * 7u + 4u);
  let wd = uniforms.rainWind.xy;
  // Fall speed varies in eighths (the owner wraps the travel by whole eighth-columns: no pop).
  let kSpeed = (6.0 + floor(h3 * 5.0)) / 8.0;
  let base = vec2f(h1, h2) * 2.0 * RT + uniforms.rain.zw;
  let rel = base - cam.xz;
  let wrapped = rel - 2.0 * RT * floor((rel + RT) / (2.0 * RT));
  let p = cam.xz + wrapped;
  let ycol = h5 * HT - uniforms.rain.x * kSpeed;
  let yrel = ycol - HT * floor((ycol - (cam.y - HT * 0.4)) / HT);
  let g = groundAtD(p.x, p.y);
  let head = vec3f(p.x, yrel, p.y);
  let dist = length(head - cam);
  // The share of the drops that fall follows the density; drops stop at the ground and fade at
  // the column's edge and right at the lens.
  var alpha = select(0.0, 1.0, h4 * 0.999 < uniforms.rain.y) * smoothstep(0.0, 0.25, head.y - g)
            * (1.0 - smoothstep(RT * 0.5, RT * 0.95, length(wrapped))) * smoothstep(0.6, 2.2, dist);
  // The streak runs along the drop's motion (fall + drift), long enough to read at the shutter.
  let vel = vec3f(wd.x * uniforms.rainWind.w, -uniforms.rainWind.z * kSpeed, wd.y * uniforms.rainWind.w);
  let speed = length(vel);
  let axis = vel / speed;
  let len = speed * (0.05 + 0.04 * h2) * (1.0 + 0.1 * clamp(dist / 20.0, 0.0, 1.0));
  let toCam = normalize(cam - head);
  let side = normalize(cross(axis, toCam) + vec3f(1e-5, 0.0, 0.0));
  // Thin, but never under ~1 px wide: wider far drops are dimmed to the same energy.
  // (a pixel of the internal render — the dynamic resolution scales it — is ~1.15 · dist / height)
  let width = max(0.0026 + 0.0016 * h5, dist * 1.5 * uniforms.screenInfo.w);
  alpha *= min(1.0, 0.0085 / width);
  let lt = corner.y * 0.5 + 0.5;
  let wp = head - axis * len * (1.0 - lt) + side * corner.x * width;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (alpha < 0.004) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vUv = vec2f(corner.x, lt);
  vertexOutputs.vAlpha = alpha;
  vertexOutputs.vWorldPos = head;
}
`;

export const rainFragmentWGSL = /* wgsl */ `
${ENV_DECL}
varying vUv: vec2f;
varying vAlpha: f32;
varying vWorldPos: vec3f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
${GRID_LIGHT_DECL}
${GRID_LIGHT_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let u = fragmentInputs.vUv;
  let wp = fragmentInputs.vWorldPos;
  let V = normalize(uniforms.cameraPosition - wp);
  let ex = uniforms.fogParams.z * atmoExposure();
  // A drop is a tiny lens: it carries the sky behind it (brightest toward the bright horizon and
  // a lit deck), a glint of the sun (and the lightning's key light) through it, and the lamps' glow.
  let c = dot(-V, uniforms.keyDir);
  let glint = 0.15 + 1.4 * pow(max(c, 0.0), 8.0);
  let vis = shadowVisibilityFast(wp, uniforms.cameraPosition);
  let sky = (shIrradiance(V) + shIrradiance(vec3f(0.0, 1.0, 0.0))) * uniforms.envMisc.w * 0.75;
  var col = sky + atmoKeyColor() * glint * vis * 0.2 + gridAcc(wp, V, 1.0) * 0.55 / max(ex, 1e-6) * 0.9;
  let lit = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(uniforms.cameraPosition - wp) * 0.001);
  let outc = displayTransform(lit, ex);
  // Across the streak a soft gaussian; along it the head is brightest and the tail fades out.
  let across = exp(-u.x * u.x * 2.6);
  let along = smoothstep(0.0, 0.85, u.y) * (0.35 + 0.65 * u.y);
  let a = fragmentInputs.vAlpha * across * along * 0.85;
  fragmentOutputs.color = vec4f(outc * a, a);
}
`;

// ── Splashes ────────────────────────────────────────────────────────────────────────────────────
export const splashVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = splash id, yz = quad corner (−1..1)
attribute uv: vec2f;                // x = kind: 0 ring (flat), 1 crown (upright)
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform levels: array<vec4f,16>;
uniform rain: vec4f;                // y = density 0..1
uniform splash: vec4f;              // x = time (s), y = splash density 0..1
var<storage, read> levelData: array<vec4f>;
var<storage, read> biomeA: array<u32>;
var<storage, read> windMap: array<u32>;
${WATER_LEVEL_DECL}
varying vUv: vec2f;
varying vAlpha: f32;
varying vWorldPos: vec3f;
varying vInfo: vec4f;               // x = life 0..1, y = on water (1), z = kind, w = seed

${PRECIP_COMMON_WGSL}
const SR: f32 = ${SPLASH_R}.0;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let id = u32(vertexInputs.position.x + 0.5);
  let corner = vertexInputs.position.yz;
  let kind = vertexInputs.uv.x;
  let cam = uniforms.cameraPosition;
  let hp = hsh(id * 5u + 1u);
  // Each splash lives PERIOD seconds, then lands somewhere new (the cycle index reseeds it).
  let period = 0.32 + 0.5 * hsh(id * 5u + 2u);
  let tt = uniforms.splash.x / period + hp;
  let cyc = u32(floor(tt)) ;
  let life = fract(tt);
  let s1 = hsh(id * 131u + cyc * 7u); let s2 = hsh(id * 131u + cyc * 7u + 3u); let s3 = hsh(id * 131u + cyc * 7u + 5u);
  // Positions are fixed in the world, wrapped round the camera.
  let base = vec2f(s1, s2) * 2.0 * SR;
  let rel = base - cam.xz;
  let wrapped = rel - 2.0 * SR * floor((rel + SR) / (2.0 * SR));
  let p = cam.xz + wrapped;
  let g = groundAtD(p.x, p.y);
  let wl = waterLevelV(p);
  let onWater = select(0.0, 1.0, wl > g + 0.02);
  let y = select(g, wl, onWater > 0.5);
  let dist = length(vec3f(p.x, y, p.y) - cam);
  let share = uniforms.splash.y;
  var alpha = select(0.0, 1.0, s3 * 0.999 < share) * (1.0 - smoothstep(SR * 0.55, SR * 0.97, length(wrapped))) * smoothstep(0.4, 1.5, dist);
  // Rings spread on water, a little crown of droplets leaps from land. Far ones grow to stay ~1 px.
  var wp: vec3f;
  let boost = 1.0 + dist * 0.045;
  if (kind < 0.5) {
    let r = select(0.05, 0.26, onWater > 0.5) * boost * (0.45 + 0.55 * sqrt(life));
    wp = vec3f(p.x + corner.x * r, y + 0.012, p.y + corner.y * r);
  } else {
    let toCam = normalize(vec3f(cam.x - p.x, 0.0, cam.z - p.y) + vec3f(1e-5, 0.0, 0.0));
    let right = vec3f(-toCam.z, 0.0, toCam.x);
    let w = 0.2 * boost; let h = 0.26 * boost;
    wp = vec3f(p.x, y, p.y) + right * corner.x * w + vec3f(0.0, (corner.y * 0.5 + 0.5) * h, 0.0);
    // Crowns are for land (on water the ring is the splash).
    alpha *= 1.0 - onWater;
  }
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (alpha < 0.004) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vUv = corner;
  vertexOutputs.vAlpha = alpha;
  vertexOutputs.vWorldPos = vec3f(p.x, y, p.y);
  vertexOutputs.vInfo = vec4f(life, onWater, kind, s3 * 91.0 + f32(cyc));
}
`;

export const splashFragmentWGSL = /* wgsl */ `
${ENV_DECL}
varying vUv: vec2f;
varying vAlpha: f32;
varying vWorldPos: vec3f;
varying vInfo: vec4f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${GRID_LIGHT_DECL}
${GRID_LIGHT_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let u = fragmentInputs.vUv;
  let info = fragmentInputs.vInfo;
  let life = info.x;
  let wp = fragmentInputs.vWorldPos;
  let V = normalize(uniforms.cameraPosition - wp);
  let ex = uniforms.fogParams.z * atmoExposure();
  var shape = 0.0;
  if (info.z < 0.5) {
    // Ring: thin, expanding, fading; a faint disc of disturbance inside it on land.
    let d = length(u);
    let r = 0.55 + 0.4 * life;
    let w = 0.07 + 0.1 * life;
    shape = exp(-pow((d - r) / w, 2.0)) * (1.0 - life) * (1.0 - life);
    if (info.y < 0.5) { shape = shape * 0.2 + exp(-d * d * 6.0) * (1.0 - life * life) * 0.22 * smoothstep(0.5, 0.0, life); }
    if (d > 1.0) { shape = 0.0; }
  } else {
    // Crown: a few droplets thrown up and out on little arcs.
    for (var k = 0; k < 5; k++) {
      let hk = hash12(vec2f(info.w, f32(k) * 3.7));
      let ang = (hk - 0.5) * 2.0;
      let t = life * 0.9;
      let dp = vec2f(ang * t * 0.8, 0.1 + (0.55 + 0.35 * hash12(vec2f(f32(k), info.w))) * t * 1.9 - 1.7 * t * t * 1.9 * 0.5);
      let q = vec2f(u.x - dp.x, (u.y * 0.5 + 0.5) - dp.y);
      shape += exp(-dot(q, q) * 900.0) * (1.0 - life);
    }
    shape = min(shape, 1.0) * 0.8;
  }
  // The splash shows the sky (brightest on water) and the lamps.
  let sky = atmoSkyUp() * 1.1 + shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w * 0.5;
  let col = sky * mix(0.7, 1.0, info.y) + atmoKeyColor() * 0.04 + gridAcc(wp + vec3f(0.0, 0.3, 0.0), V, 1.0) * 0.55 / max(ex, 1e-6);
  let lit = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(uniforms.cameraPosition - wp) * 0.001);
  let outc = displayTransform(lit, ex);
  let a = clamp(fragmentInputs.vAlpha * shape * mix(0.55, 0.38, info.y), 0.0, 1.0);
  fragmentOutputs.color = vec4f(outc * a, a);
}
`;
