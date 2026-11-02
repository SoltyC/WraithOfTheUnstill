// Ebbhold (render/ebbhold.js): Shaper stone, dark and green, carved in relief — tall panels in stepped frames, fluted in their
// lower two thirds and crossed by tide chevrons above, with gold run into the frames and chevrons; the pillars fluted on every
// facet; polished flagstones that hold reflections (they mark the post chain's SSR); bronze-gold balustrades and trims; the veiled
// statues in a smoother, darker stone; the sea-windows glowing cold behind geometric leading; braziers that never flicker.
// Light: the sun through the roof's slits as a cold sea-light (shadowed: the roof casts), the lamps (world lights, `held`: they light
// the Wraith the same way) and a faint fill. The haze and its shafts are post/compose's (systems/ebbhold.js sets them inside).

import { ENV_DECL, COMMON_WGSL, SPELL_LIGHT_DECL, SPELL_LIGHT_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';
import { BEAM_WGSL } from '../world/ebbhold.js';

export const EBB_KIND = { wall: 0, sand: 1, prop: 2, bronze: 3, flame: 4, pillar: 5, floor: 6, statue: 7, window: 8, trim: 9, ceiling: 10, shadow: 11 };

export const ebbVertexWGSL = /* wgsl */ `
attribute position: vec3f;
attribute normal: vec3f;
attribute info: vec4f;               // x = kind (EBB_KIND), y = per-piece seed
uniform viewProjection: mat4x4f;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vInfo: vec4f;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  vertexOutputs.position = uniforms.viewProjection * vec4f(vertexInputs.position, 1.0);
  vertexOutputs.vWorldPos = vertexInputs.position;
  vertexOutputs.vNormal = vertexInputs.normal;
  vertexOutputs.vInfo = vertexInputs.info;
}
`;

export const ebbFragmentWGSL = /* wgsl */ `
${ENV_DECL}
${SPELL_LIGHT_DECL}
uniform ebbParams: vec4f;            // y = fill (display-referred), z = sea-light strength
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vInfo: vec4f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
${SPELL_LIGHT_WGSL}
${BEAM_WGSL}
fn eHash(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453); }
fn band(x: f32, w: f32) -> f32 { return 1.0 - smoothstep(0.0, w, abs(x)); }

// Wall relief: height (0 deep … 1 proud) and gold at (u along the wall, v up). Panels 8 × 12 m in stepped frames; fluted below,
// tide chevrons above; gold in the frame's inner line and along the chevrons.
fn wallRelief(uv: vec2f) -> vec2f {
  let PW = 8.0; let PH = 12.0;
  let p = vec2f(uv.x - PW * floor(uv.x / PW), uv.y - PH * floor(uv.y / PH));
  let e = min(min(p.x, PW - p.x), min(p.y, PH - p.y));
  var h = 0.85; var gold = 0.0;
  if (e < 0.18) { h = 0.0; }
  else if (e < 0.9) { h = 1.0; }
  else if (e < 1.3) { h = 0.55; gold = band(e - 1.1, 0.05); }
  else {
    let fv = (p.y - 1.3) / (PH - 2.6);
    if (fv < 0.62) {
      let f = abs(fract((p.x - 1.3) / 0.6) - 0.5) * 2.0;
      h = 0.62 + 0.25 * smoothstep(0.15, 0.6, f);
    } else {
      let c = abs(p.x - PW * 0.5) * 0.7 + p.y;
      let f = fract(c / 1.1);
      h = 0.6 + 0.3 * smoothstep(0.1, 0.35, f) * (1.0 - smoothstep(0.65, 0.9, f));
      gold = band(f - 0.05, 0.03) * step(0.5, fract(c / 2.2));
    }
  }
  return vec2f(h, gold);
}
// Pillar and pilaster facets: deep flutes round the shaft (0.9 m), a ring every 3 m.
fn pillarRelief(uv: vec2f) -> vec2f {
  let f = abs(fract(uv.x / 0.9) - 0.5) * 2.0;
  var h = 0.55 + 0.4 * smoothstep(0.1, 0.7, f);
  let ring = band(fract(uv.y / 3.0) - 0.5, 0.06);
  h = mix(h, 1.0, ring);
  return vec2f(h, ring * 0.6);
}
// Flagstones, 3 m, joints with a dark gold line.
fn floorRelief(uv: vec2f) -> vec2f {
  let p = fract(uv / 3.0);
  let e = min(min(p.x, 1.0 - p.x), min(p.y, 1.0 - p.y)) * 3.0;
  return vec2f(select(1.0, 0.2, e < 0.05), band(e - 0.07, 0.025));
}
fn relief(kind: i32, uv: vec2f) -> vec2f {
  if (kind == 0 || kind == 10) { return wallRelief(uv); }
  if (kind == 5) { return pillarRelief(uv); }
  if (kind == 6) { return floorRelief(uv); }
  if (kind == 7) { let f = abs(fract(uv.x / 1.4) - 0.5) * 2.0; return vec2f(0.7 + 0.3 * smoothstep(0.0, 0.8, f), 0.0); }
  return vec2f(1.0, 0.0);
}
fn ggxD(nh: f32, a: f32) -> f32 { let a2 = a * a; let d = nh * nh * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let Ng = normalize(fragmentInputs.vNormal);
  let kind = i32(fragmentInputs.vInfo.x + 0.5);
  let ex = uniforms.fogParams.z * atmoExposure();
  let camPos = uniforms.cameraPosition;
  let an = abs(Ng);
  var uv = vec2f(wp.x, wp.z); var T = vec3f(1.0, 0.0, 0.0); var Bv = vec3f(0.0, 0.0, 1.0);
  if (an.y < 0.5) {
    let side = normalize(vec3f(Ng.z, 0.0, -Ng.x));
    uv = vec2f(dot(wp, side), wp.y); T = side; Bv = vec3f(0.0, 1.0, 0.0);
  }
  // Shadows first (they take screen derivatives: before any branch).
  let vis = shadowVisibility(wp, Ng, camPos, fragmentInputs.position.xy);
  if (uniforms.ebbParams.w > 0.5) { fragmentOutputs.color = vec4f(vec3f(vis, max(dot(Ng, uniforms.keyDir), 0.0), 0.0) * 0.5, 0.0); return fragmentOutputs; }   // debug: sun visibility (r), facing (g)
  if (kind == 4) {
    fragmentOutputs.color = vec4f(displayTransform(vec3f(6.0, 3.4, 1.3) * 0.6 / max(ex, 1e-6), ex), 0.0);
    return fragmentOutputs;
  }
  if (kind == 8) {
    let lat = band(fract((uv.x + uv.y) / 1.6) - 0.5, 0.04) + band(fract((uv.x - uv.y) / 1.6) - 0.5, 0.04) + band(fract(uv.y / 4.0) - 0.5, 0.02);
    let glow = vec3f(0.22, 0.62, 0.58) * (0.75 + 0.25 * eHash(floor(vec3f(uv / 1.6, 1.0)))) * (1.0 - 0.85 * clamp(lat, 0.0, 1.0));
    fragmentOutputs.color = vec4f(displayTransform(glow * 0.55 / max(ex, 1e-6), ex), 0.0);
    return fragmentOutputs;
  }
  if (kind == 11) { fragmentOutputs.color = vec4f(0.0); return fragmentOutputs; }
  let e = 0.04;
  let r0 = relief(kind, uv);
  let ru = relief(kind, uv + vec2f(e, 0.0)).x; let rv = relief(kind, uv + vec2f(0.0, e)).x;
  let depthScale = select(0.06, 0.03, kind == 6);
  let dh = vec2f(ru - r0.x, rv - r0.x) / e * depthScale;
  let N = normalize(Ng - T * dh.x - Bv * dh.y);
  let ao = 0.5 + 0.5 * r0.x;
  let gold = r0.y;
  let tone = 0.85 + 0.3 * eHash(floor(wp / 2.0) + fragmentInputs.vInfo.y);
  var albedo = vec3f(0.11, 0.14, 0.13) * tone;
  var rough = 0.55; var metal = 0.0; var refl = 0.0;
  if (kind == 1) { albedo = vec3f(0.06, 0.058, 0.062) * (0.8 + 0.4 * eHash(floor(wp * 9.0))); rough = 0.9; }
  if (kind == 2) { albedo = vec3f(0.42, 0.42, 0.38); rough = 0.6; }
  if (kind == 3) { albedo = vec3f(0.30, 0.20, 0.09); metal = 1.0; rough = 0.42; }
  if (kind == 5) { albedo = vec3f(0.10, 0.13, 0.12) * tone; rough = 0.45; }
  if (kind == 6) { albedo = vec3f(0.07, 0.09, 0.085) * (0.8 + 0.35 * eHash(floor(vec3f(wp.x / 3.0, 0.0, wp.z / 3.0)))); rough = 0.18; refl = 0.22; }
  if (kind == 7) { albedo = vec3f(0.085, 0.10, 0.095); rough = 0.35; }
  if (kind == 9) { albedo = vec3f(0.2, 0.14, 0.065); metal = 0.85; rough = 0.34; }
  if (kind == 10) { albedo *= 0.8; }
  albedo = mix(albedo, vec3f(0.85, 0.62, 0.25), gold); metal = max(metal, gold); rough = mix(rough, 0.3, gold);
  // The sea-light: the hall's own, down the roof's slits at a fixed slant (not the sun): sharp pools where it lands.
  let L = -EBB_BEAM;
  let lit = beamAt(wp - EBB_O + Ng * 0.05) * uniforms.ebbParams.z;
  let key = vec3f(0.45, 0.85, 0.8) * lit / max(ex, 1e-6);
  let V = normalize(camPos - wp);
  let nl = max(dot(N, L), 0.0);
  let Hh = normalize(L + V);
  let F0 = mix(vec3f(0.04), albedo, metal);
  let Fs = F0 + (1.0 - F0) * pow(1.0 - max(dot(Hh, V), 0.0), 5.0);
  let spec = key * ggxD(max(dot(N, Hh), 0.0), rough * rough) * Fs * nl * 0.25;
  let diff = albedo * (1.0 - metal) * key * nl;
  let lampD = spellLit(wp, N, mix(albedo, albedo * 0.5 + vec3f(0.08, 0.055, 0.025), metal), 0.2, ex);
  let fill = vec3f(0.5, 0.78, 0.8) * uniforms.ebbParams.y * (0.75 + 0.25 * N.y) * ao;
  let col = (diff + spec) * ao + lampD * ao + mix(albedo, F0, metal) * fill / max(ex, 1e-6);
  let fres = refl * (0.15 + 0.85 * pow(1.0 - max(dot(N, V), 0.0), 4.0)) * select(0.0, 1.0, Ng.y > 0.5);
  fragmentOutputs.color = vec4f(displayTransform(col, ex), fres);
}
`;
