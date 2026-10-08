// Shaper architecture (world/architecture.js): one static mesh for every site, in site-local
// metres; the vertex shader places each site at its anchor and seat (sites[] = x, seat y, z,
// shown). Fragment: Shaper ashlar (coursed blocks, worn arrises, mortar shadow), carved glyph bands
// that wake with a faint cold light (siteGlow), felt tents lit through from the fire, timber, a
// bronze bell, a frozen pool (writes the SSR weight), and embers. Snow lies on what faces up.
// Lit like the rocks: key light with cascaded shadows, SH sky, aerial perspective.

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';

export const ARCH_SITES = 64;

const ARCH_VERTEX = /* wgsl */ `
attribute position: vec3f;
attribute normal: vec3f;
attribute uv: vec2f;
attribute info: vec4f;       // site, material, seed, carve
uniform viewProjection: mat4x4f;
uniform sites: array<vec4f, ${ARCH_SITES}>;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vUv: vec2f;
varying vInfo: vec4f;
varying vLocalY: f32;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let s = uniforms.sites[u32(vertexInputs.info.x + 0.5)];
  let wp = vec3f(s.x, s.y, s.z) + vertexInputs.position;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (s.w < 0.5) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vNormal = vertexInputs.normal;
  vertexOutputs.vUv = vertexInputs.uv;
  vertexOutputs.vInfo = vertexInputs.info;
  vertexOutputs.vLocalY = vertexInputs.position.y;
}
`;
export const archVertexWGSL = ARCH_VERTEX;

export const archFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform siteGlow: array<vec4f, ${ARCH_SITES}>;  // x = glyph light 0..1, y = fire 0..1, zw = hearth x, z (world)
uniform archParams: vec4f;                       // x = time, y = snow cover 0..1, z = restored 0..1
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vUv: vec2f;
varying vInfo: vec4f;
varying vLocalY: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}

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

  var albedo = vec3f(0.3, 0.29, 0.275);
  var rough = 0.85;
  var emit = vec3f(0.0);       // display-referred (like the spell lights): divided by the exposure below
  var ssr = 0.0;
  var trans = 0.0;           // light through (canvas)
  var ao = 1.0;
  let n1 = noised(wp.xz * 1.7 + wp.y * 0.9).x;
  let n2 = noised(wp.xz * 0.35 + vec2f(seed)).x;
  let topFace = abs(N.y) > 0.7;

  if (mid <= 1) {
    // Shaper stone: a pale, warm grey that weathers darker toward the ground and in the wet.
    let a = ashlar(select(uv, uv * vec2f(1.0, 0.6), topFace), seed);
    let fade = ar_fade(0.5, fp);
    albedo = vec3f(0.33, 0.315, 0.29) * (0.86 + 0.22 * a.y) * (0.9 + 0.2 * n1);
    albedo *= mix(1.0, 0.72, smoothstep(1.2, -0.2, fragmentInputs.vLocalY) * (0.5 + 0.5 * n2));
    albedo *= 1.0 - 0.45 * a.x * fade;
    ao = 1.0 - 0.35 * a.x * fade;
    N = normalize(N + vec3f(n1, 0.0, n2) * 0.06 * a.z * fade);
    if (mid == 1 && !topFace) {
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
  } else if (mid == 2) {
    // Felt and canvas: undyed wool, patched; light comes through it from the fire at night.
    let patched = step(0.62, ar_hash(floor(uv / vec2f(0.8, 0.6)) + seed));
    albedo = mix(vec3f(0.42, 0.36, 0.28), vec3f(0.33, 0.26, 0.2), patched) * (0.9 + 0.2 * n1);
    albedo *= 0.93 + 0.07 * sin(uv.x * 40.0);
    trans = 1.0;
  } else if (mid == 3) {
    albedo = vec3f(0.13, 0.09, 0.06) * (0.8 + 0.4 * noised(vec2f(uv.x * 30.0, uv.y * 2.0)).x);
  } else if (mid == 4) {
    // Ice: dark, clear, glossy; the SSR pass reflects the world in it.
    albedo = vec3f(0.06, 0.1, 0.13) + vec3f(0.12, 0.18, 0.22) * smoothstep(0.2, 0.9, n1);
    rough = 0.12; ssr = 0.55;
  } else if (mid == 5) {
    // Embers: char and a breathing glow.
    albedo = vec3f(0.03, 0.025, 0.02);
    let flick = 0.6 + 0.25 * sin(t * 7.3 + wp.x * 9.0) + 0.15 * sin(t * 13.1 + wp.z * 7.0);
    emit = vec3f(1.0, 0.36, 0.08) * smoothstep(0.1, 0.8, n1 * 0.5 + 0.5) * flick * glowS.y * 0.9;
  } else {
    // Bronze, green with age.
    albedo = mix(vec3f(0.22, 0.14, 0.07), vec3f(0.12, 0.2, 0.17), smoothstep(-0.2, 0.6, n1 + 0.3 * N.y));
    rough = 0.45;
  }

  // Snow on what faces up (not on embers or ice), heavier when it is snowing; drifts at the base.
  var snow = 0.0;
  if (mid != 5 && mid != 4) {
    let up = smoothstep(0.55, 0.85, N.y + 0.12 * n1 + 0.1 * n2) * (0.55 + 0.45 * uniforms.archParams.y);
    let drift = (1.0 - smoothstep(0.05, 0.35 + 0.15 * n2, fragmentInputs.vLocalY)) * select(0.0, 1.0, mid <= 1);
    snow = max(up, drift * 0.85);
    albedo = mix(albedo, vec3f(0.84, 0.87, 0.92), snow);
    ssr = 0.0;
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
  let sky = shIrradiance(N) * skyTint * uniforms.envMisc.w * ao * (0.8 + 0.2 * clamp(N.y * 0.5 + 0.5, 0.0, 1.0));
  var col = albedo * (key * diff * vis / PI + sky);
  // Canvas: sun through the felt, and the fire behind it.
  if (trans > 0.0) {
    col += albedo * key * clamp(-nl, 0.0, 1.0) * vis * 0.35;
    emit += vec3f(1.0, 0.55, 0.24) * albedo * glowS.y * 0.55 * (0.85 + 0.15 * sin(t * 6.1 + seed));
  }
  let H = normalize(L + V);
  let shin = mix(16.0, 140.0, 1.0 - rough);
  col += key * pow(max(dot(N, H), 0.0), shin) * (1.0 - rough) * 0.6 * vis * clamp(nl, 0.0, 1.0);
  // Firelight on the camp's stones, packs and snow: falls off from the hearth (site origin).
  let s0 = uniforms.siteGlow[site];
  if (s0.y > 0.0 && trans == 0.0) {
    let toFire = vec3f(s0.z, 0.0, s0.w) - wp; // hearth xz in z/w (world)
    let d = length(toFire.xz);
    emit += albedo * vec3f(1.0, 0.5, 0.2) * s0.y * 0.9 * max(dot(N, normalize(toFire + vec3f(0.0, 0.6, 0.0))), 0.0) / (1.0 + d * d * 0.35);
  }
  let ex = uniforms.fogParams.z * atmoExposure();
  col += emit / max(ex, 1e-6);
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(camPos - wp) * 0.001);
  let outc = displayTransform(col, ex);
  fragmentOutputs.color = vec4f(outc, ssr);
}
`;
