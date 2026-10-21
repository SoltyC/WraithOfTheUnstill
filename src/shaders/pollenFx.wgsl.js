// Pollen curtains (PLAN.md M8, the Chanter): a hanging veil of gold pollen that blinds. Stateless GPU
// particles like the fire and the gale FX: every quad is a hashed seed, placed in a disc of the
// curtain's radius from the ground to about 3 m (densest at 1-1.8 m) and animated in the vertex
// shader from the clock, so nothing is uploaded per frame but eight curtains and their ground
// heights. Fine motes drift lazily and twinkle; a few big soft blobs give the hazy body that veils
// what is behind. Alpha-blended, lit by the sky and the sun like the fire's smoke, glowing a little
// in sunlight. A curtain with strength 0 culls its quads.

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';

export const CURTAINS = 8;
export const PER_CURTAIN = 160; // 40 haze blobs, 120 motes
export const POLLEN_COUNT = CURTAINS * PER_CURTAIN;

export const pollenFxVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = particle id, yz = quad corner (−1..1)
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform pollen: array<vec4f, ${CURTAINS}>;  // x, z, radius (m), strength (0 = none)
uniform pollenY: array<vec4f, 2>;           // ground y of curtain 4i..4i+3
uniform pollenT: vec4f;                     // x = time (s), yz = wind direction (x, z)
varying vUv: vec2f;
varying vAlpha: f32;
varying vKind: f32;
varying vSeed: f32;
varying vWorldPos: vec3f;

fn ph(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return f32((x >> 22u) ^ x) / 4294967295.0;
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let id = u32(vertexInputs.position.x + 0.5);
  let corner = vertexInputs.position.yz;
  let c = id / ${PER_CURTAIN}u; let k = id % ${PER_CURTAIN}u;
  let P = uniforms.pollen[c];
  let S = P.w; let R = P.z;
  let gy = uniforms.pollenY[c / 4u][c % 4u];
  let t = uniforms.pollenT.x;
  let wind = vec3f(uniforms.pollenT.y, 0.0, uniforms.pollenT.z);
  let h1 = ph(id * 8u + 1u); let h2 = ph(id * 8u + 2u); let h3 = ph(id * 8u + 3u); let h4 = ph(id * 8u + 4u);
  let h5 = ph(id * 8u + 5u); let h6 = ph(id * 8u + 6u);
  let a0 = h1 * 6.28318;
  let rn = sqrt(h2);
  var size = 0.02; var alpha = 0.0; var kind = 0.0;
  var y = 0.0; var rr = rn * R;
  var drift = vec3f(0.0);
  if (k < 40u) {
    // A haze blob: big, soft, low alpha; it only breathes.
    y = 0.5 + 1.9 * h3;
    size = 0.7 + 0.7 * h4;
    drift = vec3f(sin(t * 0.07 + h5 * 6.28), 0.15 * sin(t * 0.11 + h6 * 6.28), cos(t * 0.06 + h6 * 6.28)) * 0.5 + wind * sin(t * 0.05 + h5 * 6.28) * 0.4;
    alpha = 0.16 * (1.0 - smoothstep(0.7, 1.0, rn)) * (0.8 + 0.2 * sin(t * 0.3 + h5 * 6.28));
    kind = 1.0;
  } else {
    // A mote: fine gold dust, densest at 1-1.8 m, a lazy drift.
    y = clamp(1.4 + (h3 + h4 - 1.0) * 1.5, 0.15, 3.0);
    size = 0.018 + 0.02 * h5;
    drift = vec3f(sin(t * 0.21 + h5 * 6.28), 0.6 * sin(t * 0.17 + h6 * 6.28), cos(t * 0.19 + h6 * 6.28)) * 0.25 + wind * (0.15 + 0.1 * h4) * sin(t * 0.1 + h3 * 6.28);
    alpha = 0.55 * (1.0 - smoothstep(0.8, 1.0, rn));
    kind = 0.0;
  }
  let p = vec3f(P.x + cos(a0) * rr, gy + y, P.y + sin(a0) * rr) + drift;
  let toCam = p - uniforms.cameraPosition;
  let dc = length(toCam);
  if (k < 40u) { alpha *= smoothstep(0.3, 1.8, dc); } // no popping when the camera passes through
  alpha *= S;
  if (S <= 0.0) { alpha = 0.0; }
  let tc = -toCam / max(dc, 1e-4);
  let ax = normalize(cross(vec3f(0.0, 1.0, 0.0), tc));
  let ay = normalize(cross(tc, ax));
  let wp = p + ax * corner.x * size + ay * corner.y * size;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (alpha < 0.002) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vUv = corner;
  vertexOutputs.vAlpha = alpha;
  vertexOutputs.vKind = kind;
  vertexOutputs.vSeed = h6;
  vertexOutputs.vWorldPos = p;
}
`;

export const pollenFxFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform pollenT: vec4f;
varying vUv: vec2f;
varying vAlpha: f32;
varying vKind: f32;
varying vSeed: f32;
varying vWorldPos: vec3f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let uv = fragmentInputs.vUv;
  let kind = fragmentInputs.vKind;
  let seed = fragmentInputs.vSeed;
  let ex = uniforms.fogParams.z * atmoExposure();
  let wp = fragmentInputs.vWorldPos;
  let t = uniforms.pollenT.x;
  let gold = vec3f(1.0, 0.82, 0.4);
  let sky = shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w;
  let cosT = dot(normalize(wp - uniforms.cameraPosition), uniforms.keyDir);
  let phase = 0.3 + 1.6 * pow(max(cosT, 0.0), 4.0);
  let sun = atmoKeyColor() * max(uniforms.keyDir.y + 0.1, 0.0) * phase / PI;
  var d = 0.0;
  var glow = 0.0;
  if (kind > 0.5) {
    // A haze blob: a soft, lumpy puff.
    let r = length(uv);
    let n = noised(uv * 1.5 + wp.xz * 0.6 + vec2f(t * 0.03)).x;
    d = smoothstep(1.0, 0.1, r + 0.25 * n);
    glow = 0.25;
  } else {
    // A mote: a tiny disc that twinkles.
    d = smoothstep(1.0, 0.3, dot(uv, uv));
    glow = 0.4 + 1.6 * pow(max(sin(t * 1.7 + seed * 50.0), 0.0), 8.0);
  }
  if (d <= 0.001) { discard; }
  let col = gold * (sky * 0.8 + sun);
  let a = d * fragmentInputs.vAlpha;
  var lit = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(uniforms.cameraPosition - wp) * 0.001);
  lit += gold * glow * (0.3 + sun) * 0.6 / max(ex, 1e-6);
  fragmentOutputs.color = vec4f(displayTransform(lit, ex) * a, a);
}
`;
