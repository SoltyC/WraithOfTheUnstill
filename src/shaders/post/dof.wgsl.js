// Depth of field (BRIEF §5.8: "very restrained"). Off in play except for things right at the lens;
// the release cinematic focuses on the Warden and softens the far steppe and the near snow.
// After TAA: reads this frame's resolved image, writes the chain's output target. A 24-tap
// golden-angle gather sized by each pixel's circle of confusion; taps from sharper, nearer
// geometry are down-weighted so in-focus edges never bleed into the blur.

import { POST_PARAMS_WGSL } from './common.wgsl.js';

export const dofCS = /* wgsl */ `
${POST_PARAMS_WGSL}
@group(0) @binding(0) var<storage, read> P: PostParams;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var depthTex: texture_depth_2d;
@group(0) @binding(3) var outColor: texture_storage_2d<rgba16float, write>;

fn distAt(q: vec2i, sz: vec2i) -> f32 {
  // q is an output pixel; depth lives at the internal size (P.size; output size in P.pad[2]).
  let c = clamp(vec2i(vec2f(q) * P.size.xy * P.pad[2].zw), vec2i(0), vec2i(P.size.xy) - 1);
  let d = textureLoad(depthTex, c, 0);
  if (d <= 0.0) { return 1e5; }
  return length(worldPos(texelNdc(c, P.size), d, P.invVP) - P.cam.xyz);
}
// Circle of confusion in pixels (signed: < 0 in front of the focus).
fn coc(dist: f32) -> f32 {
  let f = P.dof.x; let r = P.dof.y;
  let s = (dist - f) / max(r, 0.01);
  let near = clamp((0.9 - dist) / 0.6, 0.0, 1.0); // anything at the lens is always soft
  let c = clamp(abs(s) - 1.0, 0.0, 1.0) * P.dof.w;
  return max(c, near) * P.dof.z * sign(s + 1e-4);
}

// Camera motion blur (cutscenes: docs/phase-10/cutscene-research.md §5): each pixel's screen motion since the last frame from
// its depth and the two cameras (the camera's motion only: what moves by itself is not smeared), a 12-tap line along it scaled by
// the shutter share. Where the frame barely moves the depth of field's gather is kept, mixed into the line as motion grows past
// 3 px (the line samples the unfocused image: a moving pixel loses its depth of field).
fn motionBlur(p: vec2i, sz: vec2i) -> vec4f {
  let c = clamp(vec2i(vec2f(p) * P.size.xy * P.pad[2].zw), vec2i(0), vec2i(P.size.xy) - 1);
  let d = textureLoad(depthTex, c, 0);
  let ndc = (vec2f(p) + 0.5) / vec2f(sz) * 2.0 - 1.0;
  let h = worldFromDepth(ndc, d, P.invVP);
  let ph = P.prevVP * h;
  if (abs(ph.w) < 1e-6) { return vec4f(0.0); }
  let pn = ph.xy / ph.w;
  var v = (ndc - pn) * 0.5 * vec2f(sz) * P.cine.x;
  let l = length(v);
  if (l < 0.6) { return vec4f(0.0); }
  v *= min(1.0, 48.0 / l);
  var acc = vec3f(0.0);
  for (var i = 0; i < 12; i++) {
    let s = (f32(i) + 0.5) / 12.0 - 0.5;
    let q = clamp(p + vec2i(round(v * s)), vec2i(0), sz - 1);
    acc += textureLoad(src, q, 0).rgb;
  }
  // How much it moves decides how much the line wins over the focus gather (w: 1 = all of it).
  return vec4f(acc / 12.0, smoothstep(0.6, 3.0, l));
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let sz = vec2i(P.pad[2].xy);
  let p = vec2i(gid.xy);
  if (p.x >= sz.x || p.y >= sz.y) { return; }
  let c0 = textureLoad(src, p, 0).rgb;
  var mb = vec4f(0.0);
  if (P.cine.x > 0.0) { mb = motionBlur(p, sz); if (mb.w >= 1.0) { textureStore(outColor, p, vec4f(mb.rgb, 1.0)); return; } }
  let r0 = abs(coc(distAt(p, sz)));
  if (r0 < 0.5) { textureStore(outColor, p, vec4f(mix(c0, mb.rgb, mb.w), 1.0)); return; }
  var acc = c0; var wsum = 1.0;
  for (var i = 0; i < 24; i++) {
    let t = (f32(i) + 0.5) / 24.0;
    let a = f32(i) * 2.39996323;
    let o = vec2f(cos(a), sin(a)) * sqrt(t) * r0;
    let q = p + vec2i(o);
    let rq = abs(coc(distAt(q, sz)));
    // A tap counts if its own blur reaches this pixel (no sharp → blurred bleeding).
    let w = clamp(rq - length(o) + 1.0, 0.0, 1.0);
    acc += textureLoad(src, clamp(q, vec2i(0), sz - 1), 0).rgb * w;
    wsum += w;
  }
  textureStore(outColor, p, vec4f(mix(acc / wsum, mb.rgb, mb.w), 1.0));
}
`;
