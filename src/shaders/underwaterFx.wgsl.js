// Under the water (Phase 10 U1): what hangs in it and what rises through it.
//   • Marine snow: a camera-centred box of hashed specks drifting on slow loops and a faint current,
//     lit by the same focused beams as the light shafts (post/compose) — they glitter in a beam and
//     go dim between — and by the blue-green light that reaches their depth.
//   • Bubbles: air shaken out of the robe (render/underwaterFx.js emits them), rising faster the
//     bigger they are, wobbling, and gone at the surface: a bright rim round a clear middle.
// Drawn as small opaque specks with a dithered edge (TAA softens it) that write depth with their own
// unfogged light: the compose pass then fogs each at its own distance. Additive specks were fogged
// at the distance of the water behind them and vanished.

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { UNDERWATER_WGSL } from './water.wgsl.js';

export const UW_SNOW = 3000;
export const UW_BUBBLES = 640;
/** The intake's column (Phase 10 U2, world/kelp.js COLUMN): bubbles rising from the vent on hashed loops, no CPU state. */
export const UW_COLUMN = 2400;
export const UW_COUNT = UW_SNOW + UW_BUBBLES + UW_COLUMN;
const BOX = 22; // m: the snow box's edge

export const uwFxVertexWGSL = /* wgsl */ `
attribute position: vec3f;           // x = particle id, yz = quad corner (−1..1)
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform keyDir: vec3f;
uniform uwParams: vec4f;             // x = time (s), y = water level at the camera (−1e4: none), z = on, w = tannin
uniform uwColumn: vec4f;             // the column: axis x, z, the vent's height, the height it frays out at
uniform uwColumn2: vec4f;            // x = shown, y = spin (0..1: the whirlpool), z = radius, w = —
var<storage, read> bubbles: array<vec4f>;   // per bubble: (x, y, z, birth time), (radius m, drift x, drift z, −)
varying vUv: vec2f;
varying vKind: f32;
varying vWorldPos: vec3f;
varying vSeed: f32;
fn uh(n: u32) -> f32 { var x = n * 747796405u + 2891336453u; x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u; return f32((x >> 22u) ^ x) / 4294967295.0; }
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let id = u32(vertexInputs.position.x + 0.5);
  let corner = vertexInputs.position.yz;
  let cam = uniforms.cameraPosition;
  let t = uniforms.uwParams.x; let lvl = uniforms.uwParams.y;
  var wp = vec3f(0.0); var size = 0.0; var kind = 0.0;
  if (id < ${UW_SNOW}u) {
    // Snow: a hashed seed in a box wrapped round the camera, each on its own slow loop, all carried
    // by a faint current.
    let h = vec3f(uh(id * 5u), uh(id * 5u + 1u), uh(id * 5u + 2u)); let h4 = uh(id * 5u + 3u); let h5 = uh(id * 5u + 4u);
    let loopv = vec3f(sin(t * (0.07 + 0.06 * h.x) + h4 * 6.28), sin(t * (0.05 + 0.05 * h.y) + h5 * 6.28) * 0.5 - t * 0.012, cos(t * (0.06 + 0.06 * h.z) + h.x * 6.28)) * (0.3 + 0.5 * h5);
    let base = h * ${BOX}.0 + loopv + vec3f(0.035, 0.0, 0.02) * t;
    let rel = base - cam;
    wp = cam + rel - ${BOX}.0 * floor(rel / ${BOX}.0 + 0.5);
    size = 0.004 + 0.014 * h4 * h4;
    kind = 0.0;
  } else if (id >= ${UW_SNOW + UW_BUBBLES}u) {
    // The column: air breathed out of the city's intake, rising fast in a plume that widens as it goes, turning round its axis
    // (faster and drawn in when it is a whirlpool), the bubbles growing as the pressure falls and fraying out at its top.
    let k = id - ${UW_SNOW + UW_BUBBLES}u;
    let C = uniforms.uwColumn; let C2 = uniforms.uwColumn2;
    if (C2.x > 0.5) {
      let h1 = uh(k * 7u + 11u); let h2 = uh(k * 7u + 12u); let h3 = uh(k * 7u + 13u); let h4 = uh(k * 7u + 14u);
      let span = C.w - C.y;
      let speed = 0.9 + 1.6 * h2 + 1.2 * C2.y;
      let f = fract(t * speed / span + h1);
      let y = C.y + f * span;
      let spin = C2.y;
      let r = C2.z * (0.12 + 0.88 * sqrt(h3)) * (0.35 + 0.65 * f) * (1.0 - 0.45 * spin * (1.0 - f));
      let ang = h4 * 6.2832 + t * (0.15 + 1.6 * spin) * (1.0 + 2.0 / (r + 0.5)) + f * 3.0 * spin;
      let wob = vec2f(sin(t * 3.1 + f32(k)), cos(t * 2.7 + f32(k) * 1.3)) * 0.12;
      wp = vec3f(C.x + cos(ang) * r + wob.x, y, C.z + sin(ang) * r + wob.y);
      size = (0.004 + 0.016 * h2 * h2) * (1.0 + 0.8 * f) * (1.0 - smoothstep(0.85, 1.0, f));
      kind = 2.0;
    }
  } else {
    // Bubbles: risen from where they were shaken out, at the speed of their size, wobbling.
    let b = id - ${UW_SNOW}u;
    let A = bubbles[b * 2u]; let B = bubbles[b * 2u + 1u];
    let age = t - A.w;
    if (age >= 0.0 && age < 30.0 && B.x > 0.0) {
      let r = B.x;
      let rise = 0.18 + 30.0 * r;                   // ~0.2 m/s for a 1 mm bubble, ~0.35 for 6 mm
      let wob = vec3f(sin(age * (5.0 + 20.0 * r) + f32(b)), 0.0, cos(age * (4.0 + 18.0 * r) + f32(b) * 1.7)) * (0.02 + 3.0 * r);
      wp = vec3f(A.x + B.y * age, A.y + rise * age, A.z + B.z * age) + wob;
      size = r * (1.0 + 0.2 * sin(age * 9.0));
      kind = 1.0;
    }
  }
  // Only under the water, and only while the camera is: elsewhere a degenerate quad.
  let dist = length(wp - cam);
  let reach = select(${BOX * 0.5}.0 + 4.0, 70.0, kind > 1.5);
  let alive = uniforms.uwParams.z > 0.5 && size > 0.0 && wp.y < lvl - 0.02 && dist > 0.15 && dist < reach;
  var outp = vec4f(0.0, 0.0, -1.0, 1.0);
  if (alive) {
    // Never smaller than about a pixel and a half on screen.
    let s = max(size, dist * 0.0011 * (1.0 + min(kind, 1.0)));
    let fwd = (wp - cam) / dist;
    let right = normalize(cross(vec3f(0.0, 1.0, 0.0), fwd) + vec3f(1e-5, 0.0, 0.0));
    let up = cross(fwd, right);
    outp = uniforms.viewProjection * vec4f(wp + (right * corner.x + up * corner.y) * s, 1.0);
  }
  vertexOutputs.position = outp;
  vertexOutputs.vUv = corner;
  vertexOutputs.vKind = kind;
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vSeed = f32(id);
}
`;

export const uwFxFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform uwParams: vec4f;
uniform uwColumn: vec4f;
varying vUv: vec2f;
varying vKind: f32;
varying vWorldPos: vec3f;
varying vSeed: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${UNDERWATER_WGSL}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let r2 = dot(fragmentInputs.vUv, fragmentInputs.vUv);
  if (r2 > 1.0) { discard; }
  let wp = fragmentInputs.vWorldPos;
  let cam = uniforms.cameraPosition;
  let t = uniforms.uwParams.x; let lvl = uniforms.uwParams.y; let tan = uniforms.uwParams.w;
  let L = uniforms.keyDir; let key = atmoKeyColor();
  let sig = mix(UW_SIG_CLEAR, UW_SIG_TANNIN, tan);
  let depth = max(lvl - wp.y, 0.0);
  // The sun's beams where this speck is (the same focus the shafts and caustics use).
  let rs = refract(-L, vec3f(0.0, 1.0, 0.0), 0.7502);
  let along = depth / max(-rs.y, 0.2);
  let beam = uwFocus(wp.xz - rs.xz * along, t) * smoothstep(0.04, 0.2, L.y);
  let sunHere = key * exp(-sig * along) * max(L.y, 0.0);
  let E = (key * max(L.y, 0.0) * 0.318 + atmoSkyUp()) * exp(-sig * depth);
  let V = normalize(cam - wp);
  // Forward scattering: a speck between the eye and the sun lights up.
  let fwd = 1.0 + 6.0 * pow(max(dot(-V, -rs), 0.0), 8.0);
  var col: vec3f; var a: f32;
  if (fragmentInputs.vKind < 0.5) {
    col = E * 0.55 + sunHere * beam * 2.2 * fwd;
    a = (1.0 - r2) * 0.85;
  } else if (fragmentInputs.vKind > 1.5) {
    // The column's bubbles: lit from below by the glow at the vent (the city's lamps through its intake), cold and bright near
    // it and fading up the plume; the sun's light too where it still reaches.
    let rim = smoothstep(0.4, 0.95, r2) * (1.0 - smoothstep(0.95, 1.0, r2));
    let up = max(wp.y - uniforms.uwColumn.y, 0.0);
    let glow = vec3f(0.45, 0.85, 1.0) * (2.2 * exp(-up * 0.07) + 0.25) / max(uniforms.fogParams.z * atmoExposure(), 1e-6) * 0.35;
    col = (glow + E * 1.2 + sunHere * (0.4 + beam)) * (0.3 + rim * 1.5);
    a = 0.3 + 0.7 * rim;
  } else {
    // A bubble: almost all of its light at the rim (the sky and the sun mirrored in its skin).
    let rim = smoothstep(0.45, 0.95, r2) * (1.0 - smoothstep(0.95, 1.0, r2));
    let glint = exp(-dot(fragmentInputs.vUv - vec2f(-0.35, 0.4), fragmentInputs.vUv - vec2f(-0.35, 0.4)) * 30.0);
    col = (E * 1.6 + sunHere * (0.6 + beam)) * (0.25 + rim * 1.4) + sunHere * glint * 3.0;
    a = 0.25 + 0.75 * rim + glint;
  }
  // A dithered edge (stochastic coverage, new each frame): TAA blends it into a soft speck.
  let n = fract(sin(dot(fragmentInputs.position.xy + vec2f(t * 61.7, t * 17.3) + fragmentInputs.vSeed, vec2f(12.9898, 78.233))) * 43758.5453);
  if (n > a) { discard; }
  let ex = uniforms.fogParams.z * atmoExposure();
  fragmentOutputs.color = vec4f(displayTransform(col, ex), 0.0);
}
`;
