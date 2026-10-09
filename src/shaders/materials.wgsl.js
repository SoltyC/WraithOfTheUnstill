// Scanned PBR materials in WGSL (src/materials/library.js): declarations of the three arrays and
// the sampling helpers every material shader shares.
//   matUv(layer, uv, N, wp)        UV-mapped surface (masonry faces, timber, felt): one tap per
//                                  array, normal through a cotangent frame from screen derivatives
//                                  (no tangent attribute needed).
//   matBiplanar(layer, p, N, k)    world-projected surface (rocks): the two dominant planes of a
//                                  triplanar projection (Quilez), two taps per array.
// Both return a MatS: linear albedo, world normal, roughness, ambient occlusion, height (0..1).

import SRC from '../../data/materials/sources.json';

/** WGSL constants MAT_<ID> = layer (ids upper-cased, '-' → '_'). */
const CONSTS = SRC.materials.map((m) => `const MAT_${m.id.toUpperCase().replace(/-/g, '_')}: i32 = ${m.layer};`).join('\n');

export const MATERIALS_DECL = /* wgsl */ `
var matAlb: texture_2d_array<f32>;
var matAlbSampler: sampler;
var matNrm: texture_2d_array<f32>;
var matNrmSampler: sampler;
var matHgt: texture_2d_array<f32>;
var matHgtSampler: sampler;
`;

export const MATERIALS_WGSL = /* wgsl */ `
${CONSTS}
struct MatS { albedo: vec3f, N: vec3f, rough: f32, ao: f32, h: f32 };

fn matTs(c: vec4f) -> vec3f {
  let xy = c.xy * 2.0 - 1.0;
  return vec3f(xy, sqrt(max(1.0 - dot(xy, xy), 0.0)));
}
// Cotangent frame (Schüler): perturb N by a tangent-space normal using the derivatives of the
// position and the UV.
fn matPerturb(N: vec3f, wp: vec3f, uv: vec2f, nts: vec3f) -> vec3f {
  let dp1 = dpdx(wp); let dp2 = dpdy(wp);
  let du1 = dpdx(uv); let du2 = dpdy(uv);
  let dp2p = cross(dp2, N); let dp1p = cross(N, dp1);
  let T = dp2p * du1.x + dp1p * du2.x;
  let B = dp2p * du1.y + dp1p * du2.y;
  let inv = inverseSqrt(max(max(dot(T, T), dot(B, B)), 1e-20));
  return normalize(T * inv * nts.x + B * inv * nts.y + N * nts.z);
}
// The scan's mean colour (its 1×1 mip): divide it out and multiply a chosen base albedo in, so
// every scan keeps its detail but takes the palette the art direction asks for.
fn matMean(layer: i32) -> vec3f { return max(textureSampleLevel(matAlb, matAlbSampler, vec2f(0.5), layer, 16.0).rgb, vec3f(0.02)); }
fn matRetint(s: MatS, layer: i32, base: vec3f, keepHue: f32) -> vec3f {
  let m = matMean(layer);
  let rel = s.albedo / m;                                  // detail around 1
  let l = dot(rel, vec3f(0.2126, 0.7152, 0.0722));
  return base * mix(vec3f(l), rel, keepHue);
}
fn matUv(layer: i32, uv: vec2f, N: vec3f, wp: vec3f) -> MatS {
  var s: MatS;
  s.albedo = textureSample(matAlb, matAlbSampler, uv, layer).rgb;
  let n = textureSample(matNrm, matNrmSampler, uv, layer);
  let hg = textureSample(matHgt, matHgtSampler, uv, layer);
  s.N = matPerturb(N, wp, uv, matTs(n));
  s.rough = n.z; s.ao = hg.y; s.h = hg.x;
  return s;
}
// Biplanar mapping: the two axes the normal leans on most; weights sharpened so the seam is
// narrow. Each plane's tangent normal is swizzled into world space (whiteout-style blend).
fn matPlane(layer: i32, uv: vec2f, dx: vec2f, dy: vec2f) -> array<vec4f, 3> {
  return array<vec4f, 3>(
    textureSampleGrad(matAlb, matAlbSampler, uv, layer, dx, dy),
    textureSampleGrad(matNrm, matNrmSampler, uv, layer, dx, dy),
    textureSampleGrad(matHgt, matHgtSampler, uv, layer, dx, dy));
}
fn matBiplanar(layer: i32, p: vec3f, N: vec3f, k: f32) -> MatS {
  let dpx = dpdx(p); let dpy = dpdy(p);
  let a = abs(N);
  // Major (ma), minor (mi) and the remaining axis.
  var ma = vec3i(0, 1, 2); var mi = vec3i(0, 1, 2);
  if (a.x > a.y && a.x > a.z) { ma = vec3i(0, 1, 2); } else if (a.y > a.z) { ma = vec3i(1, 2, 0); } else { ma = vec3i(2, 0, 1); }
  if (a.x < a.y && a.x < a.z) { mi = vec3i(0, 1, 2); } else if (a.y < a.z) { mi = vec3i(1, 2, 0); } else { mi = vec3i(2, 0, 1); }
  let me = vec3i(3) - mi - ma;
  let uvA = vec2f(p[ma.y], p[ma.z]) * k; let uvB = vec2f(p[me.y], p[me.z]) * k;
  let A = matPlane(layer, uvA, vec2f(dpx[ma.y], dpx[ma.z]) * k, vec2f(dpy[ma.y], dpy[ma.z]) * k);
  let B = matPlane(layer, uvB + 0.37, vec2f(dpx[me.y], dpx[me.z]) * k, vec2f(dpy[me.y], dpy[me.z]) * k);
  var w = vec2f(a[ma.x], a[me.x]);
  w = clamp((w - 0.5773) / (1.0 - 0.5773), vec2f(0.0), vec2f(1.0));
  w = pow(w, vec2f(8.0 / 8.0)) + vec2f(1e-4);
  // Height-aware: the higher texel wins near the seam (stones over mortar, not a cross-fade).
  w *= vec2f(0.5 + A[2].x, 0.5 + B[2].x);
  w = w / (w.x + w.y);
  var s: MatS;
  s.albedo = A[0].rgb * w.x + B[0].rgb * w.y;
  s.rough = A[1].z * w.x + B[1].z * w.y;
  s.ao = A[2].y * w.x + B[2].y * w.y;
  s.h = A[2].x * w.x + B[2].x * w.y;
  // Tangent normals → world: for the plane whose normal axis is i, (u, v) map to axes (j, k).
  let tA = matTs(A[1]); let tB = matTs(B[1]);
  var nA = vec3f(0.0); var nB = vec3f(0.0);
  nA[ma.y] = tA.x; nA[ma.z] = tA.y; nA[ma.x] = tA.z * sign(N[ma.x]);
  nB[me.y] = tB.x; nB[me.z] = tB.y; nB[me.x] = tB.z * sign(N[me.x]);
  // Whiteout blend toward the geometric normal.
  let nw = normalize(N + (nA - N * dot(nA, N)) * w.x + (nB - N * dot(nB, N)) * w.y);
  s.N = nw;
  return s;
}
`;
