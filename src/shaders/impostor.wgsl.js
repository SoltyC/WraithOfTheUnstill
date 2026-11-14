// Octahedral tree impostors (docs/meadow-overhaul.md M2): the far forest, 365 m to the horizon ring.
// Each tree variant is baked at load (render/impostors.js) from IMP_N × IMP_N directions over the upper
// hemisphere (hemi-octahedral layout) into two texture arrays, one layer per variant: albedo + coverage,
// and the tree-space normal + crown occlusion. At run time each tree is a camera-facing quad; the
// view direction picks the four nearest baked directions and each is sampled where the quad's point
// projects into that view (Ryan Brucks' octahedral impostors), blended bilinearly — no popping as the
// camera moves round it. Lit by the same sun, sky, shadows and air as the near leaves.

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';
import { BRDF_WGSL } from './brdf.wgsl.js';

/** Shared by the bake and the draw: the hemi-octahedral map and each baked view's frame. */
export const IMP_COMMON_WGSL = /* wgsl */ `
fn impHemiEncode(d: vec3f) -> vec2f {
  let v = vec3f(d.x, max(d.y, 0.0), d.z);
  let p = v.xz / (abs(v.x) + v.y + abs(v.z));
  return vec2f(p.x + p.y, p.x - p.y);
}
fn impHemiDecode(o: vec2f) -> vec3f {
  let p = vec2f((o.x + o.y) * 0.5, (o.x - o.y) * 0.5);
  return normalize(vec3f(p.x, 1.0 - abs(p.x) - abs(p.y), p.y));
}
/** The direction (tree → eye) of baked frame (i, j) of n. */
fn impFrameDir(f: vec2f, n: f32) -> vec3f { return impHemiDecode((f + 0.5) / n * 2.0 - 1.0); }
/** A view's right and up (the eye looks along −d). */
fn impBasisR(d: vec3f) -> vec3f {
  var up = vec3f(0.0, 1.0, 0.0);
  if (abs(d.y) > 0.999) { up = vec3f(0.0, 0.0, 1.0); }
  return normalize(cross(up, d));
}
`;

export const impostorVertexWGSL = (N) => /* wgsl */ `
attribute position: vec3f;           // quad corner (x, y in −1..1)
attribute world0: vec4f;             // x, z, scale, yaw
attribute world1: vec4f;             // layer, hue, ground y, −
attribute world2: vec4f;
attribute world3: vec4f;
uniform viewProjection: mat4x4f;
uniform impParams: vec4f;            // x = near fade start (m), y = near fade end, z = far fade start, w = far end
uniform cameraPosition: vec3f;
var<storage, read> impLayers: array<vec4f>;   // per layer: centre height, radius (tree space)
varying vWorldPos: vec3f;
varying vUv01: vec4f;
varying vUv23: vec4f;
varying vW: vec4f;
varying vInfo: vec4f;                // layer, hue, yaw, distance to the camera
varying vR: f32;                     // the crown's radius (m)
${IMP_COMMON_WGSL}
const NF: f32 = ${N}.0;

fn frameUv(f: vec2f, pl: vec3f, R: f32) -> vec2f {
  let d = impFrameDir(f, NF);
  let r = impBasisR(d); let u = cross(d, r);
  let c = clamp(vec2f(dot(pl, r), -dot(pl, u)) / R * 0.5 + 0.5, vec2f(0.004), vec2f(0.996));
  return (f + c) / NF;
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let w0 = vertexInputs.world0; let w1 = vertexInputs.world1;
  let sc = w0.z;
  if (sc <= 0.0) {
    vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0);
    vertexOutputs.vWorldPos = vec3f(0.0); vertexOutputs.vUv01 = vec4f(0.0); vertexOutputs.vUv23 = vec4f(0.0); vertexOutputs.vW = vec4f(0.0); vertexOutputs.vInfo = vec4f(0.0); vertexOutputs.vR = 0.0;
    return vertexOutputs;
  }
  let L = impLayers[u32(w1.x + 0.5)];
  let C = vec3f(w0.x, w1.z + L.x * sc, w0.y);
  let R = L.y * sc;
  let toEye = uniforms.cameraPosition - C;
  let dist = length(toEye);
  let V = toEye / max(dist, 1e-3);
  // The billboard faces the eye; it is pulled toward it by half the radius so the crown is not cut
  // by the slope behind the trunk.
  let rB = impBasisR(V); let uB = cross(V, rB);
  let q = vertexInputs.position.xy;
  let wp = C + (rB * q.x + uB * q.y) * R + V * R * 0.5;
  // Into tree space (the near trees' yaw undone), unscaled.
  let cy = cos(w0.w); let sy = sin(w0.w);
  let pl = (rB * q.x + uB * q.y) * L.y;
  let plL = vec3f(pl.x * cy + pl.z * sy, pl.y, -pl.x * sy + pl.z * cy);
  let vL = vec3f(V.x * cy + V.z * sy, V.y, -V.x * sy + V.z * cy);
  // The four baked views nearest the eye, bilinear.
  let g = clamp((impHemiEncode(vL) * 0.5 + 0.5) * NF - 0.5, vec2f(0.0), vec2f(NF - 1.0));
  let f0 = min(floor(g), vec2f(NF - 2.0)); let t = clamp(g - f0, vec2f(0.0), vec2f(1.0));
  vertexOutputs.vUv01 = vec4f(frameUv(f0, plL, L.y), frameUv(f0 + vec2f(1.0, 0.0), plL, L.y));
  vertexOutputs.vUv23 = vec4f(frameUv(f0 + vec2f(0.0, 1.0), plL, L.y), frameUv(f0 + vec2f(1.0, 1.0), plL, L.y));
  vertexOutputs.vW = vec4f((1.0 - t.x) * (1.0 - t.y), t.x * (1.0 - t.y), (1.0 - t.x) * t.y, t.x * t.y);
  vertexOutputs.vInfo = vec4f(w1.x, w1.y, w0.w, dist);
  vertexOutputs.vR = R;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  vertexOutputs.vWorldPos = wp;
}
`;

export const impostorFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform impParams: vec4f;
var impAlb: texture_2d_array<f32>;
var impAlbSampler: sampler;
var impNrm: texture_2d_array<f32>;
var impNrmSampler: sampler;
varying vWorldPos: vec3f;
varying vUv01: vec4f;
varying vUv23: vec4f;
varying vW: vec4f;
varying vInfo: vec4f;
varying vR: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
${BRDF_WGSL()}

fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715)))); }

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let layer = i32(fragmentInputs.vInfo.x + 0.5);
  let w = fragmentInputs.vW;
  let a0 = textureSample(impAlb, impAlbSampler, fragmentInputs.vUv01.xy, layer);
  let a1 = textureSample(impAlb, impAlbSampler, fragmentInputs.vUv01.zw, layer);
  let a2 = textureSample(impAlb, impAlbSampler, fragmentInputs.vUv23.xy, layer);
  let a3 = textureSample(impAlb, impAlbSampler, fragmentInputs.vUv23.zw, layer);
  let n0 = textureSample(impNrm, impNrmSampler, fragmentInputs.vUv01.xy, layer);
  let n1 = textureSample(impNrm, impNrmSampler, fragmentInputs.vUv01.zw, layer);
  let n2 = textureSample(impNrm, impNrmSampler, fragmentInputs.vUv23.xy, layer);
  let n3 = textureSample(impNrm, impNrmSampler, fragmentInputs.vUv23.zw, layer);
  // No cut-out here: the depth prepass (impostorDepth) did it, coverage and the dithered distance
  // fades alike, and this pass draws only where its depth is equal (each visible pixel shaded once).
  // Each view's own weight by its coverage (no grey fringe where one view has a leaf and another sky).
  let wa = w * vec4f(a0.a, a1.a, a2.a, a3.a);
  let ws = max(wa.x + wa.y + wa.z + wa.w, 1e-4);
  var albedo = (a0.rgb * wa.x + a1.rgb * wa.y + a2.rgb * wa.z + a3.rgb * wa.w) / ws;
  let nn = (n0 * wa.x + n1 * wa.y + n2 * wa.z + n3 * wa.w) / ws;
  let ao = nn.a;
  var Nt = normalize(nn.xyz * 2.0 - 1.0);
  // Tree space → world (the near trees' yaw).
  let cy = cos(fragmentInputs.vInfo.z); let sy = sin(fragmentInputs.vInfo.z);
  let N = normalize(vec3f(Nt.x * cy - Nt.z * sy, Nt.y, Nt.x * sy + Nt.z * cy));
  // The tree's own tint (vHue of the near trees), around the baked mid value.
  let hue = fragmentInputs.vInfo.y;
  albedo *= (0.85 + 0.35 * hue) / 1.025 * mix(vec3f(0.97, 1.0, 0.95), vec3f(1.03, 1.0, 0.97), hue);
  { let k = fract(hue * 7.31); albedo *= mix(vec3f(0.78, 0.9, 0.95), vec3f(1.12, 1.06, 0.82), k) * mix(0.82, 1.12, fract(hue * 3.17)); }   // treeTone (shaders/trees.wgsl.js)
  albedo *= mix(1.0, 0.76, uniforms.wetParams.x);
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let V = normalize(camPos - wp);
  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  // Shadows from the other trees (and the land): looked up a crown's radius toward the light, past this tree's own caster.
  let vis = shadowVisibilityFast(wp + L * fragmentInputs.vR * 1.1, camPos);
  let nl = dot(N, L);
  let diff = clamp((nl + 0.35) / 1.35, 0.0, 1.0);
  let sky = shIrradiance(N) * uniforms.envMisc.w * ao;
  let through = shIrradiance(-N) * uniforms.envMisc.w * 0.18 * ao;
  var col = albedo * (key * diff * vis * mix(0.45, 1.0, ao) / PI + sky + through);
  // Light through the crown toward the sun.
  let back = pow(clamp(dot(-V, L), 0.0, 1.0), 2.5) * (0.6 + 0.4 * clamp(-nl, 0.0, 1.0));
  col += key * albedo * vec3f(0.95, 1.2, 0.5) * back * vis * 0.45 * ao;
  // The leaves' sheen, averaged over a crown (rougher than one leaf; shared BRDF, realism plan R1).
  col += key * vis * brdfSunSpec(N, V, L, 0.62, vec3f(0.04)) * ao * aggregateMask(V, L, N) + skySpec(N, V, 0.62, vec3f(0.04), ao * ao) * uniforms.envMisc.w * smoothstep(0.1, 0.6, dot(N, V));
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(camPos - wp) * 0.001);
  let exposure = uniforms.fogParams.z * atmoExposure();
  fragmentOutputs.color = vec4f(displayTransform(col, exposure), 0.0);
}
`;

/** The bake (render/impostors.js): tree geometry → one view of one layer, two targets. */
export const impostorBakeWGSL = (N) => /* wgsl */ `
struct U { view: vec4f, centre: vec4f, frame: vec4f, pad: vec4f };   // centre: (0, cy, 0, R); frame: (i, j, bark layer, −)
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var leafTex: texture_2d<f32>;
@group(0) @binding(2) var leafSurf: texture_2d<f32>;
@group(0) @binding(3) var barkTex: texture_2d_array<f32>;
@group(0) @binding(4) var samp: sampler;
${IMP_COMMON_WGSL}
const NF: f32 = ${N}.0;
struct VO { @builtin(position) pos: vec4f, @location(0) n: vec3f, @location(1) uv: vec2f, @location(2) info: vec4f, @location(3) lp: vec3f };
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) info: vec4f) -> VO {
  let d = impFrameDir(u.frame.xy, NF);
  let r = impBasisR(d); let up = cross(d, r);
  let q = p - u.centre.xyz; let R = u.centre.w;
  var o: VO;
  o.pos = vec4f(dot(q, r) / R, dot(q, up) / R, 0.5 - dot(q, d) / (2.0 * R), 1.0);
  o.n = n; o.uv = uv; o.info = info; o.lp = p;
  return o;
}
fn leafUv(uv: vec2f, cellIdx: f32) -> vec2f {
  let c = floor(cellIdx + 0.5);
  let col = c - 4.0 * floor(c / 4.0); let row = floor(c / 4.0);
  return vec2f((col + 0.02 + uv.x * 0.96) / 4.0, (row + 0.98 - uv.y * 0.96) / 4.0);
}
struct FO { @location(0) alb: vec4f, @location(1) nrm: vec4f };
@fragment fn fs(i: VO) -> FO {
  var o: FO;
  let d = impFrameDir(u.frame.xy, NF);
  // Every sample and derivative first (uniform control flow), then the kind.
  let luv = leafUv(i.uv, i.info.z);
  let lc0 = textureSample(leafTex, samp, luv);
  // Coverage kept through the mips (shaders/trees.wgsl.js leafCoverage): the bake reads the scanned
  // sprays several mips down, where their averaged alpha would thin the crown to twigs.
  let tq = luv * 4096.0;
  let mipq = max(0.5 * log2(max(dot(dpdx(tq), dpdx(tq)), dot(dpdy(tq), dpdy(tq)))), 0.0);
  let lc = vec4f(lc0.rgb, lc0.a * (1.0 + mipq * 0.3));
  let ls = textureSample(leafSurf, samp, luv);
  let bk = textureSample(barkTex, samp, i.uv, i32(u.frame.z)).rgb;
  var Nc = normalize(cross(dpdy(i.lp), dpdx(i.lp)));
  if (dot(Nc, d) < 0.0) { Nc = -Nc; }
  if (i.info.x > 0.5) {
    if (lc.a < 0.5) { discard; }
    // The near leaves' colour (shaders/trees.wgsl.js): per-cluster variation at the mid hue.
    let h = fract(i.info.y * 0.0137 + 0.5);
    let albedo = lc.rgb * mix(vec3f(0.85, 0.95, 0.8), vec3f(1.1, 1.05, 0.9), h) * 1.025;
    let cd = smoothstep(0.3, 0.8, (i.info.z - floor(i.info.z + 0.5)) / 0.9 + 0.5);
    let ao = mix(0.68, 1.0, clamp(i.n.y * 0.5 + 0.5, 0.0, 1.0)) * mix(1.0, 0.24, pow(cd, 1.6)) * mix(0.82, 1.0, i.info.w);
    // The crown's rounded normal broken up by the card's own facing and its drawn surface.
    let ln = ls.xy * 2.0 - 1.0;
    let N = normalize(mix(normalize(i.n), normalize(Nc + vec3f(ln.x, ln.y, 0.0) * 0.4), 0.45));
    o.alb = vec4f(albedo, 1.0);
    o.nrm = vec4f(N * 0.5 + 0.5, ao);
  } else {
    o.alb = vec4f(bk * 0.85, 1.0);
    o.nrm = vec4f(normalize(i.n) * 0.5 + 0.5, mix(0.55, 0.9, i.info.w));
  }
  return o;
}
`;

/** Shadow caster: the same quads turned to the sun (shadowLight: direction towards the light), the
 *  baked view nearest the sun's bearing, coverage-tested; writes the cascade's depth (shadowDepth). */
export const impostorShadowVertexWGSL = (N) => /* wgsl */ `
attribute position: vec3f;
attribute world0: vec4f;
attribute world1: vec4f;
attribute world2: vec4f;
attribute world3: vec4f;
uniform viewProjection: mat4x4f;
uniform shadowLight: vec4f;
var<storage, read> impLayers: array<vec4f>;
varying vWorldPos: vec3f;
varying vUv: vec2f;
varying vLayer: f32;
${IMP_COMMON_WGSL}
const NF: f32 = ${N}.0;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let w0 = vertexInputs.world0; let w1 = vertexInputs.world1;
  if (w0.z <= 0.0) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); vertexOutputs.vWorldPos = vec3f(0.0); vertexOutputs.vUv = vec2f(0.0); vertexOutputs.vLayer = 0.0; return vertexOutputs; }
  let L = impLayers[u32(w1.x + 0.5)];
  let sc = w0.z;
  let C = vec3f(w0.x, w1.z + L.x * sc, w0.y);
  let V = normalize(uniforms.shadowLight.xyz);
  let cy = cos(w0.w); let sy = sin(w0.w);
  let vL = vec3f(V.x * cy + V.z * sy, V.y, -V.x * sy + V.z * cy);
  let f = clamp(floor((impHemiEncode(vL) * 0.5 + 0.5) * NF), vec2f(0.0), vec2f(NF - 1.0));
  // The quad in the chosen view's own frame, so it matches the bake exactly.
  let dL = impFrameDir(f, NF);
  let rL = impBasisR(dL); let uL = cross(dL, rL);
  let q = vertexInputs.position.xy;
  let pl = (rL * q.x + uL * q.y) * L.y;
  let pw = vec3f(pl.x * cy - pl.z * sy, pl.y, pl.x * sy + pl.z * cy) * sc;
  let wp = C + pw;
  vertexOutputs.vUv = (f + clamp(vec2f(q.x, -q.y) * 0.5 + 0.5, vec2f(0.004), vec2f(0.996))) / NF;
  vertexOutputs.vLayer = w1.x;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  vertexOutputs.vWorldPos = wp;
}
`;
export const impostorShadowFragmentWGSL = /* wgsl */ `
uniform shadowLight: vec4f;
uniform shadowOrigin: vec4f;
var impAlb: texture_2d_array<f32>;
var impAlbSampler: sampler;
varying vWorldPos: vec3f;
varying vUv: vec2f;
varying vLayer: f32;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let a = textureSampleLevel(impAlb, impAlbSampler, fragmentInputs.vUv, i32(fragmentInputs.vLayer + 0.5), 1.0).a;
  if (a < 0.45) { discard; }
  let d = dot(fragmentInputs.vWorldPos - uniforms.shadowOrigin.xyz, -uniforms.shadowLight.xyz);
  fragmentOutputs.color = vec4f(d, 0.0, 0.0, 1.0);
}
`;

/** Depth prepass (drawn first, as the near leaves' treeZ): coverage and the distance fades only, so the
 *  colour pass (depth EQUAL) shades each visible pixel once however many crowns overlap behind it. */
export const impostorDepthFragmentWGSL = /* wgsl */ `
uniform impParams: vec4f;
uniform artParams: vec4f;
var impAlb: texture_2d_array<f32>;
var impAlbSampler: sampler;
varying vWorldPos: vec3f;
varying vUv01: vec4f;
varying vUv23: vec4f;
varying vW: vec4f;
varying vInfo: vec4f;
varying vR: f32;
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715)))); }
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let layer = i32(fragmentInputs.vInfo.x + 0.5);
  let w = fragmentInputs.vW;
  let cov = textureSample(impAlb, impAlbSampler, fragmentInputs.vUv01.xy, layer).a * w.x + textureSample(impAlb, impAlbSampler, fragmentInputs.vUv01.zw, layer).a * w.y
          + textureSample(impAlb, impAlbSampler, fragmentInputs.vUv23.xy, layer).a * w.z + textureSample(impAlb, impAlbSampler, fragmentInputs.vUv23.zw, layer).a * w.w;
  let d = fragmentInputs.vInfo.w;
  let P = uniforms.impParams;
  let keep = smoothstep(P.x, P.y, d) * (1.0 - smoothstep(P.z, P.w, d));
  let dith = ign(fragmentInputs.position.xy + vec2f(fract(uniforms.artParams.z * 0.618) * 64.0));
  if (cov < 0.42 || dith > keep) { discard; }
  fragmentOutputs.color = vec4f(0.0);
}
`;
