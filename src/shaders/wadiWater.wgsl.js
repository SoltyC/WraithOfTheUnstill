// The wadis' evening water (render/wadiWater.js): a ribbon down each braid, laid on the clipmap's
// rendered ground in the vertex shader; in the fragment, broken sheets of thin water threading
// round sand bars in the ribbon's middle (the sky in them, the sun's glint, flowing ripples) and a
// band of wet sand either side. Premultiplied alpha: the water adds its reflection and darkens the
// bed under it; the wet band only darkens.
import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';
import { FIELD_WGSL } from './grass.wgsl.js';

export const wadiVertexWGSL = /* wgsl */ `
attribute position: vec3f;   // x, the braid's seed, z
attribute wadi: vec4f;       // across −1..1, metres along, half-width (m), end fade
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform levels: array<vec4f,16>;
uniform wadiParams: vec4f;   // x = time, y = flow 0..1, z = the flowers' bloom 0..1
var<storage, read> levelData: array<vec4f>;
var<storage, read> biomeA: array<u32>;
var<storage, read> windMap: array<u32>;
varying vWorldPos: vec3f;
varying vWadi: vec4f;
varying vSeed: f32;
${FIELD_WGSL}
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let p = vertexInputs.position;
  var wp = vec3f(p.x, gGround(p.x, p.z), p.z);
  // Lifted toward the camera with distance, so the coarse clipmap levels never poke through.
  let toCam = uniforms.cameraPosition - wp; let d = length(toCam);
  wp += toCam / max(d, 1e-3) * min(0.03 + d * 0.0015, 2.5);
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (uniforms.wadiParams.y < 0.002 || d > 2500.0) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vWadi = vertexInputs.wadi;
  vertexOutputs.vSeed = p.y;
}
`;

export const wadiFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform wadiParams: vec4f;
varying vWorldPos: vec3f;
varying vWadi: vec4f;
varying vSeed: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos; let w = fragmentInputs.vWadi; let seed = fragmentInputs.vSeed;
  let cam = uniforms.cameraPosition; let V = normalize(cam - wp); let L = uniforms.keyDir;
  let t = uniforms.wadiParams.x; let flow = uniforms.wadiParams.y;
  let a = w.y; let hw = w.z;
  // Across the bed in metres from the ribbon's middle, the thread meandering within it.
  let x = w.x * hw + 0.3 * hw * noised(vec2f(a * 0.013, seed * 3.1)).x;
  let ax = abs(x) / hw;
  // The water: wider as the flow comes up, broken along its length, parted round sand bars.
  let core = (0.2 + 0.35 * flow) * (0.8 + 0.4 * noised(vec2f(a * 0.03, seed * 1.7)).x);
  let gaps = smoothstep(-0.45, 0.0, noised(vec2f(a * 0.011, seed * 7.3)).x + 0.4 * flow);
  let bars = smoothstep(0.25, 0.45, noised(vec2f(x * 0.22, a * 0.045 + seed)).x * 0.5 + 0.5 + 0.2 * flow);
  let water = (1.0 - smoothstep(core * 0.75, core, ax)) * gaps * mix(1.0, bars, 0.85) * w.w;
  // The wet band: the sand darkened either side of the water, a little wider where it is wider.
  let wetR = core + 0.18 + 0.12 * noised(vec2f(a * 0.05, seed * 2.3)).x;
  let wet = (1.0 - smoothstep(wetR * 0.6, wetR, ax)) * smoothstep(-0.7, -0.2, noised(vec2f(a * 0.011, seed * 7.3)).x + 0.4 * flow) * w.w * min(1.0, flow * 1.5);
  if (water + wet < 0.004) { discard; }
  // Ripples running downstream (a fine and a broad set), as a perturbed normal.
  let r1 = noised(vec2f(x * 1.6, a * 0.9 - t * 1.4));
  let r2 = noised(vec2f(x * 0.5 + 3.0, a * 0.25 - t * 0.6));
  let N = normalize(vec3f(r1.y * 0.05 + r2.y * 0.06, 1.0, r1.z * 0.05 + r2.z * 0.06));
  let NV = max(dot(N, V), 0.0);
  let F = 0.02 + 0.98 * pow(1.0 - NV, 5.0);
  let vis = shadowVisibilityFast(wp, cam);
  let key = atmoKeyColor();
  let H = normalize(L + V);
  // What it shows: the sky reflected, the sun's glint; the bed under thin water darkened (alpha).
  let R = reflect(-V, N);
  var col = atmoSky(normalize(vec3f(R.x, max(R.y, 0.02), R.z))) * F;
  col += key * vis * pow(max(dot(N, H), 0.0), 500.0) * 2.5 * step(0.0, L.y);
  let lit = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(cam - wp) * 0.001);
  let outc = displayTransform(lit, uniforms.fogParams.z * atmoExposure());
  let aw = water * (F + (1.0 - F) * 0.3);
  let a2 = aw + (1.0 - aw) * wet * 0.2;
  fragmentOutputs.color = vec4f(outc * water, a2);
}
`;

// The flowers along the banks (render/wadiWater.js wadiFlowers): cards turned to the camera round
// the vertical, nodding in the air; drawn in the fragment — a stem, two leaves and a five-petalled
// head in the kind's colour — cut out (no blending), lit flat (small, many-faced things).
export const wadiFlowerVertexWGSL = /* wgsl */ `
attribute position: vec3f;   // the card's root (x, 0, z)
attribute flower: vec4f;     // corner x −1..1, corner y 0..1, size (m), kind + seed fraction
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform levels: array<vec4f,16>;
uniform wadiParams: vec4f;
var<storage, read> levelData: array<vec4f>;
var<storage, read> biomeA: array<u32>;
var<storage, read> windMap: array<u32>;
varying vWorldPos: vec3f;
varying vFlower: vec4f;
${FIELD_WGSL}
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let f = vertexInputs.flower; let p = vertexInputs.position;
  let root = vec3f(p.x, gGround(p.x, p.z) - 0.03, p.z);
  let toCam = uniforms.cameraPosition - root; let d = length(toCam.xz);
  let right = normalize(vec3f(-toCam.z, 0.0, toCam.x) + vec3f(1e-5, 0.0, 0.0));
  // Grown with the bloom (and shrunk away past 120–150 m: no popping cards).
  let size = f.z * uniforms.wadiParams.z * (1.0 - smoothstep(120.0, 150.0, d));
  let sway = sin(uniforms.wadiParams.x * 1.7 + fract(f.w) * 40.0) * 0.06 * f.y * f.y;
  let wp = root + right * (f.x * 0.5 * size + sway * size) + vec3f(0.0, f.y * size, 0.0);
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (size < 0.01) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vFlower = f;
}
`;

export const wadiFlowerFragmentWGSL = /* wgsl */ `
${ENV_DECL}
varying vWorldPos: vec3f;
varying vFlower: vec4f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let f = fragmentInputs.vFlower; let wp = fragmentInputs.vWorldPos;
  let kind = floor(f.w); let seed = fract(f.w);
  let q = vec2f(f.x * 0.5, f.y);                       // card space: x −0.5..0.5 (one size), y 0..1
  // A small plant: two or three flower heads on thin stems at different heights, the petals (5 to
  // 7, irregular) shaded darker toward the eye, narrow blade leaves at the foot.
  var hit = 0.0; var albedo = vec3f(0.0);
  let pc = array<vec3f, 4>(vec3f(0.9, 0.87, 0.8), vec3f(0.55, 0.3, 0.62), vec3f(0.92, 0.45, 0.17), vec3f(0.93, 0.78, 0.2));
  let pcol = pc[u32(clamp(kind, 0.0, 3.0))] * (0.9 + 0.2 * seed);
  let heads = 2 + i32(seed * 1.99);
  for (var k = 0; k < heads; k++) {
    let hs = fract(seed * (7.13 + f32(k) * 3.7));
    let hc = vec2f((hs - 0.5) * 0.5, 0.55 + 0.35 * fract(hs * 5.3));
    let hr = 0.1 + 0.05 * fract(hs * 9.1);
    let hv = (q - hc) / hr; let r = length(hv);
    let np = 5.0 + floor(fract(hs * 3.3) * 2.99);
    let th = atan2(hv.y, hv.x) + hs * 6.283;
    let edge = 0.55 + 0.45 * pow(abs(cos(th * np * 0.5)), 0.7) * (0.85 + 0.15 * sin(th * 7.0 + hs * 20.0));
    if (r < edge && hit < 0.5) { hit = 1.0; albedo = pcol * mix(0.65, 1.05, smoothstep(0.15, 0.8, r)); if (r < 0.26) { albedo = vec3f(0.6, 0.42, 0.1); } }
    // Its stem, bending a little.
    let sx = hc.x * (q.y / hc.y) + 0.015 * sin(q.y * 9.0 + hs * 6.0);
    if (hit < 0.5 && abs(q.x - sx) < 0.012 && q.y < hc.y) { hit = 1.0; albedo = vec3f(0.24, 0.32, 0.14); }
  }
  // Blade leaves from the root.
  for (var k = 0; k < 3; k++) {
    let a = (f32(k) - 1.0) * 0.5 + (seed - 0.5) * 0.3;
    let dirv = vec2f(sin(a), cos(a)); let along = dot(q - vec2f(0.0, 0.0), dirv); let across = abs(dot(q, vec2f(dirv.y, -dirv.x)));
    if (hit < 0.5 && along > 0.0 && along < 0.32 && across < 0.03 * (1.0 - along / 0.32)) { hit = 1.0; albedo = vec3f(0.2, 0.28, 0.12) * (0.8 + 0.4 * along / 0.32); }
  }
  if (hit < 0.5) { discard; }
  let cam = uniforms.cameraPosition; let L = uniforms.keyDir;
  let vis = shadowVisibilityFast(wp, cam);
  let key = atmoKeyColor();
  let col = albedo * (key * vis * (0.45 + 0.4 * max(L.y, 0.0)) / PI + shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w);
  let lit = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(cam - wp) * 0.001);
  fragmentOutputs.color = vec4f(displayTransform(lit, uniforms.fogParams.z * atmoExposure()), 0.0);
}
`;
