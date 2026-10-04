// Frame-metered eye adaptation (BRIEF §5.8: "eye adaptation with tight limits"). One workgroup
// samples the composed frame on a 64×64 grid (centre-weighted), converts it back to absolute
// luminance by dividing out the exposure it was rendered with, and builds a log-luminance
// histogram. The trimmed mean (ignoring the darkest 30 % and the brightest 3 % of the weight, so
// a sun disc or a black rock cannot swing it) goes to meter[0].x for the atmosphere's ambient pass,
// which turns it into a bounded correction of the analytic exposure (render/atmosphere.js).

import { POST_PARAMS_WGSL } from './common.wgsl.js';

export const meterCS = /* wgsl */ `
${POST_PARAMS_WGSL}
@group(0) @binding(0) var<storage, read> P: PostParams;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> atmoLight: array<vec4f, 13>;
@group(0) @binding(3) var<storage, read_write> meter: array<vec4f, 1>;

const BINS: u32 = 64u;
const LMIN: f32 = -14.0;
const LMAX: f32 = 10.0;
var<workgroup> hist: array<atomic<u32>, 64>;

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(local_invocation_index) li: u32, @builtin(local_invocation_id) lid: vec3u) {
  if (li < BINS) { atomicStore(&hist[li], 0u); }
  workgroupBarrier();
  let sz = vec2f(P.size.xy);
  let usedExposure = max(P.keyCol.w * atmoLight[3].w, 1e-8);
  for (var j = 0u; j < 4u; j++) {
    for (var i = 0u; i < 4u; i++) {
      let g = vec2f(f32(lid.x * 4u + i), f32(lid.y * 4u + j)) + 0.5;
      let uv = g / 64.0;
      let c = textureLoad(src, vec2i(uv * sz), 0).rgb;
      let L = max(luma(c) / usedExposure, 1e-6);
      let lg = clamp(log2(L), LMIN, LMAX - 0.001);
      let b = u32((lg - LMIN) / (LMAX - LMIN) * f32(BINS));
      // Centre weight: a soft ellipse (integer weights 1..4 for the atomics).
      let d = (uv - 0.5) * vec2f(1.0, 1.4);
      let w = u32(1.0 + 3.0 * exp(-dot(d, d) * 6.0));
      atomicAdd(&hist[b], w);
    }
  }
  workgroupBarrier();
  if (li == 0u) {
    var total = 0.0;
    for (var b = 0u; b < BINS; b++) { total += f32(atomicLoad(&hist[b])); }
    let lo = total * 0.30; let hi = total * 0.97;
    var acc = 0.0; var sum = 0.0; var wsum = 0.0;
    for (var b = 0u; b < BINS; b++) {
      let n = f32(atomicLoad(&hist[b]));
      let a0 = max(acc, lo); let a1 = min(acc + n, hi);
      let w = max(a1 - a0, 0.0);
      sum += w * (LMIN + (f32(b) + 0.5) / f32(BINS) * (LMAX - LMIN));
      wsum += w;
      acc += n;
    }
    meter[0] = vec4f(sum / max(wsum, 1.0), select(0.0, 1.0, P.exposure.x > 0.5 && wsum > 0.0), 0.0, 0.0);
  }
}
`;
