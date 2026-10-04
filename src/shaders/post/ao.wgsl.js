// Screen-space ambient occlusion (BRIEF §5.8), half resolution, from the reverse-Z depth alone
// (no normal buffer: the normal comes from the depth's smaller-step derivative). Alchemy AO
// (McGuire 2011): 8 samples on a disc of fixed world radius, rotated per pixel and per frame so
// TAA integrates the noise. It is restrained and grounds contacts — trail floors, berm feet, the
// Wraith's hem on the snow, rocks bedded in drifts — and fades out with distance.
// Output: r = AO (1 = open), g = linear distance of the sample (for the depth-aware upsample).

import { POST_PARAMS_WGSL } from './common.wgsl.js';
import { WEATHER_FOG_WGSL } from './fog.wgsl.js';

export const aoCS = /* wgsl */ `
${POST_PARAMS_WGSL}
@group(0) @binding(0) var<storage, read> P: PostParams;
@group(0) @binding(1) var depthTex: texture_depth_2d;
@group(0) @binding(2) var outAo: texture_storage_2d<rgba16float, write>;

// Sky texels (depth 0) have no position; callers pass a fallback (the centre) for them, so an
// infinite point never turns a silhouette into NaN.
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
  let d = textureLoad(depthTex, p, 0);
  if (d <= 0.0 || P.ao.z < 0.5) { textureStore(outAo, hp, vec4f(1.0, 1e6, 0.0, 1.0)); return; }
  let pos = worldPos(texelNdc(p, P.size), d, P.invVP);
  let dist = length(pos - P.cam.xyz);
  // Normal from the smaller of the forward/backward depth differences (no halo at silhouettes).
  let px1 = posOr(p + vec2i(1, 0), sz, pos + vec3f(1e3)); let px0 = posOr(p - vec2i(1, 0), sz, pos + vec3f(1e3));
  let py1 = posOr(p + vec2i(0, 1), sz, pos + vec3f(1e3)); let py0 = posOr(p - vec2i(0, 1), sz, pos + vec3f(1e3));
  let dx = select(pos - px0, px1 - pos, length(px1 - pos) < length(pos - px0));
  let dy = select(pos - py0, py1 - pos, length(py1 - pos) < length(pos - py0));
  var n = cross(dy, dx);
  n = select(normalize(n), normalize(P.cam.xyz - pos), dot(n, n) < 1e-12 || length(dx) > 500.0 || length(dy) > 500.0);
  if (dot(n, P.cam.xyz - pos) < 0.0) { n = -n; }
  let R = P.ao.x;
  let rPx = clamp(R * P.ao.w / max(dist, 0.1), 2.0, 96.0);
  // Per-pixel rotation (interleaved gradient noise), advanced each frame.
  let ign = fract(52.9829189 * fract(dot(vec2f(p) + f32(i32(P.jitter.z) % 8) * 5.588238, vec2f(0.06711056, 0.00583715))));
  let rot = ign * 6.2831853;
  var sum = 0.0;
  let N = 8;
  for (var i = 0; i < N; i++) {
    let t = (f32(i) + 0.5) / f32(N);
    let a = rot + f32(i) * 2.39996323;
    let r = rPx * sqrt(t);
    let q = p + vec2i(vec2f(cos(a), sin(a)) * r);
    let v = posOr(q, sz, pos) - pos; // sky taps occlude nothing
    let vv = dot(v, v);
    // Samples beyond the radius fade out (no dark halos from distant geometry).
    let fall = clamp(1.0 - vv / (R * R * 4.0), 0.0, 1.0);
    sum += max(dot(v, n) - 0.01 * dist, 0.0) / (vv + 0.01) * fall;
  }
  var ao = max(1.0 - 2.0 * P.ao.y / f32(N) * sum, 0.0);
  ao = pow(ao, 1.4);
  // Fade with distance: contact shading near the player, none across the field.
  ao = mix(ao, 1.0, smoothstep(40.0, 140.0, dist));
  textureStore(outAo, hp, vec4f(ao, dist, 0.0, 1.0));
}
`;

/** Compose: the current frame for TAA — scene × AO (depth-aware upsample), then the weather
 *  volumes: SSR on ice, clouds over the sky, and the weather fog (full-resolution analytic height fog lit by
 *  the sky and the sun, the sun's share shadowed by the quarter-resolution shaft ratio). Composed
 *  before TAA so it integrates the marches' noise. Scene values are pre-exposed; the volumes are
 *  absolute, so they take the exposure here. */
export const composeCS = /* wgsl */ `
${POST_PARAMS_WGSL}
@group(0) @binding(0) var<storage, read> P: PostParams;
@group(0) @binding(1) var sceneTex: texture_2d<f32>;
@group(0) @binding(2) var depthTex: texture_depth_2d;
@group(0) @binding(3) var aoTex: texture_2d<f32>;
@group(0) @binding(4) var cloudSampler: sampler;
@group(0) @binding(5) var cloudTex: texture_2d<f32>;
@group(0) @binding(6) var shaftSampler: sampler;
@group(0) @binding(7) var shaftTex: texture_2d<f32>;
@group(0) @binding(8) var<storage, read> atmoLight: array<vec4f, 13>;
@group(0) @binding(9) var ssrSampler: sampler;
@group(0) @binding(10) var ssrTex: texture_2d<f32>;
@group(0) @binding(11) var outColor: texture_storage_2d<rgba16float, write>;
${WEATHER_FOG_WGSL}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let sz = vec2i(P.size.xy);
  let p = vec2i(gid.xy);
  if (p.x >= sz.x || p.y >= sz.y) { return; }
  var c = textureLoad(sceneTex, p, 0);
  let d = textureLoad(depthTex, p, 0);
  let ndc = texelNdc(p, P.size);
  // Debug (?postDebug=1): flag non-finite inputs by colour — scene magenta, AO green,
  // clouds red, shafts blue, SSR yellow, depth cyan.
  if (P.pad[0].x > 0.5) {
    let half = (sz + 1) / 2;
    let a = textureLoad(aoTex, min(p / 2, half - 1), 0);
    let uvd = (vec2f(p) + 0.5) * P.size.zw;
    let cl = textureSampleLevel(cloudTex, cloudSampler, uvd, 0.0);
    let sh = textureSampleLevel(shaftTex, shaftSampler, uvd, 0.0);
    let sr = textureSampleLevel(ssrTex, ssrSampler, uvd, 0.0);
    var dbg = vec3f(-1.0);
    if (any(c != c) || any(abs(c) > vec4f(1e30))) { dbg = vec3f(1.0, 0.0, 1.0); }
    else if (any(a != a)) { dbg = vec3f(0.0, 1.0, 0.0); }
    else if (any(cl != cl)) { dbg = vec3f(1.0, 0.0, 0.0); }
    else if (any(sh != sh)) { dbg = vec3f(0.0, 0.0, 1.0); }
    else if (any(sr != sr)) { dbg = vec3f(1.0, 1.0, 0.0); }
    else if (d != d) { dbg = vec3f(0.0, 1.0, 1.0); }
    if (dbg.x >= 0.0) { textureStore(outColor, p, vec4f(dbg * 50.0, 0.0)); return; }
  }
  let cam = P.cam.xyz;
  var dist = 2e4;
  var dir: vec3f;
  if (d > 0.0) {
    let wp = worldPos(ndc, d, P.invVP);
    dist = length(wp - cam);
    dir = (wp - cam) / max(dist, 1e-4);
  } else {
    let fh = P.invVP * vec4f(ndc, 1e-7, 1.0);
    dir = normalize(fh.xyz / fh.w - cam);
  }
  if (P.ao.z > 0.5 && d > 0.0) {
    // Depth-aware 2×2 upsample of the half-resolution AO.
    let half = (sz + 1) / 2;
    let base = clamp((p - 1) / 2, vec2i(0), half - 1);
    var acc = 0.0; var wsum = 0.0;
    for (var j = 0; j < 2; j++) {
      for (var i = 0; i < 2; i++) {
        let s = textureLoad(aoTex, min(base + vec2i(i, j), half - 1), 0);
        let w = 1.0 / (abs(s.g - dist) / max(dist * 0.02, 0.05) + 0.05);
        acc += s.r * w; wsum += w;
      }
    }
    c = vec4f(c.rgb * (acc / max(wsum, 1e-5)), c.a);
  }
  let exposure = P.keyCol.w * atmoLight[3].w;
  let uv = (vec2f(p) + 0.5) * P.size.zw;
  // Screen-space reflections on ice and wet slush (premultiplied, half resolution).
  if (P.ssr.w > 0.5 && c.a > 0.03) {
    let r = textureSampleLevel(ssrTex, ssrSampler, uv, 0.0);
    c = vec4f(c.rgb * (1.0 - r.a) + r.rgb, c.a);
  }
  // Clouds over the sky.
  if (d <= 0.0 && P.fog2.y > 0.02) {
    let cl = textureSampleLevel(cloudTex, cloudSampler, uv, 0.0);
    c = vec4f(c.rgb * cl.a + cl.rgb * exposure, c.a);
  }
  // Weather fog (snow haze, falling snow, blizzard), lit by the sky and the shafted sun.
  if (P.fog.x > 1e-7) {
    let fogp = vec4f(P.fog.x, P.fog.y, P.fog.z, 0.0);
    let T = exp(-fogOpticalDepth(cam, dir, dist, fogp));
    let keyC = atmoLight[0].xyz;
    let skyUp = atmoLight[1].xyz;
    let cosT = dot(dir, P.sun.xyz);
    var ratio = 1.0;
    if (P.fog.w > 0.5) { ratio = textureSampleLevel(shaftTex, shaftSampler, uv, 0.0).r; }
    let phase = mix(hgPhase(cosT, 0.55), 0.0795775, 0.45);
    let ins = (keyC * phase * ratio * 0.9 + skyUp * 0.95) * (1.0 - T);
    c = vec4f(c.rgb * T + ins * exposure, c.a);
  }
  c = vec4f(select(c.rgb, vec3f(0.0), c.rgb != c.rgb), c.a);
  textureStore(outColor, p, c);
}
`;
