// Costume parts (render/costume.js, render/costumeGeo.js): rigid pieces of a Veiled's dress, instanced, each
// instance placed by a 3×4 transform read from a storage buffer (4 vec4: three rows, then visible, seed, wet, 0),
// lit like the cloth beside them (key with cascaded shadows, SH sky under the canopy, fire and spell light,
// aerial perspective). The look is the shader's, from the part's own uv:
//   straw (0): a hat sewn from one long plait coiled round and round, each coil a raised round ridge with a
//     stitched groove, the plait's chevrons along it, single straws varying; sun-bleached on top, raw underneath;
//     light comes through the brim when the sun is behind it;
//   band (1): madder wool in a fine twill; the tails' forked ends;
//   wicker (2) and base (5): peeled willow weavers over darker stakes, each rod's grain, gaps shadowed;
//   wrap (3): a rim and handle bound in a spiral of split cane;
//   fig (4): purple-black with a dusty bloom, green toward the neck.

import { ENV_DECL, COMMON_WGSL, SPELL_LIGHT_DECL, SPELL_LIGHT_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';

export const costumeVertexWGSL = /* wgsl */ `
attribute position: vec3f;
attribute normal: vec3f;
attribute uv: vec2f;
attribute tangent: vec4f;
attribute info: vec4f;
uniform viewProjection: mat4x4f;
var<storage, read> costumeXf: array<vec4f>;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vTangent: vec3f;
varying vUv: vec2f;
varying vInfo: vec4f;
varying vInst: vec4f;
varying vLocal: vec3f;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let s = vertexInputs.instanceIndex * 4u;
  let r0 = costumeXf[s];
  let r1 = costumeXf[s + 1u];
  let r2 = costumeXf[s + 2u];
  let inst = costumeXf[s + 3u];
  let p = vertexInputs.position;
  let n = vertexInputs.normal;
  let t = vertexInputs.tangent.xyz;
  let wp = vec3f(dot(r0.xyz, p) + r0.w, dot(r1.xyz, p) + r1.w, dot(r2.xyz, p) + r2.w);
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (inst.x < 0.5) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vNormal = vec3f(dot(r0.xyz, n), dot(r1.xyz, n), dot(r2.xyz, n));
  vertexOutputs.vTangent = vec3f(dot(r0.xyz, t), dot(r1.xyz, t), dot(r2.xyz, t));
  vertexOutputs.vUv = vertexInputs.uv;
  vertexOutputs.vInfo = vertexInputs.info;
  vertexOutputs.vInst = inst;
  vertexOutputs.vLocal = p;
}
`;

export const costumeFragmentWGSL = /* wgsl */ `
${ENV_DECL}
${SPELL_LIGHT_DECL}
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vTangent: vec3f;
varying vUv: vec2f;
varying vInfo: vec4f;
varying vInst: vec4f;
varying vLocal: vec3f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
${SPELL_LIGHT_WGSL}

fn h1(x: f32) -> f32 { return fract(sin(x * 127.1 + 311.7) * 43758.5453); }
fn vn(x: f32) -> f32 { let i = floor(x); let f = x - i; let u = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), u); }

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let V = normalize(camPos - wp);
  let n0 = fragmentInputs.vNormal;
  var Ng = select(vec3f(0.0, 1.0, 0.0), n0 * inverseSqrt(max(dot(n0, n0), 1e-20)), dot(n0, n0) > 1e-16);
  let facing = dot(Ng, V) >= 0.0;
  if (!facing) { Ng = -Ng; }
  var Tu = fragmentInputs.vTangent;
  Tu = normalize(Tu - Ng * dot(Tu, Ng) + vec3f(1e-5, 0.0, 0.0));
  let cv = cross(Ng, Tu);
  let Tv = cv * inverseSqrt(max(dot(cv, cv), 1e-12));
  let info = fragmentInputs.vInfo;
  let mid = i32(info.x + 0.5);
  let uv = fragmentInputs.vUv;
  let iseed = fragmentInputs.vInst.y;

  var albedo = vec3f(0.3);
  var rough = 0.7;
  var ao = 1.0;
  var dU = 0.0;   // surface slope along Tu (metres of relief per metre)
  var dV = 0.0;   // along Tv
  var thin = 0.0;
  var aniso = 0.0;       // a highlight along the fibres (Kajiya-Kay), strength
  var fibre = Tu;
  var bloom = 0.0;       // a dusty sheen at grazing view (the figs)
  // Every derivative here, in uniform control flow (WGSL forbids them inside the branches below).
  let fwPh = fwidth(uv.y / 0.0128 + uv.x);
  let fwPl = fwidth(uv.x * 6.2831853 * max(info.z, 0.004) / 0.0052);
  let fwTw = fwidth((uv.x * 1.12 + uv.y) * 260.0);
  let fwRow = fwidth(select(uv.y / 0.012 + uv.x, (0.2 - uv.y) / (0.2 / 17.0), mid == 2));
  let fwTurns = fwidth(uv.x * select(175.0, 90.0, info.y > 0.5) + uv.y / (6.2831853 * select(0.0125, 0.0105, info.y > 0.5)));

  if (mid == 0) {
    // ---- Straw: one plait coiled from the crown's top outward (a spiral: the coil index climbs once a turn).
    let r = max(info.z, 0.004);
    let under = info.w < 0.0;
    thin = abs(info.w);
    let coilW = 0.0128;
    let ph = uv.y / coilW + uv.x;
    let c = fract(ph);
    let coil = floor(ph);
    let fadeC = 1.0 - smoothstep(0.25, 0.6, fwPh);
    // The coil's round ridge, the groove where two coils are stitched.
    let sc = sin(PI * c);
    let ridge = sqrt(max(sc, 0.0));
    let dr = PI * cos(PI * c) / (2.0 * sqrt(max(sc, 0.02))) / coilW;
    dV += clamp(dr, -600.0, 600.0) * 0.0015 * fadeC;
    ao *= mix(1.0, 0.45 + 0.55 * smoothstep(0.0, 0.5, ridge), fadeC);
    // Along the coil (metres round): the plait's chevrons — seven straws crossing, each a flat band.
    let t = uv.x * 6.2831853 * r;
    let across = abs(c - 0.5) * 2.0;
    let pl = t / 0.0052 + across * 1.15 * select(1.0, -1.0, fract(coil * 0.5) > 0.25);
    let fadeP = 1.0 - smoothstep(0.2, 0.55, fwPl);
    let sp = fract(pl);
    let band = smoothstep(0.0, 0.12, sp) * smoothstep(1.0, 0.82, sp);
    let strand = floor(pl) + coil * 31.0;
    dU += sin(sp * 6.2831853) * 0.12 * fadeP;
    ao *= mix(1.0, 0.72 + 0.28 * band, fadeP);
    // Colour: pale wheat straw, each straw its own (a few darker, a few almost white), the coils in runs.
    let sv = h1(strand + iseed * 17.0);
    let cv = vn(coil * 0.7 + iseed * 5.0);
    var straw = mix(vec3f(0.46, 0.33, 0.14), vec3f(0.62, 0.49, 0.26), cv);
    straw *= mix(1.0, 0.82 + 0.36 * sv, fadeP);
    straw = mix(straw, vec3f(0.3, 0.19, 0.08), step(0.93, sv) * 0.6 * fadeP);
    // Sun-bleached and grey-weathered on top, raw gold underneath; sweat dark at the crown's foot; the edge frayed darker.
    if (!under) {
      let top = clamp(Ng.y * 0.5 + 0.5, 0.0, 1.0);
      straw = mix(straw, straw * vec3f(1.12, 1.08, 1.0) + vec3f(0.04, 0.035, 0.03), top * 0.5);
      straw = mix(straw, vec3f(0.36, 0.33, 0.28), 0.18 * vn(uv.x * 23.0 + uv.y * 41.0) * top);
    } else {
      straw *= vec3f(1.04, 0.96, 0.82);
    }
    let foot = 1.0 - smoothstep(0.0, 0.03, abs(fragmentInputs.vLocal.y - 0.01));
    straw = mix(straw, straw * vec3f(0.55, 0.48, 0.4), foot * 0.35 * smoothstep(0.15, 0.185, r) * (1.0 - smoothstep(0.185, 0.2, r)));
    let edge = smoothstep(0.3, 0.322, r);
    straw *= 1.0 - 0.35 * edge;
    albedo = straw;
    rough = 0.48;
    aniso = 0.55 * fadeP;
    // The fibre runs along the straw: along the coil, leaning with the chevron.
    let lean = select(0.55, -0.55, c > 0.5);
    fibre = normalize(Tu + Tv * lean * 0.6);
  } else if (mid == 1) {
    // ---- Madder wool band, a fine twill; the tails' ends forked and frayed.
    let m = vec2f(uv.x * 1.12, uv.y);
    let tw = (m.x + m.y) * 260.0;
    let fw = 1.0 - smoothstep(0.25, 0.7, fwTw);
    albedo = vec3f(0.27, 0.06, 0.045) * (0.85 + 0.3 * vn(uv.x * 40.0 + iseed));
    albedo *= 1.0 + 0.1 * fw * sin(tw * 6.2831853);
    if (info.y > 1.5) {
      // A tail (uv.y metres down it, uv.x 0..1 across): a fork cut into the end.
      let fork = 0.118 + 0.012 * abs(uv.x - 0.5) * 2.0;
      if (uv.y > fork + 0.003 * vn(uv.x * 30.0)) { discard; }
      thin = 0.6;
      albedo *= 0.92;
    }
    rough = 0.85;
    ao = 0.9;
  } else if (mid == 2 || mid == 5) {
    // ---- Willow: peeled weavers (buff), the stakes between them darker; each rod its own shade.
    let DEPTH = 0.2;
    let rowH = DEPTH / 17.0;
    var row = 0.0; var f = 0.0; var along = 0.0;
    if (mid == 2) {
      let h = (DEPTH - uv.y) / rowH;
      row = floor(h); f = fract(h);
      along = uv.x * 28.0;
    } else {
      // The base: a spiral of rods wound out from the middle.
      let hh = uv.y / 0.012 + uv.x;
      row = floor(hh); f = fract(hh);
      along = uv.x * 40.0;
    }
    let tube = sqrt(max(sin(PI * f), 0.0));
    let fade = 1.0 - smoothstep(0.3, 0.7, fwRow);
    let rv = h1(row * 3.7 + iseed * 11.0 + f32(mid));
    albedo = mix(vec3f(0.34, 0.22, 0.1), vec3f(0.46, 0.32, 0.16), rv);
    albedo = mix(albedo, vec3f(0.17, 0.1, 0.05), step(0.86, rv) * 0.7);     // a brown (unpeeled) rod now and then
    // Where a weaver dives behind a stake, the stake shows: a darker upright between the rows.
    let stake = 1.0 - smoothstep(0.0, 0.22, abs(fract(along) - 0.5) * 2.0 - 0.0);
    albedo = mix(albedo, albedo * 0.55, (1.0 - tube) * 0.6 * fade);
    albedo *= 1.0 - 0.15 * stake * (1.0 - tube);
    ao = mix(1.0, 0.35 + 0.65 * tube, fade);
    // The rod's grain along it (fine lines), a little sheen.
    let grain = vn(along * 30.0 + row * 7.0) * vn(f * 9.0 + row);
    albedo *= 0.88 + 0.24 * grain;
    rough = 0.55;
    aniso = 0.35 * fade;
    fibre = Tu;
    if (!facing) { albedo *= 0.7; ao *= 0.6; }   // the inside, in the basket's own shade
  } else if (mid == 3) {
    // ---- Split cane bound round the rim and the handle, a spiral.
    // uv.x runs along the rim (or the handle), uv.y round the tube in metres: one turn of cane per 6 mm along.
    let turns = uv.x * select(175.0, 90.0, info.y > 0.5) + uv.y / (6.2831853 * select(0.0125, 0.0105, info.y > 0.5));
    let fs = fract(turns);
    let fade = 1.0 - smoothstep(0.3, 0.7, fwTurns);
    let rib = sqrt(max(sin(PI * fs), 0.0));
    albedo = mix(vec3f(0.38, 0.26, 0.12), vec3f(0.5, 0.36, 0.18), h1(floor(turns) + iseed * 3.0)) * mix(1.0, 0.55 + 0.45 * rib, fade);
    ao = mix(1.0, 0.5 + 0.5 * rib, fade);
    rough = 0.45;
    aniso = 0.5 * fade;
    fibre = normalize(Tu * 0.3 + Tv);
    if (info.y > 0.5) { albedo *= 0.8; }   // the handle: darker with handling
  } else if (mid == 4) {
    // ---- A fig: dark purple, a dusty bloom, green-gold at the neck, a few pale flecks.
    let v = info.z;   // 0 at the stem → 1 at the base
    let s = info.y;
    albedo = mix(vec3f(0.07, 0.025, 0.05), vec3f(0.11, 0.04, 0.06), h1(s * 91.0));
    albedo = mix(vec3f(0.16, 0.18, 0.05), albedo, smoothstep(0.08, 0.38, v));
    albedo = mix(albedo, vec3f(0.08, 0.06, 0.03), 1.0 - smoothstep(0.0, 0.06, v));   // the stem stub
    let fl = step(0.985, hash12(floor(uv * vec2f(60.0, 40.0)) + s * 13.0));
    albedo += vec3f(0.08, 0.07, 0.05) * fl;
    rough = 0.4;
    bloom = 0.6;
    ao = 0.85 + 0.15 * smoothstep(0.3, 0.9, 1.0 - v);
  }

  // Detail as normal relief, faded before the pixel.
  var N = normalize(Ng - Tu * dU - Tv * dV);
  if (!facing && mid != 2) { N = Ng; }

  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  let nl = dot(N, L);
  let vis = shadowVisibility(wp, Ng, camPos, fragmentInputs.position.xy);
  let canopy = canopyAt(wp.xz);
  let skyRaw = shIrradiance(N);
  let sky = (skyRaw * uniforms.envMisc.w * canopySky(canopy) + canopyFill(canopy, N)) * ao;
  let diff = clamp((nl + 0.15) / 1.15, 0.0, 1.0);
  // Ash-cast (systems/eruption.js; the figure's robe the same: shaders/cloth.wgsl.js): its colours gone under grey ash.
  let ashW = fragmentInputs.vInst.z;
  let ashK = min(ashW, 1.0);
  // (Crumbling with the figure, ash 1..2: the hat comes away in pieces.)
  if (ashW > 1.0) { let pr = fract(sin(dot(floor(fragmentInputs.vLocal * 22.0), vec3f(12.9898, 78.233, 37.719))) * 43758.5453); if (pr < (ashW - 1.0) * 1.4) { discard; } }
  if (ashK > 0.0) { albedo = mix(albedo, vec3f(0.33, 0.31, 0.29) * (0.65 + 0.7 * vn(dot(fragmentInputs.vLocal, vec3f(40.0, 31.0, 23.0)))) + dot(albedo, vec3f(0.3, 0.5, 0.2)) * 0.04, ashK); }
  var col = albedo * (key * diff * vis / PI + sky);
  // Specular: a soft lobe, and a highlight along the fibres (straw, cane and willow shine along their length).
  let H = normalize(L + V);
  let nVar = dot(abs(dpdx(N)) + abs(dpdy(N)), vec3f(1.0));
  let rr = max(rough, clamp(nVar * 0.6, 0.0, 0.9));
  let shin = mix(12.0, 120.0, 1.0 - rr);
  col += key * pow(max(dot(N, H), 0.0), shin) * (1.0 - rr) * 0.35 * vis * clamp(nl, 0.0, 1.0) * ao;
  let th = dot(fibre, H);
  col += key * albedo * aniso * 1.6 * pow(sqrt(max(1.0 - th * th, 0.0)), 60.0) * clamp(nl, 0.0, 1.0) * vis * ao;
  // Light through the brim and the ribbon when the sun is behind them (straw glows gold).
  let back = clamp(-dot(Ng, L), 0.0, 1.0) * (0.35 + 0.65 * pow(clamp(dot(-V, L), 0.0, 1.0), 2.0));
  col += key * albedo * vec3f(1.5, 1.25, 0.8) * back * thin * vis * 0.55;
  // The figs' bloom: a pale dust that shows at grazing view.
  let nv = clamp(dot(N, V), 0.0, 1.0);
  col += bloom * (sky * 0.5 + key * vis * clamp(nl, 0.0, 1.0) * 0.15) * vec3f(0.55, 0.55, 0.62) * pow(1.0 - nv, 2.5);
  // Rim: the silhouette holds in the dark (as the cloth's).
  col += key * albedo * 0.2 * pow(1.0 - nv, 4.0) * clamp(dot(-V, L) * 0.6 + 0.4, 0.0, 1.0) * vis;
  let ex = uniforms.fogParams.z * atmoExposure();
  var glow = spellLit(wp, N, albedo, 0.25, 1.0);
  glow += vec3f(0.5, 0.6, 0.75) * pow(1.0 - nv, 3.0) * 0.02 * ao;
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(camPos - wp) * 0.001);
  fragmentOutputs.color = vec4f(displayTransform(col + glow / max(ex, 1e-6), ex), 0.0);
}
`;
