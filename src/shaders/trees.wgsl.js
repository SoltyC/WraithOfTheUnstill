// Trees (PLAN.md Phase 8 M4; world/trees/generator.js grows the meshes, render/leafAtlas.js draws
// the leaf clusters). Thin-instanced per variant: world0 = (x, z, scale, yaw), world1 = (seed, hue,
// lean x, lean z). The vertex shader seats the tree on the rendered terrain at its root (as the
// rocks do), leans it a little, and sways it in the wind — trunk by height², branches and leaf
// clusters with their own phase. Bark: the species' scanned bark (material arrays) in the tube's
// metre UVs. Leaves: the atlas cluster, alpha-tested, coloured per cluster, lit through when the
// sun is behind them (the reference's glowing canopy), with crown-shaped normals.

import { CLIPMAP_N, CLIPMAP_LEVELS } from './clipmap.wgsl.js';
import { ENV_DECL, COMMON_WGSL, SPELL_LIGHT_DECL, SPELL_LIGHT_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';
import { MATERIALS_DECL, MATERIALS_WGSL } from './materials.wgsl.js';

/** Near detail within LOD_NEAR m, trees end at LOD_OUT; a change dissolves over FADE s (render/trees.js).
 *  Fade kinds (world2.y): 1 plain, 2 detail in, 3 detail out, 4 edge in, 5 edge out. */
export const LOD_NEAR = 55, LOD_OUT = 365, FADE = 0.6;

const VERTEX = /* wgsl */ `
attribute position: vec3f;
attribute normal: vec3f;
attribute uv: vec2f;
attribute info: vec4f;               // kind (0 bark, 1 leaf), cluster seed, atlas cell, height in tree (0..1)
attribute world0: vec4f;
attribute world1: vec4f;
attribute world2: vec4f;
attribute world3: vec4f;           // world2 = (fade start, fade kind, -, -)
uniform viewProjection: mat4x4f;
uniform levels: array<vec4f,16>;
uniform treeParams: vec4f;           // x = time, y = wind strength, z = wind dir x, w = wind dir z
uniform treeLod: vec4f;              // z = pass (0 view, 1 shadow: no fade, 2 far shadow: edge fades only), w = clock (s)
var<storage, read> levelData: array<vec4f>;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vUv: vec2f;
varying vInfo: vec4f;
varying vHue: f32;
varying vFade: f32;

const V: u32 = ${CLIPMAP_N + 1}u;
const HALF: f32 = ${CLIPMAP_N / 2}.0;
fn tGround(x: f32, z: f32) -> f32 {
  for (var l = 0u; l < ${CLIPMAP_LEVELS}u; l++) {
    let L = uniforms.levels[l];
    let g = (vec2f(x, z) - L.xy) / L.z + HALF;
    if (g.x >= 1.0 && g.y >= 1.0 && g.x < 2.0 * HALF - 1.0 && g.y < 2.0 * HALF - 1.0) {
      let b = floor(g); let t = g - b; let i = u32(b.x); let j = u32(b.y);
      return mix(mix(levelData[(l * V + j) * V + i].x, levelData[(l * V + j) * V + i + 1u].x, t.x),
                 mix(levelData[(l * V + j + 1u) * V + i].x, levelData[(l * V + j + 1u) * V + i + 1u].x, t.x), t.y);
    }
  }
  return 0.0;
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let w0 = vertexInputs.world0; let w1 = vertexInputs.world1;
  let x = w0.x; let z = w0.y; let sc = w0.z; let yaw = w0.w;
  if (sc <= 0.0) {
    vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0);
    vertexOutputs.vWorldPos = vec3f(0.0); vertexOutputs.vNormal = vec3f(0.0, 1.0, 0.0); vertexOutputs.vUv = vec2f(0.0); vertexOutputs.vInfo = vec4f(0.0); vertexOutputs.vHue = 0.0; vertexOutputs.vFade = 0.0;
    return vertexOutputs;
  }
  // Dissolve (dithered in the fragment): in-kinds keep noise ≥ 1 − k (stored −k), out-kinds keep
  // noise < 1 − k, so a detail swap's two copies are complementary — no gap, no double.
  let w2 = vertexInputs.world2;
  let fk = clamp((uniforms.treeLod.w - w2.x) / ${FADE}, 0.0, 1.0);
  let kind = u32(w2.y + 0.5);
  var fade = 1.0;
  if (kind == 2u || kind == 4u) { fade = -fk; } else if (kind == 3u || kind == 5u) { fade = 1.0 - fk; }
  if (uniforms.treeLod.z > 1.5 && (kind == 2u || kind == 3u)) { fade = 1.0; }
  else if (uniforms.treeLod.z > 0.5 && uniforms.treeLod.z < 1.5) { fade = 1.0; }
  vertexOutputs.vFade = fade;
  let cy = cos(yaw); let sy = sin(yaw);
  var lp = vertexInputs.position * sc;
  let hf = vertexInputs.info.w;
  // Lean (per tree) grows with height.
  lp += vec3f(w1.z, 0.0, w1.w) * lp.y * 0.05;
  // Wind: the whole tree sways with height²; leaf clusters flutter on their own phase.
  let t = uniforms.treeParams.x; let ws = uniforms.treeParams.y;
  let wd = vec3f(uniforms.treeParams.z, 0.0, uniforms.treeParams.w);
  let ph = dot(vec2f(x, z), vec2f(0.05, 0.07)) + w1.x * 6.28;
  let sway = (sin(t * 0.8 + ph) * 0.6 + sin(t * 1.9 + ph * 1.7) * 0.25 + 0.5) * ws * hf * hf * 0.35 * sc;
  var p = vec3f(lp.x * cy - lp.z * sy, lp.y, lp.x * sy + lp.z * cy) + wd * sway;
  if (vertexInputs.info.x > 0.5) {
    let fl = sin(t * 4.7 + vertexInputs.info.y * 0.37 + p.y) * 0.04 * ws * sc;
    p += vec3f(fl, fl * 0.6, -fl * 0.8);
  }
  let base = tGround(x, z);
  let wp = vec3f(x, base, z) + p;
  let n = vertexInputs.normal;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vNormal = vec3f(n.x * cy - n.z * sy, n.y, n.x * sy + n.z * cy);
  vertexOutputs.vUv = vertexInputs.uv;
  vertexOutputs.vInfo = vertexInputs.info;
  vertexOutputs.vHue = w1.y;
}
`;
export const treeVertexWGSL = VERTEX;

const LEAF_UV = /* wgsl */ `
fn leafUv(uv: vec2f, cellIdx: f32) -> vec2f {
  let c = floor(cellIdx + 0.5);
  let col = c - 4.0 * floor(c / 4.0); let row = floor(c / 4.0);
  // Card v runs up from its base; the atlas cell's base is at its bottom (row-major, top row 0).
  return vec2f((col + 0.02 + uv.x * 0.96) / 4.0, (row + 0.98 - uv.y * 0.96) / 4.0);
}
`;

/** Detail and edge dissolve: white noise per pixel, re-drawn each frame (TAA blends it;
 *  interleaved gradient noise left a visible diagonal hatch). Encoding in the vertex shader. */
const DISSOLVE = /* wgsl */ `
fn dissolveCut(xy: vec2f, frame: f32, fv: f32) -> bool {
  let n = fract(sin(dot(floor(xy) + vec2f(frame * 7.31, frame * 2.17), vec2f(12.9898, 78.233))) * 43758.5453);
  return (fv >= 0.0 && n >= fv) || (fv < 0.0 && n < 1.0 + fv);
}
`;

/** Leaves and bark are separate draws: bark has no cut-out (early depth), leaves skip the bark scan. */
function treeFragment(leafPass) {
  return /* wgsl */ `
${ENV_DECL}
${SPELL_LIGHT_DECL}
uniform treeMat: vec4f;              // x = bark layer, y = species tint (0 pine, 1 oak, 2 birch)
${leafPass ? 'var leafAtlas: texture_2d<f32>;\nvar leafAtlasSampler: sampler;' : ''}
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vUv: vec2f;
varying vInfo: vec4f;
varying vHue: f32;
varying vFade: f32;
${leafPass ? '' : MATERIALS_DECL}
${COMMON_WGSL}
${SPELL_LIGHT_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
${leafPass ? LEAF_UV : MATERIALS_WGSL}
${DISSOLVE}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let V = normalize(camPos - wp);
  var N = normalize(fragmentInputs.vNormal);
  let info = fragmentInputs.vInfo;
  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  let ex = uniforms.fogParams.z * atmoExposure();
  var col: vec3f;
${leafPass ? '' : `  if (dissolveCut(fragmentInputs.position.xy, uniforms.artParams.z, fragmentInputs.vFade)) { discard; }`}
${leafPass ? `
  // No cut-out here: the depth prepass (treeLeafDepth) did it, and this pass draws only where its
  // depth is equal — each visible leaf pixel is shaded once, however many cards overlap.
  let lc = textureSample(leafAtlas, leafAtlasSampler, leafUv(fragmentInputs.vUv, info.z));
  if (dot(N, V) < -0.2) { N = normalize(N + V * 0.6); }
  // Per-cluster colour: a little hue and value variation, and the tree's own (vHue).
  let h = fract(info.y * 0.0137 + fragmentInputs.vHue);
  var albedo = lc.rgb * mix(vec3f(0.85, 0.95, 0.8), vec3f(1.1, 1.05, 0.9), h) * (0.8 + 0.35 * fragmentInputs.vHue);
  // Inner crown is darker (light has crossed the leaves above): height in tree and facing.
  let inner = mix(0.55, 1.0, clamp(N.y * 0.5 + 0.5, 0.0, 1.0)) * mix(0.75, 1.0, info.w);
  // Leaves: the 4-tap lookup — the cut-out edges already break the penumbra up, TAA blends it.
  let vis = shadowVisibilityFast(wp, camPos);
  let nl = dot(N, L);
  let diff = clamp((nl + 0.4) / 1.4, 0.0, 1.0);
  let sky = shIrradiance(N) * uniforms.envMisc.w * inner;
  col = albedo * (key * diff * vis * inner / PI + sky);
  // Light through the leaves toward the sun.
  let back = pow(clamp(dot(-V, L), 0.0, 1.0), 2.5);
  col += key * albedo * vec3f(0.9, 1.15, 0.55) * back * vis * 0.45;
  col += spellLit(wp, N, albedo, 0.4, ex);` : `
  let bk = matUv(i32(uniforms.treeMat.x + 0.5), fragmentInputs.vUv * vec2f(1.2, 0.6), N, wp);
  // Bark: the scan, darkened toward the root, mossy on the shaded, lower side.
  var albedo = matRetint(bk, i32(uniforms.treeMat.x + 0.5), select(select(vec3f(0.17, 0.13, 0.1), vec3f(0.16, 0.13, 0.11), uniforms.treeMat.y > 0.5), vec3f(0.3, 0.29, 0.27), uniforms.treeMat.y > 1.5), 0.6);
  let moss = smoothstep(0.3, 0.0, info.w) * smoothstep(-0.2, 0.6, -bk.N.z * 0.6 + 0.2) * 0.6;
  albedo = mix(albedo, vec3f(0.06, 0.09, 0.03), moss);
  N = bk.N;
  let vis = shadowVisibility(wp, N, camPos, fragmentInputs.position.xy);
  let nl = clamp(dot(N, L), 0.0, 1.0);
  let sky = shIrradiance(N) * uniforms.envMisc.w * mix(1.0, bk.ao, 0.8);
  col = albedo * (key * nl * vis / PI + sky);
  col += spellLit(wp, N, albedo, 0.0, ex);`}
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(camPos - wp) * 0.001);
  fragmentOutputs.color = vec4f(displayTransform(col, ex), 0.0);
}
`;
}
export const treeLeafFragmentWGSL = treeFragment(true);
export const treeBarkFragmentWGSL = treeFragment(false);

/** Far trees' shadows dissolve in and out with them at the edge (same encoding as the view). */
const SHADOW_FADE = /* wgsl */ `
fn shadowFadeOut(xy: vec2f, fv: f32) -> bool {
  let n = fract(sin(dot(floor(xy), vec2f(12.9898, 78.233))) * 43758.5453);
  return (fv >= 0.0 && n >= fv) || (fv < 0.0 && n < 1.0 + fv);
}
`;

/** Shadow caster: depth like shadowDepth, leaves cut out by the atlas alpha. */
export const treeShadowFragmentWGSL = /* wgsl */ `
uniform shadowLight: vec4f;
uniform shadowOrigin: vec4f;
var leafAtlas: texture_2d<f32>;
var leafAtlasSampler: sampler;
varying vWorldPos: vec3f;
varying vUv: vec2f;
varying vInfo: vec4f;
varying vFade: f32;
${LEAF_UV}
${SHADOW_FADE}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  if (shadowFadeOut(fragmentInputs.position.xy, fragmentInputs.vFade)) { discard; }
  let a = textureSampleLevel(leafAtlas, leafAtlasSampler, leafUv(fragmentInputs.vUv, fragmentInputs.vInfo.z), 1.0).a;
  if (a < 0.5) { discard; }
  let d = dot(fragmentInputs.vWorldPos - uniforms.shadowOrigin.xyz, -uniforms.shadowLight.xyz);
  fragmentOutputs.color = vec4f(d, 0.0, 0.0, 1.0);
}
`;

/** Bark shadow caster: plain depth, no cut-out. */
export const treeBarkShadowFragmentWGSL = /* wgsl */ `
uniform shadowLight: vec4f;
uniform shadowOrigin: vec4f;
varying vWorldPos: vec3f;
varying vFade: f32;
${SHADOW_FADE}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  if (shadowFadeOut(fragmentInputs.position.xy, fragmentInputs.vFade)) { discard; }
  let d = dot(fragmentInputs.vWorldPos - uniforms.shadowOrigin.xyz, -uniforms.shadowLight.xyz);
  fragmentOutputs.color = vec4f(d, 0.0, 0.0, 1.0);
}
`;

/** Leaf depth prepass: the cut-out and the dissolve, depth only (render/trees.js draws it before
 *  every other opaque mesh; the leaf colour pass then tests depth equal). */
export const treeLeafDepthFragmentWGSL = /* wgsl */ `
uniform artParams: vec4f;
var leafAtlas: texture_2d<f32>;
var leafAtlasSampler: sampler;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vUv: vec2f;
varying vInfo: vec4f;
varying vHue: f32;
varying vFade: f32;
${LEAF_UV}
${DISSOLVE}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let a = textureSample(leafAtlas, leafAtlasSampler, leafUv(fragmentInputs.vUv, fragmentInputs.vInfo.z)).a;
  if (a < 0.5 || dissolveCut(fragmentInputs.position.xy, uniforms.artParams.z, fragmentInputs.vFade)) { discard; }
  fragmentOutputs.color = vec4f(0.0);
}
`;
