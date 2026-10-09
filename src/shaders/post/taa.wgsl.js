// Temporal anti-aliasing (BRIEF §5.8, first in the chain). The scene renders with a sub-pixel
// Halton jitter; each frame blends into a history reprojected through depth and the camera's
// motion, clipped to the current neighbourhood's colour distribution (variance clipping in YCoCg)
// so moving objects and disocclusions never ghost. Blending is weighted by 1/(1 + luma) so bright
// glints resolve stably instead of flickering (BRIEF §5.1: glints must not crawl under TAA).
// Writes the next history and the frame the rest of the chain reads (two fixed targets, so the
// bindings never change; two instances alternate the history).

import { POST_PARAMS_WGSL } from './common.wgsl.js';

export const taaCS = /* wgsl */ `
${POST_PARAMS_WGSL}
@group(0) @binding(0) var<storage, read> P: PostParams;
@group(0) @binding(1) var cur: texture_2d<f32>;
@group(0) @binding(2) var depthTex: texture_depth_2d;
@group(0) @binding(3) var histSampler: sampler;
@group(0) @binding(4) var hist: texture_2d<f32>;
@group(0) @binding(5) var outHist: texture_storage_2d<rgba16float, write>;
@group(0) @binding(6) var outColor: texture_storage_2d<rgba16float, write>;

fn toYCoCg(c: vec3f) -> vec3f {
  return vec3f(0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b);
}
fn fromYCoCg(c: vec3f) -> vec3f {
  return vec3f(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z);
}
// Compress HDR for neighbourhood statistics and blending (Karis): fireflies cannot dominate.
fn tmap(c: vec3f) -> vec3f { return c / (1.0 + luma(c)); }
fn itmap(c: vec3f) -> vec3f { return c / max(1.0 - luma(c), 1e-4); }

fn loadCur(p: vec2i, sz: vec2i) -> vec3f {
  return textureLoad(cur, clamp(p, vec2i(0), sz - 1), 0).rgb;
}

// Catmull-Rom history sample from 5 bilinear taps (sharper than bilinear; less blur over time).
fn sampleHistory(uv: vec2f, size: vec4f) -> vec3f {
  let pos = uv * size.xy;
  let c = floor(pos - 0.5) + 0.5;
  let f = pos - c;
  let w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  let w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  let w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  let w3 = f * f * (-0.5 + 0.5 * f);
  let w12 = w1 + w2;
  let t0 = (c - 1.0) * size.zw;
  let t3 = (c + 2.0) * size.zw;
  let t12 = (c + w2 / w12) * size.zw;
  var r = textureSampleLevel(hist, histSampler, vec2f(t12.x, t0.y), 0.0).rgb * (w12.x * w0.y);
  r += textureSampleLevel(hist, histSampler, vec2f(t0.x, t12.y), 0.0).rgb * (w0.x * w12.y);
  r += textureSampleLevel(hist, histSampler, vec2f(t12.x, t12.y), 0.0).rgb * (w12.x * w12.y);
  r += textureSampleLevel(hist, histSampler, vec2f(t3.x, t12.y), 0.0).rgb * (w3.x * w12.y);
  r += textureSampleLevel(hist, histSampler, vec2f(t12.x, t3.y), 0.0).rgb * (w12.x * w3.y);
  let wsum = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return max(r / wsum, vec3f(0.0));
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  // Temporal upscaling (PLAN.md Q6): p is an OUTPUT pixel (P.pad[2] = output size); the current
  // frame and depth are at the internal size (P.size), rendered with a sub-pixel jitter (P.jitter,
  // internal pixels). At render scale 1 this is ordinary TAA with jitter-aware reconstruction.
  let osz = vec2i(P.pad[2].xy);
  let isz = vec2i(P.size.xy);
  let p = vec2i(gid.xy);
  if (p.x >= osz.x || p.y >= osz.y) { return; }
  let uvO = (vec2f(p) + 0.5) * P.pad[2].zw;
  // This output pixel's centre in internal pixel units; internal pixel q's sample sits at
  // q + 0.5 − jitter (the projection was shifted by +jitter).
  let ip = uvO * P.size.xy;
  let j = select(vec2f(0.0), P.jitter.xy, P.taa.z > 0.5);
  let qc = vec2i(floor(ip + j));
  // Reconstruct the current frame at ip from the 3×3 internal samples (a Gaussian on the distance
  // to each sample), gather the neighbourhood's moments for clipping, and the nearest depth.
  var m1 = vec3f(0.0); var m2 = vec3f(0.0);
  var mn = vec3f(1e9); var mx = vec3f(-1e9);
  var acc = vec3f(0.0); var wsum = 0.0; var wmax = 0.0;
  var dBest = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let q = clamp(qc + vec2i(x, y), vec2i(0), isz - 1);
      let c = loadCur(q, isz);
      let s = toYCoCg(tmap(c));
      m1 += s; m2 += s * s; mn = min(mn, s); mx = max(mx, s);
      let d = ip - (vec2f(q) + 0.5 - j);
      let w = exp(-2.8 * dot(d, d));
      acc += tmap(c) * w; wsum += w; wmax = max(wmax, w);
      let qd = textureLoad(depthTex, q, 0);
      if (qd > dBest) { dBest = qd; }
    }
  }
  let c0 = itmap(acc / max(wsum, 1e-5));
  if (P.taa.z < 0.5) {
    textureStore(outColor, p, vec4f(c0, 1.0));
    textureStore(outHist, p, vec4f(c0, 1.0));
    return;
  }
  m1 /= 9.0; m2 /= 9.0;
  let sigma = sqrt(max(m2 - m1 * m1, vec3f(0.0)));
  // Reproject this output pixel with the nearest depth around it (edges reproject with the
  // foreground; homogeneous, so the sky at infinite depth reprojects as a direction).
  let ndc = uvO * 2.0 - 1.0;
  let wh = P.invVP * vec4f(ndc, dBest, 1.0);
  let ph = P.prevVP * wh;
  let prevNdc = ph.xy / ph.w;
  let uv = prevNdc * 0.5 + 0.5;
  let valid = P.jitter.w < 0.5 && ph.w > 0.0 && all(uv > vec2f(0.0)) && all(uv < vec2f(1.0));
  var outc = c0;
  if (valid) {
    let h = toYCoCg(tmap(sampleHistory(uv, P.pad[2])));
    // Variance clip toward the neighbourhood (γ wider when upscaling: fewer samples per pixel).
    let up = P.pad[2].x * P.size.z; // output / internal (≥ 1)
    let gamma = 1.1 + 0.35 * clamp(up - 1.0, 0.0, 1.0);
    let lo = m1 - gamma * sigma; let hi = m1 + gamma * sigma;
    let cen = (lo + hi) * 0.5; let ext = max((hi - lo) * 0.5, vec3f(1e-5));
    let v = h - cen;
    let unit = abs(v / ext);
    let vmax = max(unit.x, max(unit.y, unit.z));
    var hc = select(h, cen + v / vmax, vmax > 1.0);
    hc = clamp(hc, mn, mx);
    let ct = toYCoCg(tmap(c0));
    // Feedback: steady at P.taa.x, less where the history moved fast; the current frame counts
    // in proportion to how near a real sample lies to this output pixel (upscaling).
    let motion = length((uv - uvO) * P.pad[2].xy);
    // Upscaling keeps more history (fewer real samples land on each output pixel per frame).
    let fbBase = mix(P.taa.x, 0.95, clamp(up - 1.0, 0.0, 1.0) * 2.0);
    let fb = mix(fbBase, 0.8, clamp(motion / 8.0, 0.0, 1.0));
    let alpha = (1.0 - fb) * clamp(wmax, 0.35, 1.0);
    let wc = alpha / (1.0 + ct.x); let wh2 = (1.0 - alpha) / (1.0 + hc.x);
    let r = (ct * wc + hc * wh2) / (wc + wh2);
    outc = itmap(fromYCoCg(r));
  }
  // Never let a non-finite value into the history (it would persist and spread).
  outc = select(clamp(outc, vec3f(0.0), vec3f(60000.0)), c0, outc != outc);
  textureStore(outHist, p, vec4f(outc, 1.0));
  textureStore(outColor, p, vec4f(outc, 1.0));
}
`;
