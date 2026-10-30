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
