// Light shafts in the slots (render/slotShafts.js): additive volumetric slices. Each pixel is the
// in-scattered sun of the air it stands for — lit only where the shadow map has sun there.
import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';

export const slotShaftVertexWGSL = /* wgsl */ `
attribute position: vec3f;
attribute shaft: vec4f;      // across −1..1, up 0..1, seed
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
varying vWorldPos: vec3f;
varying vShaft: vec4f;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let wp = vertexInputs.position;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  // Slices far from the camera are dropped whole (no fragments): only the near slot glows.
  let d = length(wp.xz - uniforms.cameraPosition.xz);
  if (d > 70.0) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vShaft = vertexInputs.shaft;
}
`;

export const slotShaftFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform shaftParams: vec4f;  // x = time, y = strength, z = debug: ignore the shadow
varying vWorldPos: vec3f;
varying vShaft: vec4f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let cam = uniforms.cameraPosition;
  let dist = length(cam - wp);
  let s = fragmentInputs.vShaft;
  let fade = smoothstep(1.5, 5.0, dist) * (1.0 - smoothstep(40.0, 58.0, dist))
           * (1.0 - s.x * s.x) * smoothstep(0.0, 0.08, s.y) * (1.0 - smoothstep(0.88, 1.0, s.y));
  let L = uniforms.keyDir;
  if (fade < 0.002 || L.y < 0.05) { discard; }
  // shaftParams.z: debug — the slices without the shadow test (where would beams be).
  let sun = max(shadowVisibilityFast(wp, cam), uniforms.shaftParams.z);
  if (sun < 0.01) { discard; }
  let V = normalize(cam - wp);
  // Forward scattering: a beam is brightest looking toward the sun.
  let phase = 0.2 + 1.8 * pow(max(dot(-V, L), 0.0), 6.0);
  // Dust drifting through it: slow, lumpy, with brighter motes.
  let t = uniforms.shaftParams.x;
  let n = noised(wp.xz * 0.35 + vec2f(wp.y * 0.25, t * 0.04)).x * 0.5 + 0.5;
  let mote = smoothstep(0.93, 0.99, noised(wp.xz * 3.1 + vec2f(wp.y * 2.3 - t * 0.3, s.z * 17.0)).x * 0.5 + 0.5);
  let k = 0.035 * uniforms.shaftParams.y * fade * sun * phase * (0.55 + 0.45 * n + 1.5 * mote);
  let col = atmoKeyColor() * vec3f(1.0, 0.86, 0.66) * k;
  let ex = uniforms.fogParams.z * atmoExposure();
  fragmentOutputs.color = vec4f(displayTransform(col, ex), 0.0);
}
`;

// The bends' beams (render/slotShafts.js slotBends): a strip from the rim down along the sun, turned
// to the camera round its axis; soft-edged, dusty, brightest looking toward the sun. Shown while the
// sun is high, leaning along the slot at the sun's elevation, and only when the rim opening is in sun
// (the shadow map at the beam's top).
export const slotBeamVertexWGSL = /* wgsl */ `
attribute position: vec3f;   // the beam's top (just under the rim)
attribute beam: vec4f;       // side −1/1, t down the beam 0..1, seed, depth to the floor (m)
attribute beamDir: vec2f;    // the slot's direction there
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform keyDir: vec3f;
varying vWorldPos: vec3f;
varying vBeam: vec4f;
varying vTop: vec3f;
varying vAlign: f32;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let b = vertexInputs.beam; let top = vertexInputs.position; let L = uniforms.keyDir;
  // Down at the sun's elevation, leaning along the slot (art-directed: across it, the real ray would
  // strike the wall a metre down) until it reaches the floor's level.
  let len = b.w / max(L.y, 0.25);
  let lh = vec2f(L.x, L.z); let d2 = vertexInputs.beamDir;
  let along = d2 * select(-1.0, 1.0, dot(lh, d2) >= 0.0) * length(lh);
  let axis = -normalize(vec3f(along.x, L.y, along.y));
  var wp = top + axis * len * b.y;
  let toCam = normalize(uniforms.cameraPosition - wp);
  let right = normalize(cross(axis, toCam) + vec3f(1e-5, 0.0, 0.0));
  wp += right * b.x * (0.9 + 1.4 * b.y) * (0.8 + 0.4 * b.z);
  // Shown while the sun is high (late morning to early afternoon).
  let align = smoothstep(0.45, 0.66, L.y);
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (align < 0.002 || length(top.xz - uniforms.cameraPosition.xz) > 120.0) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vBeam = b;
  vertexOutputs.vTop = top;
  vertexOutputs.vAlign = align;
}
`;

export const slotBeamFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform shaftParams: vec4f;
varying vWorldPos: vec3f;
varying vBeam: vec4f;
varying vTop: vec3f;
varying vAlign: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos; let b = fragmentInputs.vBeam;
  let cam = uniforms.cameraPosition; let L = uniforms.keyDir;
  let dist = length(cam - wp);
  // Soft across, fading in under the rim and out toward the floor; not up against the camera.
  let fade = (1.0 - b.x * b.x) * smoothstep(0.0, 0.12, b.y) * (1.0 - smoothstep(0.7, 1.0, b.y)) * smoothstep(1.5, 6.0, dist);
  let sunTop = max(shadowVisibilityFast(fragmentInputs.vTop + vec3f(0.0, 6.0, 0.0), cam), uniforms.shaftParams.z);
  if (fade * fragmentInputs.vAlign * sunTop < 0.002) { discard; }
  let V = normalize(cam - wp);
  let phase = 0.25 + 1.6 * pow(max(dot(-V, L), 0.0), 5.0);
  let t = uniforms.shaftParams.x;
  // Streaks along the beam (the opening's ragged edge) and dust drifting through.
  let streak = noised(vec2f(b.x * 2.2 + b.z * 30.0, b.y * 1.5)).x * 0.5 + 0.5;
  let dust = noised(wp.xz * 0.6 + vec2f(wp.y * 0.4, t * 0.05)).x * 0.5 + 0.5;
  let mote = smoothstep(0.93, 0.99, noised(wp.xz * 3.1 + vec2f(wp.y * 2.3 - t * 0.3, b.z * 17.0)).x * 0.5 + 0.5);
  let k = 0.22 * uniforms.shaftParams.y * fade * fragmentInputs.vAlign * sunTop * phase * (0.45 + 0.4 * streak + 0.3 * dust + 1.2 * mote);
  let col = atmoKeyColor() * vec3f(1.0, 0.86, 0.66) * k;
  fragmentOutputs.color = vec4f(displayTransform(col, uniforms.fogParams.z * atmoExposure()), 0.0);
}
`;
