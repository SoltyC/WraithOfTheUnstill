// Shared declarations for the post-chain compute passes: the per-frame parameter block written by
// src/post/post.js (one upload per frame) and helpers for reverse-Z depth and reprojection.
// Texel convention: row 0 is the bottom of the view, so ndc = (texel + 0.5) / size · 2 − 1.

/** Floats in the parameter block (post.js fills [0..43]; passes add theirs via onParams). */
export const POST_PARAM_FLOATS = 128;

export const POST_PARAMS_WGSL = /* wgsl */ `
struct PostParams {
  invVP: mat4x4f,     // this frame, unjittered
  prevVP: mat4x4f,    // last frame, unjittered
  size: vec4f,        // W, H, 1/W, 1/H
  jitter: vec4f,      // jitter x, y (px), frame index, history reset (1)
  cam: vec4f,         // camera position, near plane
  taa: vec4f,         // feedback, sharpen, TAA on (1), −
  ao: vec4f,          // radius (m), intensity, on (1), −
  bloom: vec4f,       // intensity, threshold knee, on, −
  fog: vec4f,         // weather fog density, height falloff, base height, shafts on
  fog2: vec4f,        // snowfall density, cloud cover, wind x, wind z
  sun: vec4f,         // key light direction (to the light), key on (1)
  keyCol: vec4f,      // key colour (illuminance) at the camera, exposure
  ambCol: vec4f,      // sky ambient (up) radiance, −
  dof: vec4f,         // focus distance (m), in-focus range (m), max CoC (px), on
  ssr: vec4f,         // intensity, max distance (m), thickness (m), on
  exposure: vec4f,    // meter on, adapt rate, min stops, max stops
  vp: mat4x4f,        // this frame's view-projection, unjittered (floats 88..103)
  pad: array<vec4f, 6>,
};

fn texelNdc(p: vec2i, size: vec4f) -> vec2f {
  return (vec2f(p) + 0.5) * size.zw * 2.0 - 1.0;
}
// World position (homogeneous: w = 0 for sky at infinite depth under reverse-Z).
fn worldFromDepth(ndc: vec2f, d: f32, invVP: mat4x4f) -> vec4f {
  return invVP * vec4f(ndc, d, 1.0);
}
fn worldPos(ndc: vec2f, d: f32, invVP: mat4x4f) -> vec3f {
  let h = invVP * vec4f(ndc, max(d, 1e-7), 1.0);
  return h.xyz / h.w;
}
fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }
`;
