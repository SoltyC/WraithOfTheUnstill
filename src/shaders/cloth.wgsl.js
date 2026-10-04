// The Wraith's cloth (BRIEF §8.1 "Cloth shading: sheen or fuzz, an anisotropic woven response,
// and subsurface scattering in thin regions. Not a plain PBR dielectric"), its shell fur (hood
// rim and cuffs: alpha-tested strands over 24 shells), and the cold light deep in the cowl.
//
// Vertices come from the CPU cloth: a storage buffer of (pos.xyz, garment id + 0.98·occlusion),
// (normal.xyz, thinness) per particle, normals pointing out of the figure; the mesh's position
// attribute carries (particle id [+ 4096·shell for fur], u, v). Two-sided: inner faces read
// darker and the inside of the hood is near black, lit only by the cowl light.

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';

export const FUR_SHELLS = 24;

// Shared: garment uv → metres (u across, v down), and small hashes/noise.
const CLOTH_COMMON = /* wgsl */ `
fn garmentScale(g: i32) -> vec2f {
  switch g {
    case 0: { return vec2f(2.0, 1.36); }   // robe
    case 1: { return vec2f(1.9, 0.5); }    // mantle
    case 2, 3: { return vec2f(0.6, 0.66); } // sleeves
    case 4: { return vec2f(0.9, 0.75); }   // cowl
    case 5, 6: { return vec2f(0.22, 0.17); } // hands
    case 7, 8: { return vec2f(0.28, 0.24); } // feet
    case 9: { return vec2f(1.3, 0.075); }  // cord
    default: { return vec2f(0.06, 0.42); } // sash
  }
}
fn h21(p: vec2f) -> f32 { return hash12(p); }
fn vn1(x: f32) -> f32 { let i = floor(x); let f = x - i; let u = f * f * (3.0 - 2.0 * f); return mix(h21(vec2f(i, 7.1)), h21(vec2f(i + 1.0, 7.1)), u); }
fn vn2(p: vec2f) -> f32 { return noised(p).x * 0.5 + 0.5; }
`;

export const clothVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = particle id, yz = garment uv
uniform viewProjection: mat4x4f;
var<storage, read> clothVerts: array<vec4f>;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vUv: vec2f;
varying vGarment: f32;
varying vThin: f32;
varying vOcc: f32;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let i = u32(vertexInputs.position.x + 0.5);
  let a = clothVerts[i * 2u];
  let b = clothVerts[i * 2u + 1u];
  vertexOutputs.position = uniforms.viewProjection * vec4f(a.xyz, 1.0);
  vertexOutputs.vWorldPos = a.xyz;
  vertexOutputs.vNormal = b.xyz;
  vertexOutputs.vUv = vertexInputs.position.yz;
  let g = floor(a.w + 0.001);
  vertexOutputs.vGarment = g;
  vertexOutputs.vOcc = clamp((a.w - g) / 0.98, 0.0, 1.0);
  vertexOutputs.vThin = b.w;
}
`;

export const clothFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform clothParams: vec4f;          // x = cowl light (health), y = time, z = snow on the hem, w = hand light
uniform clothHead: vec4f;            // xyz = the cowl light's position, w = breath 0..1
uniform clothHandL: vec4f;           // xyz = left fingertips, w = glow
uniform clothHandR: vec4f;           // xyz = right fingertips, w = glow
uniform clothFrost: vec4f;           // x = frost creeping up from the hems as health falls (0..1)
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vUv: vec2f;
varying vGarment: f32;
varying vThin: f32;
varying vOcc: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
${CLOTH_COMMON}

// Charlie sheen distribution (Estevez & Kulla): soft fuzz highlight at grazing angles.
fn charlieD(nh: f32, rough: f32) -> f32 {
  let inv = 1.0 / rough;
  let s2 = max(1.0 - nh * nh, 1e-4);
  return (2.0 + inv) * pow(s2, inv * 0.5) / (2.0 * PI);
}

// The cold light deep in the cowl and at the fingertips (display-referred: the same on screen by
// day or night), with a soft inverse-square falloff.
fn coldLight(wp: vec3f, at: vec4f, r0: f32) -> f32 {
  let d = length(wp - at.xyz);
  return at.w / (1.0 + (d * d) / (r0 * r0));
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let V = normalize(camPos - wp);
  var N = normalize(fragmentInputs.vNormal);
  let inside = dot(N, V) < 0.0;
  if (inside) { N = -N; }
  let g = i32(fragmentInputs.vGarment + 0.5);
  let uv = fragmentInputs.vUv;
  let sc = garmentScale(g);
  let m = uv * sc;                                   // metres on the garment
  let occ = fragmentInputs.vOcc;

  // Torn edges: the robe's hem, the mantle's hem and the sleeves' cuffs are ragged (alpha-tested).
  let edgeM = (1.0 - uv.y) * sc.y;
  if (g <= 4) {
    let depth = select(select(select(0.035, 0.05, g == 1), 0.025, g >= 2), 0.03, g == 4);
    let t = vn1(m.x * 26.0) * 0.65 + vn1(m.x * 95.0 + 3.0) * 0.35;
    if (edgeM < depth * t * t * t * 1.8 - 0.004) { discard; }
  }

  // Base colours: a deep charcoal under-robe and sleeves; a near-black heavy wool mantle and cowl;
  // grey, worn linen wrappings; a dark hemp cord; an oxblood sash.
  var albedo = vec3f(0.088, 0.088, 0.096);
  var sheenTint = vec3f(0.22, 0.22, 0.235);
  var weaveAmp = 1.0;
  if (g == 1 || g == 4) { albedo = vec3f(0.062, 0.059, 0.06); sheenTint = vec3f(0.24, 0.23, 0.225); }
  else if (g >= 5 && g <= 8) { albedo = vec3f(0.2, 0.188, 0.165); sheenTint = vec3f(0.06); weaveAmp = 0.5; }
  else if (g == 9) { albedo = vec3f(0.085, 0.07, 0.05); sheenTint = vec3f(0.05); weaveAmp = 0.0; }
  else if (g == 10) { albedo = vec3f(0.11, 0.045, 0.038); sheenTint = vec3f(0.2, 0.12, 0.1); }

  // Large-scale wear and fading (tens of cm), and slubs in the yarn (cm).
  let wear = vn2(m * vec2f(3.1, 2.3) + vec2f(f32(g) * 7.3, 0.0));
  albedo *= 0.82 + 0.36 * wear;
  let slub = vn2(m * vec2f(35.0, 9.0));
  albedo *= 0.9 + 0.2 * slub;

  // Weave: a fine twill (diagonal ridges at ~4 mm) as a micro-normal and thread shading, faded
  // out as it approaches the pixel size (no moiré at a distance).
  let tw = (m.x + m.y) * 240.0;
  let fw = max(fwidth(tw), 1e-4);
  let wf = weaveAmp * (1.0 - smoothstep(0.25, 0.7, fw));
  let ridge = sin(tw * 6.2831853);
  let cross2 = sin(m.y * 520.0 * 6.2831853 + ridge * 0.6);
  albedo *= 1.0 + 0.08 * wf * ridge * cross2;

  // Wrapped hands and feet: overlapping bandage turns (a spiral), grooves between them darker.
  if (g >= 5 && g <= 8) {
    let s = fract(uv.y * 6.0 + uv.x * 1.0);
    let groove = smoothstep(0.0, 0.14, s) * smoothstep(1.0, 0.82, s);
    albedo *= 0.55 + 0.45 * groove;
    // Grime toward the soles and fingertips.
    albedo *= mix(1.0, 0.6, smoothstep(0.5, 1.0, uv.y) * select(0.6, 1.0, g >= 7));
  }
  // The cord: a twisted rope.
  if (g == 9) {
    let twist = sin((uv.x * 260.0 + uv.y * 2.0) * 6.2831853);
    albedo *= 0.65 + 0.35 * (0.5 + 0.5 * twist);
  }

  // Hem: darker where wet, dusted with snow along the very edge, patchy.
  if (g == 0 || g == 10) {
    let wet = 1.0 - smoothstep(0.0, 0.22, edgeM);
    albedo *= 1.0 - 0.3 * wet;
    let dust = (1.0 - smoothstep(0.0, 0.09, edgeM)) * smoothstep(0.35, 0.75, vn2(m * vec2f(14.0, 30.0)));
    albedo = mix(albedo, vec3f(0.42, 0.44, 0.47), dust * 0.45 * uniforms.clothParams.z);
  }

  // Wounds: frost creeps up the robe from the hem (and in from cuffs and the mantle's edge) as
  // health falls (BRIEF §8.1, §12) — a pale crystalline crust, with a ragged, glinting front.
  let creep = uniforms.clothFrost.x;
  var frostAmt = 0.0;
  if (creep > 0.001 && g <= 3) {
    // Robe: up to about the thigh at worst; the mantle only at its edge; the cuffs.
    let reach = select(select(0.45, 0.25, g == 1), 0.3, g >= 2) * creep;
    let front = 1.0 - reach + 0.1 * (vn2(m * vec2f(6.0, 2.0)) - 0.5);
    frostAmt = smoothstep(front, front + 0.1, uv.y);
    let crystal = vn2(m * 90.0);
    albedo = mix(albedo, vec3f(0.7, 0.8, 0.92) * (0.8 + 0.4 * crystal), frostAmt * 0.9);
  }
  // Inner faces: darker  // Inner faces: darker (enclosed, the light that reaches them has crossed the cloth).
  var ambientK = 1.0;
  if (inside) {
    if (g == 4) { albedo = vec3f(0.006, 0.006, 0.008); ambientK = 0.04; }
    else { albedo *= 0.55; ambientK = 0.4; }
  }

  // Micro-normal from the weave (on the faced side only).
  let Tv = normalize(dpdy(wp) * dpdx(uv.x) - dpdx(wp) * dpdy(uv.x) + vec3f(1e-6)); // along the threads (v)
  let Tu = normalize(cross(N, Tv));
  N = normalize(N + (Tu * ridge * 0.07 + Tv * cross2 * 0.05) * wf);

  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  let nl = dot(N, L);
  let nv = max(dot(N, V), 1e-3);
  let vis = shadowVisibility(wp, N, camPos, fragmentInputs.position.xy);
  let ao = mix(0.25, 1.0, occ);
  // Diffuse: wrapped (fabric scatters past the terminator).
  let diff = clamp((nl + 0.35) / 1.35, 0.0, 1.0);
  let sky = shIrradiance(N) * uniforms.envMisc.w;
  var col = albedo * (key * diff * vis * mix(0.55, 1.0, occ) / PI + sky * ao * ambientK);
  // Sheen: fuzz at grazing view (Charlie), the fabric's defining highlight.
  let H = normalize(L + V);
  let sheen = charlieD(max(dot(N, H), 0.0), 0.5) / (4.0 * (max(nl, 0.0) + nv - max(nl, 0.0) * nv) + 1e-3);
  col += key * sheenTint * sheen * clamp(nl, 0.0, 1.0) * vis * mix(0.4, 1.0, occ) * 0.6;
  col += sky * sheenTint * 2.2 * pow(1.0 - nv, 3.0) * ao * ambientK;
  // Anisotropic woven highlight along the threads (Kajiya-Kay).
  let th = dot(Tv, H);
  col += key * sheenTint * 0.25 * pow(sqrt(max(1.0 - th * th, 0.0)), 40.0) * clamp(nl, 0.0, 1.0) * vis * wf;
  // Thin regions transmit backlight (hems, the mantle's edge, cuffs, the sash).
  let back = clamp(-nl, 0.0, 1.0) * pow(clamp(dot(-V, L), 0.0, 1.0), 2.0);
  col += key * albedo * vec3f(1.6, 1.35, 1.15) * back * vis * fragmentInputs.vThin * 0.8;

  // Frost crust: glassy glints and a cold sheen of sky.
  if (frostAmt > 0.0) {
    let fc = floor(m * 140.0);
    let gl = step(0.93, hash12(fc)) * pow(max(dot(N, H), 0.0), 60.0);
    col += (key * gl * 2.0 * vis + sky * 0.25 * pow(1.0 - nv, 2.0)) * frostAmt;
  }
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(camPos - wp) * 0.001);
  let exposure = uniforms.fogParams.z * atmoExposure();
  // The cowl light: lights the inside of the hood (and faintly the rim), breathing slowly; the
  // element's light gathers at the wrapped fingertips.
  let cold = vec3f(0.55, 0.78, 1.0);
  var glow = vec3f(0.0);
  if (g == 4) {
    // Faint: it should only just pick the inner folds out of the dark, strongest close to it.
    let k = coldLight(wp, uniforms.clothHead, 0.045) * uniforms.clothParams.x;
    glow += cold * k * k * select(0.015, 0.09, inside);
  }
  if (g >= 2 && g <= 6) {
    let k = coldLight(wp, uniforms.clothHandL, 0.035) + coldLight(wp, uniforms.clothHandR, 0.035);
    glow += vec3f(0.6, 0.85, 1.0) * k * uniforms.clothParams.w * select(0.15, 0.6, g >= 5);
  }
  var outc = displayTransform(col + glow / max(exposure, 1e-6), exposure);
  fragmentOutputs.color = vec4f(outc, 0.0); // alpha: SSR weight (none)
}
`;

// ---- Shell fur: the same particles, extruded along the normal by shell; strands are cells of a
// jittered grid in garment metres, tapering and ending at a per-strand length.
export const furVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = particle id + 4096·shell, yz = garment uv
uniform viewProjection: mat4x4f;
uniform furParams: vec4f;           // x = wind x, y = wind z, z = time
var<storage, read> clothVerts: array<vec4f>;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vUv: vec2f;
varying vGarment: f32;
varying vH: f32;
varying vOcc: f32;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let id = u32(vertexInputs.position.x + 0.5);
  let i = id & 4095u;
  let shell = f32(id >> 12u);
  let a = clothVerts[i * 2u];
  let b = clothVerts[i * 2u + 1u];
  let g = floor(a.w + 0.001);
  let h = (shell + 1.0) / ${FUR_SHELLS}.0;
  let len = select(0.032, 0.022, g < 3.5);        // hood ruff longer than the cuffs
  // Strands lean down under their weight and stream a little with the wind.
  let sway = 0.25 * sin(uniforms.furParams.z * 3.1 + a.x * 9.0 + a.z * 7.0);
  let bend = vec3f(uniforms.furParams.x * (0.6 + sway), -1.0, uniforms.furParams.y * (0.6 + sway)) * len * 0.55 * h * h;
  let wp = a.xyz + b.xyz * len * h + bend;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vNormal = normalize(b.xyz * len + bend * 2.0 / max(h, 0.05));
  vertexOutputs.vUv = vertexInputs.position.yz;
  vertexOutputs.vGarment = g;
  vertexOutputs.vH = h;
  vertexOutputs.vOcc = clamp((a.w - g) / 0.98, 0.0, 1.0);
}
`;

export const furFragmentWGSL = /* wgsl */ `
${ENV_DECL}
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vUv: vec2f;
varying vGarment: f32;
varying vH: f32;
varying vOcc: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
${CLOTH_COMMON}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let g = i32(fragmentInputs.vGarment + 0.5);
  let h = fragmentInputs.vH;
  let m = fragmentInputs.vUv * garmentScale(g);
  // Strand cells (~2.6 mm), jittered; each strand has its own length and tapers to its tip.
  // Strands: a jittered grid (~3 mm) in garment metres, each strand leaning across the surface
  // as it rises (seen end-on it is a short streak, not a dot), with its own length and taper.
  // Once strands fall below a pixel the shells become a soft fuzz volume with a noisy top
  // instead (a regular grid of sub-pixel strands reads as chainmail).
  let base = m * 330.0;
  let pix = max(max(fwidth(base.x), fwidth(base.y)), 1e-4);
  let fuzz = vn2(m * 55.0) * 0.6 + vn2(m * 160.0) * 0.4;
  var sl = 0.5 + 0.5 * fuzz;
  var r1 = fuzz; var r2 = vn2(m * 90.0 + vec2f(3.0, 1.0));
  if (pix > 0.55) {
    if (h > 0.25 + 0.6 * fuzz) { discard; }
  } else {
    let c = base + vec2f(1.7, 0.9) * h;
    let cell = floor(c);
    r1 = h21(cell); r2 = h21(cell + vec2f(17.0, 3.0)); let r3 = h21(cell + vec2f(5.0, 29.0));
    let f = fract(c) - vec2f(0.5) - (vec2f(r2, r3) - 0.5) * 0.7;
    sl = 0.4 + 0.6 * r1;
    if (h > sl) { discard; }
    let rad = 0.42 * pow(1.0 - h / sl, 0.7);
    if (length(f) > rad) { discard; }
  }

  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let V = normalize(camPos - wp);
  let T = normalize(fragmentInputs.vNormal);          // along the strand
  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  // Dark roots, grey frost-tipped ends (a wolf-grey ruff), varying per strand.
  var albedo = mix(vec3f(0.04, 0.037, 0.034), vec3f(0.1, 0.096, 0.09), smoothstep(0.25, 1.0, h / sl));
  albedo *= 0.85 + 0.3 * r2;
  let selfShadow = mix(0.2, 1.0, h) * mix(0.4, 1.0, fragmentInputs.vOcc);
  let vis = shadowVisibility(wp, T, camPos, fragmentInputs.position.xy);
  let tl = dot(T, L);
  let diff = sqrt(max(1.0 - tl * tl, 0.0)) * 0.6 + 0.2;
  let Hh = normalize(L + V);
  let th = dot(T, Hh);
  let spec = pow(sqrt(max(1.0 - th * th, 0.0)), 60.0) * 0.05 + pow(sqrt(max(1.0 - th * th, 0.0)), 12.0) * albedo.x * 0.5;
  var col = albedo * key * diff * vis * selfShadow / PI + key * spec * vis * selfShadow
          + albedo * shIrradiance(T) * uniforms.envMisc.w * selfShadow;
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(camPos - wp) * 0.001);
  var outc = displayTransform(col, uniforms.fogParams.z * atmoExposure());
  fragmentOutputs.color = vec4f(outc, 0.0); // alpha: SSR weight (none)
}
`;
