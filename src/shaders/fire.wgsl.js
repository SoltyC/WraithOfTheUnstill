// Fire (PLAN.md V6): the camp's hearth and the lit braziers. Stateless GPU particles like the
// snowfall: every quad is a hashed seed with a looping life, animated in the vertex shader from
// the clock, so nothing is uploaded per frame but eight fire positions. Per fire: flame tongues
// (soft teardrops whose colour runs from a white-gold core to red tips), embers rising on the
// heat, and smoke curling away downwind. Flames and embers add light (premultiplied, alpha 0);
// smoke is alpha-blended and lit by the sky and, low down, by the fire. Display-referred emission
// divided by the exposure, as the other emitters (spell lights, glyphs).

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';

export const FIRES = 8;
export const PER_FIRE = 112; // 48 flames, 36 embers, 28 smoke
export const FIRE_COUNT = FIRES * PER_FIRE;

export const fireVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = particle id, yz = quad corner (−1..1)
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform fires: array<vec4f, ${FIRES}>; // xyz = base (world), w = size (0 = out)
uniform fireT: vec4f;                  // x = time (s), yz = wind direction (unit x, z), w = wind strength
varying vUv: vec2f;
varying vAlpha: f32;
varying vKind: f32;
varying vLife: f32;
varying vWorldPos: vec3f;

fn fh(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return f32((x >> 22u) ^ x) / 4294967295.0;
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let id = u32(vertexInputs.position.x + 0.5);
  let corner = vertexInputs.position.yz;
  let f = id / ${PER_FIRE}u; let k = id % ${PER_FIRE}u;
  let F = uniforms.fires[f];
  let S = F.w;
  let t = uniforms.fireT.x;
  let h1 = fh(id * 5u + 1u); let h2 = fh(id * 5u + 2u); let h3 = fh(id * 5u + 3u); let h4 = fh(id * 5u + 4u); let h5 = fh(id * 5u + 5u);
  let wind = vec3f(uniforms.fireT.y, 0.0, uniforms.fireT.z) * uniforms.fireT.w;
  var p = F.xyz; var size = 0.1; var alpha = 0.0; var kind = 0.0; var life = 0.0; var stretch = 1.0;
  if (k < 48u) {
    // Flame tongues: born at the embers, rising and narrowing, leaning a little downwind.
    life = fract(t * (1.15 + 0.7 * h1) + h2);
    let spread = (1.0 - life * 0.7) * 0.42 * S;
    p += vec3f((h4 - 0.5) * spread, life * (0.75 + 0.7 * h3) * S, (h5 - 0.5) * spread);
    p += vec3f(sin(t * 3.1 + h1 * 6.28), 0.0, cos(t * 2.7 + h2 * 6.28)) * 0.05 * life * S + wind * life * life * 0.25 * S;
    size = S * (0.36 * (1.0 - life) + 0.09) * (0.7 + 0.6 * h3);
    stretch = 1.5;
    alpha = smoothstep(0.0, 0.12, life) * (1.0 - life);
    kind = 0.0;
  } else if (k < 84u) {
    // Embers: sparks lifted on the heat, wandering, going out.
    life = fract(t * (0.3 + 0.35 * h1) + h2);
    let swirl = vec3f(sin(t * 1.7 + h1 * 6.28) + (h4 - 0.5) * 2.0, 0.0, cos(t * 1.3 + h3 * 6.28) + (h5 - 0.5) * 2.0) * life * 0.45 * S;
    p += vec3f((h4 - 0.5) * 0.3 * S, 0.3 * S + life * (2.2 + 2.4 * h3) * S, (h5 - 0.5) * 0.3 * S) + swirl + wind * life * 1.4 * S;
    size = 0.005 + 0.006 * h3;
    stretch = 2.2;
    alpha = (1.0 - life) * select(0.0, 1.0, h5 < 0.75);
    kind = 1.0;
  } else {
    // Smoke: slow puffs, widening, carried downwind and thinning.
    life = fract(t * (0.09 + 0.05 * h1) + h2);
    p += vec3f((h4 - 0.5) * 0.4 * S, (0.9 + life * 5.0) * S, (h5 - 0.5) * 0.4 * S) + wind * life * (2.5 + 2.0 * h3) * S;
    p += vec3f(sin(t * 0.5 + h1 * 6.28), 0.0, cos(t * 0.4 + h3 * 6.28)) * life * 0.6 * S;
    size = S * (0.35 + life * 1.7) * (0.8 + 0.4 * h3);
    alpha = smoothstep(0.0, 0.25, life) * (1.0 - life) * 0.32;
    kind = 2.0;
  }
  if (S <= 0.0) { alpha = 0.0; }
  // Camera-facing; flames and embers stretched upward.
  let toCam = normalize(uniforms.cameraPosition - p);
  let ax = normalize(cross(vec3f(0.0, 1.0, 0.0), toCam));
  let ay = normalize(cross(toCam, ax));
  let wp = p + ax * corner.x * size + ay * corner.y * size * stretch;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (alpha < 0.002) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vUv = corner;
  vertexOutputs.vAlpha = alpha;
  vertexOutputs.vKind = kind;
  vertexOutputs.vLife = life;
  vertexOutputs.vWorldPos = p;
}
`;

export const fireFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform fireT: vec4f;
varying vUv: vec2f;
varying vAlpha: f32;
varying vKind: f32;
varying vLife: f32;
varying vWorldPos: vec3f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let uv = fragmentInputs.vUv;
  let life = fragmentInputs.vLife;
  let kind = fragmentInputs.vKind;
  let ex = uniforms.fogParams.z * atmoExposure();
  let wp = fragmentInputs.vWorldPos;
  let t = uniforms.fireT.x;
  var outc = vec4f(0.0);
  if (kind < 0.5) {
    // A tongue: a teardrop (round below, drawn to a point above), its edge eaten by noise.
    let q = vec2f(uv.x / max(0.35 + 0.65 * (0.5 - uv.y * 0.5), 0.15), uv.y);
    let r = length(q);
    let n = noised(vec2f(uv.x * 2.3, uv.y * 1.6 - t * 3.5) + wp.xz * 3.0).x;
    let body = smoothstep(1.0, 0.25, r + 0.25 * n);
    if (body <= 0.001) { discard; }
    let temp = clamp((1.0 - life * 0.8) * (1.3 - r) - 0.08 * uv.y, 0.0, 1.0);
    let col = mix(vec3f(0.9, 0.18, 0.03), vec3f(1.0, 0.62, 0.22), smoothstep(0.1, 0.5, temp)) + vec3f(1.0, 0.85, 0.6) * smoothstep(0.55, 0.9, temp);
    let a = body * fragmentInputs.vAlpha;
    let lit = col * a * 9.0 / max(ex, 1e-6);
    outc = vec4f(displayTransform(lit, ex), 0.0);
  } else if (kind < 1.5) {
    let r2 = dot(uv, uv);
    if (r2 > 1.0) { discard; }
    let a = (1.0 - r2) * fragmentInputs.vAlpha;
    let lit = vec3f(1.0, 0.38, 0.08) * a * 5.0 / max(ex, 1e-6);
    outc = vec4f(displayTransform(lit, ex), 0.0);
  } else {
    // Smoke: a soft, lumpy puff, grey, lit by the sky and (young, low) by the fire under it.
    let r = length(uv);
    let n = noised(uv * 1.7 + wp.xz * 0.7 + vec2f(t * 0.1)).x;
    let d = smoothstep(1.0, 0.2, r + 0.3 * n);
    if (d <= 0.001) { discard; }
    let sky = shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w;
    let glow = vec3f(1.0, 0.45, 0.15) * (1.0 - smoothstep(0.0, 0.3, life)) * 0.6 / max(ex, 1e-6);
    let col = vec3f(0.2, 0.19, 0.18) * (sky + atmoKeyColor() * max(uniforms.keyDir.y, 0.0) * 0.15) + glow;
    let a = d * fragmentInputs.vAlpha;
    let lit = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(uniforms.cameraPosition - wp) * 0.001);
    outc = vec4f(displayTransform(lit, ex) * a, a);
  }
  fragmentOutputs.color = outc;
}
`;
