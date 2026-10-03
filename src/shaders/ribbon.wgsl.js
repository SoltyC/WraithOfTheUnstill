// Ribbon water (BRIEF §9.4 "water shading: refraction with restrained dispersion, depth
// absorption tint, animated flow-map normals, foam and slush at leading edges"). There is no scene
// colour to refract here, so transmission is approximated: the body takes the sky and ground light
// through a cyan absorption tint that deepens with path length across the tube, with a fresnel
// sky reflection, a sharp sun glint, flowing streaks along the stream and foam at its head.

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';

export const RIBBON_SIDES = 10;

export const ribbonVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = node (0 = newest, at the hand), y = side
uniform viewProjection: mat4x4f;
uniform ribbonParams: vec4f;        // x = radius, y = time, z = node count
var<storage, read> ribbonNodes: array<vec4f>;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vAlong: f32;
varying vAlpha: f32;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let n = i32(vertexInputs.position.x + 0.5);
  let k = vertexInputs.position.y;
  let N = i32(uniforms.ribbonParams.z);
  let a = ribbonNodes[n];
  let prev = ribbonNodes[max(n - 1, 0)];
  let next = ribbonNodes[min(n + 1, N - 1)];
  // Tangent from the live neighbours; a frame around it.
  var t = select(next.xyz, a.xyz, next.w <= 0.0) - select(prev.xyz, a.xyz, prev.w <= 0.0);
  if (dot(t, t) < 1e-8) { t = vec3f(0.0, 0.0, 1.0); }
  t = normalize(t);
  let up = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(t.y) > 0.9);
  let b1 = normalize(cross(t, up));
  let b2 = cross(b1, t);
  let ang = k / ${RIBBON_SIDES}.0 * 6.2831853;
  // Body: tapers to a point at the hand and thins toward the tail; a ripple travels along it.
  let f = f32(n) / f32(N - 1);
  let body = smoothstep(0.0, 0.06, f) * (1.0 - smoothstep(0.75, 1.0, f));
  let ripple = 1.0 + 0.18 * sin(f32(n) * 0.9 - uniforms.ribbonParams.y * 18.0);
  let r = uniforms.ribbonParams.x * body * ripple * select(0.0, 1.0, a.w > 0.0) * (0.4 + 0.6 * a.w);
  let nrm = cos(ang) * b1 + sin(ang) * b2;
  let wp = a.xyz + nrm * r;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (a.w <= 0.0) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vNormal = nrm;
  vertexOutputs.vAlong = f32(n);
  vertexOutputs.vAlpha = a.w;
}
`;

export const ribbonFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform ribbonParams: vec4f;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vAlong: f32;
varying vAlpha: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let V = normalize(camPos - wp);
  var N = normalize(fragmentInputs.vNormal);
  if (dot(N, V) < 0.0) { N = -N; }
  let t = uniforms.ribbonParams.y;
  // Flow: streaks travelling along the stream perturb the normal.
  let s = fragmentInputs.vAlong;
  let flow = noised(vec2f(s * 0.35 - t * 9.0, dot(N, vec3f(0.7, 0.2, 0.7)) * 3.0));
  N = normalize(N + vec3f(flow.y, flow.z, -flow.y) * 0.18);
  let nv = clamp(dot(N, V), 0.0, 1.0);
  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  let vis = shadowVisibility(wp, N, camPos, fragmentInputs.position.xy);
  // Fresnel (water, n = 1.33).
  let F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
  let R = reflect(-V, N);
  let refl = atmoSky(normalize(vec3f(R.x, max(R.y, 0.02), R.z)));
  // Transmission: the light through the body, absorbed toward cyan along the path across it.
  let path = 0.5 + 1.5 * nv;
  let absorb = exp(-vec3f(1.6, 0.55, 0.38) * path);
  let ambient = shIrradiance(N) * uniforms.envMisc.w;
  let through = (ambient * 1.4 + key * 0.25 * vis * max(dot(-V, L) * 0.5 + 0.5, 0.0)) * absorb;
  let H = normalize(L + V);
  let glint = pow(max(dot(N, H), 0.0), 220.0) * 6.0 * vis;
  // Foam at the head (near the hand the stream is still forming) and in the turbulent streaks.
  let foam = (1.0 - smoothstep(1.0, 5.0, s)) * 0.6 + smoothstep(0.55, 0.9, flow.x * 0.5 + 0.5) * 0.25;
  var col = mix(through, refl, F) + key * glint;
  col = mix(col, (ambient + key * vis * max(dot(N, L), 0.0) / PI) * 0.9, foam);
  // The bending's own light glows faintly inside the water.
  col += vec3f(0.18, 0.32, 0.45) * 0.08 / max(uniforms.fogParams.z * atmoExposure(), 1e-6) * (0.5 + 0.5 * nv);
  let a = clamp(fragmentInputs.vAlpha, 0.0, 1.0) * mix(0.62, 0.95, max(F, foam));
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(camPos - wp) * 0.001);
  let outc = displayTransform(col, uniforms.fogParams.z * atmoExposure());
  fragmentOutputs.color = vec4f(outc * a, a);
}
`;
