// Limestone outcrops on the meadow (docs/meadow-overhaul.md M6): sculpted pieces (tools/models/
// outcrop_pieces.py) thin-instanced per variant and LOD (render/outcrops.js). The sculpt's normal
// and occlusion come from the baked atlas (RG octahedral object-space normal, B AO); the scanned
// pale stone is laid over it biplanar in the rock's own frame (it rides with the rock, no swimming),
// grey-green lichen in patches, moss where water lies (up-facing hollows), grime streaking down from
// the ledges. Lit like the terrain: sun, sky, cascaded shadows, aerial perspective.
// Instance: world0 = (x, y, z, yaw), world1 = (size x, y, z (m), seed).

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';
import { MATERIALS_DECL, MATERIALS_WGSL } from './materials.wgsl.js';

const VERTEX = /* wgsl */ `
attribute position: vec3f;           // the piece, unit space (game frame: +y up)
attribute uv: vec2f;                 // its place in the atlas
attribute world0: vec4f;
attribute world1: vec4f;
attribute world2: vec4f;
attribute world3: vec4f;
uniform viewProjection: mat4x4f;
varying vWorldPos: vec3f;
varying vAtlas: vec2f;
varying vPm: vec3f;                  // rock-frame metres (unrotated)
varying vInvS: vec3f;
varying vRot: vec2f;                 // cos, sin of the yaw
varying vSeed: f32;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let w0 = vertexInputs.world0; let w1 = vertexInputs.world1;
  if (w1.x <= 0.0) {
    vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0);
    vertexOutputs.vWorldPos = vec3f(0.0); vertexOutputs.vAtlas = vec2f(0.0); vertexOutputs.vPm = vec3f(0.0); vertexOutputs.vInvS = vec3f(1.0); vertexOutputs.vRot = vec2f(1.0, 0.0); vertexOutputs.vSeed = 0.0;
    return vertexOutputs;
  }
  let pm = vertexInputs.position * w1.xyz * 0.5;
  let c = cos(w0.w); let s = sin(w0.w);
  let wp = w0.xyz + vec3f(pm.x * c - pm.z * s, pm.y, pm.x * s + pm.z * c);
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vAtlas = vertexInputs.uv;
  vertexOutputs.vPm = pm;
  vertexOutputs.vInvS = 2.0 / max(w1.xyz, vec3f(1e-3));
  vertexOutputs.vRot = vec2f(c, s);
  vertexOutputs.vSeed = w1.w;
}
`;
export const outcropVertexWGSL = VERTEX;

export const outcropFragmentWGSL = /* wgsl */ `
${ENV_DECL}
var pieceAtlas: texture_2d<f32>;
var pieceAtlasSampler: sampler;
${MATERIALS_DECL}
varying vWorldPos: vec3f;
varying vAtlas: vec2f;
varying vPm: vec3f;
varying vInvS: vec3f;
varying vRot: vec2f;
varying vSeed: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
${MATERIALS_WGSL}
fn octDecode(e: vec2f) -> vec3f {
  var n = vec3f(e.x, e.y, 1.0 - abs(e.x) - abs(e.y));
  let t = max(-n.z, 0.0);
  n.x += select(t, -t, n.x >= 0.0);
  n.y += select(t, -t, n.y >= 0.0);
  return normalize(n);
}
fn oh(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn on2(p: vec2f) -> f32 {
  let i = floor(p); let f = p - i; let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(oh(i), oh(i + vec2f(1.0, 0.0)), u.x), mix(oh(i + vec2f(0.0, 1.0)), oh(i + vec2f(1.0, 1.0)), u.x), u.y);
}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let V = normalize(camPos - wp);
  let pt = textureSample(pieceAtlas, pieceAtlasSampler, fragmentInputs.vAtlas);
  let pm = fragmentInputs.vPm;
  let pdx = dpdx(pm); let pdy = dpdy(pm);
  // The sculpt's normal: object → rock frame (inverse scale) → world (the yaw).
  let nc = normalize(octDecode(pt.xy * 2.0 - 1.0) * fragmentInputs.vInvS);
  let dist = length(camPos - wp);
  let scanK = smoothstep(260.0, 160.0, dist);
  var albedo = vec3f(0.36, 0.35, 0.33);
  var nr = nc;
  var sao = 1.0;
  // Pale limestone (the scan's detail, retinted pale grey-cream); lichen in patches.
  let st = matBiplanarG(MAT_STONE_PALE, pm, nc, 0.32, pdx, pdy);
  let li = matBiplanarG(MAT_ROCK_LICHEN, pm + vec3f(13.0), nc, 0.4, pdx, pdy);
  // Weathered limestone: pale where the rain washes it, grey where it has weathered longer, a warm
  // iron stain here and there (large patches over the scan's own detail).
  let wz = on2(pm.xy * 0.08 + pm.z * 0.05 + vec2f(fragmentInputs.vSeed)) * 0.65 + on2(pm.xz * 0.21 + vec2f(fragmentInputs.vSeed * 3.0)) * 0.35;
  let tone = mix(vec3f(0.34, 0.34, 0.32), vec3f(0.52, 0.51, 0.47), smoothstep(0.2, 0.8, wz));   // limestone 0.25–0.45 (0.6 clipped beside the grass)
  let iron = smoothstep(0.7, 0.9, on2(pm.xy * 0.13 + vec2f(fragmentInputs.vSeed * 5.0, 2.0)));
  let base = matRetint(st, MAT_STONE_PALE, mix(tone, vec3f(0.5, 0.38, 0.26), iron * 0.6), 0.25);
  let lichenBase = matRetint(li, MAT_ROCK_LICHEN, vec3f(0.42, 0.46, 0.36), 0.6);
  let seedO = vec2f(fragmentInputs.vSeed * 13.1, fragmentInputs.vSeed * 7.7);
  let lichen = smoothstep(0.5, 0.75, on2(pm.xz * 0.35 + pm.y * 0.2 + seedO) * 0.7 + on2(pm.xy * 1.3 + seedO) * 0.3);
  albedo = mix(albedo, mix(base, lichenBase, lichen * 0.8), scanK);
  nr = normalize(mix(nc, normalize(mix(st.N, li.N, lichen)), 0.65 * scanK));
  sao = mix(1.0, st.ao, 0.6 * scanK);
  let ao = pt.z * sao;
  let cavity = pt.z * pt.z;   // the joints and bed seams read deep in direct light; the sky still reaches the faces
  let N0 = normalize(vec3f(nr.x * fragmentInputs.vRot.x - nr.z * fragmentInputs.vRot.y, nr.y, nr.x * fragmentInputs.vRot.y + nr.z * fragmentInputs.vRot.x));
  // Moss where water lies: up-facing ledges and hollows (low AO), most on the shaded side; grime
  // streaks down the faces below the ledges.
  let up = clamp(N0.y, 0.0, 1.0);
  let moss = smoothstep(0.55, 0.95, up * 0.8 + (1.0 - pt.z) * 0.9 + 0.25 * on2(pm.xz * 0.6 + seedO)) * smoothstep(-0.2, 0.4, on2(pm.xz * 0.15 + seedO * 2.0));
  albedo = mix(albedo, vec3f(0.11, 0.16, 0.05) * (0.8 + 0.4 * on2(pm.xz * 3.0)), moss * 0.85);
  let streak = (1.0 - up) * smoothstep(0.55, 0.9, on2(vec2f(pm.x * 1.7 + pm.z * 1.7, pm.y * 0.08) + seedO));
  albedo *= 1.0 - 0.45 * streak;
  // A grimy, greened foot where the turf meets it (the rock's lowest metre or two).
  let foot = 1.0 - smoothstep(-0.32, -0.12, pm.y * fragmentInputs.vInvS.y * 0.5);
  albedo = mix(albedo, albedo * vec3f(0.55, 0.62, 0.42), foot * 0.7);
  let N = N0;
  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  let vis = shadowVisibility(wp, N, camPos, fragmentInputs.position.xy);
  let nl = dot(N, L);
  let diff = clamp(nl, 0.0, 1.0);
  let sky = shIrradiance(N) * uniforms.envMisc.w * ao;
  // Light bounced off the sunlit meadow onto the rock's lower faces.
  let bounce = vec3f(0.16, 0.24, 0.08) * key * max(L.y, 0.0) * clamp(-N.y * 0.5 + 0.5, 0.0, 1.0) * 0.18 * ao;
  var col = albedo * (key * diff * vis * mix(0.55, 1.0, cavity) / PI + sky * 1.15 + bounce);
  let H = normalize(L + V);
  col += key * pow(max(dot(N, H), 0.0), 24.0) * 0.04 * vis * (1.0 - moss);
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, dist * 0.001);
  let exposure = uniforms.fogParams.z * atmoExposure();
  fragmentOutputs.color = vec4f(displayTransform(col, exposure), 0.0);
}
`;
