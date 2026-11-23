// Volcanic bombs (render/bombs.js; systems/eruption.js throws them): chunks of the crater's rock and clots of lava flung
// out of the summit — real solids, each its own lumpy shape, turning as they fly; glowing through their cracks while hot,
// the glow dying as they cool (in the air, then on the ground, where they stay). Records (storage): per bomb two vec4:
// position + scale, rotation (quaternion); a third: temperature 0..1, spare.
import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';
import { LAVA_WGSL } from './lava.wgsl.js';

export const BOMB_MAX = 192;

export const bombVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // the rock's own shape (unit size)
attribute normal: vec3f;
attribute bomb: vec4f;              // x = bomb, yzw = the vertex on the unit rock before its lumps (for the cracks)
uniform viewProjection: mat4x4f;
var<storage, read> bombRec: array<vec4f>;
varying vWorldPos: vec3f;
varying vNormalW: vec3f;
varying vLocal: vec3f;
varying vTemp: f32;

fn bqRot(q: vec4f, v: vec3f) -> vec3f { let t = 2.0 * cross(q.xyz, v); return v + q.w * t + cross(q.xyz, t); }

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let k = u32(vertexInputs.bomb.x + 0.5);
  let a = bombRec[k * 3u]; let q = bombRec[k * 3u + 1u]; let c = bombRec[k * 3u + 2u];
  let wp = a.xyz + bqRot(q, vertexInputs.position * a.w);
  vertexOutputs.position = select(vec4f(0.0, 0.0, -2.0, 1.0), uniforms.viewProjection * vec4f(wp, 1.0), a.w > 0.0);
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vNormalW = bqRot(q, vertexInputs.normal);
  vertexOutputs.vLocal = vertexInputs.bomb.yzw * 3.0 + vec3f(f32(k) * 7.3, f32(k) * 3.1, 0.0);
  vertexOutputs.vTemp = c.x;
}
`;

export const bombFragmentWGSL = /* wgsl */ `
${ENV_DECL}
varying vWorldPos: vec3f;
varying vNormalW: vec3f;
varying vLocal: vec3f;
varying vTemp: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
${LAVA_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let V = normalize(camPos - wp);
  var N = normalize(fragmentInputs.vNormalW);
  if (dot(N, V) < 0.0) { N = -N; }
  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  let vis = shadowVisibilityFast(wp, camPos);
  let ex = uniforms.fogParams.z * atmoExposure();
  let p = fragmentInputs.vLocal;
  // Basalt: near black, a little vesicular (pitted), a glassy skin where it was quenched.
  let pit = lvN(p.xy * 6.0 + p.z) * 0.5 + 0.5;
  let albedo = vec3f(0.045, 0.04, 0.038) * (0.7 + 0.5 * pit);
  var col = albedo * (key * max(dot(N, L), 0.0) * vis / PI + shIrradiance(N) * uniforms.envMisc.w);
  let H = normalize(L + V);
  col += key * vis * pow(max(dot(N, H), 0.0), 50.0) * 0.15 * (1.0 - fragmentInputs.vTemp);
  // Hot: its cracks glow (a bread-crust bomb: the skin split as the inside swelled), the whole of it red while fresh.
  let t = fragmentInputs.vTemp;
  let cr = max(smoothstep(0.9, 1.0, lvRidge(p.xy * 1.3 + p.z * 0.7)), smoothstep(0.92, 1.0, lvRidge(p.yz * 2.1 + 3.0)) * 0.7);
  let e = lavaMelt(0.4 + 0.6 * t) * (cr * 1.4 * smoothstep(0.05, 0.4, t) + 0.8 * smoothstep(0.5, 1.0, t)) * t;
  col += e / max(ex, 1e-6);
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(camPos - wp) * 0.001);
  fragmentOutputs.color = vec4f(displayTransform(col, ex), 0.0);
}
`;
