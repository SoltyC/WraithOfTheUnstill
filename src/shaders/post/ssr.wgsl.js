// Screen-space reflections (BRIEF §5.8: "wet, icy, glassy and water surfaces only"). Materials
// mark reflective pixels in the scene target's alpha with their reflection weight (Fresnel ×
// ice/wet gloss; 0 elsewhere — see the clipmap's frost output). Half resolution: for each marked
// pixel, march the mirrored view ray through the depth buffer (growing steps, then a binary
// refine), and where it meets an object (the Wraith, the Warden, rocks, berms) return that
// object's colour with a confidence that fades at screen edges, with distance and for rays facing
// the camera. Where nothing is hit the material's own sky reflection stands.
// Out: rgb = reflected colour × weight (pre-exposed, from this frame's scene), a = blend weight.

import { POST_PARAMS_WGSL } from './common.wgsl.js';
import { WIND_CORE_WGSL } from '../wind.wgsl.js';
import { WATER_WAVES_WGSL } from '../water.wgsl.js';

export const ssrCS = /* wgsl */ `
${POST_PARAMS_WGSL}
@group(0) @binding(0) var<storage, read> P: PostParams;
@group(0) @binding(1) var sceneTex: texture_2d<f32>;
@group(0) @binding(2) var depthTex: texture_depth_2d;
@group(0) @binding(3) var outSsr: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var<storage, read> waterRipples: array<vec4f>;
@group(0) @binding(5) var cloudSampler: sampler;
@group(0) @binding(6) var cloudTex: texture_2d<f32>;
@group(0) @binding(7) var<storage, read> atmoLight: array<vec4f, 13>;
fn wHash(p: vec2f) -> f32 { var q = fract(p * vec2f(0.1031, 0.1030)); q += dot(q, q.yx + 33.33); return fract((q.x + q.y) * q.x); }
fn wNoised(p: vec2f) -> vec3f {
  let i = floor(p); let f = p - i;
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0); let du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  let a = wHash(i); let b = wHash(i + vec2f(1.0, 0.0)); let c = wHash(i + vec2f(0.0, 1.0)); let d = wHash(i + vec2f(1.0, 1.0));
  let k1 = b - a; let k2 = c - a; let k4 = a - b - c + d;
  return vec3f(2.0 * (a + k1 * u.x + k2 * u.y + k4 * u.x * u.y) - 1.0, 2.0 * du * vec2f(k1 + k4 * u.y, k2 + k4 * u.x));
}
${WIND_CORE_WGSL}
${WATER_WAVES_WGSL}

fn posOr(q: vec2i, sz: vec2i, fallback: vec3f) -> vec3f {
  let c = clamp(q, vec2i(0), sz - 1);
  let d = textureLoad(depthTex, c, 0);
  if (d <= 0.0) { return fallback; }
  return worldPos(texelNdc(c, P.size), d, P.invVP);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let sz = vec2i(P.size.xy);
  let half = (sz + 1) / 2;
  let hp = vec2i(gid.xy);
  if (hp.x >= half.x || hp.y >= half.y) { return; }
  let p = hp * 2;
  let mask0 = textureLoad(sceneTex, p, 0).a;
  let isWater = mask0 < 0.0;
  let mask = abs(mask0);
  let d = textureLoad(depthTex, p, 0);
  if (P.ssr.w < 0.5 || mask < 0.03 || d <= 0.0) { textureStore(outSsr, hp, vec4f(0.0)); return; }
  let pos = worldPos(texelNdc(p, P.size), d, P.invVP);
  // Reflections are a near-field effect (ice under the Wraith, a frozen lake ahead); far terrain
  // keeps its material sky reflection.
  let dist0 = length(pos - P.cam.xyz);
  if (dist0 > select(160.0, 900.0, isWater)) { textureStore(outSsr, hp, vec4f(0.0)); return; }
  let far = pos + vec3f(1e3);
  let px1 = posOr(p + vec2i(1, 0), sz, far); let px0 = posOr(p - vec2i(1, 0), sz, far);
  let py1 = posOr(p + vec2i(0, 1), sz, far); let py0 = posOr(p - vec2i(0, 1), sz, far);
  let dx = select(pos - px0, px1 - pos, length(px1 - pos) < length(pos - px0));
  let dy = select(pos - py0, py1 - pos, length(py1 - pos) < length(pos - py0));
  let nc = cross(dy, dx);
  if (dot(nc, nc) < 1e-12 || length(dx) > 500.0 || length(dy) > 500.0) { textureStore(outSsr, hp, vec4f(0.0)); return; }
  var n = normalize(nc);
  let V = normalize(P.cam.xyz - pos);
  if (dot(n, V) < 0.0) { n = -n; }
  // Water: the surface is flat in the depth buffer; its waves and the Wraith's ripples (the same
  // function the water shader uses, the same wind) bend the reflected ray.
  if (isWater) {
    let wv = windCore(pos.xz, P.pad[4], P.pad[5]);
    // The pixel's footprint on the water (as the water shader's fwidth sees it, at half resolution).
    let fp = dist0 * P.size.w * 2.0 / max(abs(V.y), 0.05);
    let sl = waterSlope(pos.xz, P.pad[4].w, wv, fp);
    n = normalize(vec3f(-sl.x, 1.0, -sl.y));
  }
  let R = reflect(-V, n);
  // March: growing steps from a small offset; per-pixel jitter (TAA integrates it).
  let ign = fract(52.9829189 * fract(dot(vec2f(p) + f32(i32(P.jitter.z) % 8) * 5.588238, vec2f(0.06711056, 0.00583715))));
  // Start beyond the surface's own reconstruction noise (it grows with distance).
  var t = (0.05 + 0.1 * ign) * (1.0 + dist0 * 0.05);
  var stepL = 0.12 * (1.0 + dist0 * 0.02);
  let thick = P.ssr.z * (1.0 + dist0 * 0.02);
  var hitUv = vec2f(-1.0);
  var prevT = 0.0;
  for (var i = 0; i < 28; i++) {
    let q = pos + R * t;
    let c = P.vp * vec4f(q, 1.0);
    if (c.w <= 0.0) { break; }
    let ndc = c.xyz / c.w;
    let uv = ndc.xy * 0.5 + 0.5;
    if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { break; }
    let sd = textureLoad(depthTex, vec2i(uv * P.size.xy), 0);
    // Reverse-Z: the ray is behind the surface when its depth is smaller.
    if (sd > ndc.z && sd > 0.0) {
      let surf = worldPos(ndc.xy, sd, P.invVP);
      let behind = length(q - P.cam.xyz) - length(surf - P.cam.xyz);
      if (behind < thick + stepL) {
        // Binary refine between the last two samples.
        var a = prevT; var b = t;
        for (var k = 0; k < 5; k++) {
          let m = (a + b) * 0.5;
          let cm = P.vp * vec4f(pos + R * m, 1.0);
          let nm = cm.xyz / cm.w;
          let sdm = textureLoad(depthTex, vec2i((nm.xy * 0.5 + 0.5) * P.size.xy), 0);
          if (sdm > nm.z) { b = m; } else { a = m; }
        }
        let cb = P.vp * vec4f(pos + R * b, 1.0);
        hitUv = (cb.xy / cb.w) * 0.5 + 0.5;
      }
      break;
    }
    prevT = t;
    t += stepL;
    stepL *= 1.18;
    if (t > P.ssr.y) { break; }
  }
  // A valid hit is real geometry (not sky, which a refine step can land on at a silhouette) and
  // not the reflecting surface's own neighbourhood.
  let hp2 = vec2i(hitUv * P.size.xy);
  let hd = textureLoad(depthTex, clamp(hp2, vec2i(0), sz - 1), 0);
  if (hitUv.x < 0.0 || hd <= 0.0 || length(vec2f(hp2 - p)) < 3.0) {
    // Water with nothing hit nearby: what lies far along the reflected ray — the far shore, the
    // mountains, the sky with its clouds — read from the frame where that direction lands.
    if (isWater) {
      var Rf = R; Rf.y = max(Rf.y, 0.01);
      let cf = P.vp * vec4f(P.cam.xyz + Rf * 1e4, 1.0);
      if (cf.w > 0.0) {
        let uvf = (cf.xy / cf.w) * 0.5 + 0.5;
        if (all(uvf > vec2f(0.0)) && all(uvf < vec2f(1.0))) {
          let pf = vec2i(uvf * P.size.xy);
          var cc = textureLoad(sceneTex, pf, 0).rgb;
          if (textureLoad(depthTex, pf, 0) <= 0.0 && P.fog2.y > 0.02) {
            let cl = textureSampleLevel(cloudTex, cloudSampler, vec2f(uvf.x, uvf.y), 0.0);
            cc = cc * cl.a + cl.rgb * P.keyCol.w * atmoLight[3].w;
          }
          let edgeF = min(min(uvf.x, 1.0 - uvf.x), min(uvf.y, 1.0 - uvf.y));
          let wF = clamp(mask * smoothstep(0.0, 0.1, edgeF) * P.ssr.x, 0.0, 1.0);
          textureStore(outSsr, hp, vec4f(cc * wF, wF));
          return;
        }
      }
    }
    textureStore(outSsr, hp, vec4f(0.0)); return;
  }
  let hc = textureLoad(sceneTex, hp2, 0).rgb;
  // Confidence: screen edges, march length, rays turning back toward the camera.
  let edge = min(min(hitUv.x, 1.0 - hitUv.x), min(hitUv.y, 1.0 - hitUv.y));
  var conf = smoothstep(0.0, 0.08, edge) * (1.0 - smoothstep(P.ssr.y * 0.6, P.ssr.y, t)) * (1.0 - smoothstep(100.0, 160.0, dist0));
  conf *= 1.0 - smoothstep(0.2, 0.6, dot(R, V));
  if (!isWater) { conf *= 1.0; } else { conf = smoothstep(0.0, 0.08, edge); } // water reflects at any distance
  let w = clamp(mask * conf * P.ssr.x, 0.0, 1.0);
  textureStore(outSsr, hp, vec4f(hc * w, w)); // premultiplied: bilinear upsampling stays correct
}
`;
