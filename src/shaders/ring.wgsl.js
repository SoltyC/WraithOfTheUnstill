// Distant mountain ring (clay view): rock with snow above a wandering snowline, lit by the
// atmosphere's key and sky light and fogged by aerial perspective. No shadow receive: the ring
// lies beyond the last cascade.

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';

export const ringVertexWGSL = /* wgsl */ `
attribute position: vec3f;
attribute normal: vec3f;
uniform viewProjection: mat4x4f;
varying vWorldPos: vec3f;
varying vNormal: vec3f;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  vertexOutputs.position = uniforms.viewProjection * vec4f(vertexInputs.position, 1.0);
  vertexOutputs.vWorldPos = vertexInputs.position;
  vertexOutputs.vNormal = vertexInputs.normal;
}
`;

export const ringFragmentWGSL = /* wgsl */ `
${ENV_DECL}
varying vWorldPos: vec3f;
varying vNormal: vec3f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let N = normalize(fragmentInputs.vNormal);
  let dist = length(camPos - wp);
  // Bearing from the centre: north ranges are frost-capped, east volcanic and dark.
  let b = normalize(wp.xz);
  let east = smoothstep(0.2, 0.9, b.x) * smoothstep(-0.6, 0.3, -b.y);
  var albedo = mix(vec3f(0.22, 0.21, 0.20), vec3f(0.11, 0.10, 0.095), east);
  // Low slopes near the sea carry scrub on the south and west.
  albedo = mix(albedo, vec3f(0.14, 0.17, 0.10), smoothstep(160.0, 20.0, wp.y) * (1.0 - east) * smoothstep(0.5, 0.9, N.y));
  let snowline = mix(1050.0, 650.0, smoothstep(-0.2, 0.8, b.y)) + mix(0.0, 400.0, east) + 120.0 * noised(wp.xz * 0.0011).x;
  let snow = smoothstep(snowline, snowline + 120.0, wp.y) * smoothstep(0.45, 0.7, N.y);
  albedo = mix(albedo, vec3f(0.78, 0.80, 0.84), snow);

  let L = uniforms.keyDir;
  let diff = clamp((dot(N, L) + 0.15) / 1.15, 0.0, 1.0);
  let key = atmoKeyColor();
  let sky = mix(atmoSkySide(), atmoSkyUp(), clamp(N.y, 0.0, 1.0)) * uniforms.envMisc.w;
  var col = albedo * (key * diff * (1.0 / PI) + sky);
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, dist * 0.001);
  var outc = displayTransform(col, uniforms.fogParams.z * atmoExposure());
  fragmentOutputs.color = vec4f(outc, 0.0); // alpha: SSR weight (none)
}
`;
