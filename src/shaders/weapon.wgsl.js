// The weapons (render/weaponView.js): carved stone, oak, iron and wrapped felt in the Shapers'
// language, lit like the architecture (key light with cascaded shadows, SH sky, scanned materials
// retinted to the art direction, spell light, aerial perspective). One mesh holds every weapon and
// the two finds; each vertex names its slot, and `weaponXf` (4 vec4 a slot: three rows of a 3×4
// transform, then visible + element tint) puts the slot where the hands or the world want it.
// The swing's trail is a separate additive-ish ribbon of two edge points per node.

import { ENV_DECL, COMMON_WGSL, SPELL_LIGHT_DECL, SPELL_LIGHT_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';
import { MATERIALS_DECL, MATERIALS_WGSL } from './materials.wgsl.js';

export const WEAPON_SLOTS = 6;
export const TRAIL_NODES = 28, TRAIL_COUNT = 2;

export const weaponVertexWGSL = /* wgsl */ `
attribute position: vec3f;
attribute normal: vec3f;
attribute uv: vec2f;
attribute info: vec4f;       // slot, material, seed, edge
uniform viewProjection: mat4x4f;
uniform weaponXf: array<vec4f,${WEAPON_SLOTS * 4}>;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vUv: vec2f;
varying vInfo: vec4f;
varying vTint: vec3f;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let s = u32(vertexInputs.info.x + 0.5) * 4u;
  let r0 = uniforms.weaponXf[s];
  let r1 = uniforms.weaponXf[s + 1u];
  let r2 = uniforms.weaponXf[s + 2u];
  let vis = uniforms.weaponXf[s + 3u];
  let p = vertexInputs.position;
  let n = vertexInputs.normal;
  let wp = vec3f(dot(r0.xyz, p) + r0.w, dot(r1.xyz, p) + r1.w, dot(r2.xyz, p) + r2.w);
  let wn = vec3f(dot(r0.xyz, n), dot(r1.xyz, n), dot(r2.xyz, n));
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (vis.x < 0.5) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vNormal = wn;
  vertexOutputs.vUv = vertexInputs.uv;
  vertexOutputs.vInfo = vertexInputs.info;
  vertexOutputs.vTint = vis.yzw;
}
`;

export const weaponFragmentWGSL = /* wgsl */ `
${ENV_DECL}
${SPELL_LIGHT_DECL}
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vUv: vec2f;
varying vInfo: vec4f;
varying vTint: vec3f;
${MATERIALS_DECL}
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
${MATERIALS_WGSL}
${SPELL_LIGHT_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let V = normalize(camPos - wp);
  var N = normalize(fragmentInputs.vNormal);
  let Ng = N;
  if (dot(N, V) < 0.0) { N = -N; }
  let info = fragmentInputs.vInfo;
  let mid = i32(info.y + 0.5);
  let seed = info.z;
  let edge = info.w;
  let hs = fract(sin(seed * 12.9898) * 43758.5453);
  // The scan for the material, sampled once in uniform control flow.
  var layer = MAT_STONE_DRESSED;
  var tile = 1.8;
  if (mid == 1) { layer = MAT_TIMBER; tile = 2.4; }
  else if (mid == 2 || mid == 4) { layer = MAT_IRON; tile = 2.2; }
  else if (mid == 3) { layer = MAT_WOOL; tile = 3.0; }
  else if (mid == 5) { layer = MAT_STONE_PALE; tile = 1.6; }
  let ms = matUv(layer, fragmentInputs.vUv * tile + vec2f(hs * 7.0, hs * 3.0), N, wp);

  var albedo = vec3f(0.3);
  var rough = 0.8;
  var sheen = 0.0;
  var ao = ms.ao;
  N = ms.N;
  if (mid == 0 || mid == 5) {
    // Dressed Shaper stone: matte, weathered, darker and mossy where the scan is deep (the architecture's own).
    let pale = select(vec3f(0.27, 0.262, 0.245), vec3f(0.34, 0.33, 0.31), mid == 5);
    albedo = matRetint(ms, layer, pale, 0.35) * (0.75 + 0.4 * hs) * (0.7 + 0.3 * smoothstep(0.2, 0.7, ms.h));
    albedo = mix(albedo, vec3f(0.12, 0.15, 0.07), (1.0 - ms.ao) * 0.35 * (0.5 + hs));
    rough = 0.95;
  } else if (mid == 1) {
    // Oak, weathered and handled: darker where the hands have been, a grey bloom in the grain.
    albedo = matRetint(ms, layer, vec3f(0.17, 0.115, 0.07), 0.55) * (0.85 + 0.3 * hs);
    rough = mix(0.55, 0.9, ms.rough);
  } else if (mid == 2) {
    albedo = matRetint(ms, layer, vec3f(0.11, 0.11, 0.118), 0.4) * (0.8 + 0.4 * hs);
    rough = mix(0.28, 0.6, ms.rough);
    sheen = 1.0;
    if (edge > 0.5) { albedo = mix(albedo, vec3f(0.5, 0.52, 0.55), 0.55); rough = 0.2; }
  } else if (mid == 3) {
    albedo = matRetint(ms, layer, vec3f(0.2, 0.15, 0.1), 0.6) * (0.85 + 0.3 * hs);
    rough = 0.95;
  } else {
    albedo = matRetint(ms, layer, vec3f(0.36, 0.25, 0.11), 0.3);
    rough = mix(0.32, 0.55, ms.rough);
    sheen = 1.5;
  }
  ao = mix(1.0, ao, 0.8);

  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  let nl = dot(N, L);
  let diff = clamp(nl, 0.0, 1.0);
  let vis = shadowVisibility(wp, Ng * sign(dot(Ng, V)), camPos, fragmentInputs.position.xy);
  let skyRaw = shIrradiance(N);
  let skyCol = mix(skyRaw, vec3f(dot(skyRaw, vec3f(0.2126, 0.7152, 0.0722))), 0.4);
  let sky = skyCol * uniforms.envMisc.w * ao * (0.8 + 0.2 * clamp(N.y * 0.5 + 0.5, 0.0, 1.0));
  var col = albedo * (key * diff * vis / PI + sky);
  let H = normalize(L + V);
  let nVar = dot(abs(dpdx(N)) + abs(dpdy(N)), vec3f(1.0));
  rough = max(rough, clamp(nVar * 0.6, 0.0, 0.9));
  let shin = mix(16.0, 160.0, 1.0 - rough);
  col += key * pow(max(dot(N, H), 0.0), shin) * (1.0 - rough) * 0.7 * vis * clamp(nl, 0.0, 1.0);
  col += sheen * key * pow(max(dot(N, H), 0.0), 22.0) * vis * clamp(nl, 0.0, 1.0) * (albedo * 3.0 + 0.012);
  // A rim of the sky on the iron, so a blade reads against dark ground.
  col += sheen * 0.4 * skyRaw * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0) * albedo;
  // The element's light along a cutting edge and the stone (an infused weapon; black = none).
  let ex = uniforms.fogParams.z * atmoExposure();
  var emit = fragmentInputs.vTint * (edge * 0.9 + select(0.0, 0.35, mid == 0)) * 0.6;
  col += emit / max(ex, 1e-6);
  col += spellLit(wp, N, albedo, 0.0, ex);
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(camPos - wp) * 0.001);
  fragmentOutputs.color = vec4f(displayTransform(col, ex), 0.0);
}
`;

// ---- Trail: a ribbon of the weapon's swept edge. Nodes are pairs (a, b) of vec4: xyz + the time it was
// made (a.w) / a segment-start flag (b.w). Quad q joins node q to node q+1 (each quad has its own four
// vertices: corner = node offset * 2 + side); it is hidden when q is the head (the newest, whose successor is
// the oldest) or when q+1 starts a new swing; alpha fades with age.
export const trailVertexWGSL = /* wgsl */ `
attribute position: vec3f;           // x = trail * N + quad, y = corner 0..3
uniform viewProjection: mat4x4f;
uniform trailParams: vec4f;          // x = time, y = life (s), z = intensity, w = unused
uniform trailHead: vec4f;            // newest node of each trail
var<storage, read> trailNodes: array<vec4f>;
varying vAge: f32;
varying vSide: f32;
varying vAlive: f32;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let id = u32(vertexInputs.position.x + 0.5);
  let corner = u32(vertexInputs.position.y + 0.5);
  let trail = id / ${TRAIL_NODES}u;
  let q = id % ${TRAIL_NODES}u;
  let qn = (q + 1u) % ${TRAIL_NODES}u;
  let older = trailNodes[(trail * ${TRAIL_NODES}u + q) * 2u];
  let newer = trailNodes[(trail * ${TRAIL_NODES}u + qn) * 2u];
  let newerB = trailNodes[(trail * ${TRAIL_NODES}u + qn) * 2u + 1u];
  let head = select(uniforms.trailHead.x, uniforms.trailHead.y, trail == 1u);
  let side = f32(corner & 1u);
  let nodeId = select(q, qn, corner >= 2u);
  let a = trailNodes[(trail * ${TRAIL_NODES}u + nodeId) * 2u];
  let b = trailNodes[(trail * ${TRAIL_NODES}u + nodeId) * 2u + 1u];
  let wp = select(a.xyz, b.xyz, side > 0.5);
  let age = uniforms.trailParams.x - a.w;
  var alive = 1.0;
  if (newerB.w > 0.5 || u32(head + 0.5) == q || older.w < 0.0 || newer.w < 0.0 || uniforms.trailParams.x - older.w > uniforms.trailParams.y) { alive = 0.0; }
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (alive < 0.5) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vAge = age / uniforms.trailParams.y;
  vertexOutputs.vSide = side;
  vertexOutputs.vAlive = alive;
}
`;

export const trailFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform trailParams: vec4f;
uniform trailTint: vec4f;
varying vAge: f32;
varying vSide: f32;
varying vAlive: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let age = clamp(fragmentInputs.vAge, 0.0, 1.0);
  // Bright at the leading edge, fading with age; the outer edge (side 1) the brighter.
  let fade = (1.0 - age) * (1.0 - age);
  let a = fade * mix(0.2, 1.0, fragmentInputs.vSide) * uniforms.trailParams.z;
  let ex = uniforms.fogParams.z * atmoExposure();
  let outc = displayTransform(uniforms.trailTint.rgb, ex);
  fragmentOutputs.color = vec4f(outc * a, a);
}
`;
