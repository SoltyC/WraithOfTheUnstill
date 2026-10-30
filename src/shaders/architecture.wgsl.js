// Shaper architecture (world/architecture.js): one static mesh for every site, in site-local
// metres; the vertex shader places each site at its anchor and seat (sites[] = x, seat y, z,
// shown). Fragment: Shaper ashlar (coursed blocks, worn arrises, mortar shadow), carved glyph bands
// that wake with a faint cold light (siteGlow), felt tents lit through from the fire, timber, a
// bronze bell, a frozen pool (writes the SSR weight), and embers. Snow lies on what faces up.
// Lit like the rocks: key light with cascaded shadows, SH sky, aerial perspective.

import { ENV_DECL, COMMON_WGSL, SPELL_LIGHT_DECL, SPELL_LIGHT_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';
import { MATERIALS_DECL, MATERIALS_WGSL } from './materials.wgsl.js';

export const ARCH_SITES = 640; // frost 58 (incl. 5 NPC props) + the meadow village (~110 buildings, ~100 lanterns) + the manor, shrines and side sites (~400 before the nooks) + the 39 nooks (464) + the erg's ruins (Phase 9 D7)

const ARCH_VERTEX = /* wgsl */ `
attribute position: vec3f;
attribute normal: vec3f;
attribute uv: vec2f;
attribute info: vec4f;       // site, material, seed, carve
uniform viewProjection: mat4x4f;
uniform sites: array<vec4f, ${ARCH_SITES}>;
uniform siteSpin: vec4f;     // x = the turning site (the mill's sails; -1 none), y = angle, zw = axis x, z (horizontal, unit)
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vUv: vec2f;
varying vInfo: vec4f;
varying vLocalY: f32;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let s = uniforms.sites[u32(vertexInputs.info.x + 0.5)];
  var lp = vertexInputs.position;
  var ln = vertexInputs.normal;
  let sp = uniforms.siteSpin;
  if (sp.x >= 0.0 && abs(vertexInputs.info.x - sp.x) < 0.5) {
    // Rodrigues about the horizontal axis k through the site origin (the windshaft).
    let k = vec3f(sp.z, 0.0, sp.w);
    let c = cos(sp.y);
    let sn = sin(sp.y);
    lp = lp * c + cross(k, lp) * sn + k * dot(k, lp) * (1.0 - c);
    ln = ln * c + cross(k, ln) * sn + k * dot(k, ln) * (1.0 - c);
  }
  let wp = vec3f(s.x, s.y, s.z) + lp;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (s.w < 0.5) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vNormal = ln;
  vertexOutputs.vUv = vertexInputs.uv;
  vertexOutputs.vInfo = vertexInputs.info;
  vertexOutputs.vLocalY = vertexInputs.position.y;
}
`;
export const archVertexWGSL = ARCH_VERTEX;

export const archFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform siteGlow: array<vec4f, ${ARCH_SITES}>;  // x = glyph light 0..1, y = fire 0..1, zw = hearth x, z (world); where y = 0: z = 1 no snow (the meadow), w = embers 0..1
uniform siteChar: array<vec4f, ${ARCH_SITES / 4}>; // soot/char 0..1 per site (systems/villageFire.js; 4 sites per vec4: site >> 2, component site & 3); 0 = untouched
uniform archParams: vec4f;                       // x = time, y = snow cover 0..1, z = restored 0..1
${SPELL_LIGHT_DECL}
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vUv: vec2f;
varying vInfo: vec4f;
varying vLocalY: f32;
${MATERIALS_DECL}
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
${MATERIALS_WGSL}
${SPELL_LIGHT_WGSL}

fn ar_hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn ar_fade(lambda: f32, fp: f32) -> f32 { return 1.0 - smoothstep(lambda * 0.15, lambda * 0.6, fp); }

// Ashlar: courses 0.55 m high, blocks 0.9–1.5 m staggered per course. Returns (groove 0..1,
// block id hash, edge wear).
fn ashlar(uv: vec2f, seed: f32) -> vec3f {
  let ch = 0.55;
  let row = floor(uv.y / ch);
  let len = 0.9 + 0.6 * ar_hash(vec2f(row, seed));
  let u = uv.x + ar_hash(vec2f(row + 7.0, seed)) * len;
  let col = floor(u / len);
  let fu = fract(u / len) * len; let fv = fract(uv.y / ch) * ch;
  let e = min(min(fu, len - fu), min(fv, ch - fv));
  let groove = 1.0 - smoothstep(0.008, 0.03, e);
  return vec3f(groove, ar_hash(vec2f(col, row) + seed), 1.0 - smoothstep(0.02, 0.07, e));
}

// Shaper glyphs: in a band, cells of 0.32 m, each a few straight carved strokes chosen by hash
// (verticals, a crossbar, a ring). Returns the carved groove 0..1.
fn glyph(uv: vec2f, seed: f32) -> f32 {
  let c = 0.32;
  let cell = floor(uv / c); let f = fract(uv / c) - 0.5;
  let h = ar_hash(cell + seed * 3.1);
  let h2 = ar_hash(cell.yx + seed);
  var g = 0.0;
  let w = 0.035;
  g = max(g, (1.0 - smoothstep(w, w + 0.02, abs(f.x - (h - 0.5) * 0.4))) * step(abs(f.y), 0.36));
  if (h2 > 0.4) { g = max(g, (1.0 - smoothstep(w, w + 0.02, abs(f.y - (h2 - 0.7) * 0.6))) * step(abs(f.x), 0.3)); }
  if (h > 0.72) { g = max(g, 1.0 - smoothstep(w, w + 0.02, abs(length(f) - 0.22))); }
  return g;
}

// One large verb symbol on a stone's broad face (info.w = 2 crystal, 3 crescent, 4 wave), as a
// carved groove 0..1; the face is 1.1 m wide, the symbol centred at 1.55 m.
fn symbolGlyph(uv: vec2f, kind: f32) -> f32 {
  let c = uv - vec2f(0.55, 1.55);
  let w = 0.03;
  var d = 1e3;
  if (kind < 2.5) {
    // Crystallize: a faceted crystal — outline, a central axis and a facet cross.
    let q = abs(c);
    d = abs(q.x / 0.2 + q.y / 0.46 - 1.0) * 0.17;
    if (q.y < 0.46) { d = min(d, q.x + select(0.0, 1.0, q.y > 0.44)); }
    d = min(d, abs(c.y + 0.02) + select(0.0, 1.0, q.x > 0.14));
  } else if (kind < 3.5) {
    // Sweep: a crescent, its tips trailing.
    let a = abs(length(c) - 0.34);
    let b = abs(length(c - vec2f(0.15, 0.0)) - 0.29);
    let inB = length(c - vec2f(0.15, 0.0)) < 0.29;
    let inA = length(c) < 0.34;
    d = min(select(1e3, a, !inB), select(1e3, b, inA));
  } else {
    // Ribbon: three flowing lines.
    for (var i = 0; i < 3; i++) {
      let y = (f32(i) - 1.0) * 0.17 + 0.06 * sin(c.x * 17.0 + f32(i) * 1.7);
      d = min(d, abs(c.y - y) + select(0.0, 1.0, abs(c.x) > 0.36));
    }
  }
  return 1.0 - smoothstep(w, w + 0.025, d);
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let V = normalize(camPos - wp);
  var N = normalize(fragmentInputs.vNormal);
  if (dot(N, V) < 0.0) { N = -N; }
  let info = fragmentInputs.vInfo;
  let site = u32(info.x + 0.5);
  let mid = i32(info.y + 0.5);
  let seed = info.z;
  let uv = fragmentInputs.vUv;
  let fp = length(fwidth(wp)) * 0.7;
  let t = uniforms.archParams.x;
  let glowS = uniforms.siteGlow[site];

  // Scanned surface (src/materials): chosen per material and per block (the seed), sampled once,
  // here in uniform control flow (the derivatives it needs). Stone blocks show different parts of
  // the scan and pale or dressed stone by their seed; big battered faces (carve 5) are cut into
  // drawn cyclopean courses first, each course block offset the same way.
  let hs = fract(sin(seed * 12.9898) * 43758.5453);
  let drawn = info.w > 4.5;
  let dc = ashlar(uv * vec2f(0.6, 0.58), seed);
  let bseed = select(hs, dc.y, drawn);
  var layer = select(MAT_STONE_PALE, MAT_STONE_DRESSED, bseed > 0.62 || mid == 1);
  if (mid == 2) { layer = MAT_WOOL; } else if (mid == 3) { layer = MAT_TIMBER; }
  var texScale = select(select(0.55, 1.6, mid == 2), 0.9, mid == 3);
  // The village (MAT 8..18): one scan each, chosen here before the single sample; texScale = 1 / metres per repeat.
  if (mid >= 8) {
    // Cobble: setts, river cobbles or mossy ones, by piece (the seed).
    let cobble = select(select(MAT_COBBLE_RIVER, MAT_COBBLE_MOSSY, hs > 0.8), MAT_COBBLE_SETTS, hs < 0.45);
    var tile = 1.0;
    if (mid == 8) { layer = MAT_PLASTER; tile = 1.2; }
    else if (mid == 9) { layer = MAT_THATCH; tile = 1.5; }
    else if (mid == 10) { layer = MAT_ROOF_SLATE; tile = 1.0; }
    else if (mid == 11) { layer = MAT_ROOF_CLAY; tile = 1.0; }
    else if (mid == 12) { layer = MAT_SIDING; tile = 1.2; }
    else if (mid == 13) { layer = MAT_PLANKS; tile = 0.9; }
    else if (mid == 14) { layer = cobble; tile = 1.2; }
    else if (mid == 15) { layer = MAT_FLAGSTONE; tile = 2.0; }
    else if (mid == 16) { layer = MAT_EARTH; tile = 2.0; }
    else if (mid == 17) { layer = MAT_IRON; tile = 0.6; }
    else { layer = MAT_PLASTER; }   // glass: no scan of its own, the sample is unused
    texScale = 1.0 / tile;
  }
  // Derivatives from the continuous uv: the per-block offset jumps at every block's edge.
  let cuv = uv * texScale;
  let tuv = cuv + vec2f(fract(bseed * 7.13), fract(bseed * 3.71)) * 7.0;
  let ms = matUvG(layer, tuv, N, wp, dpdx(cuv), dpdy(cuv));

  var albedo = vec3f(0.3, 0.29, 0.275);
  var rough = 0.85;
  var emit = vec3f(0.0);       // display-referred (like the spell lights): divided by the exposure below
  var ssr = 0.0;
  var trans = 0.0;           // light through (canvas)
  var ao = 1.0;
  var scatter = 0.0;         // light through thin reed at grazing angles (thatch)
  var sheen = 0.0;           // a faint metallic broad highlight (iron)
  var glassK = 0.0;          // battle glass (mid 19): light through it, fracture planes, pinpoint glints
  let n1 = noised(wp.xz * 1.7 + wp.y * 0.9).x;
  let n2 = noised(wp.xz * 0.35 + vec2f(seed)).x;
  let topFace = abs(N.y) > 0.7;

  if (mid <= 1) {
    // Shaper stone: the scan, each block a little warmer or cooler, lighter or darker; weathered
    // darker toward the ground and in the wet; lichen where it is sheltered and faces north;
    // rime in the deepest pores.
    let tint = vec3f(1.0 + 0.08 * (hs - 0.5), 1.0, 1.0 - 0.1 * (hs - 0.5)) * (0.74 + 0.4 * fract(hs * 5.3));
    // Pale, warm Shaper limestone (the scan's detail, the art direction's colour).
    albedo = matRetint(ms, layer, vec3f(0.34, 0.335, 0.32), 0.3) * tint;
    albedo *= pow(max(dot(ms.albedo / matMean(layer), vec3f(0.333)), 0.05), 0.6); // the scan's own light and dark, deepened
    if (info.w > 5.5) { albedo *= 0.5; ao *= 0.55; } // a joint (block chamfers): recessed, shadowed
    N = ms.N; rough = mix(0.7, 1.0, ms.rough); ao = mix(1.0, ms.ao, 0.85);
    albedo *= mix(1.0, 0.68, smoothstep(1.2, -0.2, fragmentInputs.vLocalY) * (0.5 + 0.5 * n2));
    // Lichen: crusts on faces that look away from the sun's arc (north) and lean out of the snow.
    let lich = smoothstep(0.55, 0.85, -N.z * 0.35 + n2 * 0.8 + 0.4 * noised(wp.xz * 4.1 + wp.y * 3.3).x) * (1.0 - smoothstep(0.4, 0.8, N.y)) * smoothstep(0.4, 0.65, ms.h);
    albedo = mix(albedo, mix(vec3f(0.34, 0.36, 0.26), vec3f(0.5, 0.34, 0.14), step(0.85, fract(hs * 13.0 + n1))), lich * 0.35);
    // Rime: hoarfrost in the pores and the joints (low in the height map, low occlusion).
    let rime = smoothstep(0.35, 0.1, ms.h) * smoothstep(0.9, 0.5, ms.ao) * 0.6;
    albedo = mix(albedo, vec3f(0.78, 0.82, 0.88), rime);
    if (drawn) {
      // The drawn courses' joints (big battered faces).
      let fade = ar_fade(0.9, fp);
      albedo *= 1.0 - 0.5 * dc.x * fade;
      ao *= 1.0 - 0.4 * dc.x * fade;
    }
    if (mid == 1 && !topFace && info.w < 5.5) {
      // Carved bands: two registers of glyphs, the grooves dark, a cold light in them when awake.
      let v = uv.y;
      let band = step(0.35, fract(v / 1.6)) * step(fract(v / 1.6), 0.75);
      var gl = glyph(uv, seed) * band * ar_fade(0.32, fp);
      var strength = 0.55;
      if (info.w > 1.5) { gl = symbolGlyph(uv, info.w) * ar_fade(0.2, fp); strength = 1.1; }
      albedo *= 1.0 - 0.55 * gl;
      ao *= 1.0 - 0.3 * gl;
      let breath = 0.75 + 0.25 * sin(t * 1.3 + seed);
      emit += vec3f(0.3, 0.6, 0.95) * gl * glowS.x * breath * strength;
    }
  } else if (mid == 7) {
    // Drifted snow banked against the stone (geometry): the snow's own colour, lightly rippled.
    albedo = vec3f(0.86, 0.88, 0.92); rough = 0.9;
    N = normalize(N + vec3f(n1 * 0.08, 0.0, n2 * 0.08));
  } else if (mid == 2) {
    // Felt and canvas: undyed wool, patched; light comes through it from the fire at night.
    let patched = step(0.62, ar_hash(floor(uv / vec2f(0.8, 0.6)) + seed));
    let felt = dot(ms.albedo, vec3f(0.3, 0.59, 0.11));
    albedo = mix(vec3f(0.42, 0.36, 0.28), vec3f(0.33, 0.26, 0.2), patched) * (0.75 + 0.6 * felt) * (0.9 + 0.2 * n1);
    N = ms.N; ao = mix(1.0, ms.ao, 0.6);
    trans = 1.0;
  } else if (mid == 3) {
    // Weathered timber: the scan, silvered by the cold.
    albedo = matRetint(ms, layer, vec3f(0.2, 0.17, 0.14), 0.5);
    N = ms.N; rough = mix(0.6, 1.0, ms.rough); ao = mix(1.0, ms.ao, 0.8);
  } else if (mid >= 8 && mid <= 17) {
    // The village. Each: the scan retinted toward the palette (matRetint), a little variation by piece (hs).
    let vary = vec3f(1.0 + 0.06 * (hs - 0.5), 1.0, 1.0 - 0.08 * (hs - 0.5)) * (0.9 + 0.2 * fract(hs * 5.3));
    let lowY = fragmentInputs.vLocalY;
    N = ms.N; ao = mix(1.0, ms.ao, 0.8);
    if (mid == 8) {
      // Plaster: cream, grimed toward the ground (splash-back and dirt), faint vertical streaks from sills and eaves.
      albedo = matRetint(ms, layer, vec3f(0.7, 0.64, 0.53), 0.45) * vary;
      let streak = noised(vec2f(uv.x * 4.5 + seed * 1.7, uv.y * 0.35)).x * 0.5 + 0.5;
      albedo *= 1.0 - 0.2 * smoothstep(0.55, 0.9, streak) * smoothstep(0.0, 1.8, 3.2 - lowY) * ar_fade(0.6, fp);
      albedo *= mix(1.0, 0.55, smoothstep(1.1, -0.1, lowY) * (0.55 + 0.45 * n2));
      albedo *= 1.0 - 0.1 * smoothstep(0.4, 0.8, n1 * 0.5 + 0.5 + 0.2 * n2);
      rough = mix(0.8, 1.0, ms.rough);
    } else if (mid == 9) {
      // Thatch: muted brown reed, matt; no specular, a little light through it at grazing angles.
      albedo = matRetint(ms, layer, vec3f(0.34, 0.275, 0.17), 0.55) * vary;
      albedo *= mix(1.0, 0.7, smoothstep(0.9, 0.0, ms.ao) * 0.6);
      rough = 1.0; scatter = 1.0;
    } else if (mid == 10) {
      // Slate: cool grey, a little sheen.
      albedo = matRetint(ms, layer, vec3f(0.2, 0.215, 0.235), 0.6) * vary;
      rough = mix(0.4, 0.75, ms.rough);
    } else if (mid == 11) {
      // Clay tile: desaturated terracotta.
      albedo = matRetint(ms, layer, vec3f(0.47, 0.27, 0.18), 0.65) * vary;
      rough = mix(0.65, 0.95, ms.rough);
    } else if (mid == 12) {
      // Shingle: the lapped siding, silvered brown, cut into shingles (courses 0.18 m, joints staggered).
      albedo = matRetint(ms, layer, vec3f(0.3, 0.245, 0.185), 0.5) * vary;
      let row = floor(uv.y / 0.18);
      let fx = fract((uv.x + ar_hash(vec2f(row, seed)) * 0.15) / 0.15) * 0.15;
      let cut = max(1.0 - smoothstep(0.003, 0.011, min(fx, 0.15 - fx)), 1.0 - smoothstep(0.004, 0.016, fract(uv.y / 0.18) * 0.18));
      albedo *= 1.0 - 0.45 * cut * ar_fade(0.15, fp) * (0.7 + 0.3 * ar_hash(vec2f(row, floor(uv.x / 0.15)) + seed));
      rough = mix(0.65, 1.0, ms.rough);
    } else if (mid == 13) {
      // Planks: dark weathered oak.
      albedo = matRetint(ms, layer, vec3f(0.16, 0.12, 0.085), 0.5) * vary;
      rough = mix(0.6, 1.0, ms.rough);
    } else if (mid == 14) {
      // Cobbles: warm grey, darker in the joints (the scan's ao); mossy ones keep their own green.
      let mossy = layer == MAT_COBBLE_MOSSY;
      albedo = select(matRetint(ms, layer, vec3f(0.4, 0.37, 0.33), 0.7) * vary, ms.albedo * 0.85, mossy);
      albedo *= mix(0.55, 1.0, smoothstep(0.2, 0.8, ms.ao));
      rough = mix(0.75, 1.0, ms.rough);
    } else if (mid == 15) {
      // Flagstones: each slab its own stone — lighter or darker, warmer or cooler, a few with lichen
      // or old staining — so the paving reads as laid slabs, not one sheet.
      let tone = 0.78 + 0.42 * fract(hs * 7.31);
      let warm = fract(hs * 3.17) - 0.5;
      albedo = matRetint(ms, layer, vec3f(0.36, 0.34, 0.31), 0.65) * tone * vec3f(1.0 + 0.12 * warm, 1.0 + 0.02 * warm, 1.0 - 0.14 * warm);
      let stain = smoothstep(0.35, 0.8, noised(wp.xz * 0.45 + vec2f(hs * 17.0)).x * 0.5 + 0.5) * step(0.6, fract(hs * 11.7));
      albedo = mix(albedo, albedo * vec3f(0.78, 0.82, 0.62), stain * 0.6);
      albedo *= mix(0.6, 1.0, smoothstep(0.2, 0.75, ms.ao));
      rough = mix(0.75, 1.0, ms.rough);
    } else if (mid == 16) {
      albedo = matRetint(ms, layer, vec3f(0.3, 0.22, 0.15), 0.6) * vary;
      rough = 1.0;
    } else {
      // Iron: dark, a faint sheen, rust left in the crevices and edges (low occlusion).
      albedo = matRetint(ms, layer, vec3f(0.075, 0.075, 0.08), 0.25);
      albedo = mix(albedo, vec3f(0.2, 0.09, 0.045), 0.45 * smoothstep(0.7, 0.25, ms.ao));
      rough = mix(0.38, 0.62, ms.rough); sheen = 1.0;
    }
  } else if (mid == 18) {
    // Leaded quarry glass: dim greenish panes in dark diamond cames (lattice in the quad's uv, metres);
    // lit from inside at night (siteGlow.x = night factor of a village site), some windows left dark.
    let dpx = uv / 0.14;                                    // pane size 0.14 m
    let dq = vec2f(dpx.x + dpx.y, dpx.x - dpx.y);
    let dl = min(abs(fract(dq.x + 0.5) - 0.5), abs(fract(dq.y + 0.5) - 0.5)) * 0.14 * 0.7071;
    let lead = max(max(1.0 - smoothstep(0.004, 0.0075, dl), 1.0 - smoothstep(0.03, 0.045, min(min(uv.x, 0.7 - uv.x), min(uv.y, 1.2 - uv.y)))), step(5.5, info.w));
    let pane = floor(dq);
    let ph = ar_hash(pane + seed);
    let glass = vec3f(0.03, 0.055, 0.045) * (0.8 + 0.5 * ph) + vec3f(0.02, 0.03, 0.03) * smoothstep(0.3, 0.9, n1 * 0.5 + 0.5);
    albedo = mix(glass, vec3f(0.035, 0.033, 0.03), lead);
    rough = mix(0.08, 0.55, lead); ao = 1.0; N = normalize(N + (ph - 0.5) * 0.015 * vec3f(1.0, 0.0, 1.0) * (1.0 - lead));
    // Some windows stay dark; late at night (archParams.w 0..1, after 23:30) more go out, each at its own hour.
    let late = uniforms.archParams.w;
    let lit = step(0.35, fract(seed * 0.7548776662)) * (1.0 - smoothstep(0.0, 0.08, late * 0.6 - fract(seed * 0.5698402909)));
    // Candle windows (about 4 in 10) gutter and breathe; the rest burn steadily.
    let gutter = step(0.6, fract(seed * 0.4142135624));
    let fr1 = sin(t * (5.0 + 3.0 * fract(seed * 0.318)) + seed * 7.0) * (0.6 + 0.4 * sin(t * 2.3 + seed));
    let flick = 0.9 + 0.1 * fr1 + gutter * (0.1 * sin(t * 13.0 + seed * 3.1) * sin(t * 4.1 + seed) + 0.08 * fr1);
    // Warm amber with a soft bloom-friendly hot core in each pane's middle.
    let core = 1.0 - smoothstep(0.0, 0.5, length(uv - vec2f(0.35, 0.6)));
    let wcol = mix(vec3f(1.0, 0.56, 0.2), vec3f(1.0, 0.76, 0.42), core * core);
    emit = wcol * (1.0 - lead) * (0.8 + 0.4 * ph) * (0.85 + 0.55 * core) * flick * lit * glowS.x * 1.15 * select(0.0, 1.0, info.w < 5.5);
  } else if (mid == 19) {
    // Battle glass (Phase 9 D7): sand fused by an old blow — dark, clear green-amber, glossy; the SSR
    // pass reflects the world in it. Fracture planes run through it, each catching the light.
    // Bottle green running to amber through a piece (where the sand fused hotter), not facet by facet.
    let tint = mix(vec3f(0.05, 0.085, 0.07), vec3f(0.085, 0.075, 0.05), smoothstep(0.3, 0.85, n2 * 0.5 + 0.5));
    albedo = tint * (0.85 + 0.3 * smoothstep(0.2, 0.9, n1 * 0.5 + 0.5));
    rough = 0.04; ssr = 0.6 * (0.15 + 0.85 * pow(1.0 - max(dot(N, V), 0.0), 3.0)); ao = 1.0; glassK = 1.0;
  } else if (mid == 4) {
    // Ice: dark, clear, glossy; the SSR pass reflects the world in it.
    albedo = vec3f(0.06, 0.1, 0.13) + vec3f(0.12, 0.18, 0.22) * smoothstep(0.2, 0.9, n1);
    rough = 0.12; ssr = 0.55;
  } else if (mid == 5) {
    // Embers: char and a breathing glow.
    albedo = vec3f(0.03, 0.025, 0.02);
    let flick = 0.6 + 0.25 * sin(t * 7.3 + wp.x * 9.0) + 0.15 * sin(t * 13.1 + wp.z * 7.0);
    // Lit by the site's fire (y), or — a site with no hearth (y = 0) — by w: candles and the
    // vigil brazier in the hall burn without lighting its felt from within.
    let emberK = max(glowS.y, select(0.0, glowS.w, glowS.y <= 0.0));
    emit = vec3f(1.0, 0.36, 0.08) * smoothstep(0.1, 0.8, n1 * 0.5 + 0.5) * flick * emberK * 0.9;
  } else {
    // Bronze, green with age.
    albedo = mix(vec3f(0.22, 0.14, 0.07), vec3f(0.12, 0.2, 0.17), smoothstep(-0.2, 0.6, n1 + 0.3 * N.y));
    rough = 0.45;
  }

  // Char (a burnt village building): blackened plaster and timber, scorched roofs; soot streaks climb from the base and
  // run up under the eaves; gloss goes (roughness up), lit windows die. 0 = untouched: skipped, so unburnt sites are bit-identical.
  let charK = uniforms.siteChar[site >> 2u][site & 3u];
  if (charK > 0.001 && mid != 5) {
    let streak = 0.6 + 0.4 * smoothstep(-0.3, 0.7, n1 * 0.5 + 0.5 + 0.35 * sin(uv.x * 7.0 + seed));
    let up = 1.0 - 0.45 * smoothstep(0.0, 6.0, fragmentInputs.vLocalY);
    let ck = clamp(charK * streak * (0.55 + 0.45 * up) * 1.15, 0.0, 1.0);
    albedo = mix(albedo, vec3f(0.028, 0.024, 0.022) * (0.7 + 0.6 * n2), ck * 0.9);
    rough = mix(rough, 0.95, ck);
    ssr = ssr * (1.0 - ck);
    emit = emit * (1.0 - charK);
  }

  // Snow on what faces up (not on embers or ice), heavier when it is snowing; drifts at the base.
  var snow = 0.0;
  // A site with no hearth (y = 0) and z = 1 lies below the snowline (the meadow's): no snow.
  let snowless = glowS.y <= 0.0 && glowS.z > 0.5;
  if (mid != 5 && mid != 4 && mid != 18 && !snowless) {
    let Ng = normalize(fragmentInputs.vNormal) * sign(dot(fragmentInputs.vNormal, V));
    let up = smoothstep(0.55, 0.85, Ng.y + 0.12 * n1 + 0.1 * n2 + 0.25 * (0.5 - ms.h)) * (0.55 + 0.45 * uniforms.archParams.y);
    let drift = (1.0 - smoothstep(0.05, 0.35 + 0.15 * n2, fragmentInputs.vLocalY)) * select(0.0, 1.0, mid <= 1);
    snow = select(max(up, drift * 0.85), 1.0, mid == 7);
    albedo = mix(albedo, vec3f(0.84, 0.87, 0.92), snow);
    N = normalize(mix(N, Ng, snow * 0.8)); rough = mix(rough, 0.9, snow);
    ssr = 0.0;
  }
  // The erg's ruins (z = 2): wind-blown sand instead — settled on every ledge and banked against the
  // foot, and the stone itself sand-scoured warm and pale.
  if (glowS.y <= 0.0 && glowS.z > 1.5 && mid <= 1) {
    let Ng = normalize(fragmentInputs.vNormal) * sign(dot(fragmentInputs.vNormal, V));
    let up = smoothstep(0.5, 0.82, Ng.y + 0.15 * n1 + 0.1 * n2 + 0.3 * (0.5 - ms.h));
    let drift = 1.0 - smoothstep(0.1, 0.6 + 0.4 * n2, fragmentInputs.vLocalY);
    let sand = max(up * 0.9, drift * 0.9);
    albedo = mix(albedo * vec3f(1.12, 1.0, 0.82), vec3f(0.62, 0.45, 0.27) * (0.92 + 0.16 * n1), sand);
    N = normalize(mix(N, Ng, sand * 0.7)); rough = mix(rough, 1.0, sand);
  }

  // Rain: stone, plaster and timber darken and take a sheen; the wet runs down, so it is heavier
  // toward the ground and on what faces up (roofs shine).
  let wetA = uniforms.wetParams.x;
  if (wetA > 0.002 && mid != 5 && mid != 4 && mid != 18 && snow < 0.5) {
    let upw = clamp(N.y, 0.0, 1.0);
    let wk = wetA * clamp(0.55 + 0.25 * upw + 0.3 * (1.0 - smoothstep(0.0, 2.5, fragmentInputs.vLocalY)), 0.0, 1.0);
    albedo *= mix(1.0, 0.6, wk);
    rough = mix(rough, 0.22, wk * 0.75);
    ssr = max(ssr, wk * upw * upw * 0.3 * (0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0)));
  }

  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  let nl = dot(N, L);
  let diff = clamp(nl, 0.0, 1.0);
  let vis = shadowVisibility(wp, normalize(fragmentInputs.vNormal) * sign(dot(fragmentInputs.vNormal, V)), camPos, fragmentInputs.position.xy);
  let cold = vec3f(0.62, 0.86, 1.32) / 0.84;
  // The cold boost is the snow's (blue in shade); stone, felt and wood keep the sky's own colour,
  // a little warmed by light bounced off the sunlit snow around them.
  let skyTint = mix(vec3f(1.04, 1.0, 0.94), cold, snow);
  // Stone in shade takes the sky's light, but not its full blue (a material, not a mirror of the sky).
  let skyRaw = shIrradiance(N);
  let skyCol = mix(skyRaw, vec3f(dot(skyRaw, vec3f(0.2126, 0.7152, 0.0722))), select(0.0, 0.45, snow < 0.5 && mid != 2));
  let sky = skyCol * skyTint * uniforms.envMisc.w * ao * (0.8 + 0.2 * clamp(N.y * 0.5 + 0.5, 0.0, 1.0));
  var col = albedo * (key * diff * vis / PI + sky);
  // Canvas: sun through the felt, and the fire behind it.
  if (trans > 0.0) {
    col += albedo * key * clamp(-nl, 0.0, 1.0) * vis * 0.35;
    emit += vec3f(1.0, 0.55, 0.24) * albedo * glowS.y * 0.55 * (0.85 + 0.15 * sin(t * 6.1 + seed));
  }
  // Thatch: forward-scattered sun through the reed at grazing views.
  col += scatter * albedo * key * vis * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0) * (0.3 + 0.7 * clamp(dot(-L, V), 0.0, 1.0)) * 0.3;
  let H = normalize(L + V);
  // Specular anti-aliasing: where the normal turns faster than a pixel can show (the scan's
  // detail far off), the highlight widens instead of sparkling under the TAA jitter.
  let nVar = dot(abs(dpdx(N)) + abs(dpdy(N)), vec3f(1.0));
  rough = max(rough, clamp(nVar * 0.6, 0.0, 0.9));
  let shin = mix(16.0, 140.0, 1.0 - rough);
  col += key * pow(max(dot(N, H), 0.0), shin) * (1.0 - rough) * 0.6 * vis * clamp(nl, 0.0, 1.0);
  col += sheen * key * pow(max(dot(N, H), 0.0), 20.0) * vis * clamp(nl, 0.0, 1.0) * (albedo * 3.0 + 0.012);
  if (glassK > 0.0) {
    // Light through the glass when the sun is behind it (warm, as through amber), and the fracture
    // planes inside lit up; the sun's glint pinpoint and hot (the bloom carries it a long way:
    // "the glass catching the sun" seen from across the erg).
    // Glass hardly scatters: its colour is what it reflects (Fresnel: the sky at grazing angles) and
    // what shows through it (the sky and sunlit sand behind, tinted by its body).
    col *= 0.45;
    let NV = max(dot(N, V), 0.0);
    let F = 0.04 + 0.96 * pow(1.0 - NV, 5.0);
    col += shIrradiance(reflect(-V, N)) * uniforms.envMisc.w * (F * 1.6 + 0.06);
    // Behind it: the sky where the view rises, else the sunlit sand it stands in (glass sits on the erg).
    let sandBehind = vec3f(0.62, 0.48, 0.32) * (key * vis * 0.55 + shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w);
    let behind = mix(sandBehind, shIrradiance(-V) * uniforms.envMisc.w, smoothstep(-0.05, 0.3, -V.y));
    col += behind * (albedo * 6.0) * (1.0 - F) * 0.3 * (0.25 + 0.75 * NV);   // seen edge-on, more glass to see through: darker
    let back = pow(clamp(dot(-V, L), 0.0, 1.0), 4.0) * (0.4 + 0.6 * clamp(-nl * 0.5 + 0.5, 0.0, 1.0));
    // Fracture planes: thin bright seams through the body, not slabs.
    let frac = smoothstep(0.965, 0.99, fract(dot(wp, vec3f(1.3, 0.7, -1.1)) * 1.7 + n2 * 0.6)) + smoothstep(0.97, 0.993, fract(dot(wp, vec3f(-0.6, 1.4, 0.8)) * 2.3 + n1 * 0.4));
    // Through-light varies with the glass's thickness (the noise): bright where thin, dark where thick.
    col += key * vis * (albedo * 6.0) * back * (0.15 + 0.35 * smoothstep(-0.3, 0.6, n1) + 1.4 * frac);
    col += key * (albedo * 6.0) * frac * 0.05;
    col += key * vis * pow(max(dot(N, H), 0.0), 900.0) * 14.0 * clamp(nl, 0.0, 1.0);
  }
  // Firelight on the camp's stones, packs and snow: falls off from the hearth (site origin).
  let s0 = uniforms.siteGlow[site];
  if (s0.y > 0.0 && trans == 0.0) {
    let toFire = vec3f(s0.z, 0.0, s0.w) - wp; // hearth xz in z/w (world)
    let d = length(toFire.xz);
    emit += albedo * vec3f(1.0, 0.5, 0.2) * s0.y * 0.9 * max(dot(N, normalize(toFire + vec3f(0.0, 0.6, 0.0))), 0.0) / (1.0 + d * d * 0.35);
  }
  let ex = uniforms.fogParams.z * atmoExposure();
  col += emit / max(ex, 1e-6);
  col += spellLit(wp, N, albedo, select(0.0, 0.5, trans > 0.0), ex);
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(camPos - wp) * 0.001);
  let outc = displayTransform(col, ex);
  fragmentOutputs.color = vec4f(outc, ssr);
}
`;
