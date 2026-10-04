// Bloom (BRIEF §5.8: restrained). A mip chain built in compute: 13-tap downsamples (Jimenez,
// "Next generation post processing in Call of Duty"), the first with a Karis average so single
// bright texels (glints, the sun disc) cannot flicker; then 9-tap tent upsamples accumulating
// back up. No threshold — energy-conserving: the display pass mixes in a small fraction, so
// only genuinely bright things (sun, spell light, the cowl light, glints) visibly bloom.

const HEAD = /* wgsl */ `
@group(0) @binding(0) var srcSampler: sampler;
@group(0) @binding(1) var src: texture_2d<f32>;
`;

export function bloomDownCS(karis) {
  return /* wgsl */ `
${HEAD}
@group(0) @binding(2) var dst: texture_storage_2d<rgba16float, write>;
fn tap(uv: vec2f) -> vec3f { return textureSampleLevel(src, srcSampler, uv, 0.0).rgb; }
fn kw(c: vec3f) -> f32 { return 1.0 / (1.0 + dot(c, vec3f(0.2126, 0.7152, 0.0722))); }
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dsz = textureDimensions(dst);
  if (gid.x >= dsz.x || gid.y >= dsz.y) { return; }
  let ts = 1.0 / vec2f(textureDimensions(src));
  let uv = (vec2f(gid.xy) + 0.5) / vec2f(dsz);
  let a = tap(uv + ts * vec2f(-2.0, 2.0)); let b = tap(uv + ts * vec2f(0.0, 2.0)); let c = tap(uv + ts * vec2f(2.0, 2.0));
  let d = tap(uv + ts * vec2f(-2.0, 0.0)); let e = tap(uv); let f = tap(uv + ts * vec2f(2.0, 0.0));
  let g = tap(uv + ts * vec2f(-2.0, -2.0)); let h = tap(uv + ts * vec2f(0.0, -2.0)); let i = tap(uv + ts * vec2f(2.0, -2.0));
  let j = tap(uv + ts * vec2f(-1.0, 1.0)); let k = tap(uv + ts * vec2f(1.0, 1.0));
  let l = tap(uv + ts * vec2f(-1.0, -1.0)); let m = tap(uv + ts * vec2f(1.0, -1.0));
  var o: vec3f;
  ${karis ? `
  // Karis average per 2×2 group: weights 1/(1+luma) tame fireflies.
  let g0 = (a + b + d + e) * 0.25; let g1 = (b + c + e + f) * 0.25; let g2 = (d + e + g + h) * 0.25;
  let g3 = (e + f + h + i) * 0.25; let g4 = (j + k + l + m) * 0.25;
  let w0 = kw(g0) * 0.125; let w1 = kw(g1) * 0.125; let w2 = kw(g2) * 0.125; let w3 = kw(g3) * 0.125; let w4 = kw(g4) * 0.5;
  o = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);` : `
  o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;`}
  textureStore(dst, gid.xy, vec4f(max(o, vec3f(0.0)), 1.0));
}
`;
}

/** Upsample: tent-filtered lower level (src) added to this level's downsample (cur). */
export const bloomUpCS = /* wgsl */ `
${HEAD}
@group(0) @binding(2) var cur: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba16float, write>;
fn tap(uv: vec2f) -> vec3f { return textureSampleLevel(src, srcSampler, uv, 0.0).rgb; }
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dsz = textureDimensions(dst);
  if (gid.x >= dsz.x || gid.y >= dsz.y) { return; }
  let ts = 1.0 / vec2f(textureDimensions(src));
  let uv = (vec2f(gid.xy) + 0.5) / vec2f(dsz);
  var s = tap(uv) * 4.0;
  s += (tap(uv + vec2f(ts.x, 0.0)) + tap(uv - vec2f(ts.x, 0.0)) + tap(uv + vec2f(0.0, ts.y)) + tap(uv - vec2f(0.0, ts.y))) * 2.0;
  s += tap(uv + ts) + tap(uv - ts) + tap(uv + vec2f(ts.x, -ts.y)) + tap(uv + vec2f(-ts.x, ts.y));
  let here = textureLoad(cur, vec2i(gid.xy), 0).rgb;
  textureStore(dst, gid.xy, vec4f(here + s / 16.0, 1.0));
}
`;
