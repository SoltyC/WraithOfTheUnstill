// Terrain-state healing (BRIEF §4.3): per-material decay toward rest plus diffusion of the
// height channels. Live pages heal on the GPU each frame; an evicted page heals in closed form
// when it reloads (here, on a worker) — no missed frames are simulated:
//
//   v(t) = e^(−k·t) · (G_σ ∗ v0),   σ² = 2·D·t   (every channel rests at 0)
//
// Decay alone is exact. Diffusion is the heat-equation solution: a separable Gaussian (three
// box passes once σ is large), clamped at page edges (neighbouring pages are not consulted). With a
// per-texel material rate the two do not strictly commute; the blur is applied first.

import { PAGE_N, COARSE_PER_M } from './layout.js';

// Material ids follow the bake (tools/bake-world/climate.mjs MATERIALS).
export const MATERIAL_COUNT = 8;
const HL = (seconds) => Math.LN2 / seconds; // half-life → decay rate (1/s)
// Channels: depression, displaced, compaction, wetness, thermal, flatten.
//                     depress     displaced   compact     wet         thermal     flatten
const RATES = [
  /* snow   */ [HL(600),   HL(600),   HL(900),   HL(240),   HL(150),   HL(180)],
  /* sand   */ [HL(300),   HL(300),   HL(600),   HL(180),   HL(120),   HL(180)],
  /* mud    */ [HL(1200),  HL(1200),  HL(1500),  HL(900),   HL(150),   HL(240)],
  /* grass  */ [HL(900),   HL(900),   HL(900),   HL(300),   HL(150),   HL(180)],
  /* ash    */ [HL(480),   HL(480),   HL(900),   HL(200),   HL(300),   HL(180)],
  /* rock   */ [HL(1800),  HL(1800),  HL(1800),  HL(240),   HL(200),   HL(180)],
  /* beach  */ [HL(240),   HL(240),   HL(400),   HL(600),   HL(120),   HL(180)],
  /* seabed */ [HL(60),    HL(60),    HL(60),    HL(30),    HL(60),    HL(60)],
];
export const DECAY = new Float64Array(MATERIAL_COUNT * 6);
for (let m = 0; m < MATERIAL_COUNT; m++) for (let c = 0; c < 6; c++) DECAY[m * 6 + c] = RATES[m][c];
/** Diffusion (m²/s) of the depression and displaced-mass channels: trails slump and fill. */
export const DIFFUSION = 0.0005; // σ ≈ 0.25 m after 60 s, 0.77 m after 10 min

// ── f16 / unorm8 packing identical to WGSL pack2x16float / pack4x8unorm ───────────────────────
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
export function toHalf(v) {
  f32[0] = v;
  const x = u32[0], sign = (x >>> 16) & 0x8000;
  let e = ((x >>> 23) & 0xff) - 127 + 15, m = x & 0x7fffff;
  if (e >= 31) return sign | 0x7c00;          // overflow → inf (NaN not expected)
  if (e <= 0) {                                // subnormal or zero
    if (e < -10) return sign;
    m |= 0x800000;
    const shift = 14 - e;
    let h = m >>> shift;
    if ((m >>> (shift - 1)) & 1 && ((m & ((1 << (shift - 1)) - 1)) || (h & 1))) h++;
    return sign | h;
  }
  let h = sign | (e << 10) | (m >>> 13);
  if ((m & 0x1000) && ((m & 0x2fff) || (h & 1))) h++; // round half to even
  return h;
}
export function fromHalf(h) {
  const s = h & 0x8000 ? -1 : 1, e = (h >>> 10) & 0x1f, m = h & 0x3ff;
  if (e === 0) return s * m * 2 ** -24;
  if (e === 31) return m ? NaN : s * Infinity;
  return s * (1 + m / 1024) * 2 ** (e - 15);
}
export const pack2 = (a, b) => (toHalf(a) | (toHalf(b) << 16)) >>> 0;
const unorm = (v) => Math.round((v < 0 ? 0 : v > 1 ? 1 : v) * 255);
export const pack4 = (a, b, c, d) => (unorm(a) | (unorm(b) << 8) | (unorm(c) << 16) | (unorm(d) << 24)) >>> 0;

/** Unpacks a page (Uint32Array of WORDS planes, PAGE_N² each) into 8 float planes. */
export function unpackPage(words, planes) {
  const n = PAGE_N * PAGE_N;
  for (let i = 0; i < n; i++) {
    const w0 = words[i], w1 = words[n + i], w2 = words[2 * n + i];
    planes[0][i] = fromHalf(w0 & 0xffff); planes[1][i] = fromHalf(w0 >>> 16);
    planes[2][i] = fromHalf(w1 & 0xffff); planes[3][i] = fromHalf(w1 >>> 16);
    planes[4][i] = (w2 & 0xff) / 255; planes[5][i] = ((w2 >>> 8) & 0xff) / 255;
    planes[6][i] = ((w2 >>> 16) & 0xff) / 255; planes[7][i] = (w2 >>> 24) / 255;
  }
}
export function packPage(planes, words) {
  const n = PAGE_N * PAGE_N;
  for (let i = 0; i < n; i++) {
    words[i] = pack2(planes[0][i], planes[1][i]);
    words[n + i] = pack2(planes[2][i], planes[3][i]);
    words[2 * n + i] = pack4(planes[4][i], planes[5][i], planes[6][i], planes[7][i]);
  }
}
export function allocPlanes() { return Array.from({ length: 8 }, () => new Float32Array(PAGE_N * PAGE_N)); }

// Planes follow the packed words: depression, displaced, compaction, thermal | wetness,
// transform, flatten, spare. Plane → RATES column (transform and spare never heal); rest is 0.
const PLANE_RATE = [0, 1, 2, 4, 3, -1, 5, -1];

/** Separable box blur of radius r (texels), edges clamped. In place via tmp. */
function boxBlur(p, tmp, r) {
  const N = PAGE_N, w = 2 * r + 1;
  for (let j = 0; j < N; j++) {          // horizontal: p → tmp
    const row = j * N;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += p[row + Math.min(N - 1, Math.max(0, k))];
    for (let i = 0; i < N; i++) {
      tmp[row + i] = acc / w;
      acc += p[row + Math.min(N - 1, i + r + 1)] - p[row + Math.max(0, i - r)];
    }
  }
  for (let i = 0; i < N; i++) {          // vertical: tmp → p
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(N - 1, Math.max(0, k)) * N + i];
    for (let j = 0; j < N; j++) {
      p[j * N + i] = acc / w;
      acc += tmp[Math.min(N - 1, j + r + 1) * N + i] - tmp[Math.max(0, j - r) * N + i];
    }
  }
}

/** Separable Gaussian of std-dev sigma (texels), edges clamped. In place via tmp. */
function gaussBlur(p, tmp, sigma) {
  const N = PAGE_N, r = Math.ceil(3 * sigma), w = new Float64Array(2 * r + 1);
  let sum = 0;
  for (let k = -r; k <= r; k++) { w[k + r] = Math.exp(-(k * k) / (2 * sigma * sigma)); sum += w[k + r]; }
  for (let k = 0; k < w.length; k++) w[k] /= sum;
  for (let j = 0; j < N; j++) {
    const row = j * N;
    for (let i = 0; i < N; i++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += w[k + r] * p[row + Math.min(N - 1, Math.max(0, i + k))];
      tmp[row + i] = acc;
    }
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += w[k + r] * tmp[Math.min(N - 1, Math.max(0, j + k)) * N + i];
      p[j * N + i] = acc;
    }
  }
}

/** Above this σ (texels) three box passes replace the exact kernel. */
export const GAUSS_MAX = 8;

/** Box radii approximating a Gaussian of std-dev sigma with three passes (Kovesi). */
export function boxRadii(sigma) {
  if (sigma < 0.5) return [0, 0, 0];
  const n = 3, wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  return [0, 1, 2].map((i) => ((i < m ? wl : wu) - 1) / 2);
}

/**
 * Heals unpacked planes in place for `seconds`. material(i) returns the bake material id of
 * coarse texel i (row-major within the page).
 */
export function healPlanes(planes, seconds, material, tmp) {
  if (!(seconds > 0)) return;
  const n = PAGE_N * PAGE_N;
  const sigma = Math.sqrt(2 * DIFFUSION * seconds) * COARSE_PER_M; // texels
  if (sigma > GAUSS_MAX) {
    const radii = boxRadii(Math.min(sigma, PAGE_N));
    for (const p of [0, 1]) for (const r of radii) if (r > 0) boxBlur(planes[p], tmp, r);
  } else if (sigma > 0.05) {
    for (const p of [0, 1]) gaussBlur(planes[p], tmp, sigma);
  }
  for (let i = 0; i < n; i++) {
    const m = material(i) * 6;
    for (let p = 0; p < 7; p++) {
      const c = PLANE_RATE[p];
      if (c < 0) continue;
      planes[p][i] *= Math.exp(-DECAY[m + c] * seconds);
    }
  }
}
