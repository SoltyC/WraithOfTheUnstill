// Weather volumes (BRIEF §5.2, §5.3, §5.6), quarter resolution, composited before TAA:
//
// 1. Clouds: a raymarched cloud layer (base/top from the weather), density from a tiled
//    noise texture shaped by coverage and a height profile, lit by a short march toward the sun
//    (Beer–powder, two-lobe phase) and by the sky. Computed for the view ray of every texel, so the
//    upsample is smooth; the compose pass applies it to sky pixels only. It is a volume, not a
//    texture on a dome: parallax, self-shadow, silver lining toward the sun.
// 2. Light shafts: the weather fog's sun in-scattering is marched through the shadow cascades
//    over the first ~300 m, giving shafts where ridges, rocks, the Wraith or the Warden block the
//    sun in falling snow and haze. Stored as a ratio (shadowed / unshadowed in-scatter) that the
//    compose pass applies to its full-resolution analytic fog, so silhouettes never halo.
//
// Out: cloudTex = (in-scattered rgb, transmittance); shaftTex.r = sun in-scatter ratio.

import { POST_PARAMS_WGSL } from './common.wgsl.js';
import { CASCADES } from '../shadows.wgsl.js';

/** Weather fog shared by this pass and compose: exponential height fog (closed form). */
export const WEATHER_FOG_WGSL = /* wgsl */ `
// Optical depth of the weather fog from camera c along unit dir over distance t.
// fog = (density /m at base height, 1/scale height, base height, −).
fn fogOpticalDepth(c: vec3f, dir: vec3f, t: f32, fog: vec4f) -> f32 {
  let k = fog.y * dir.y * t;
  let base = fog.x * exp(-fog.y * (c.y - fog.z));
  return select(base * t * (1.0 - exp(-k)) / k, base * t, abs(k) < 1e-4);
}
fn fogDensityAt(p: vec3f, fog: vec4f) -> f32 { return fog.x * exp(-fog.y * (p.y - fog.z)); }
// Henyey–Greenstein phase.
fn hgPhase(cosT: f32, g: f32) -> f32 {
  let g2 = g * g;
  return (1.0 - g2) / (12.566371 * pow(max(1.0 + g2 - 2.0 * g * cosT, 1e-4), 1.5));
}
`;

export const fogCS = /* wgsl */ `
${POST_PARAMS_WGSL}
struct ShadowData {
  viewProj: array<mat4x4f, ${CASCADES}>,
  splits: vec4f,
  origins: array<vec4f, ${CASCADES}>,
  light: vec4f,
};
@group(0) @binding(0) var<storage, read> P: PostParams;
@group(0) @binding(1) var depthTex: texture_depth_2d;
@group(0) @binding(2) var<storage, read> atmoLight: array<vec4f, 13>;
@group(0) @binding(3) var<storage, read> shadowData: ShadowData;
@group(0) @binding(4) var shadowMap0: texture_2d<f32>;
@group(0) @binding(5) var shadowMap1: texture_2d<f32>;
@group(0) @binding(6) var shadowMap2: texture_2d<f32>;
@group(0) @binding(7) var noiseSampler: sampler;
@group(0) @binding(8) var noiseTex: texture_2d<f32>;
@group(0) @binding(9) var noiseLoSampler: sampler;
@group(0) @binding(10) var noiseLo: texture_2d<f32>;
@group(0) @binding(11) var cloudOut: texture_storage_2d<rgba16float, write>;
@group(0) @binding(12) var shaftOut: texture_storage_2d<rgba16float, write>;
${WEATHER_FOG_WGSL}

fn shadowLoad(c: u32, p: vec2i) -> f32 {
  let q = clamp(p, vec2i(0), vec2i(2047));
  switch c {
    case 0u: { return textureLoad(shadowMap0, q, 0).r; }
    case 1u: { return textureLoad(shadowMap1, q, 0).r; }
    default: { return textureLoad(shadowMap2, q, 0).r; }
  }
}
// Point visibility in the first three cascades (one tap: TAA and the march integrate it).
fn sunVis(wp: vec3f, dist: f32) -> f32 {
  let sp = shadowData.splits;
  var c = 0u;
  if (dist > sp.x) { c = 1u; }
  if (dist > sp.y) { c = 2u; }
  if (dist > sp.z) { return 1.0; }
  let L = shadowData.light.xyz;
  let clip = shadowData.viewProj[c] * vec4f(wp, 1.0);
  let uv = vec2f(clip.x * 0.5 + 0.5, 0.5 + clip.y * 0.5);
  if (any(uv <= vec2f(0.0)) || any(uv >= vec2f(1.0))) { return 1.0; }
  let d = dot(wp - shadowData.origins[c].xyz, -L) - shadowData.origins[c].w * 1.5;
  return select(0.0, 1.0, d <= shadowLoad(c, vec2i(uv * 2048.0)));
}

// Cloud layer: base, top (m); coverage from the weather.
fn cloudLayer() -> vec2f {
  let cover = P.fog2.y;
  let base = mix(2700.0, 1750.0, smoothstep(0.5, 1.0, cover) * (0.4 + 0.6 * P.fog2.x));
  return vec2f(base, base + mix(900.0, 1500.0, cover));
}
// Noise with a crude level of detail: the 512² field (27 m texels over 14 km) aliases into radial
// streaks where long, grazing marches sample it every few hundred metres, so far samples blend to
// a 4×-box-filtered copy (noiseLo) and drop the fine octaves.
fn cloudNoise(uv: vec2f, lod: f32) -> vec4f {
  let hi = textureSampleLevel(noiseTex, noiseSampler, uv, 0.0);
  if (lod < 0.05) { return hi; }
  let lo = textureSampleLevel(noiseLo, noiseLoSampler, uv, 0.0);
  return mix(hi, lo, clamp(lod, 0.0, 1.0));
}
fn cloudDensity(p: vec3f, lay: vec2f, lod: f32) -> f32 {
  let h = (p.y - lay.x) / (lay.y - lay.x);
  if (h <= 0.0 || h >= 1.0) { return 0.0; }
  // fog2.zw: the cloud field's offset (m), integrated from the wind on the CPU.
  let uv = (p.xz + P.fog2.zw) / 14000.0;
  let n = cloudNoise(uv, lod);
  let fine = 1.0 - clamp(lod, 0.0, 1.0); // fine octaves fade out with distance
  // A second octave sheared with height, so the shape changes going up (a 2D field alone made
  // every column uniform in height: the clouds read as vertical streaks from below).
  let n2 = cloudNoise(uv * 2.3 + vec2f(h * 0.21, h * 0.13), lod + 0.5).r;
  let cover = P.fog2.y;
  var c = n.r * 0.6 + n2 * 0.25 + n.g * 0.15;
  // Coverage: remap so cover 0 → nothing, 1 → a closed deck ("clear" at 0.3 keeps scattered cumulus).
  c = clamp((c - (1.0 - cover) * 0.5) / max(1.0 - (1.0 - cover) * 0.5, 0.05), 0.0, 1.0);
  // Each column's top follows its coverage: thin edges stay low, cores tower — flat bases,
  // rounded (dome) tops, the way cumulus build. A closing deck fills the whole layer.
  let top = mix(0.12, 1.0, max(c, smoothstep(0.75, 1.0, cover)));
  let hn = h / top;
  if (hn >= 1.0) { return 0.0; }
  var d = c * sqrt(1.0 - hn * hn) * smoothstep(0.0, 0.06, h);
  // Erode the edges with the detail noise, sheared with height (billows, not extrusions).
  if (fine > 0.0) {
    let detail = textureSampleLevel(noiseTex, noiseSampler, uv * 6.1 + vec2f(h * 0.37, -h * 0.29), 0.0).g;
    d = clamp(d - (1.0 - d) * detail * 0.6 * fine, 0.0, 1.0);
  }
  return d * mix(0.006, 0.012, cover);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let fsz = vec2i(P.size.xy);
  let qsz = (fsz + 3) / 4;
  let q = vec2i(gid.xy);
  if (q.x >= qsz.x || q.y >= qsz.y) { return; }
  // Nearest depth in the 4×4 block (shafts never reach past a foreground object).
  var dMax = 0.0;
  for (var j = 0; j < 4; j += 1) { for (var i = 0; i < 4; i += 1) {
    dMax = max(dMax, textureLoad(depthTex, min(q * 4 + vec2i(i, j), fsz - 1), 0));
  } }
  let pc = q * 4 + 2;
  let ndc = texelNdc(pc, P.size);
  let farH = P.invVP * vec4f(ndc, 1e-7, 1.0);
  let cam = P.cam.xyz;
  let dir = normalize(farH.xyz / farH.w - cam);
  let L = P.sun.xyz;
  let keyC = atmoLight[0].xyz;
  let skyUp = atmoLight[1].xyz;
  let cosT = dot(dir, L);
  let ign = fract(52.9829189 * fract(dot(vec2f(q) + f32(i32(P.jitter.z) % 8) * 5.588238, vec2f(0.06711056, 0.00583715))));

  // --- Clouds ---------------------------------------------------------------------------------
  // A 64-frame golden-ratio jitter of the march start (TAA integrates it).
  let cj = fract(ign + f32(i32(P.jitter.z) % 64) * 0.618034);
  var cl = vec4f(0.0, 0.0, 0.0, 1.0);
  let lay = cloudLayer();
  if (P.fog2.y > 0.02) {
    var t0 = 0.0; var t1 = 0.0;
    if (cam.y < lay.x) {
      if (dir.y > 0.003) { t0 = (lay.x - cam.y) / dir.y; t1 = (lay.y - cam.y) / dir.y; }
    } else if (cam.y < lay.y) {
      t0 = 0.0; t1 = select((lay.x - cam.y) / dir.y, (lay.y - cam.y) / dir.y, dir.y > 0.0);
    } else if (dir.y < -0.003) { t0 = (lay.y - cam.y) / dir.y; t1 = (lay.x - cam.y) / dir.y; }
    // Long grazing paths through the layer are capped (the far deck fades into the air anyway).
    t1 = min(min(t1, 60000.0), t0 + 14000.0);
    if (t1 > t0) {
      // Steps start fine at the layer's entry (what you see of a deck from below is its first few
      // hundred metres) and grow ×1.12; equal 440 m steps banded into ladders across the deck.
      let N = 32;
      var dt = 60.0 * max((t1 - t0) / 18000.0, 0.25);
      var t = t0 + dt * cj;
      var T = 1.0; var S = vec3f(0.0);
      // Silver lining + back-scatter; sun light reaching the cloud is the undimmed sun (the
      // deck itself is what dims the ground's key light).
      let phase = mix(hgPhase(cosT, 0.62), hgPhase(cosT, -0.18), 0.3) * 4.0 * 3.14159;
      let cc = clamp((P.fog2.y - 0.35) / 0.65, 0.0, 1.0);
      let sunC = keyC / (0.015 + 0.985 * (1.0 - cc) * (1.0 - cc) * (1.0 - cc));
      for (var i = 0; i < N; i++) {
        if (t > t1) { break; }
        let p = cam + dir * t;
        // Detail fades as the step (and the distance) grows past the noise's texel size.
        let lod = clamp(max(dt / 250.0, t / 9000.0) - 0.5, 0.0, 1.0);
        let dens = cloudDensity(p, lay, lod);
        if (dens > 1e-5) {
          // Light march toward the sun (4 taps, growing steps).
          var od = 0.0;
          for (var k = 1; k <= 4; k++) {
            let s = f32(k * k) * 60.0;
            od += cloudDensity(p + L * s, lay, lod + 1.0) * s * 0.5;
          }
          let hFrac = clamp((p.y - lay.x) / (lay.y - lay.x), 0.0, 1.0);
          let beer = exp(-od * 1.4) * mix(1.0, 1.0 - exp(-dens * 160.0), 0.5); // powder
          let amb = skyUp * mix(0.55, 1.15, hFrac) * 3.14159 * 0.35;
          let lum = sunC * beer * phase * 0.32 + amb;
          let ext = dens;
          let tr = exp(-ext * dt);
          S += T * lum * (1.0 - tr);
          T *= tr;
          if (T < 0.01) { break; }
        }
        t += dt; dt *= 1.12;
      }
      // Distant clouds fade into the atmosphere (they are seen through kilometres of air).
      let fade = exp(-t0 / 26000.0);
      cl = vec4f(S * fade, mix(1.0, T, fade));
    }
  }
  textureStore(cloudOut, q, cl);

  // --- Light shafts: shadowed share of the weather fog's sun in-scattering --------------------
  var ratio = 1.0;
  if (P.fog.w > 0.5 && shadowData.light.w > 0.0) {
    var dist = 1e5;
    if (dMax > 0.0) { dist = length(worldPos(texelNdc(pc, P.size), dMax, P.invVP) - cam); }
    let fogp = vec4f(P.fog.x, P.fog.y, P.fog.z, 0.0);
    let total = 1.0 - exp(-fogOpticalDepth(cam, dir, min(dist, 3000.0), fogp));
    let tMax = min(dist, 300.0);
    let N = 16;
    let dt = tMax / f32(N);
    var lit = 0.0; var wsum = 0.0; var od = 0.0;
    for (var i = 0; i < N; i++) {
      let t = (f32(i) + ign) * dt;
      let p = cam + dir * t;
      let dens = fogDensityAt(p, fogp);
      let w = dens * exp(-od) * dt;
      od += dens * dt;
      lit += w * sunVis(p, t);
      wsum += w;
    }
    // Near segment marched; the rest (unshadowed) completes the total.
    let rest = max(total - wsum, 0.0);
    ratio = (lit + rest) / max(wsum + rest, 1e-6);
  }
  textureStore(shaftOut, q, vec4f(ratio, 0.0, 0.0, 1.0));
}
`;

/** Tileable cloud noise (built once at load): r = Perlin–Worley base, g = Worley detail. */
export const cloudNoiseCS = /* wgsl */ `
@group(0) @binding(0) var outTex: texture_storage_2d<rgba16float, write>;
const SZ: f32 = 512.0;
fn h2(p: vec2f) -> vec2f {
  let q = vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)));
  return fract(sin(q) * 43758.5453);
}
// Tileable Worley (period in cells).
fn worley(uv: vec2f, period: f32) -> f32 {
  let p = uv * period;
  let i = floor(p); let f = p - i;
  var md = 1.0;
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let o = vec2f(f32(x), f32(y));
    let c = (i + o) - floor((i + o) / period) * period;
    let d = length(o + h2(c) - f);
    md = min(md, d);
  } }
  return md;
}
// Tileable value-gradient noise.
fn vnoise(uv: vec2f, period: f32) -> f32 {
  let p = uv * period;
  let i = floor(p); let f = p - i;
  let u = f * f * (3.0 - 2.0 * f);
  let w = period;
  let a = h2(i - floor(i / w) * w).x; let b = h2((i + vec2f(1.0, 0.0)) - floor((i + vec2f(1.0, 0.0)) / w) * w).x;
  let c = h2((i + vec2f(0.0, 1.0)) - floor((i + vec2f(0.0, 1.0)) / w) * w).x; let d = h2((i + 1.0) - floor((i + 1.0) / w) * w).x;
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= 512u || gid.y >= 512u) { return; }
  let uv = (vec2f(gid.xy) + 0.5) / SZ;
  var pn = 0.0; var amp = 0.5; var per = 4.0;
  for (var o = 0; o < 5; o++) { pn += vnoise(uv, per) * amp; amp *= 0.5; per *= 2.0; }
  let w1 = 1.0 - worley(uv, 6.0); let w2 = 1.0 - worley(uv, 14.0); let w3 = 1.0 - worley(uv, 30.0);
  let wf = w1 * 0.625 + w2 * 0.25 + w3 * 0.125;
  // Perlin–Worley: billowy cells with soft fbm edges.
  let base = clamp((pn - (1.0 - wf) * 0.55) / 0.6, 0.0, 1.0);
  let detail = (1.0 - worley(uv, 24.0)) * 0.6 + (1.0 - worley(uv, 48.0)) * 0.4;
  textureStore(outTex, gid.xy, vec4f(base, detail, pn, 1.0));
}
`;

/** 4×4 box downsample of the cloud noise (512² → 128²): the far-field level of cloudNoise(). */
export const cloudNoiseLoCS = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var outTex: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= 128u || gid.y >= 128u) { return; }
  var acc = vec4f(0.0);
  for (var j = 0u; j < 4u; j++) { for (var i = 0u; i < 4u; i++) {
    acc += textureLoad(src, vec2u(gid.x * 4u + i, gid.y * 4u + j), 0);
  } }
  textureStore(outTex, gid.xy, acc / 16.0);
}
`;
