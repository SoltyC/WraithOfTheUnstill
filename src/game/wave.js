// The wave's shape (render/wave.js draws it, shaders/wave.wgsl.js computes it on the GPU from the same numbers): a breaking
// wave's profile, and how it varies across the hall. Pure and exact on both sides (an integer hash, no sin-hash), so a shot can
// put a hand an inch from the water (game/release.js). Turbulence is the GPU's alone (≤ ~1 m, more at the lip).

/** The profile's control points: (d, y) — d metres ahead of the front (towards −x, the way it travels), y local height. In order
 *  along the sheet: the flood behind, the crest, the lip pitched forward and curling down, the barrel's roof and back, the face,
 *  the toe, and down into the chasm. */
export const WAVE_PROFILE = [
  [-70, 13], [-30, 14.5], [-10, 17.5], [-2, 20.3], [2.5, 21.2], [5.8, 19.9], [7.4, 17.0], [6.4, 14.8], [3.4, 15.3],
  [0.9, 13.4], [-0.2, 9.0], [0.3, 4.0], [1.8, 0.7], [4.2, -1.6], [5.0, -55],
];
/** Profile points that pitch forward in the curl (scaled by the lip's reach). */
export const CURL = [3, 9];

/** 32-bit integer hash (lowbias32): the same bits in WGSL. */
export function ihash(n) {
  let x = n >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0; x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0; x ^= x >>> 16;
  return x >>> 0;
}
/** 1D value noise in 0..1. */
export function n1(x) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const a = ihash((i + 100000) >>> 0) / 4294967296, b = ihash((i + 100001) >>> 0) / 4294967296;
  return a + (b - a) * u;
}
/** How the wave varies across the hall at z: lag (m behind the front), the lip's reach, the height's scale. */
export function across(z) {
  return [(n1(z * 0.045) - 0.5) * 7 + (n1(z * 0.13 + 4) - 0.5) * 2, 0.45 + 0.85 * n1(z * 0.09 + 9), 0.9 + 0.2 * n1(z * 0.05 + 2)];
}
function wp(i, reach, hs) {
  const k = Math.max(0, Math.min(WAVE_PROFILE.length - 1, i));
  let [x, y] = WAVE_PROFILE[k];
  if (k >= CURL[0] && k <= CURL[1]) x = x * reach + (1 - reach) * Math.min(x, 1) * 0.4;
  if (y > 0) y *= hs;
  return [x, y];
}
/** The profile at s (0..1): Catmull-Rom through the control points. */
export function profile(s, reach, hs) {
  const N = WAVE_PROFILE.length, q = Math.max(0, Math.min(1, s)) * (N - 1), i = Math.min(Math.floor(q), N - 2), u = q - i;
  const a = wp(i - 1, reach, hs), b = wp(i, reach, hs), c = wp(i + 1, reach, hs), d = wp(i + 2, reach, hs);
  const cr = (A, B, C, D) => B + 0.5 * u * (C - A + u * (2 * A - 5 * B + 4 * C - D + u * (3 * (B - C) + D - A)));
  return [cr(a[0], b[0], c[0], d[0]), cr(a[1], b[1], c[1], d[1])];
}
/** The smooth sheet's point (no turbulence), local: s along the profile, z across, front x. */
export function wavePoint(s, z, front) {
  const [lag, reach, hs] = across(z), [d, y] = profile(s, reach, hs);
  return [front - (d + lag), y, z];
}
/** Where the face is at height y on line z, for a front at 0 (local x offset; the face from the barrel's back to the toe). */
export function faceOffset(z, y) {
  let best = null;
  for (let i = 0; i <= 400; i++) {
    const s = 0.55 + 0.35 * i / 400, p = wavePoint(s, z, 0);
    if (best === null || Math.abs(p[1] - y) < Math.abs(best[1] - y)) best = p;
  }
  return best[0];
}

/** WGSL for the same: the profile, the hash, across(), the smooth point. */
export const WAVE_SHAPE_WGSL = /* wgsl */ `
const WP_N: i32 = ${WAVE_PROFILE.length};
const WP: array<vec2f, ${WAVE_PROFILE.length}> = array<vec2f, ${WAVE_PROFILE.length}>(${WAVE_PROFILE.map(([d, y]) => `vec2f(${d.toFixed(2)}, ${y.toFixed(2)})`).join(', ')});
fn ihash(n: u32) -> u32 {
  var x = n; x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x;
}
fn wN1(x: f32) -> f32 {
  let i = floor(x); let f = x - i; let u = f * f * (3.0 - 2.0 * f);
  let a = f32(ihash(u32(i32(i) + 100000))) / 4294967296.0; let b = f32(ihash(u32(i32(i) + 100001))) / 4294967296.0;
  return a + (b - a) * u;
}
fn wpAt(i: i32, reach: f32, hs: f32) -> vec2f {
  let k = clamp(i, 0, WP_N - 1);
  var p = WP[k];
  if (k >= ${CURL[0]} && k <= ${CURL[1]}) { p.x = p.x * reach + (1.0 - reach) * min(p.x, 1.0) * 0.4; }
  if (p.y > 0.0) { p.y = p.y * hs; }
  return p;
}
fn profile(s: f32, reach: f32, hs: f32) -> vec2f {
  let q = clamp(s, 0.0, 1.0) * f32(WP_N - 1); let i = min(i32(floor(q)), WP_N - 2); let u = q - f32(i);
  let a = wpAt(i - 1, reach, hs); let b = wpAt(i, reach, hs); let c = wpAt(i + 1, reach, hs); let d = wpAt(i + 2, reach, hs);
  return b + 0.5 * u * (c - a + u * (2.0 * a - 5.0 * b + 4.0 * c - d + u * (3.0 * (b - c) + d - a)));
}
fn across(z: f32) -> vec3f {
  return vec3f((wN1(z * 0.045) - 0.5) * 7.0 + (wN1(z * 0.13 + 4.0) - 0.5) * 2.0, 0.45 + 0.85 * wN1(z * 0.09 + 9.0), 0.9 + 0.2 * wN1(z * 0.05 + 2.0));
}
`;
