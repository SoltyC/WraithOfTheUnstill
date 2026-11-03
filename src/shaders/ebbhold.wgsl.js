// Ebbhold (render/ebbhold.js): Shaper stone — a dark green marble, veined pale, its grain from the scans (stone-pale, stone-dressed,
// flagstone; retinted) — carved in relief: tall panels in stepped frames, fluted below and crossed by tide chevrons above, gold run
// into the frames; the pillars in drums with incised gold lines; lozenge-carved parapets; coffered ceilings; polished flagstones
// that hold reflections (they mark the post chain's SSR). Bronze-gold trims and braziers from the iron scan, green patina in their
// hollows; the sea-doors in raised bronze waves. The veiled statues in a paler, softer stone, darkened in their folds and the hood
// (the mesh's cavity). The sea-windows glow cold behind leading; the braziers' flames are still teardrops of light.
// Every relief is filtered by its footprint on screen (it fades to its mean before it can alias); the scans are mipmapped.
// Light: the sea-light down the roof's slits (BEAM_WGSL: slabs and pillars keep it off), the lamps (world lights, `held`; diffuse,
// and a glossy glint off polished stone and bronze), a faint fill from the haze. The haze and its shafts are post/compose's.

import { ENV_DECL, COMMON_WGSL, SPELL_LIGHT_DECL, SPELL_LIGHT_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';
import { MATERIALS_DECL, MATERIALS_WGSL } from './materials.wgsl.js';
import { BEAM_WGSL, EBB_ORIGIN } from '../world/ebbhold.js';

export const EBB_KIND = { wall: 0, sand: 1, prop: 2, bronze: 3, flame: 4, pillar: 5, floor: 6, statue: 7, window: 8, trim: 9, ceiling: 10, shadow: 11, parapet: 12, door: 13, linen: 14, dough: 15, loaf: 16, blanket: 17, skin: 18 };

export const ebbVertexWGSL = /* wgsl */ `
attribute position: vec3f;
attribute normal: vec3f;
attribute info: vec4f;               // x = kind (EBB_KIND), y = per-piece seed, z = cavity (a flame: its height 0..1)
uniform viewProjection: mat4x4f;
uniform ebbHands: array<vec4f, 16>;  // dents in the dough: world x, the dent's floor y, z; w = 1 while it lasts (systems/drowned.js: they rise back slowly)
uniform ebbCarry: array<vec4f, 2>;   // a carried thing (info.w = 2, built at the city's origin): [0] world position, yaw; [1].w shown
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vInfo: vec4f;
varying vLocal: vec3f;               // a carried thing's own coordinates (else the city's)
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  var p = vertexInputs.position;
  // Dough (info.w = 1) holds the dents the hands made: each a palm-sized hollow whose floor rises back over seconds; what is
  // pressed out of a hollow swells round its rim.
  if (vertexInputs.info.w > 0.5 && vertexInputs.info.w < 1.5) {
    var sinkT = 0.0; var push = vec2f(0.0);
    for (var i = 0; i < 16; i++) {
      let h = uniforms.ebbHands[i];
      if (h.w <= 0.0) { continue; }
      let d = p.xz - h.xz; let r = length(d);
      let palm = 1.0 - smoothstep(0.035, 0.12, r);
      let floorY = h.y + r * r * 2.5;
      let sink = max(0.0, p.y - floorY) * palm * h.w;
      sinkT = max(sinkT, sink);
      push += d / max(r, 1e-3) * sink * 0.45;
    }
    p = vec3f(p.x + push.x, p.y - sinkT, p.z + push.y);
  }
  var nrm = vertexInputs.normal;
  vertexOutputs.vLocal = p - vec3f(${EBB_ORIGIN.x}.0, ${EBB_ORIGIN.y}.0, ${EBB_ORIGIN.z}.0);
  if (vertexInputs.info.w > 1.5) {
    let c = uniforms.ebbCarry[0]; let cs = cos(c.w); let sn = sin(c.w);
    let l = (p - vec3f(${EBB_ORIGIN.x}.0, ${EBB_ORIGIN.y}.0, ${EBB_ORIGIN.z}.0)) * uniforms.ebbCarry[1].w;
    p = c.xyz + vec3f(l.x * cs + l.z * sn, l.y, -l.x * sn + l.z * cs);
    nrm = vec3f(nrm.x * cs + nrm.z * sn, nrm.y, -nrm.x * sn + nrm.z * cs);
  }
  vertexOutputs.position = uniforms.viewProjection * vec4f(p, 1.0);
  vertexOutputs.vWorldPos = p;
  vertexOutputs.vNormal = nrm;
  vertexOutputs.vInfo = vertexInputs.info;
}
`;

export const ebbFragmentWGSL = /* wgsl */ `
${ENV_DECL}
${SPELL_LIGHT_DECL}
${MATERIALS_DECL}
uniform ebbParams: vec4f;            // y = fill (display-referred), z = sea-light strength, w > 0.5: debug (sun visibility)
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vInfo: vec4f;
varying vLocal: vec3f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
${SPELL_LIGHT_WGSL}
${MATERIALS_WGSL}
${BEAM_WGSL}
fn eHash(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453); }
fn eNoise(p: vec3f) -> f32 {
  let i = floor(p); let f = p - i; let u = f * f * (3.0 - 2.0 * f);
  let a = mix(mix(eHash(i), eHash(i + vec3f(1.0, 0.0, 0.0)), u.x), mix(eHash(i + vec3f(0.0, 1.0, 0.0)), eHash(i + vec3f(1.0, 1.0, 0.0)), u.x), u.y);
  let b = mix(mix(eHash(i + vec3f(0.0, 0.0, 1.0)), eHash(i + vec3f(1.0, 0.0, 1.0)), u.x), mix(eHash(i + vec3f(0.0, 1.0, 1.0)), eHash(i + vec3f(1.0, 1.0, 1.0)), u.x), u.y);
  return mix(a, b, u.z);
}
fn eFbm(p: vec3f) -> f32 { return eNoise(p) * 0.55 + eNoise(p * 2.03 + 7.1) * 0.3 + eNoise(p * 4.1 + 3.3) * 0.15; }
// A line of width w (in x's units) filtered by the footprint fw: energy kept, contrast lost as it shrinks below a pixel.
fn band(x: f32, w: f32, fw: f32) -> f32 { let ww = max(w, fw); return (1.0 - smoothstep(0.0, ww, abs(x))) * (w / ww); }
// A step at e filtered by the footprint.
fn ast(e: f32, x: f32, fw: f32) -> f32 { return smoothstep(e - fw, e + fw, x); }

// Wall relief → (height 0 deep … 1 proud, gold). Panels 8 × 12 m in stepped frames; fluted in their lower part, tide chevrons above.
fn wallRelief(uv: vec2f, fw: f32) -> vec2f {
  let PW = 8.0; let PH = 12.0;
  let p = vec2f(uv.x - PW * floor(uv.x / PW), uv.y - PH * floor(uv.y / PH));
  let e = min(min(p.x, PW - p.x), min(p.y, PH - p.y));
  let w = max(fw, 0.02);
  let fine = 1.0 - smoothstep(0.06, 0.3, fw);           // the small carving fades out with distance
  let fv = (p.y - 1.3) / (PH - 2.6);
  let fl = abs(fract((p.x - 1.3) / 0.6) - 0.5) * 2.0;
  let flutes = 0.62 + 0.25 * smoothstep(0.15, 0.6, fl);
  let c = abs(p.x - PW * 0.5) * 0.7 + p.y;
  let cf = fract(c / 1.1);
  let chev = 0.6 + 0.3 * smoothstep(0.1, 0.35, cf) * (1.0 - smoothstep(0.65, 0.9, cf));
  let inner = mix(0.74, mix(flutes, chev, ast(0.62, fv, w / (PH - 2.6))), fine);
  var h = mix(0.0, 1.0, ast(0.18, e, w));
  h = mix(h, 0.55, ast(0.9, e, w));
  h = mix(h, inner, ast(1.3, e, w));
  var gold = band(e - 1.1, 0.05, fw) * ast(0.9, e, w) * (1.0 - ast(1.3, e, w));
  gold += band(cf - 0.05, 0.03, fw / 1.1) * step(0.5, fract(c / 2.2)) * ast(0.62, fv, w / (PH - 2.6)) * ast(1.3, e, w) * fine;
  return vec2f(h, gold);
}
// Pillars and columns (their facets meet at angles: only what runs round them): drums of 3 m with fine joints, a pair of incised
// gold lines every 12 m.
fn pillarRelief(uv: vec2f, fw: f32) -> vec2f {
  let y = uv.y;
  let joint = band(fract(y / 3.0 + 0.5) - 0.5, 0.02 / 3.0, fw / 3.0);
  let g = band(fract(y / 12.0 + 0.5) - 0.5 - 0.02, 0.006, fw / 12.0) + band(fract(y / 12.0 + 0.5) - 0.5 + 0.02, 0.006, fw / 12.0);
  return vec2f(1.0 - 0.6 * joint - 0.5 * g, g);
}
// Flagstones 3 m, their joints with a gold line; every third course a band of small lozenges.
fn floorRelief(uv: vec2f, fw: f32) -> vec2f {
  let p = fract(uv / 3.0);
  let e = min(min(p.x, 1.0 - p.x), min(p.y, 1.0 - p.y)) * 3.0;
  let j = 1.0 - ast(0.05, e, fw);
  let gold = band(e - 0.09, 0.025, fw);
  return vec2f(1.0 - 0.8 * j, gold);
}
// Parapets: a carved lozenge lattice between plain courses.
fn parapetRelief(uv: vec2f, fw: f32) -> vec2f {
  let q = vec2f(uv.x / 0.7, uv.y / 0.35);
  let d = abs(fract(q.x) - 0.5) + abs(fract(q.y) - 0.5);
  let fine = 1.0 - smoothstep(0.04, 0.2, fw);
  let h = mix(0.75, 0.5 + 0.5 * smoothstep(0.32, 0.4, d), fine);
  return vec2f(h, band(d - 0.45, 0.03, fw / 0.5) * fine * 0.8);
}
// The ceiling: coffers 7 m, two steps deep, a gold rosette lozenge in each.
fn ceilRelief(uv: vec2f, fw: f32) -> vec2f {
  let p = fract(uv / 7.0) * 7.0;
  let e = min(min(p.x, 7.0 - p.x), min(p.y, 7.0 - p.y));
  let w = max(fw, 0.03);
  var h = mix(1.0, 0.6, ast(0.6, e, w));
  h = mix(h, 0.25, ast(1.2, e, w));
  let r = abs(p.x - 3.5) + abs(p.y - 3.5);
  return vec2f(h, band(r - 1.0, 0.06, fw) * ast(1.2, e, w));
}
// The sea-doors: raised bronze waves in tiers, a gold edge on each crest.
fn doorRelief(uv: vec2f, fw: f32) -> vec2f {
  let q = vec2f(uv.x / 3.5, uv.y / 2.8);
  let row = floor(q.y);
  let x = fract(q.x + row * 0.5) - 0.5;
  let crest = fract(q.y) - (0.55 - 0.45 * x * x * 4.0);
  let h = 0.45 + 0.55 * smoothstep(-0.25, 0.0, crest) * (1.0 - smoothstep(0.0, 0.08, crest));
  return vec2f(h, band(crest + 0.02, 0.02, fw / 2.8));
}
fn relief(kind: i32, uv: vec2f, fw: f32) -> vec2f {
  if (kind == 0) { return wallRelief(uv, fw); }
  if (kind == 10) { return ceilRelief(uv, fw); }
  if (kind == 5) { return pillarRelief(uv, fw); }
  if (kind == 6) { return floorRelief(uv, fw); }
  if (kind == 12) { return parapetRelief(uv, fw); }
  if (kind == 13) { return doorRelief(uv, fw); }
  return vec2f(1.0, 0.0);
}
// Marble veins (0..1): thin pale lines on a warped field, in drifts (not everywhere).
fn veins(p: vec3f, fw: f32) -> f32 {
  let q = p * 0.09;
  let n = eFbm(q * 1.6);
  let v = abs(sin((q.x * 1.3 + q.y * 0.8 - q.z * 0.9) * 2.6 + n * 6.5));
  let drift = smoothstep(0.38, 0.62, eNoise(q * 0.7 + 4.0));
  let w = 0.035 + fw * 0.6;
  return (1.0 - smoothstep(0.0, w, v)) * (0.035 / w) * (0.35 + 0.65 * drift);
}
fn ggxD(nh: f32, a: f32) -> f32 { let a2 = a * a; let d = nh * nh * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let lp = wp - EBB_O;
  let Ng = normalize(fragmentInputs.vNormal);
  let kind = i32(fragmentInputs.vInfo.x + 0.5);
  let cav = fragmentInputs.vInfo.z;
  let ex = uniforms.fogParams.z * atmoExposure();
  let camPos = uniforms.cameraPosition;
  let an = abs(Ng);
  var uv = vec2f(lp.x, lp.z); var T = vec3f(1.0, 0.0, 0.0); var Bv = vec3f(0.0, 0.0, 1.0);
  if (an.y < 0.5) {
    let side = normalize(vec3f(Ng.z, 0.0, -Ng.x));
    uv = vec2f(dot(lp, side), lp.y); T = side; Bv = vec3f(0.0, 1.0, 0.0);
  }
  // Everything that takes screen derivatives first (before any branch): the footprint, the shadows, the scans.
  let dpx = dpdx(lp); let dpy = dpdy(lp);
  let fw = max(length(dpx), length(dpy));
  let vis = shadowVisibility(wp, Ng, camPos, fragmentInputs.position.xy);
  if (uniforms.ebbParams.w > 0.5) { fragmentOutputs.color = vec4f(vec3f(vis, max(dot(Ng, uniforms.keyDir), 0.0), 0.0) * 0.5, 0.0); return fragmentOutputs; }
  var layer = MAT_STONE_PALE; var tile = 0.22;
  if (kind == 7 || kind == 2) { layer = MAT_STONE_DRESSED; tile = 0.35; }
  if (kind == 14 || kind == 17) { layer = MAT_LINEN; tile = 1.6; }
  if (kind == 6) { layer = MAT_STONE_PALE; tile = 0.3; }
  if (kind == 1) { layer = MAT_SAND_FINE; tile = 0.5; }
  if (kind == 3 || kind == 9 || kind == 13) { layer = MAT_IRON; tile = 0.45; }
  let ms = matBiplanarG(layer, lp, Ng, tile, dpx, dpy);
  if (kind == 4) {
    // A still flame: white-gold at its root and core, deepening to orange at the tip and the rim.
    let t = cav;
    let V0 = normalize(camPos - wp);
    let rim = 1.0 - abs(dot(Ng, V0));
    let core = mix(vec3f(1.0, 0.86, 0.6), vec3f(1.0, 0.5, 0.16), smoothstep(0.1, 0.9, t));
    let col = mix(core * 1.3, vec3f(0.9, 0.3, 0.07), smoothstep(0.3, 0.95, rim)) * (1.0 - 0.4 * t);
    fragmentOutputs.color = vec4f(displayTransform(col * 4.2 / max(ex, 1e-6), ex), 0.0);
    return fragmentOutputs;
  }
  if (kind == 8) {
    let lat = band(fract((uv.x + uv.y) / 1.6) - 0.5, 0.04, fw / 1.6) + band(fract((uv.x - uv.y) / 1.6) - 0.5, 0.04, fw / 1.6) + band(fract(uv.y / 4.0) - 0.5, 0.02, fw / 4.0);
    let cell = eHash(floor(vec3f((uv.x + uv.y) / 1.6, (uv.x - uv.y) / 1.6, 1.0)));
    let glow = mix(vec3f(0.2, 0.58, 0.56), vec3f(0.3, 0.7, 0.62), cell) * (0.7 + 0.3 * smoothstep(60.0, 100.0, lp.y)) * (1.0 - 0.9 * clamp(lat, 0.0, 1.0));
    fragmentOutputs.color = vec4f(displayTransform(glow * 0.6 / max(ex, 1e-6), ex), 0.0);
    return fragmentOutputs;
  }
  if (kind == 11) { fragmentOutputs.color = vec4f(0.0); return fragmentOutputs; }
  // Relief: its normal from a filtered finite difference (the step grows with the footprint).
  let e = max(0.03, fw * 0.75);
  let r0 = relief(kind, uv, fw);
  let ru = relief(kind, uv + vec2f(e, 0.0), fw).x; let rv = relief(kind, uv + vec2f(0.0, e), fw).x;
  let depthScale = select(select(0.05, 0.025, kind == 6), 0.035, kind == 12);
  let dh = vec2f(ru - r0.x, rv - r0.x) / e * depthScale;
  // The scan's normal detail, then the carving's on top.
  var N = normalize(ms.N - T * dh.x - Bv * dh.y);
  if (dot(N, Ng) < 0.05) { N = Ng; }
  if (kind == 15) { let fn0 = normalize(cross(dpx, dpy)); N = normalize(mix(Ng, select(-fn0, fn0, dot(fn0, Ng) > 0.0), 0.45)); }
  let gold = r0.y;
  // (info.z is a height, not a cavity, on bread)
  var ao = (0.45 + 0.55 * r0.x) * mix(1.0, ms.ao, 0.6) * (1.0 - 0.85 * select(cav, 0.0, kind == 15 || kind == 16));
  let seed = fragmentInputs.vInfo.y;
  let vary = 0.88 + 0.24 * eHash(floor(lp / 3.0) + seed * 17.0);
  let vn = veins(lp + seed * 31.0, fw);
  // Grime run down the stone from every ledge, a dark wet band over the drowned floor.
  let streak = eNoise(vec3f((lp.x + lp.z) * 0.8, lp.y * 0.05, seed * 9.0));
  let grime = mix(1.0, 0.72 + 0.28 * streak, step(an.y, 0.5));
  let wet = 1.0 - smoothstep(-50.0, -44.0, lp.y);
  var albedo = vec3f(0.08); var rough = 0.5; var metal = 0.0; var refl = 0.0;
  if (kind == 0 || kind == 10 || kind == 12) {
    albedo = mix(vec3f(0.075, 0.098, 0.088), matRetint(ms, layer, vec3f(0.075, 0.098, 0.088), 0.12), 0.7) * vary;
    albedo = mix(albedo, vec3f(0.24, 0.29, 0.26), vn * 0.55);
    rough = clamp(ms.rough * 0.7 + 0.18, 0.25, 0.8);
    if (kind == 10) { albedo *= 0.75; }
  } else if (kind == 5) {
    albedo = mix(vec3f(0.05, 0.07, 0.062), matRetint(ms, layer, vec3f(0.05, 0.07, 0.062), 0.1), 0.55) * vary;
    albedo = mix(albedo, vec3f(0.26, 0.3, 0.27), vn * 0.75);
    rough = 0.2 + ms.rough * 0.15;
  } else if (kind == 6) {
    albedo = matRetint(ms, layer, vec3f(0.05, 0.062, 0.058), 0.1) * (0.82 + 0.36 * eHash(floor(vec3f(lp.x / 3.0, 0.0, lp.z / 3.0))));
    albedo = mix(albedo, vec3f(0.22, 0.26, 0.24), vn * 0.6);
    rough = 0.1 + ms.rough * 0.18; refl = 0.3;
  } else if (kind == 7) {
    albedo = matRetint(ms, layer, vec3f(0.17, 0.19, 0.18), 0.15);
    albedo = mix(albedo, vec3f(0.2, 0.23, 0.21), vn * 0.25);
    rough = 0.42 + ms.rough * 0.2;
  } else if (kind == 1) {
    albedo = matRetint(ms, layer, vec3f(0.06, 0.058, 0.062), 0.3); rough = 0.9;
  } else if (kind == 18) {
    // A baby's face, asleep in the fold: warm skin, soft, a flush on the cheeks.
    albedo = vec3f(0.58, 0.39, 0.3) * (0.95 + 0.1 * eNoise(fragmentInputs.vLocal * 90.0)); rough = 0.55;
  } else if (kind == 15) {
    // Dough: soft cream, floured where the hands have not just been, a little sheen where they have; its own normal from the
    // surface (it is dented in the vertex shader).
    let fl = smoothstep(0.4, 0.85, eNoise(lp * 13.0 + seed * 9.0) * 0.65 + eNoise(lp * 42.0) * 0.35) * smoothstep(0.2, 0.8, cav);
    albedo = mix(vec3f(0.74, 0.64, 0.47), vec3f(0.88, 0.86, 0.8), fl * 0.7) * (0.94 + 0.12 * eNoise(lp * 25.0));
    rough = mix(0.62, 0.9, fl);
  } else if (kind == 16) {
    // A loaf: three slashes across its top opened in the oven (pale, floury, their lips risen and dark); the crust deep brown on
    // top, golden down the sides, pale where it sat on the tray. (info.y: the angle round it; info.z: the height.)
    let ang = seed * 6.2831853; let rr = 1.0 - cav;
    let tu = cos(ang) * rr; let tv = sin(ang) * rr;
    let dd = fract((tu * 0.85 + tv * 0.5) * 3.2 + 0.5) - 0.5;
    let inTop = smoothstep(0.35, 0.6, cav) * (1.0 - smoothstep(0.45, 0.7, abs(-tu * 0.5 + tv * 0.85)));
    let slash = (1.0 - smoothstep(0.05, 0.1, abs(dd))) * inTop;
    let lip = (1.0 - smoothstep(0.1, 0.16, abs(dd))) * inTop - slash;
    let tone = mix(mix(vec3f(0.66, 0.52, 0.34), vec3f(0.48, 0.29, 0.11), smoothstep(0.0, 0.3, cav)), vec3f(0.27, 0.14, 0.05), smoothstep(0.45, 0.95, cav));
    albedo = mix(tone * (0.85 + 0.3 * eNoise(lp * 70.0)) * (1.0 - 0.3 * lip), vec3f(0.8, 0.7, 0.52), slash);
    rough = mix(0.55, 0.8, slash);
  } else if (kind == 17) {
    // The swaddle: undyed oat-coloured wool, soft and matt, one madder band wound round its middle.
    let q = fragmentInputs.vLocal;
    let bandd = abs(q.x - 0.02);
    let band = 1.0 - smoothstep(0.022, 0.03, bandd);
    albedo = mix(vec3f(0.5, 0.43, 0.33), vec3f(0.42, 0.1, 0.07), band) * (0.9 + 0.2 * eNoise(q * 60.0)); rough = 0.92;
  } else if (kind == 14) {
    // Linen, parchment, dough: pale and soft, each piece its own shade.
    albedo = matRetint(ms, layer, mix(vec3f(0.5, 0.44, 0.34), vec3f(0.36, 0.3, 0.22), fract(seed * 7.3)), 0.3); rough = 0.85;
  } else if (kind == 2) {
    albedo = matRetint(ms, layer, vec3f(0.36, 0.36, 0.33), 0.3); rough = 0.6;
  } else {
    // Bronze (3, 9, 13): the iron scan's pitting as its wear, verdigris settling in the hollows and the low places.
    let worn = clamp(ms.h * 1.4 - 0.2, 0.0, 1.0);
    let bronze = select(vec3f(0.66, 0.46, 0.2), vec3f(0.5, 0.33, 0.14), kind == 3);
    let pat = clamp((1.0 - worn) * 0.8 + (1.0 - r0.x) * 0.9 - 0.35, 0.0, 1.0) * (0.6 + 0.4 * eNoise(lp * 0.7));
    albedo = mix(bronze * (0.7 + 0.3 * worn), vec3f(0.07, 0.17, 0.14), pat);
    metal = 1.0 - pat; rough = mix(0.28 + ms.rough * 0.2, 0.75, pat);
  }
  if (kind < 14) { albedo *= grime * mix(1.0, 0.6, wet); }
  rough = mix(rough, 0.12, wet * 0.8);
  albedo = mix(albedo, vec3f(0.85, 0.62, 0.25), gold); metal = max(metal, gold); rough = mix(rough, 0.28, gold);
  // Bread and cloth carry their own fine surface: the dough's bubbles and stretch, the crust's crackle and blisters, the
  // swaddle's wrapped folds. A height field by noise, its slope bent into the normal (no screen derivatives: any branch).
  if (kind >= 15 && kind <= 17 && fw < 0.02) {
    let q = select(lp, fragmentInputs.vLocal, kind == 17);
    var hgt = 0.0; var hx = 0.0; var hz = 0.0; var hy = 0.0; let e2 = 0.002;
    for (var k = 0; k < 4; k++) {
      let o = select(select(select(vec3f(0.0), vec3f(e2, 0.0, 0.0), k == 1), vec3f(0.0, e2, 0.0), k == 2), vec3f(0.0, 0.0, e2), k == 3);
      let x = q + o;
      var v = 0.0;
      if (kind == 15) { v = -0.6 * smoothstep(0.62, 0.8, eNoise(x * 160.0)) + 0.25 * eNoise(x * vec3f(40.0, 90.0, 40.0)); }
      else if (kind == 16) { v = 0.45 * eNoise(x * 60.0) + 0.3 * eNoise(x * 170.0) - 0.4 * (1.0 - smoothstep(0.0, 0.04, abs(eNoise(x * 75.0) - 0.5))); }
      else { let w = sin((x.x * 0.8 + x.y * 1.4 + x.z * 0.6) * 38.0 + eNoise(x * 12.0) * 3.0); v = 0.5 * smoothstep(-0.2, 0.9, w) + 0.15 * eNoise(x * 140.0); }
      if (k == 0) { hgt = v; } else if (k == 1) { hx = v; } else if (k == 2) { hy = v; } else { hz = v; }
    }
    let amp = select(select(0.0016, 0.0035, kind == 16), 0.004, kind == 17);
    let gq = vec3f(hx - hgt, hy - hgt, hz - hgt) / e2 * amp;
    N = normalize(N - (gq - N * dot(gq, N)));
    if (kind == 16) { albedo *= mix(0.7, 1.0, smoothstep(-0.4, 0.1, hgt)); }        // the crackle's small dark seams
    if (kind == 15) { albedo *= mix(0.86, 1.0, smoothstep(-0.5, 0.0, hgt)); }
    if (kind == 17) { albedo *= 0.8 + 0.25 * hgt; }
    ao *= 0.85 + 0.15 * smoothstep(-0.6, 0.4, hgt);
  }
  // The sea-light: the hall's own, down the roof's slits at a fixed slant (not the sun): sharp pools where it lands.
  let L = -EBB_BEAM;
  let lit = beamAt(lp + Ng * 0.05) * uniforms.ebbParams.z;
  let key = vec3f(0.45, 0.85, 0.8) * lit / max(ex, 1e-6);
  let V = normalize(camPos - wp);
  let nl = max(dot(N, L), 0.0);
  let Hh = normalize(L + V);
  let F0 = mix(vec3f(0.04), albedo, metal);
  let nv = max(dot(N, V), 0.0);
  let Fs = F0 + (1.0 - F0) * pow(1.0 - max(dot(Hh, V), 0.0), 5.0);
  let Fv = F0 + (max(vec3f(1.0 - rough), F0) - F0) * pow(1.0 - nv, 5.0);
  let a = max(rough * rough, 0.02);
  let spec = key * ggxD(max(dot(N, Hh), 0.0), a) * Fs * nl * 0.25;
  let diff = albedo * (1.0 - metal) * key * nl;
  // The lamps: diffuse, and a glint off whatever is polished (the world-light grid gathered round the reflected ray).
  let lampD = spellLit(wp, N, albedo * (1.0 - metal), 0.2, ex);
  let R = reflect(-V, N);
  let lampS = gridAcc(wp + N * 0.05, R, mix(-0.92, -0.4, rough)) * Fv * (1.0 - rough) * 2.2 * 0.55 / max(ex, 1e-6);
  // Fill: the haze's light, more from above; mirrored in polished stone and bronze.
  let fillC = vec3f(0.5, 0.78, 0.8) * uniforms.ebbParams.y;
  let fill = fillC * (0.7 + 0.3 * N.y) * ao * albedo * (1.0 - metal);
  let envS = mix(fillC, vec3f(0.95, 0.72, 0.42) * uniforms.ebbParams.y, metal * 0.7) * Fv * (0.6 + 0.8 * max(R.y, 0.0)) * (1.0 - rough * 0.7) * ao * (1.5 + 1.2 * metal);
  let col = (diff + spec) * mix(1.0, ao, 0.5) + lampD * ao + lampS * ao + (fill + envS) / max(ex, 1e-6);
  let fres = refl * (0.15 + 0.85 * pow(1.0 - nv, 4.0)) * select(0.0, 1.0, Ng.y > 0.5);
  fragmentOutputs.color = vec4f(displayTransform(col, ex), fres);
}
`;
