// Dry grains skim along the shared wind field; completed brushes lift short-lived puffs.
// Fixed seeds and game time make captures reproducible. Opaque geometry depth-tests the wisps.
import { CLIPMAP_N, CLIPMAP_LEVELS } from './clipmap.wgsl.js';
import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';
import { WIND_DECL, WIND_WGSL } from './wind.wgsl.js';
import { FINE_N, FINE_PER_M } from '../terrain/state/layout.js';
import { DUST_EVENTS, DUST_LIFE } from '../world/sandDust.js';

const WIND_COUNT = 1536, PER_EVENT = 24;
export const SAND_DUST_COUNT = WIND_COUNT + DUST_EVENTS * PER_EVENT;

export const sandDustVertexWGSL = /* wgsl */ `
attribute position: vec3f;
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform levels: array<vec4f,16>;
uniform dustParams: vec4f; // time, rain wetness, visual strength, dunes restored
uniform dustEvents: array<vec4f,${DUST_EVENTS * 2}>;
${WIND_DECL}
${WIND_WGSL}
var<storage, read> levelData: array<vec4f>;
var<storage, read> surface: array<u32>;
var<storage, read> stateFine0: array<u32>;
var<storage, read> stateFine1: array<u32>;
var<storage, read> stateParams: array<u32>;
varying vUv: vec2f;
varying vAlpha: f32;
varying vWorldPos: vec3f;
varying vSeed: f32;

const V: u32 = ${CLIPMAP_N + 1}u;
const HALF: f32 = ${CLIPMAP_N / 2}.0;
fn dh(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return f32((x >> 22u) ^ x) / 4294967295.0;
}
fn dustGround(p: vec2f) -> f32 {
  for (var l = 0u; l < ${CLIPMAP_LEVELS}u; l++) {
    let L = uniforms.levels[l]; let g = (p - L.xy) / L.z + HALF;
    if (all(g >= vec2f(1.0)) && all(g < vec2f(2.0 * HALF - 1.0))) {
      let b = vec2u(floor(g)); let f = fract(g); let k = (l * V + b.y) * V + b.x;
      return mix(mix(levelData[k].x, levelData[k + 1u].x, f.x), mix(levelData[k + V].x, levelData[k + V + 1u].x, f.x), f.y);
    }
  }
  return -10000.0;
}
fn dustRelief(p: vec2f) -> f32 {
  let q = vec2i(floor(p * ${FINE_PER_M}.0)); let o = vec2i(bitcast<i32>(stateParams[0]), bitcast<i32>(stateParams[1]));
  if (any(q < o) || any(q >= o + vec2i(${FINE_N}))) { return 0.0; }
  let a = vec2u(((q % vec2i(${FINE_N})) + vec2i(${FINE_N})) % vec2i(${FINE_N}));
  let h = unpack2x16float(stateFine0[a.y * ${FINE_N}u + a.x]); return h.y - h.x;
}
fn looseSand(p: vec2f) -> f32 {
  let col = u32(clamp((p.x + 4096.0) * 0.25, 0.0, 2047.0));
  let row = u32(clamp((4096.0 - p.y) * 0.25, 0.0, 2047.0));
  let m = surface[row * 2048u + col] & 255u;
  if (m != 1u && m != 6u) { return 0.0; }
  var wet = uniforms.dustParams.y; var frozen = 0.0; var transformed = false;
  let q = vec2i(floor(p * ${FINE_PER_M}.0)); let o = vec2i(bitcast<i32>(stateParams[0]), bitcast<i32>(stateParams[1]));
  if (all(q >= o) && all(q < o + vec2i(${FINE_N}))) {
    let a = vec2u(((q % vec2i(${FINE_N})) + vec2i(${FINE_N})) % vec2i(${FINE_N}));
    let s = unpack4x8unorm(stateFine1[a.y * ${FINE_N}u + a.x]);
    wet = max(wet, s.y); frozen = s.z; transformed = s.w > 0.0;
  }
  return (1.0 - smoothstep(0.08, 0.65, wet)) * (1.0 - smoothstep(0.02, 0.3, frozen)) * select(1.0, 0.0, transformed);
}
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let id = u32(vertexInputs.position.x + 0.5); let corner = vertexInputs.position.yz;
  let t = uniforms.dustParams.x; let cam = uniforms.cameraPosition;
  let h1 = dh(id * 7u + 1u); let h2 = dh(id * 7u + 2u); let h3 = dh(id * 7u + 3u); let h4 = dh(id * 7u + 4u);
  var p = cam.xz; var lift = 0.0; var alpha = 0.0; var sx = 0.3; var sy = 0.12;
  var direction = uniforms.windField[0].xy;
  var source = p;
  if (id < ${WIND_COUNT}u) {
    let speed = (1.5 + 3.5 * h3) * uniforms.windField[0].z;
    let seed = vec2f(h1, h2) * 80.0 + direction * t * speed;
    let rel = seed - cam.xz; let wrapped = rel - 80.0 * floor((rel + 40.0) / 80.0);
    p = cam.xz + wrapped; source = p;
    let wf = windField(p); direction = wf.xy;
    let gu = smoothstep(0.06, 0.65, wf.z);
    let wave = 0.5 + 0.5 * sin(dot(p, vec2f(-direction.y, direction.x)) * 0.13 + t * 0.45 + sin(dot(p, direction) * 0.07 - t));
    let age = fract(t * (0.22 + h3 * 0.15) + h4);
    lift = 0.06 + h4 * h4 * (0.18 + gu * 0.55) + sin(age * 3.14159) * 0.12;
    sx = 0.25 + h3 * 0.8 + gu * 0.45; sy = 0.045 + h4 * h4 * 0.17;
    alpha = 0.14 * gu * (0.3 + 0.7 * wave * wave) * sin(age * 3.14159)
      * (1.0 - smoothstep(22.0, 38.0, length(wrapped))) * uniforms.dustParams.w;
  } else {
    let slot = (id - ${WIND_COUNT}u) / ${PER_EVENT}u;
    let A = uniforms.dustEvents[slot * 2u]; let B = uniforms.dustEvents[slot * 2u + 1u];
    let age = t - A.z - h4 * 0.12;
    let life = ${DUST_LIFE} * (0.65 + h3 * 0.35);
    if (age >= 0.0 && age < life) {
      let u = age / life; let angle = h1 * 6.283185;
      source = A.xy + B.xy * ((h2 - 0.5) * 2.0 * B.z) + vec2f(-B.y, B.x) * ((h3 - 0.5) * A.w);
      let wf = windField(source); direction = wf.xy;
      p = source + vec2f(cos(angle), sin(angle)) * A.w * (0.15 + 0.8 * u)
        + direction * age * min(wf.z * 2.5, 3.0);
      lift = 0.05 + sin(u * 2.5) * (0.12 + B.w * 0.7) + u * 0.12;
      sx = 0.06 + A.w * 0.16 + u * (0.12 + B.w * 0.2); sy = sx * 0.65;
      alpha = 0.4 * B.w * smoothstep(0.0, 0.08, u) * (1.0 - u) * (1.0 - u);
    }
  }
  alpha *= looseSand(source) * uniforms.dustParams.z;
  let y = dustGround(p) + dustRelief(p) + lift;
  let ax = normalize(vec3f(direction.x, 0.0, direction.y) + vec3f(0.00001, 0.0, 0.0));
  let view = normalize(cam - vec3f(p.x, y, p.y));
  let side = cross(view, ax); let ay = side / max(length(side), 0.001);
  let wp = vec3f(p.x, y, p.y) + ax * corner.x * sx + ay * corner.y * sy;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (alpha < 0.001) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vUv = corner; vertexOutputs.vAlpha = alpha; vertexOutputs.vWorldPos = wp; vertexOutputs.vSeed = h1;
}
`;
export const sandDustFragmentWGSL = /* wgsl */ `
${ENV_DECL}
varying vUv: vec2f;
varying vAlpha: f32;
varying vWorldPos: vec3f;
varying vSeed: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let uv = fragmentInputs.vUv; let r2 = dot(uv, uv);
  let shape = pow(max(1.0 - r2, 0.0), 2.0);
  let wisp = 0.65 + 0.35 * sin(uv.x * 5.0 + fragmentInputs.vSeed * 25.0 + sin(uv.y * 7.0));
  let a = fragmentInputs.vAlpha * shape * wisp;
  if (a < 0.001) { discard; }
  let wp = fragmentInputs.vWorldPos; let V = normalize(uniforms.cameraPosition - wp);
  let forward = pow(max(dot(-V, uniforms.keyDir), 0.0), 5.0);
  let vis = shadowVisibility(wp, vec3f(0.0, 1.0, 0.0), uniforms.cameraPosition, fragmentInputs.position.xy);
  let tint = vec3f(0.63, 0.47, 0.29);
  let col = tint * (atmoKeyColor() * (0.28 + forward * 0.6) * vis + shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w * 0.7);
  let lit = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(uniforms.cameraPosition - wp) * 0.001);
  let outc = displayTransform(lit, uniforms.fogParams.z * atmoExposure());
  fragmentOutputs.color = vec4f(outc * a, a);
}
`;
