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
  let c = clamp(q, vec2i(0), sz - 1);
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

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let sz = vec2i(P.size.xy);
  let p = vec2i(gid.xy);
  if (p.x >= sz.x || p.y >= sz.y) { return; }
  let c0 = textureLoad(src, p, 0).rgb;
  let r0 = abs(coc(distAt(p, sz)));
  if (r0 < 0.5) { textureStore(outColor, p, vec4f(c0, 1.0)); return; }
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
  textureStore(outColor, p, vec4f(acc / wsum, 1.0));
}
`;
