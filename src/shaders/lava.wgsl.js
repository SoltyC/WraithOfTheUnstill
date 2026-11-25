// Lava (render/lava.js): the crater's lake and the eruption's flows, generated — no image anywhere (user, 2026-11-23: "generate
// it yourself, like the water"). One field, sampled the same way by the vertex shader (the surface's real relief) and the
// fragment shader (its light):
//   flow       the surface moves: two staggered phases of the field advected along the flow, blended so neither the
//              motion nor its looping ever shows (each phase fades out before it has stretched far)
//   warp       the melt is viscous: the field is domain-warped twice by slow noise, so it swirls, folds and drags
//   heat       a temperature over the surface (0 cold crust … 1 the open melt): hot where it wells up and at a flow's front,
//              cooling with age and toward the edges; it decides everything else
//   veins      the crust is torn in branching networks — ridged noise of the warped surface at three scales, the tears
//              wider and brighter the hotter it is, hairlines where it has cooled
//   ropes      across the flow, the skin wrinkles into ropy folds (pāhoehoe), pushed along with it; the crust between the
//              tears is raised and pillowed, the tears sunk
//   light      the melt glows by its temperature (a blackbody's run: deep red, orange, yellow-white), the thin crust round a
//              tear dull red; the crust itself black glass that takes the sky and the sun and the glow of its own tears
// Emission is display-referred (÷ exposure), like the ground's (shaders/volcano.wgsl.js).
import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';

export const LAVA_WGSL = /* wgsl */ `
fn lvH(p: vec2f) -> f32 { let q = fract(p * vec2f(0.1031, 0.1030)); let d = dot(q, q.yx + 33.33); return fract((q.x + q.y) * (q.x + d) + d * 0.5); }
fn lvHash2(p: vec2f) -> vec2f { return vec2f(lvH(p), lvH(p + vec2f(19.19, 7.77))); }
/** Value noise, −1..1, quintic. */
fn lvN(p: vec2f) -> f32 {
  let i = floor(p); let f = p - i; let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let a = lvH(i); let b = lvH(i + vec2f(1.0, 0.0)); let c = lvH(i + vec2f(0.0, 1.0)); let d = lvH(i + vec2f(1.0, 1.0));
  return (a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y) * 2.0 - 1.0;
}
const LV_ROT = mat2x2f(0.8, 0.6, -0.6, 0.8);
fn lvFbm(p0: vec2f, oct: i32) -> f32 { var p = p0; var a = 0.5; var s = 0.0; for (var i = 0; i < oct; i++) { s += a * lvN(p); p = LV_ROT * p * 2.03 + vec2f(1.7, 9.2); a *= 0.5; } return s; }
/** Ridged: 1 on the crest of a line, falling off either side. */
fn lvRidge(p: vec2f) -> f32 { return 1.0 - abs(lvN(p)); }

struct LavaS { melt: f32, temp: f32, crust: f32, rim: f32, h: f32 };

/** One phase of the surface at q (already advected): s = feature scale (m), heat 0..1, dir = flow direction. */
fn lvPhase(q: vec2f, s: f32, heat: f32, dir: vec2f, t: f32) -> LavaS {
  var o: LavaS;
  // The viscous warp: twice, slowly.
  let w1 = vec2f(lvFbm(q / (s * 7.0) + vec2f(3.1, 1.7), 3), lvFbm(q / (s * 7.0) + vec2f(8.3, 2.8), 3));
  let qw = q + w1 * s * 2.2;
  let w2 = vec2f(lvN(qw / (s * 2.3) + vec2f(t * 0.013, 5.0)), lvN(qw / (s * 2.3) + vec2f(1.3, t * 0.011)));
  let qq = qw + w2 * s * 0.6;
  // Temperature: the heat given, varied over metres (hotter streams, cooler rafts).
  let tv = lvFbm(qq / (s * 3.5), 3);
  let temp = clamp(heat * 0.9 + 0.34 * tv, 0.0, 1.0);
  // The tears: three scales of ridged lines, each wider with the heat; the finest only where it is hot enough to tear.
  let r0 = lvRidge(qq / (s * 2.6));
  let r1 = lvRidge(LV_ROT * qq / (s * 1.1) + vec2f(4.0, 1.0));
  let r2 = lvRidge(qq / (s * 0.45) + vec2f(9.0, 3.0));
  let wd = 0.025 + 0.13 * temp * temp;
  let v0 = smoothstep(1.0 - wd, 1.0 - wd * 0.25, r0);
  let v1 = smoothstep(1.0 - wd * 0.7, 1.0 - wd * 0.15, r1) * smoothstep(0.25, 0.6, temp);
  let v2 = smoothstep(1.0 - wd * 0.3, 1.0, r2) * smoothstep(0.6, 0.9, temp) * 0.45;
  // Open melt where the heat runs over: the crust gone.
  let pool = smoothstep(0.9, 1.02, temp + 0.1 * lvN(qq / s));
  o.melt = clamp(max(max(v0, v1), max(v2, pool)), 0.0, 1.0);
  o.temp = clamp(temp * (0.75 + 0.25 * o.melt) + 0.15 * pool, 0.0, 1.0);
  o.crust = 1.0 - o.melt;
  // The thin crust either side of a tear (it glows dull red through).
  o.rim = max(smoothstep(1.0 - wd * 3.5, 1.0 - wd, r0), smoothstep(1.0 - wd * 2.5, 1.0 - wd * 0.7, r1) * 0.6) * o.crust;
  // Relief: pillowed crust, sunk tears, and ropy folds across the flow (pushed into the slower crust ahead).
  let across = dot(qq, vec2f(-dir.y, dir.x)); let along = dot(qq, dir);
  let rope = sin(along / (s * 0.22) + 2.5 * lvN(vec2f(across / (s * 1.3), along / (s * 4.0)))) * smoothstep(0.2, 0.6, 1.0 - temp);
  o.h = (0.55 * (lvFbm(qq / (s * 1.6), 2) * 0.5 + 0.5) + 0.12 * rope) * o.crust * s * 0.22 - o.melt * s * 0.1;
  return o;
}

/** The surface at p (world metres): v = the flow (m/s), heat 0..1, t seconds, s = its feature scale (m). */
fn lavaField(p: vec2f, v: vec2f, heat: f32, t: f32, s: f32) -> LavaS {
  let sp = length(v);
  let dir = select(vec2f(1.0, 0.0), v / max(sp, 1e-4), sp > 1e-4);
  // (Each phase lives per seconds; at its middle it is weightiest, at its ends it has faded out: never seen stretched.)
  let per = clamp(s * 2.5 / max(sp, 0.05), 6.0, 40.0);
  var acc: LavaS; acc.melt = 0.0; acc.temp = 0.0; acc.crust = 0.0; acc.rim = 0.0; acc.h = 0.0;
  var wsum = 0.0;
  for (var k = 0; k < 2; k++) {
    let fk = f32(k);
    let ph = fract(t / per + fk * 0.5);
    let w = 1.0 - abs(ph * 2.0 - 1.0);
    let q = p - v * (ph - 0.5) * per + vec2f(fk * 37.1, fk * 11.3);
    let o = lvPhase(q, s, heat, dir, t);
    acc.melt += o.melt * w; acc.temp += o.temp * w; acc.crust += o.crust * w; acc.rim += o.rim * w; acc.h += o.h * w;
    wsum += w;
  }
  acc.melt /= wsum; acc.temp /= wsum; acc.crust /= wsum; acc.rim /= wsum; acc.h /= wsum;
  return acc;
}

/** The relief alone (for normals: the same shapes as lvPhase's, without the tears' detail). */
fn lavaRelief(p: vec2f, v: vec2f, heat: f32, t: f32, s: f32) -> f32 {
  let sp = length(v);
  let dir = select(vec2f(1.0, 0.0), v / max(sp, 1e-4), sp > 1e-4);
  let per = clamp(s * 2.5 / max(sp, 0.05), 6.0, 40.0);
  var h = 0.0;
  for (var k = 0; k < 2; k++) {
    let fk = f32(k);
    let ph = fract(t / per + fk * 0.5);
    let w = 1.0 - abs(ph * 2.0 - 1.0);
    let q = p - v * (ph - 0.5) * per + vec2f(fk * 37.1, fk * 11.3);
    let w1 = vec2f(lvFbm(q / (s * 7.0) + vec2f(3.1, 1.7), 2), lvFbm(q / (s * 7.0) + vec2f(8.3, 2.8), 2));
    let qq = q + w1 * s * 2.2;
    let temp = clamp(heat + 0.32 * lvFbm(qq / (s * 3.5), 2), 0.0, 1.0);
    let r0 = lvRidge(qq / (s * 2.6)); let wd = 0.04 + 0.2 * temp * temp;
    let melt = smoothstep(1.0 - wd, 1.0 - wd * 0.25, r0);
    let along = dot(qq, dir); let across = dot(qq, vec2f(-dir.y, dir.x));
    let rope = sin(along / (s * 0.22) + 2.5 * lvN(vec2f(across / (s * 1.3), along / (s * 4.0)))) * smoothstep(0.2, 0.6, 1.0 - temp);
    h += w * ((0.55 * (lvFbm(qq / (s * 1.6), 2) * 0.5 + 0.5) + 0.12 * rope) * (1.0 - melt) * s * 0.22 - melt * s * 0.1);
  }
  return h;
}

/** Cells (Worley): (distance to the nearest centre, to the second, the nearest cell's own random 0..1). */
fn lvVoro(p: vec2f) -> vec3f {
  let i = floor(p); let f = p - i;
  var d1 = 9.0; var d2 = 9.0; var id = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let g = vec2f(f32(x), f32(y));
      let o = lvHash2(i + g);
      let d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; id = lvH(i + g + vec2f(3.7, 9.1)); } else if (d < d2) { d2 = d; }
    }
  }
  return vec3f(d1, d2, id);
}
/** A flow's surface (shaders/lava.wgsl.js lavaFlow*): crust broken into plates, a stride to a few metres across, riding the
 *  flow; the cracks between them glow, wider and brighter the hotter it is, with finer cracks across the plates while hot.
 *  (The lake keeps the tears of lvPhase; on a flow they read as long satin streaks.) Same outputs as lavaField. */
fn lvPlatesPhase(q: vec2f, s: f32, heat: f32, t: f32) -> LavaS {
  var o: LavaS;
  let w1 = vec2f(lvFbm(q / (s * 6.0) + vec2f(3.1, 1.7), 2), lvFbm(q / (s * 6.0) + vec2f(8.3, 2.8), 2));
  let qq = q + w1 * s * 2.2 + vec2f(lvN(q / (s * 0.9)), lvN(q / (s * 0.9) + 7.0)) * s * 0.25;
  let tv = lvFbm(qq / (s * 3.5), 3);
  let temp = clamp(heat * 0.9 + 0.3 * tv, 0.0, 1.0);
  let c0 = lvVoro(qq / (s * 1.25));
  let c1 = lvVoro(qq / (s * 0.42) + vec2f(5.3, 2.1));
  let e0 = c0.y - c0.x; let e1 = c1.y - c1.x;
  // (Crack widths vary along their length; the fine cracks only in patches: never an even net.)
  let wd = (0.025 + 0.2 * temp * temp) * (0.45 + 1.1 * (lvN(qq / (s * 0.8)) * 0.5 + 0.5));
  let k0 = 1.0 - smoothstep(wd * 0.35, wd, e0);
  let k1 = (1.0 - smoothstep(wd * 0.2, wd * 0.55, e1)) * smoothstep(0.35, 0.75, temp) * 0.7 * smoothstep(0.35, 0.7, lvN(qq / (s * 1.7) + 3.0) * 0.5 + 0.5);
  let pool = smoothstep(0.9, 1.02, temp + 0.1 * lvN(qq / s));
  o.melt = clamp(max(max(k0, k1), pool), 0.0, 1.0);
  o.temp = clamp(temp * (0.75 + 0.25 * o.melt) + 0.15 * pool, 0.0, 1.0);
  o.crust = 1.0 - o.melt;
  o.rim = (1.0 - smoothstep(wd, wd * 2.0, e0)) * o.crust * 0.6;
  // Plates: raised to their middles, each tilted its own way, rough with rubble; the cracks sunk between.
  let plate = smoothstep(0.0, 0.35, e0) * (0.6 + 0.8 * c0.z);
  let rub = lvFbm(qq / (s * 0.3), 2) * 0.5 + 0.5;
  o.h = (plate * 0.55 + rub * 0.25) * o.crust * s * 0.2 - o.melt * s * 0.08;
  return o;
}
fn lavaPlates(p: vec2f, v: vec2f, heat: f32, t: f32, s: f32) -> LavaS {
  let sp = length(v);
  let per = clamp(s * 2.5 / max(sp, 0.05), 6.0, 40.0);
  var acc: LavaS; acc.melt = 0.0; acc.temp = 0.0; acc.crust = 0.0; acc.rim = 0.0; acc.h = 0.0;
  var wsum = 0.0;
  for (var k = 0; k < 2; k++) {
    let fk = f32(k);
    let ph = fract(t / per + fk * 0.5);
    let w = 1.0 - abs(ph * 2.0 - 1.0);
    let q = p - v * (ph - 0.5) * per + vec2f(fk * 37.1, fk * 11.3);
    let o = lvPlatesPhase(q, s, heat, t);
    acc.melt += o.melt * w; acc.temp += o.temp * w; acc.crust += o.crust * w; acc.rim += o.rim * w; acc.h += o.h * w;
    wsum += w;
  }
  acc.melt /= wsum; acc.temp /= wsum; acc.crust /= wsum; acc.rim /= wsum; acc.h /= wsum;
  return acc;
}

/** The lake's bursts (k of four): a dome of melt swells under the crust (the first tenth of its cycle), bursts, and a ring
 *  of fresh melt spreads and skins over. → (dome height m, the fresh melt 0..1, the cycle's phase, the burst's centre). */
fn lvBurst(p: vec2f, t: f32, k: i32, up0: vec2f, up1: vec2f) -> vec4f {
  let fk = f32(k);
  let per = 9.0 + 4.0 * fk;
  let cyc = floor(t / per + fk * 0.37);
  let ph = fract(t / per + fk * 0.37);
  let c = (lvHash2(vec2f(cyc, fk * 7.0)) - 0.5) * 60.0 + mix(up0, up1, fk / 3.0) * 0.5;
  let q = p - c;
  let r = length(q) * (1.0 + 0.3 * lvN(q * 0.3 + vec2f(cyc * 3.1, fk)));
  let rise = smoothstep(0.0, 0.1, ph) * (1.0 - smoothstep(0.1, 0.13, ph));
  let dome = 1.8 * rise * exp(-r * r / 14.0);
  let pb = max(ph - 0.1, 0.0) / 0.9;
  let R = 1.5 + 8.0 * sqrt(pb);
  let fresh = select(0.0, (1.0 - smoothstep(R * 0.3, R, r)) * (1.0 - smoothstep(0.2, 1.0, pb)), ph > 0.1);
  return vec4f(dome, fresh, ph, c.x * 0.0 + cyc);
}

/** The melt's light by temperature (a blackbody's run), display-referred brightness before ÷ exposure. */
fn lavaMelt(temp: f32) -> vec3f {
  let k = clamp(temp, 0.0, 1.0);
  let col = vec3f(1.0, 0.08 + 0.55 * pow(k, 1.6), 0.01 + 0.2 * pow(k, 3.0));
  return col * (0.12 + 1.25 * pow(k, 2.2));
}
`;

/** The light on a lava surface: crust (black glass) and melt; shared by the lake and the flows. */
const LAVA_SHADE = /* wgsl */ `
fn lavaShade(wp: vec3f, N: vec3f, s: LavaS, heat: f32, glass: f32, fragXY: vec2f) -> vec3f {
  let camPos = uniforms.cameraPosition;
  let V = normalize(camPos - wp);
  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  let vis = shadowVisibilityFast(wp, camPos);
  let ex = uniforms.fogParams.z * atmoExposure();
  // The crust: fresh black glass, duller as it ages; a little variation over the plates.
  let albedo = mix(vec3f(0.028, 0.026, 0.026), vec3f(0.018, 0.018, 0.021), glass) * (0.8 + 0.4 * (lvN(wp.xz * 0.7) * 0.5 + 0.5));
  // Clinker: the crust is broken rubble at the scale of a hand to a stride (seen close, a smooth crust read as satin).
  let cn = vec2f(lvN(wp.xz * 2.7) - lvN(wp.xz * 2.7 + vec2f(0.37, 0.0)), lvN(wp.xz * 2.7) - lvN(wp.xz * 2.7 + vec2f(0.0, 0.37)));
  let cn2 = vec2f(lvN(wp.xz * 9.1 + 3.0) - lvN(wp.xz * 9.1 + vec2f(3.37, 0.0)), lvN(wp.xz * 9.1 + 3.0) - lvN(wp.xz * 9.1 + vec2f(3.0, 0.37)));
  let Nc = normalize(N + vec3f(cn.x * 2.2 + cn2.x * 1.1, 0.0, cn.y * 2.2 + cn2.y * 1.1) * s.crust * (1.0 - glass));
  var col = albedo * (key * max(dot(Nc, L), 0.0) * vis / PI + shIrradiance(Nc) * uniforms.envMisc.w);
  let H = normalize(L + V);
  let nv = max(dot(N, V), 0.0);
  let F = 0.04 + mix(0.12, 0.96, glass) * pow(1.0 - nv, 5.0);
  let sharp = mix(18.0, 220.0, glass);
  let Ns = normalize(mix(Nc, N, glass));
  col += (key * vis * pow(max(dot(Ns, H), 0.0), sharp) * mix(0.2, 2.0, glass) + mix(shIrradiance(reflect(-V, Ns)) * uniforms.envMisc.w * 0.2, atmoSky(normalize(reflect(-V, Ns) + vec3f(0.0, 0.05, 0.0))), glass)) * F * s.crust;
  // The crust lit by its own tears (the glow under and round it: near them, not all over), and the thin skin glowing through.
  col += albedo * vec3f(1.0, 0.3, 0.05) * (0.03 + 1.4 * s.melt + 0.8 * s.rim) * heat * 0.55 / max(ex, 1e-6);
  let e = lavaMelt(s.temp) * s.melt + vec3f(0.22, 0.03, 0.0) * s.rim * heat * (0.4 + 0.6 * s.temp);
  // (Cold — a flow after the eruption, heat 0 — gives no light at all: the field's melt alone left it glowing rust-red.)
  col += e * smoothstep(0.0, 0.05, heat) / max(ex, 1e-6);
  col = atmoApply(col, fragXY * uniforms.screenInfo.zw, length(camPos - wp) * 0.001);
  return displayTransform(col, ex);
}
/** The surface's normal from its relief (central differences of the field's height, e metres apart). */
fn lavaNormal(p: vec2f, v: vec2f, heat: f32, t: f32, s: f32, h0: f32, e: f32) -> vec3f {
  let hc = lavaRelief(p, v, heat, t, s);
  let hx = lavaRelief(p + vec2f(e, 0.0), v, heat, t, s);
  let hz = lavaRelief(p + vec2f(0.0, e), v, heat, t, s);
  return normalize(vec3f(hc - hx, e, hc - hz));
}
`;

export const lavaLakeVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // xz = metres from the lake's centre, y = the ring (0 centre … 1 edge)
uniform viewProjection: mat4x4f;
uniform lavaA: vec4f;               // xyz = the lake's centre at its level, w = time (s)
uniform lavaB: vec4f;               // x = heat 0..1, y = bursts 0..1, z = the lake's radius (m), w = swell (m)
varying vWorldPos: vec3f;
varying vLocal: vec2f;
${LAVA_WGSL}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let p = vertexInputs.position.xz;
  let t = uniforms.lavaA.w;
  // The lake heaves: long slow swells and a bulge over the upwellings.
  let sw = uniforms.lavaB.w * (lvFbm(p * 0.018 + vec2f(t * 0.012, -t * 0.009), 2) + 0.6 * exp(-length(p - vec2f(-14.0, 9.0)) / 20.0) * (0.6 + 0.4 * sin(t * 0.35)));
  // The surface's own relief (pillowed crust standing up, the tears sunk: the same field the fragments light), and the
  // domes swelling under the crust before each burst.
  let up0 = vec2f(-14.0, 9.0); let up1 = vec2f(22.0, -18.0);
  let d0 = p - up0; let d1 = p - up1;
  let v = normalize(d0 + vec2f(1e-3)) * 0.5 * exp(-length(d0) / 45.0) + normalize(d1 + vec2f(1e-3)) * 0.35 * exp(-length(d1) / 35.0) + vec2f(0.03, 0.02);
  let near = max(exp(-length(d0) / 16.0), 0.8 * exp(-length(d1) / 13.0));
  let heat = clamp(uniforms.lavaB.x * (0.6 + 0.5 * near), 0.0, 1.0);
  var rel = lavaRelief(p, v, heat, t, 5.0);
  if (uniforms.lavaB.y > 0.0) { for (var k = 0; k < 4; k++) { rel += lvBurst(p, t, k, up0, up1).x * uniforms.lavaB.y; } }
  // (Toward the walls the relief stays: the crust piles up against the rock.)
  let wp = uniforms.lavaA.xyz + vec3f(p.x, sw + rel, p.y);
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vLocal = p;
}
`;

export const lavaLakeFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform lavaA: vec4f;
uniform lavaB: vec4f;
uniform lavaShore: array<vec4f, 8>;   // the shore's radius (m) at 32 angles round the lake, at its level (render/lava.js)
varying vWorldPos: vec3f;
varying vLocal: vec2f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
${LAVA_WGSL}
${LAVA_SHADE}

// The upwellings (local metres): the melt rises there and spreads to sink at the walls.
const UP0 = vec2f(-14.0, 9.0);
const UP1 = vec2f(22.0, -18.0);

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let p = fragmentInputs.vLocal;
  let t = uniforms.lavaA.w;
  // The flow: out from both upwellings, slowing as it spreads.
  let d0 = p - UP0; let d1 = p - UP1;
  let v = normalize(d0 + vec2f(1e-3)) * 0.5 * exp(-length(d0) / 45.0) + normalize(d1 + vec2f(1e-3)) * 0.35 * exp(-length(d1) / 35.0) + vec2f(0.03, 0.02);
  // The shore (the walls at the lake's level): the crust cools and thickens toward it, and tears against the rock.
  let ang = (atan2(p.y, p.x) / 6.2831853 + 0.5) * 32.0;
  let i0 = u32(floor(ang)) % 32u; let i1 = (i0 + 1u) % 32u;
  let shoreR = mix(uniforms.lavaShore[i0 / 4u][i0 % 4u], uniforms.lavaShore[i1 / 4u][i1 % 4u], fract(ang));
  let toShore = shoreR - length(p);
  let near = max(exp(-length(d0) / 16.0), 0.8 * exp(-length(d1) / 13.0));
  let heat = clamp(uniforms.lavaB.x * (0.6 + 0.5 * near) - 0.25 * smoothstep(16.0, 2.0, toShore), 0.0, 1.0);
  var s = lavaField(p, v, heat, t, 5.0);
  // The shore's tear, and the bursts (fresh melt welling through the crust, spreading, skinning over).
  let shore = 0.85 * (1.0 - smoothstep(0.4, 2.4, abs(toShore - 0.9))) * smoothstep(-0.4, 0.4, lvN(p * 0.18 + vec2f(0.0, t * 0.05))) * (0.5 + 0.5 * uniforms.lavaB.x);
  var burst = 0.0; var dome = 0.0;
  if (uniforms.lavaB.y > 0.0) {
    for (var k = 0; k < 4; k++) { let b = lvBurst(p, t, k, UP0, UP1); burst = max(burst, b.y * uniforms.lavaB.y); dome += b.x * uniforms.lavaB.y; }
  }
  // (A dome stretches the crust thin over it: it glows through as it swells.)
  burst = max(burst, smoothstep(0.4, 1.6, dome) * 0.6);
  let add = max(shore, burst);
  s.melt = max(s.melt, add); s.temp = max(s.temp, 0.6 * add + s.temp * (1.0 - add)); s.crust = 1.0 - s.melt;
  // The relief's light: the surface's own normal (central differences; finer near the eye).
  let e = clamp(length(uniforms.cameraPosition - wp) * 0.004, 0.08, 0.6);
  var N = lavaNormal(p, v, heat, t, 5.0, s.h, e);
  // The domes' slope (they are real geometry: their light must follow).
  if (dome > 0.02) {
    var dx = 0.0; var dz = 0.0;
    for (var k = 0; k < 4; k++) { dx += lvBurst(p + vec2f(0.3, 0.0), t, k, UP0, UP1).x; dz += lvBurst(p + vec2f(0.0, 0.3), t, k, UP0, UP1).x; }
    dx = (dx * uniforms.lavaB.y - dome) / 0.3; dz = (dz * uniforms.lavaB.y - dome) / 0.3;
    N = normalize(N - vec3f(dx, 0.0, dz) * N.y);
  }
  fragmentOutputs.color = vec4f(lavaShade(wp, N, s, heat, 0.0, fragmentInputs.position.xy), 0.0);
}
`;

// The eruption's flows (render/lava.js createLavaFlows): ribbons along the baked paths (data/world/lavaFlows.json), the
// ground across each row baked in. A row shows once the front has passed it; the front is a rounded lobe, thickest at its
// nose, the melt bursting through its face. Heat by age (seconds since the front passed): fresh at the front, a crust
// thickening behind it, levées cooling first at the edges, black and cold at the end (the new land stays). A front held by
// Frost (flowHold) is glass: black, glossy, no melt.
export const lavaFlowVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x, ground y across, z
attribute flowA: vec4f;             // x = metres along, y = across −1..1, z = the flow (0..3), w = when the front gets here (s)
attribute flowB: vec4f;             // xy = the flow's direction here, z = half-width (m)
uniform viewProjection: mat4x4f;
uniform flowFront: vec4f;           // the fronts (m along), per flow
uniform flowT: vec4f;               // x = time (s), y = eruption time (s), z = cooling 0..1 (the afterwards), w = shown 0/1
varying vWorldPos: vec3f;
varying vAlong: f32;
varying vU: f32;
varying vFlow: f32;
varying vArr: f32;
varying vDir: vec2f;
${LAVA_WGSL}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let a = vertexInputs.flowA;
  let fi = u32(a.z + 0.5);
  let front = uniforms.flowFront[fi];
  let behind = front - a.x;
  let u = a.y;
  // Thick in the middle, levées at the edges, sunk into the ground at the very edge; the nose rises over 10 m.
  let lev = smoothstep(0.55, 0.85, abs(u)) * (1.0 - smoothstep(0.85, 1.0, abs(u)));
  var th = (1.6 * sqrt(max(0.0, 1.0 - u * u)) + 0.5 * lev - 0.35) * smoothstep(-2.0, 10.0, behind);
  // The surface's own relief (the same field the fragments light).
  let dir = vertexInputs.flowB.xy;
  let age = max(0.0, uniforms.flowT.y - a.w);
  let heat = clamp(0.7 - age / 320.0, 0.1, 0.7);
  let p = vertexInputs.position.xz;
  th += lavaRelief(p, dir * mix(1.1, 0.15, smoothstep(0.0, 120.0, age)), heat, uniforms.flowT.x, 2.6) * 1.6;
  var wp = vec3f(vertexInputs.position.x, vertexInputs.position.y + th, vertexInputs.position.z);
  if (behind < -6.0 || uniforms.flowT.w < 0.5) { wp.y -= 60.0; }
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vAlong = a.x; vertexOutputs.vU = u; vertexOutputs.vFlow = a.z; vertexOutputs.vArr = a.w;
  vertexOutputs.vDir = dir;
}
`;

export const lavaFlowFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform flowFront: vec4f;
uniform flowT: vec4f;
uniform flowHold: vec4f;            // per flow: 1 while its front is held in glass (Frost)
varying vWorldPos: vec3f;
varying vAlong: f32;
varying vU: f32;
varying vFlow: f32;
varying vArr: f32;
varying vDir: vec2f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
${LAVA_WGSL}
${LAVA_SHADE}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let fi = u32(fragmentInputs.vFlow + 0.5);
  let front = uniforms.flowFront[fi];
  let u = fragmentInputs.vU;
  // The lobe: the nose rounded across the flow, ragged.
  let wp = fragmentInputs.vWorldPos;
  let behind = front - fragmentInputs.vAlong - 5.0 * u * u + 1.5 * lvN(vec2f(u * 3.0, fragmentInputs.vAlong * 0.2));
  if (behind < 0.0 || uniforms.flowT.w < 0.5) { discard; }
  let t = uniforms.flowT.x;
  // Heat: the crust moves from the start (the melt shows in its tears); the nose bursting; the edges cooling first.
  let age = max(0.0, uniforms.flowT.y - fragmentInputs.vArr);
  // The cooling runs down the flow from the vent: what came out first goes black first, a wave down to the front (the
  // afterwards, or the Ember Warden plugging the vent: render/lava.js cooling).
  let cw = uniforms.flowT.z * (uniforms.flowT.y + 60.0) - fragmentInputs.vArr;
  let cool = 1.0 - clamp(cw / 60.0, 0.0, 1.0);
  var heat = clamp(0.7 - age / 320.0, 0.1, 0.7) * cool;
  heat = max(heat, (1.0 - smoothstep(0.0, 9.0, behind)) * 0.86 * cool);
  heat *= 1.0 - 0.55 * smoothstep(0.5, 1.0, abs(u));
  let glass = uniforms.flowHold[fi] * (1.0 - smoothstep(4.0, 12.0, behind));
  heat *= 1.0 - glass;
  // The flow's motion: fastest in the middle of the channel (it shears against its levées), slowing with age.
  let v = fragmentInputs.vDir * mix(1.1, 0.15, smoothstep(0.0, 120.0, age)) * (1.0 - glass) * (1.0 - 0.7 * u * u);
  var s = lavaPlates(wp.xz, v, heat, t, 2.6);
  // (On the flow's steep edges the plates, laid from above, stretch into streaks: there the crust closes over, a dull rim.)
  let gN = normalize(cross(dpdx(wp), dpdy(wp)));
  let steep = smoothstep(0.75, 0.45, abs(gN.y));
  s.melt *= 1.0 - steep * 0.85; s.rim = mix(s.rim, 0.25, steep); s.crust = 1.0 - s.melt;
  // (The plates' own relief for the normal: their raised middles and sunk cracks catch the light.)
  let e = clamp(length(uniforms.cameraPosition - wp) * 0.004, 0.08, 0.5);
  let hx = lavaPlates(wp.xz + vec2f(e, 0.0), v, heat, t, 2.6).h;
  let hz = lavaPlates(wp.xz + vec2f(0.0, e), v, heat, t, 2.6).h;
  var N = normalize(vec3f(s.h - hx, e, s.h - hz));
  // The channel's own shape across (its levées tilt the surface outward at the edges).
  N = normalize(N + vec3f(-u * fragmentInputs.vDir.y, 0.0, u * fragmentInputs.vDir.x) * 0.35 * smoothstep(0.4, 1.0, abs(u)));
  fragmentOutputs.color = vec4f(lavaShade(wp, N, s, heat, glass, fragmentInputs.position.xy), 0.0);
}
`;

// The lake's crust rafts (render/lava.js createLavaRafts): slabs of cooled crust, real solids a few metres across and a
// span thick, welling up at the upwellings, riding out on the flow, turning, and going under at the walls. Their tops are
// black crust crazed with faint red cracks; their sides glow, hottest at the waterline where they sit in the melt.
export const lavaRaftVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // the raft's own metres (y up, 0 at its waterline)
attribute raftA: vec4f;             // x = raft, y = side (0 top … 1 bottom), z = how far out to its rim (0..1), w = seed
uniform viewProjection: mat4x4f;
uniform lavaA: vec4f;               // the lake's centre at its level, time
uniform lavaB: vec4f;               // heat, bursts, radius, swell
varying vWorldPos: vec3f;
varying vNormalW: vec3f;
varying vLocal: vec3f;
varying vRaft: vec4f;
${LAVA_WGSL}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let k = vertexInputs.raftA.x; let t = uniforms.lavaA.w;
  let T = 60.0 + 50.0 * lvH(vec2f(k, 1.0));
  let u = fract(t / T + lvH(vec2f(k, 2.0)));
  let up = select(vec2f(22.0, -18.0), vec2f(-14.0, 9.0), lvH(vec2f(k, 3.0)) < 0.55);
  let a0 = lvH(vec2f(k, 4.0)) * 6.2831853 + 0.5 * u;
  let start = up + (lvHash2(vec2f(k, 5.0)) - 0.5) * 10.0;
  let dist = 50.0 * (1.0 - pow(1.0 - u, 1.6));
  var c = start + vec2f(cos(a0), sin(a0)) * dist;
  // Born out of the melt, gone under it at the end (or where it meets the walls).
  let out = smoothstep(uniforms.lavaB.z * 0.75, uniforms.lavaB.z * 0.95, length(c));
  let sink = max(smoothstep(0.82, 1.0, u), out) * 1.6 + (1.0 - smoothstep(0.0, 0.06, u)) * 1.2;
  let yaw = lvH(vec2f(k, 6.0)) * 6.2831853 + u * (lvH(vec2f(k, 7.0)) - 0.5) * 2.5;
  let cy = cos(yaw); let sy = sin(yaw);
  let lp = vertexInputs.position;
  // A slow rock on the swell.
  let bob = vec2f(sin(t * 0.4 + k), cos(t * 0.33 + k * 1.7)) * 0.03;
  let ly = lp.y + lp.x * bob.x + lp.z * bob.y;
  let sw = uniforms.lavaB.w * lvFbm(c * 0.018 + vec2f(t * 0.012, -t * 0.009), 2);
  let wp = vec3f(uniforms.lavaA.x + c.x + lp.x * cy - lp.z * sy, uniforms.lavaA.y + sw + 0.75 - sink + ly, uniforms.lavaA.z + c.y + lp.x * sy + lp.z * cy);
  // Its normal (flat-shaded from the geometry's derivatives in the fragment).
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vNormalW = vec3f(0.0, 1.0, 0.0);
  vertexOutputs.vLocal = lp;
  vertexOutputs.vRaft = vec4f(vertexInputs.raftA.yzw, uniforms.lavaA.y + sw - sink);
}
`;

export const lavaRaftFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform lavaA: vec4f;
uniform lavaB: vec4f;
varying vWorldPos: vec3f;
varying vNormalW: vec3f;
varying vLocal: vec3f;
varying vRaft: vec4f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
${LAVA_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  // Below the melt's surface it is not seen.
  if (wp.y < fragmentInputs.vRaft.w - 0.05) { discard; }
  let N = normalize(cross(dpdx(wp), dpdy(wp)));
  let side = fragmentInputs.vRaft.x; let rim = fragmentInputs.vRaft.y; let seed = fragmentInputs.vRaft.z;
  let heat = uniforms.lavaB.x;
  let camPos = uniforms.cameraPosition;
  let V = normalize(camPos - wp);
  let Nf = select(-N, N, dot(N, V) > 0.0);
  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  let vis = shadowVisibilityFast(wp, camPos);
  let ex = uniforms.fogParams.z * atmoExposure();
  // Crust: black glass crazed with cracks (faintly red), rougher toward the rim where it has broken.
  let q = fragmentInputs.vLocal.xz + vec2f(seed * 31.0, seed * 17.0);
  let cr = max(smoothstep(0.965, 1.0, lvRidge(q * 0.9)), smoothstep(0.975, 1.0, lvRidge(q * 2.3 + 4.0)) * 0.6);
  let albedo = vec3f(0.03, 0.028, 0.028) * (0.8 + 0.4 * (lvN(q * 3.0) * 0.5 + 0.5));
  var col = albedo * (key * max(dot(Nf, L), 0.0) * vis / PI + shIrradiance(Nf) * uniforms.envMisc.w);
  let H = normalize(L + V);
  let F = 0.04 + 0.5 * pow(1.0 - max(dot(Nf, V), 0.0), 5.0);
  col += (key * vis * pow(max(dot(Nf, H), 0.0), 60.0) * 0.5 + shIrradiance(reflect(-V, Nf)) * uniforms.envMisc.w * 0.3) * F;
  // The glow: the cracks on top a little; the sides more and more toward the melt they sit in; the waterline brightest.
  let above = wp.y - fragmentInputs.vRaft.w;
  // (The top stays black: only its cracks show red; the broken sides glow toward the melt they ride in.)
  let wl = side * (1.0 - smoothstep(0.0, 0.5, above));
  let sideGlow = side * 0.25 * (1.0 - smoothstep(0.0, 1.2, above));
  let topCr = cr * (1.0 - side) * smoothstep(0.6, 1.0, rim + 0.3 * cr);
  let e = lavaMelt(0.4 + 0.35 * heat) * (topCr * 0.12 * heat + sideGlow * 0.6 + wl * 0.7) * (0.5 + 0.5 * heat);
  col += e / max(ex, 1e-6);
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(camPos - wp) * 0.001);
  fragmentOutputs.color = vec4f(displayTransform(col, ex), 0.0);
}
`;

// Spatter (render/lava.js createLavaSpatter): when a dome bursts, blobs of melt are thrown up — metres high, arcing,
// cooling from yellow to dull red as they fall back. Billboards, emissive, premultiplied.
export const lavaSpatterVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = blob, yz = corner
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform lavaA: vec4f;
uniform lavaB: vec4f;
varying vUv: vec2f;
varying vTemp: f32;
varying vWorldPos: vec3f;
${LAVA_WGSL}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let i = vertexInputs.position.x; let corner = vertexInputs.position.yz; let t = uniforms.lavaA.w;
  let k = i32(i) % 4; let fk = f32(k);
  let per = 9.0 + 4.0 * fk;
  let cyc = floor(t / per + fk * 0.37);
  let ph = fract(t / per + fk * 0.37);
  let c = (lvHash2(vec2f(cyc, fk * 7.0)) - 0.5) * 60.0 + mix(vec2f(-14.0, 9.0), vec2f(22.0, -18.0), fk / 3.0) * 0.5;
  // Thrown at the burst (a tenth into the cycle), each a little after the last.
  let h1 = lvH(vec2f(i, cyc)); let h2 = lvH(vec2f(i * 1.7, cyc + 3.0)); let h3 = lvH(vec2f(i * 2.3, cyc + 7.0));
  let age = (ph - 0.1) * per - h3 * 0.6;
  let vUp = (4.0 + 8.0 * h1) * (0.6 + 0.4 * uniforms.lavaB.y);
  let ang = h2 * 6.2831853; let vOut = 0.5 + 3.5 * h3;
  let y = vUp * age - 4.9 * age * age;
  let alive = age > 0.0 && y > -0.3 && uniforms.lavaB.y > 0.05;
  let p = uniforms.lavaA.xyz + vec3f(c.x + cos(ang) * vOut * age + (h1 - 0.5) * 2.0, y, c.y + sin(ang) * vOut * age + (h2 - 0.5) * 2.0);
  let size = (0.12 + 0.35 * h3 * h3) * (1.0 - 0.3 * clamp(age / 2.0, 0.0, 1.0));
  let f = normalize(uniforms.cameraPosition - p);
  let r = normalize(cross(vec3f(0.0, 1.0, 0.0), f)); let u = cross(f, r);
  // (Stretched a little along its flight: a blob, not a dot.)
  let vel = normalize(vec3f(cos(ang) * vOut, vUp - 9.8 * age, sin(ang) * vOut) + vec3f(0.0, 1e-3, 0.0));
  let wp = p + (r * corner.x + u * corner.y) * size + vel * corner.y * size * 0.6;
  vertexOutputs.position = select(vec4f(0.0, 0.0, -2.0, 1.0), uniforms.viewProjection * vec4f(wp, 1.0), alive);
  vertexOutputs.vUv = corner;
  vertexOutputs.vTemp = clamp(1.0 - age / 2.2, 0.15, 1.0) * (0.7 + 0.3 * uniforms.lavaB.x);
  vertexOutputs.vWorldPos = wp;
}
`;

export const lavaSpatterFragmentWGSL = /* wgsl */ `
${ENV_DECL}
varying vUv: vec2f;
varying vTemp: f32;
varying vWorldPos: vec3f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${LAVA_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let r2 = dot(fragmentInputs.vUv, fragmentInputs.vUv);
  if (r2 > 1.0) { discard; }
  let ex = uniforms.fogParams.z * atmoExposure();
  let core = 1.0 - smoothstep(0.0, 1.0, r2);
  // A dark skin forming over the blob as it cools; its core still bright.
  let e = lavaMelt(fragmentInputs.vTemp * (0.6 + 0.4 * core)) * (0.6 + 0.8 * core);
  var col = e / max(ex, 1e-6);
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(uniforms.cameraPosition - fragmentInputs.vWorldPos) * 0.001);
  let a = smoothstep(1.0, 0.6, r2);
  fragmentOutputs.color = vec4f(displayTransform(col, ex) * a, a);
}
`;
