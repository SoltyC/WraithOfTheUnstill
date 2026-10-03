// The Wraith's effects (BRIEF §8.1): footfall spray (snow kicked up on the exact frame a foot
// plants; dust where the ground is not snow) and the glow sprites (the faint cold light deep in
// the cowl, the element's light at the fingertips). One mesh of camera-facing quads; per-quad data
// in a storage buffer (two vec4 per quad), written by the CPU once per frame. Spray motion is
// analytic from its spawn record (position, time, velocity, size), so only spawns are written.
// Premultiplied alpha: spray blends, glows add (alpha 0).

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';

export const FX_GLOWS = 3;
export const FX_SPRAY = 1536;
export const FX_COUNT = FX_GLOWS + FX_SPRAY;
export const SPRAY_LIFE = 1.1;

export const fxVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = quad id, yz = corner (−1..1)
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform fxParams: vec4f;            // x = time (s), y = wind x, z = wind z
var<storage, read> fxData: array<vec4f>;
var<storage, read> biomeA: array<u32>;
varying vUv: vec2f;
varying vAlpha: f32;
varying vColor: vec3f;
varying vWorldPos: vec3f;
varying vKind: f32;

const N8: i32 = 1024; const C8: f32 = 8.0; const W_HALF: f32 = 4096.0;
fn frostAtF(x: f32, z: f32) -> f32 {
  let i = clamp(i32((x + W_HALF) / C8), 0, N8 - 1); let j = clamp(i32((W_HALF - z) / C8), 0, N8 - 1);
  let a = unpack4x8unorm(biomeA[j * N8 + i]);
  return a.x / max(a.x + a.y + a.z + a.w, 0.05);
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let id = u32(vertexInputs.position.x + 0.5);
  let corner = vertexInputs.position.yz;
  let a = fxData[id * 2u];
  let b = fxData[id * 2u + 1u];
  let cam = uniforms.cameraPosition;
  var p = a.xyz;
  var size = b.w;
  var alpha = 0.0;
  var color = b.xyz;
  var kind = 0.0;
  if (id < ${FX_GLOWS}u) {
    // Glow: a.w = 1 when shown; b = colour (display-referred), size. Pulled toward the camera a
    // little so the hood's inner wall does not clip the quad.
    kind = 1.0;
    alpha = a.w;
    p += normalize(cam - p) * size * 0.6;
  } else {
    // Spray: a = spawn position, spawn time; b = velocity, size (negative: slush/water, heavy).
    let age = uniforms.fxParams.x - a.w;
    let wet = b.w < 0.0;
    // Size above 0.5 m: a billow of powder (the Warden's release wave) — long-lived, rolling.
    let big = b.w > 0.5;
    let life = select(select(${SPRAY_LIFE}, 0.8, wet), 3.4, big);
    if (age >= 0.0 && age < life) {
      let k = select(select(3.2, 1.3, wet), 0.9, big);  // air drag: fine snow floats, slush falls
      let gr = select(select(2.2 * 3.2, 9.8, wet), 0.5, big);
      let e = (1.0 - exp(-k * age)) / k;
      let wind = vec3f(uniforms.fxParams.y, 0.0, uniforms.fxParams.z) * select(0.6, 0.15, wet);
      p = a.xyz + b.xyz * e + wind * (age - e) + vec3f(0.0, -gr, 0.0) * (age - e) / k;
      p.y = max(p.y, a.y - 0.01);
      let t = age / life;
      size = abs(b.w) * (1.0 + select(select(2.5, 0.6, wet), 1.6, big) * t);
      let frost = frostAtF(a.x, a.z);
      if (wet) {
        alpha = (1.0 - t) * smoothstep(0.0, 0.03, age) * 0.75;
        color = vec3f(0.5, 0.6, 0.68);
      } else {
        alpha = (1.0 - t) * (1.0 - t) * smoothstep(0.0, 0.05, age) * mix(0.15, 0.36, frost);
        // Billows cast no shadow (kind 2: the shadow pass skips them; dithered cover from
        // metre-wide puffs would screen-door the ground).
        if (big) { alpha = (1.0 - t) * (1.0 - t) * smoothstep(0.0, 0.35, age) * 0.42; kind = 2.0; }
        // Snow on snow; pale grey-brown dust elsewhere.
        color = mix(vec3f(0.42, 0.38, 0.32), vec3f(0.92, 0.95, 1.0), frost);
      }
    }
  }
  let toCam = normalize(cam - p);
  let right = normalize(cross(vec3f(0.0, 1.0, 0.0), toCam));
  let up = cross(toCam, right);
  let wp = p + (right * corner.x + up * corner.y) * size;
  // Puffs right at the camera fade out (no screen-filling overdraw).
  if (kind < 0.5) { alpha *= smoothstep(1.0, 3.0, length(p - cam)); }
  if (kind > 1.5) { alpha *= smoothstep(2.0, 8.0, length(p - cam)); }
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (alpha < 0.002) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vUv = corner;
  vertexOutputs.vAlpha = alpha;
  vertexOutputs.vColor = color;
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vKind = kind;
}
`;

export const fxFragmentWGSL = /* wgsl */ `
${ENV_DECL}
varying vUv: vec2f;
varying vAlpha: f32;
varying vColor: vec3f;
varying vWorldPos: vec3f;
varying vKind: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let r2 = dot(fragmentInputs.vUv, fragmentInputs.vUv);
  if (r2 > 1.0) { discard; }
  if (fragmentInputs.vKind > 0.5 && fragmentInputs.vKind < 1.5) {
    // Additive glow: a tight core and a soft halo (display-referred).
    let k = (exp(-r2 * 30.0) + 0.3 * exp(-r2 * 6.0)) * (1.0 - r2) * fragmentInputs.vAlpha;
    fragmentOutputs.color = vec4f(fragmentInputs.vColor * k, 0.0);
    return fragmentOutputs;
  }
  // Spray puff: soft disc, lit by the sun (forward scattering) and the sky.
  let shape = pow(1.0 - r2, 1.5);
  let a = clamp(fragmentInputs.vAlpha * shape, 0.0, 1.0);
  if (a < 0.002) { discard; }
  let wp = fragmentInputs.vWorldPos;
  let V = normalize(uniforms.cameraPosition - wp);
  let L = uniforms.keyDir;
  let gg = 0.5; let c = dot(-V, L);
  let hg = (1.0 - gg * gg) / pow(max(1.0 + gg * gg - 2.0 * gg * c, 1e-3), 1.5) * (1.0 / (4.0 * PI));
  let vis = shadowVisibilityFast(wp, uniforms.cameraPosition);
  // A cloud of ice grains scatters light many times: in shade it glows with the sky (bright,
  // never sooty), in sun it lights up, most toward the sun.
  let col = fragmentInputs.vColor * (atmoKeyColor() * (0.3 + hg) * vis + shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w * 2.2);
  let lit = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(uniforms.cameraPosition - wp) * 0.001);
  let outc = displayTransform(lit, uniforms.fogParams.z * atmoExposure());
  fragmentOutputs.color = vec4f(outc * a, a);
}
`;

/** Shadow pass for the spray (glows cast nothing): dithered coverage from the puff's opacity, so
 *  the filtered shadow is soft and as dense as the plume. Writes light-space depth like
 *  shadowDepth (shaders/shadows.wgsl.js). */
export const fxShadowFragmentWGSL = /* wgsl */ `
uniform shadowLight: vec4f;
uniform shadowOrigin: vec4f;
varying vUv: vec2f;
varying vAlpha: f32;
varying vColor: vec3f;
varying vWorldPos: vec3f;
varying vKind: f32;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  if (fragmentInputs.vKind > 0.5) { discard; }
  let r2 = dot(fragmentInputs.vUv, fragmentInputs.vUv);
  if (r2 > 1.0) { discard; }
  let cover = clamp(fragmentInputs.vAlpha * pow(1.0 - r2, 1.5) * 1.6, 0.0, 1.0);
  let n = fract(52.9829189 * fract(dot(fragmentInputs.position.xy, vec2f(0.06711056, 0.00583715))));
  if (n >= cover) { discard; }
  let d = dot(fragmentInputs.vWorldPos - uniforms.shadowOrigin.xyz, -uniforms.shadowLight.xyz);
  fragmentOutputs.color = vec4f(d, 0.0, 0.0, 1.0);
}
`;
