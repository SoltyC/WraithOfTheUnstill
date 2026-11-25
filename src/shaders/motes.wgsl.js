// Motes and pollen in the light (PLAN.md M4b, user: "light filtering through the leaves"): dust,
// spores and pollen hanging in the air of the groves and drifting over the meadow, seen only where
// the sun reaches them — in the shafts under the canopy they glitter, in the shade they vanish.
// Stateless like the diamond dust: a camera-centred volume of hashed seeds, each wandering slowly
// on its own (a lazy Lissajous drift) and carried by the wind; density from the canopy map (thick
// in groves, a light pollen over the open meadow). Additive (premultiplied with alpha 0).

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';
import { FIELD_WGSL } from './grass.wgsl.js';
import { WIND_DECL, WIND_WGSL } from './wind.wgsl.js';

export const MOTE_COUNT = 4000;
const R = 18; // m: half extent of the camera-centred volume

export const moteVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = mote id, yz = quad corner (−1..1)
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform levels: array<vec4f,16>;
uniform motes: vec4f;               // x = time (s), y = density 0..1, z = wind strength, w = the Ember Waste restored 0..1 (its embers)
${WIND_DECL}var<storage, read> levelData: array<vec4f>;
var<storage, read> biomeA: array<u32>;
var<storage, read> windMap: array<u32>;
var canopyTex: texture_2d<f32>;
var canopyTexSampler: sampler;
varying vUv: vec2f;
varying vAlpha: f32;
varying vWorldPos: vec3f;
varying vTint: f32;

${FIELD_WGSL}
${WIND_WGSL}
const RT: f32 = ${R}.0;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let id = u32(vertexInputs.position.x + 0.5);
  let corner = vertexInputs.position.yz;
  let cam = uniforms.cameraPosition;
  let tm = uniforms.motes.x;
  let h1 = gh(id * 7u); let h2 = gh(id * 7u + 1u); let h3 = gh(id * 7u + 2u); let h4 = gh(id * 7u + 3u);
  let h5 = gh(id * 7u + 4u); let h6 = gh(id * 7u + 5u);
  let w0 = windField(cam.xz).xy;
  // Wander: each mote drifts on its own slow loop, and the breeze carries the whole field.
  let wander = vec3f(sin(tm * (0.11 + 0.1 * h3) + h1 * 6.28), sin(tm * (0.07 + 0.08 * h4) + h2 * 6.28) * 0.6,
                     cos(tm * (0.09 + 0.1 * h5) + h3 * 6.28)) * (0.8 + 1.2 * h6);
  let carry = w0 * tm * (0.15 + 0.5 * uniforms.motes.z);
  let base = vec2f(h1, h2) * 2.0 * RT + carry + wander.xz;
  let rel = base - cam.xz;
  let wrapped = rel - 2.0 * RT * floor((rel + RT) / (2.0 * RT));
  let p = cam.xz + wrapped;
  let canopy = textureSampleLevel(canopyTex, canopyTexSampler, (p + 4096.0) / 8192.0, 0.0).r;
  let meadow = smoothstep(0.45, 0.8, gMeadow(p.x, p.y));
  // Thick in the groves (to ~9 m, under the crowns), a light pollen low over the open meadow.
  let forest = smoothstep(0.2, 0.6, canopy);
  let top = mix(2.5, 9.0, forest);
  let y = gGround(p.x, p.y) + 0.2 + top * h4 * h4 + wander.y;
  var wp0 = vec3f(p.x, y, p.y);
  // The restored Ember Waste (BRIEF §6.5, docs/phase-11/ember-release.md): embers lifting off the ground and carried on the
  // wind across it — one mote in two, rising through ten metres and going out; near the mountain only.
  let ember = uniforms.motes.w * (1.0 - smoothstep(1600.0, 2600.0, length(p - vec2f(2350.0, -2150.0)))) * step(0.5, h6);
  var life = 0.0;
  if (ember > 0.001) {
    life = fract(h4 + tm * (0.05 + 0.06 * h5));
    let lift = 10.0 * life;
    let blow = w0 * lift * (0.6 + 0.8 * h3) * (0.5 + uniforms.motes.z);
    wp0 = vec3f(p.x + blow.x, gGround(p.x, p.y) + 0.2 + lift + wander.y * 0.4, p.y + blow.y);
  }
  let dist = length(wp0 - cam);
  var alpha = uniforms.motes.y * meadow * mix(0.25, 1.0, forest)
            * (1.0 - smoothstep(RT * 0.6, RT * 0.95, length(wrapped))) * smoothstep(0.4, 1.2, dist);
  if (ember > 0.001) { alpha = ember * smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.55, 1.0, life)) * (1.0 - smoothstep(RT * 0.6, RT * 0.95, length(wrapped))) * smoothstep(0.4, 1.2, dist); }
  // Small: 3–7 mm (an ember 1–2 cm), kept ≥ ~1.5 px with the energy held (enlarged ones dimmed).
  let s0 = select(0.003 + 0.004 * h5, 0.01 + 0.01 * h5, ember > 0.001);
  let size = max(s0, dist * 0.0011);
  alpha *= (s0 / size) * (s0 / size) * 0.6 + 0.4 * (s0 / size);
  let toCam = normalize(cam - wp0);
  let right = normalize(cross(vec3f(0.0, 1.0, 0.0), toCam));
  let up = cross(toCam, right);
  let wp = wp0 + (right * corner.x + up * corner.y) * size;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (alpha < 0.003) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vUv = corner;
  vertexOutputs.vAlpha = alpha;
  vertexOutputs.vWorldPos = wp0;
  vertexOutputs.vTint = select(h3, 2.0 + life, ember > 0.001);   // (≥ 2: an ember, its age)
}
`;

export const moteFragmentWGSL = /* wgsl */ `
${ENV_DECL}
varying vUv: vec2f;
varying vAlpha: f32;
varying vWorldPos: vec3f;
varying vTint: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let r2 = dot(fragmentInputs.vUv, fragmentInputs.vUv);
  if (r2 > 1.0) { discard; }
  let wp = fragmentInputs.vWorldPos;
  let V = normalize(uniforms.cameraPosition - wp);
  let L = uniforms.keyDir;
  // Sunlit only (the shafts), strongly forward-scattering: toward the sun they glitter.
  let vis = shadowVisibilityFast(wp, uniforms.cameraPosition);
  let c = dot(-V, L);
  let phase = 0.15 + 2.5 * pow(max(c, 0.0), 6.0) + 6.0 * pow(max(c, 0.0), 40.0);
  let tint = mix(vec3f(1.0, 0.95, 0.8), vec3f(1.0, 0.98, 0.7), fragmentInputs.vTint); // dust and pollen
  var col = atmoKeyColor() * tint * phase * vis * 0.45;
  let ex = uniforms.fogParams.z * atmoExposure();
  // An ember: its own light, yellow-orange new and dull red going out (lit day or night, unlike the dust).
  if (fragmentInputs.vTint >= 2.0) {
    let age = fragmentInputs.vTint - 2.0;
    col = mix(vec3f(1.0, 0.55, 0.15), vec3f(0.8, 0.12, 0.02), age) * (0.9 + 0.1 * sin(age * 90.0)) * 1.4 / max(ex, 1e-6);
  }
  let lit = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(uniforms.cameraPosition - wp) * 0.001);
  let outc = displayTransform(lit, ex);
  let a = fragmentInputs.vAlpha * (1.0 - r2) * (1.0 - r2);
  fragmentOutputs.color = vec4f(outc * a, 0.0);
}
`;
