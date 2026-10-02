// Phase 0 player capsule: a dark, softly sheened cloth-toned body with a faint cold light near
// the top (where the cowl will be). A stand-in for the Wraith (Phase 3), not a shipped look.

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';

export const capsuleVertexWGSL = /* wgsl */ `
attribute position: vec3f;
attribute normal: vec3f;
uniform world: mat4x4f;
uniform viewProjection: mat4x4f;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vLocalY: f32;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let wp = uniforms.world * vec4f(vertexInputs.position, 1.0);
  vertexOutputs.position = uniforms.viewProjection * wp;
  vertexOutputs.vWorldPos = wp.xyz;
  vertexOutputs.vNormal = normalize((uniforms.world * vec4f(vertexInputs.normal, 0.0)).xyz);
  vertexOutputs.vLocalY = vertexInputs.position.y;
}
`;

export const capsuleFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform bodyParams: vec4f; // x: half height, y: cowl light intensity, z: time
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vLocalY: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let V = normalize(camPos - wp);
  let N = normalize(fragmentInputs.vNormal);
  let L = uniforms.keyDir;
  let NdotV = clamp(dot(N, V), 0.0, 1.0);

  // Deep slate-indigo woven tone; darker toward the hem.
  let hy = fragmentInputs.vLocalY / uniforms.bodyParams.x; // -1 (hem) .. 1 (crown)
  var albedo = mix(vec3f(0.035, 0.038, 0.048), vec3f(0.075, 0.078, 0.092), smoothstep(-1.0, 0.6, hy));

  let wrap = 0.45;
  let diff = clamp((dot(N, L) + wrap) / (1.0 + wrap), 0.0, 1.0);
  let key = atmoKeyColor();
  let hemi = shIrradiance(N) * uniforms.envMisc.w;
  let vis = shadowVisibility(wp, N, camPos, fragmentInputs.position.xy);
  var col = albedo * (key * diff * vis * (1.0 / PI) + hemi);
  // Cloth sheen: rim of light at grazing view angles, tinted by the key.
  let sheen = pow(1.0 - NdotV, 4.0) * (0.35 + 0.65 * diff);
  col += (key * (0.06 / PI) + atmoLight[3].xyz * 0.05) * sheen;

  // Faint, slowly breathing cold light high on the body.
  let breathe = 0.82 + 0.18 * sin(uniforms.bodyParams.z * 1.3);
  let cowl = smoothstep(0.35, 0.8, hy) * pow(NdotV, 2.0) * uniforms.bodyParams.y * breathe;
  col += vec3f(0.55, 0.75, 1.0) * cowl * 0.15;

  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(camPos - wp) * 0.001);
  fragmentOutputs.color = vec4f(displayTransform(col, uniforms.fogParams.z * atmoExposure()), 1.0);
}
`;
