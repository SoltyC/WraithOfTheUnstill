// The wave (render/wave.js; release-cinematic.md shots 5–7 and 14): the sea through the sea-doors, a wall of water coming down
// the Tide Hall from wall to wall, its lip pitched forward over a barrel. One sheet: a grid whose rows run across the hall and
// whose columns run along a breaking wave's profile (the flood behind, the crest, the lip curling down, the barrel's inside, the
// face, the toe), varied along the hall's width (the front uneven, the lip pitching in some places and spilling in others) and
// broken up by turbulence. Time can stop (the Listener's hold): every ripple, every drop in the spray, held where it was.
// Spray: drops thrown off the lip and mist boiling at the toe, billboards (premultiplied). Lit as the city is: the sea-light down
// the roof's slits, the lamps, the haze's fill; the lip glows green where it is thin and lit from behind.

import { ENV_DECL, COMMON_WGSL, SPELL_LIGHT_DECL, SPELL_LIGHT_WGSL, LIGHT_SLOTS } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { BEAM_WGSL } from '../world/ebbhold.js';
import { WAVE_SHAPE_WGSL } from '../game/wave.js';

const NOISE = /* wgsl */ `
fn wHash(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453); }
fn wNoise(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wHash(i), wHash(i + vec3f(1.0, 0.0, 0.0)), u.x), mix(wHash(i + vec3f(0.0, 1.0, 0.0)), wHash(i + vec3f(1.0, 1.0, 0.0)), u.x), u.y),
             mix(mix(wHash(i + vec3f(0.0, 0.0, 1.0)), wHash(i + vec3f(1.0, 0.0, 1.0)), u.x), mix(wHash(i + vec3f(0.0, 1.0, 1.0)), wHash(i + vec3f(1.0, 1.0, 1.0)), u.x), u.y), u.z);
}
`;

const PROFILE_WGSL = /* wgsl */ `
${WAVE_SHAPE_WGSL}
/** A point of the sheet (local: x along the hall, y, z across): s along the profile, z across, t the wave's own time. */
fn wavePoint(s: f32, z: f32, front: f32, t: f32) -> vec3f {
  let A = across(z);
  let p = profile(s, A.y, A.z);
  // Turbulence: big slow churn and a finer chop, carried up the face and over (the water climbs the wave); ragged at the lip.
  let q = vec3f(p.x * 0.35, p.y * 0.3 - t * 0.9, z * 0.3);
  let lip = smoothstep(0.25, 0.45, s) * (1.0 - smoothstep(0.55, 0.68, s));
  let amp = 0.35 + 0.9 * lip;
  let n = vec2f(wNoise(q) - 0.5, wNoise(q + vec3f(5.2, 1.3, 7.7)) - 0.5) * 2.0 * amp
        + vec2f(wNoise(q * 3.1 + 2.0) - 0.5, wNoise(q * 3.1 + 9.0) - 0.5) * 0.5 * (0.4 + lip);
  // Fingers along the lip: it breaks into tongues, some further than others.
  let fing = (wNoise(vec3f(z * 0.9, t * 0.3, 1.0)) - 0.5) * 2.2 * lip;
  return vec3f(front - (p.x + A.x + n.x + fing), p.y + n.y - fing * 0.4, z);
}
`;

export const waveVertexWGSL = /* wgsl */ `
attribute position: vec3f;         // x = s along the profile, y = z across the hall (local)
uniform viewProjection: mat4x4f;
uniform waveParams: vec4f;         // x = the front (local x), y = the wave's time (s; held while frozen), z = shown, w = —
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vS: f32;
varying vLocal: vec3f;
${NOISE}
${PROFILE_WGSL}
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let s = vertexInputs.position.x; let z = vertexInputs.position.y;
  let P = uniforms.waveParams;
  let p = wavePoint(s, z, P.x, P.y);
  let ps = wavePoint(s + 0.004, z, P.x, P.y); let pz = wavePoint(s, z + 0.35, P.x, P.y);
  let nrm = normalize(cross(pz - p, ps - p));
  let O = vec3f(${-4700}.0, ${400}.0, ${-1400}.0);
  let wp = p + O;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (P.z < 0.5) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vNormal = nrm;
  vertexOutputs.vS = s;
  vertexOutputs.vLocal = p;
}
`;

export const waveFragmentWGSL = /* wgsl */ `
${ENV_DECL}
${SPELL_LIGHT_DECL}
uniform waveParams: vec4f;
uniform ebbParams: vec4f;          // the city's light: y = fill, z = the sea-light's strength
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vS: f32;
varying vLocal: vec3f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SPELL_LIGHT_WGSL}
${BEAM_WGSL}
${NOISE}
fn ggxW(nh: f32, a: f32) -> f32 { let a2 = a * a; let d = nh * nh * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos; let lp = fragmentInputs.vLocal; let s = fragmentInputs.vS;
  let cam = uniforms.cameraPosition; let V = normalize(cam - wp);
  var N = normalize(fragmentInputs.vNormal);
  // Fine water (a bump in screen space, before any branch): streaks pulled along the flow — up the face and over the lip —
  // and a chop across them, filtered away with distance.
  let tt = uniforms.waveParams.y;
  let dpx = dpdx(lp); let dpy = dpdy(lp);
  let fw = max(length(dpx), length(dpy));
  let qa = vec3f(lp.x * 1.3, lp.y * 0.22 - tt * 1.6, lp.z * 1.3);
  var h = (wNoise(qa) - 0.5) * 1.0 + (wNoise(qa * vec3f(3.1, 2.0, 3.1) + 4.0) - 0.5) * 0.5 * (1.0 - smoothstep(0.08, 0.25, fw));
  h += (wNoise(lp * 7.0 + vec3f(0.0, -tt * 2.0, 0.0)) - 0.5) * 0.22 * (1.0 - smoothstep(0.02, 0.07, fw));
  let hx = dpdx(h); let hy = dpdy(h);
  let r1 = cross(dpy, N); let r2 = cross(N, dpx); let det = dot(dpx, r1);
  let grad = sign(det) * (hx * r1 + hy * r2);
  N = normalize(abs(det) * N - grad * 0.35);
  let back = dot(N, V) < 0.0;
  if (back) { N = -N; }
  let ex = uniforms.fogParams.z * atmoExposure();
  let t = uniforms.waveParams.y;
  // Where on the wave: the lip (thin, glowing), the face, the toe.
  let lip = smoothstep(0.2, 0.36, s) * (1.0 - smoothstep(0.52, 0.64, s));
  let thin = smoothstep(0.3, 0.42, s) * (1.0 - smoothstep(0.5, 0.6, s));
  let face = smoothstep(0.6, 0.7, s) * (1.0 - smoothstep(0.85, 0.9, s));
  let toe = smoothstep(0.8, 0.86, s) * (1.0 - smoothstep(0.93, 0.97, s));
  // Foam: a torn sheet over the crest and the lip, streaks pulled down the face, a boil at the toe; the flood behind marbled.
  let q = vec3f(lp.x * 0.5, lp.y * 0.5 - t * 0.9, lp.z * 0.5);
  let n1 = wNoise(q * 1.7); let n2 = wNoise(q * 5.3 + 3.1); let n3 = wNoise(vec3f(lp.z * 2.6, lp.y * 0.25 - t * 1.4, lp.x * 0.4));
  let marble = smoothstep(0.55, 0.75, n1 * 0.6 + n2 * 0.4);
  let lace = wNoise(lp * 3.7 + vec3f(0.0, -t * 1.2, 0.0)) * 0.5 + wNoise(lp * 9.5) * 0.3 + h * 0.4;
  var foam = lip * smoothstep(0.42, 0.62, n1 * 0.4 + n2 * 0.25 + lace * 0.45) + face * (0.25 + 0.55 * smoothstep(0.5, 0.85, n3 * 0.75 + lace * 0.35)) + toe * smoothstep(0.25, 0.55, n1 * 0.5 + n2 * 0.5)
           + (1.0 - smoothstep(0.15, 0.25, s)) * marble * 0.55;
  foam = clamp(foam, 0.0, 1.0);
  // Light: the sea-light down the slits (the hall's sun), the lamps, the haze.
  let L = -EBB_BEAM;
  let beam = beamAt(lp + N * 0.1) * uniforms.ebbParams.z;
  let key = vec3f(0.45, 0.85, 0.8) * beam / max(ex, 1e-6);
  let fillC = vec3f(0.5, 0.78, 0.8) * uniforms.ebbParams.y / max(ex, 1e-6);
  let nv = max(dot(N, V), 0.0); let nl = dot(N, L);
  // The water: dark and deep where thick; the thin lip transmits (the light behind it, through it: green).
  let deep = vec3f(0.012, 0.04, 0.042);
  let scat = vec3f(0.09, 0.42, 0.36);
  let through = beamAt(lp - N * 0.6) * uniforms.ebbParams.z;
  let trans = scat * (vec3f(0.45, 0.85, 0.8) * through / max(ex, 1e-6) * (0.35 + 0.65 * pow(max(dot(-V, L), 0.0), 3.0)) + fillC * 0.6) * (0.5 + 1.4 * thin + 0.35 * face);
  let lampT = spellLit(wp, -N, scat * (0.3 + thin), 0.2, ex);
  var col = deep * (fillC * 0.6 + key * max(nl, 0.0) * 0.3) + trans + lampT * 0.6;
  // Its surface: glossy, the slits' light and the lamps in it.
  let R = reflect(-V, N); let H = normalize(L + V);
  let F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
  col += key * ggxW(max(dot(N, H), 0.0), 0.06) * F * max(nl, 0.0) * 0.6;
  col += gridAcc(wp + N * 0.1, R, -0.9) * F * 2.2 * 0.55 / max(ex, 1e-6);
  col += fillC * F * (0.6 + 0.8 * max(R.y, 0.0)) * 1.4;
  // The near lights (the verbs', a shot's key) in the water: a tight highlight each, and glitter where the chop faces them.
  for (var li = 0u; li < ${LIGHT_SLOTS}u; li++) {
    let sp = uniforms.spellLights[li * 2u]; let sc = uniforms.spellLights[li * 2u + 1u];
    if (sc.w <= 0.0) { continue; }
    let lv = sp.xyz - wp; let d = max(length(lv), 0.35);
    if (d >= sp.w) { continue; }
    let Ls = lv / d; let Hs = normalize(Ls + V);
    let fall = (1.0 - d / sp.w) * (1.0 - d / sp.w) / (1.0 + d * d * 0.1);
    let nh = max(dot(N, Hs), 0.0);
    col += sc.rgb * sc.w * fall * (ggxW(nh, 0.05) * 0.08 + pow(nh, 6.0) * 0.25) * F * 4.0 * max(dot(N, Ls), 0.0) / max(ex, 1e-6);
  }
  // Foam is white, rough and lit all round (the beam, the lamps, the haze).
  let foamC = vec3f(0.82, 0.88, 0.86) * (key * (0.35 + 0.65 * max(nl, 0.0)) + fillC * (0.8 + 0.4 * N.y)) + spellLit(wp, N, vec3f(0.8, 0.85, 0.84), 0.6, ex);
  col = mix(col, foamC, foam * (0.65 + 0.35 * n2));
  // (The haze is the post chain's, as on the city's stone.)
  fragmentOutputs.color = vec4f(displayTransform(col, ex), 0.0);
}
`;

// The spray: drops flung from the lip ahead of the wave and falling; mist boiling at the toe and torn off the crest. Each a
// billboard; where it is in the wave's own time decides where it is (so holding the time holds every drop).
export const sprayVertexWGSL = /* wgsl */ `
attribute position: vec3f;         // x = corner u (−1/1), y = corner v (−1/1), z = —
attribute spray: vec4f;            // x = z across (local), y = seed, z = kind (0 drop, 1 mist off the toe, 2 mist off the crest), w = second seed
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform waveParams: vec4f;
varying vWorldPos: vec3f;
varying vUv: vec3f;
varying vFade: f32;
${NOISE}
${PROFILE_WGSL}
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let P = uniforms.waveParams; let sp = vertexInputs.spray;
  let kind = i32(sp.z + 0.5);
  var life = 1.6; var s0 = 0.4; var v = vec3f(0.0); var g = 9.0; var size = 0.03 + 0.05 * fract(sp.w * 7.3);
  if (kind == 0) { s0 = 0.36 + 0.1 * fract(sp.w * 3.1); v = vec3f(3.0 + 6.0 * fract(sp.y * 5.7), 1.0 + 5.0 * fract(sp.w * 11.3), (fract(sp.y * 13.1) - 0.5) * 2.5); }
  else if (kind == 1) { life = 3.0; s0 = 0.86; v = vec3f(2.0 + 4.0 * fract(sp.y * 5.7), 0.6 + 2.0 * fract(sp.w * 11.3), (fract(sp.y * 13.1) - 0.5) * 3.0); g = -0.3; size = 0.8 + 1.8 * fract(sp.w * 7.3); }
  else { life = 2.4; s0 = 0.28; v = vec3f(1.0 + 3.0 * fract(sp.y * 5.7), 1.5 + 2.5 * fract(sp.w * 11.3), (fract(sp.y * 13.1) - 0.5) * 2.0); g = 0.4; size = 0.5 + 1.2 * fract(sp.w * 7.3); }
  let age = fract(P.y / life + sp.y) * life;
  let base = wavePoint(s0, sp.x, P.x, P.y - age);   // where the lip was when it left
  // Thrown forward (−x) of the wave, which carries on at its own pace: relative to the front the drop drifts ahead.
  var lpos = base + vec3f(-v.x * age, v.y * age - 0.5 * g * age * age, v.z * age);
  let O = vec3f(${-4700}.0, ${400}.0, ${-1400}.0);
  let c = lpos + O;
  let toCam = normalize(uniforms.cameraPosition - c);
  let right = normalize(cross(vec3f(0.0, 1.0, 0.0), toCam) + vec3f(1e-5, 0.0, 0.0)); let up = cross(toCam, right);
  // Drops stretch along their fall when time runs (a streak), and are round when it stops.
  let vel = vec3f(-v.x, v.y - g * age, v.z);
  var r = right * size; var u = up * size;
  let wp = c + r * vertexInputs.position.x + u * vertexInputs.position.y;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (P.z < 0.5 || lpos.y < -2.0) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vUv = vec3f(vertexInputs.position.xy, sp.z);
  vertexOutputs.vFade = smoothstep(0.0, 0.15, age / life) * (1.0 - smoothstep(0.7, 1.0, age / life));
}
`;

export const sprayFragmentWGSL = /* wgsl */ `
${ENV_DECL}
${SPELL_LIGHT_DECL}
uniform waveParams: vec4f;
uniform ebbParams: vec4f;
varying vWorldPos: vec3f;
varying vUv: vec3f;
varying vFade: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SPELL_LIGHT_WGSL}
${BEAM_WGSL}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos; let uv = fragmentInputs.vUv;
  let r2 = dot(uv.xy, uv.xy);
  if (r2 > 1.0) { discard; }
  let ex = uniforms.fogParams.z * atmoExposure();
  let lp = wp - EBB_O;
  let beam = beamAt(lp) * uniforms.ebbParams.z;
  let fillC = vec3f(0.5, 0.78, 0.8) * uniforms.ebbParams.y;
  var a = 0.0; var col = vec3f(0.0);
  if (uv.z < 0.5) {
    // A drop: a bright bead where the light catches it (the beam behind it most of all).
    a = (1.0 - smoothstep(0.3, 1.0, r2)) * 0.9;
    col = (vec3f(0.45, 0.85, 0.8) * beam * 1.6 + fillC * 1.2) / max(ex, 1e-6) + spellLit(wp, normalize(uniforms.cameraPosition - wp), vec3f(0.9), 0.2, ex) * 1.5;
  } else {
    a = (1.0 - smoothstep(0.0, 1.0, r2)) * 0.22;
    col = (vec3f(0.45, 0.85, 0.8) * beam * 0.9 + fillC * 1.4) * vec3f(0.85, 0.92, 0.9) / max(ex, 1e-6) + spellLit(wp, vec3f(0.0, 1.0, 0.0), vec3f(0.8), 0.6, ex);
  }
  a *= fragmentInputs.vFade;
  if (a < 0.004) { discard; }
  fragmentOutputs.color = vec4f(displayTransform(col, ex) * a, a);
}
`;
