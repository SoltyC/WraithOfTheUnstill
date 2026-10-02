// Terrain state layout (BRIEF §4.3): addressing for the two levels, pure and shared by the
// runtime, the workers and the tests.
//
// Fine window: 4092² texels of 1/48 m (≈2.08 cm) → 85.25 m square, following the player. Stored
// toroidally: world fine texel (i, j) lives at (i mod 4092, j mod 4092), so scrolling never moves
// data. 4092 = 341 coarse texels and the origin snaps to whole coarse texels (12 fine = 25 cm), so
// the window never swims and every strip it gains or loses is whole coarse texels.
//
// Coarse pages: 128 m × 128 m at 25 cm (512² texels), keyed on a 64 × 64 grid over the 8 km
// bake. Only pages that have been written hold a slot in the page atlas; every other page reads
// as rest state (zero). Slots are evicted least-recently-used and serialised with a timestamp;
// on reload, healing for the elapsed time is applied in closed form (healing.js).
//
// Channels (BRIEF §4.3 table), packed as three u32 words per texel, stored planar (one buffer
// per word — the fine window is 64 MB per plane, under WebGPU's 128 MiB binding limit):
//   word 0: depression (m), displaced mass (m)          — pack2x16float
//   word 1: compaction (0..1), thermal (−1 frozen … +1 molten) — pack2x16float
//   word 2: wetness, transform id (/255, never heals), flatten, spare — pack4x8unorm
// Every channel rests at 0, so freshly zeroed buffers are untouched ground.

export const FINE_N = 4092;
export const FINE_PER_M = 48;                 // fine texels per metre
export const RATIO = 12;                      // fine texels per coarse texel
export const COARSE_PER_M = FINE_PER_M / RATIO; // 4 → 25 cm
export const PAGE_N = 512;                    // coarse texels per page side
export const PAGE_M = PAGE_N / COARSE_PER_M;  // 128 m
export const WORLD_HALF = 4096;
export const PAGES = (2 * WORLD_HALF) / PAGE_M; // 64 per side
export const WORDS = 3;
export const SLOTS = 48;                      // resident coarse pages (≈3 MB each)
export const NO_SLOT = 0xffff;

/** Fine-window origin (world fine texel of its min corner) for a player at (x, z): centred, snapped to coarse texels. */
export function windowOrigin(x, z, out) {
  const half = FINE_N / 2;
  out[0] = Math.floor((x * FINE_PER_M - half) / RATIO) * RATIO;
  out[1] = Math.floor((z * FINE_PER_M - half) / RATIO) * RATIO;
  return out;
}

/** Toroidal storage index of world fine texel (i, j). */
export function fineIndex(i, j) {
  const u = ((i % FINE_N) + FINE_N) % FINE_N, v = ((j % FINE_N) + FINE_N) % FINE_N;
  return v * FINE_N + u;
}

/** Page grid coordinate of world coarse texel c (−1 outside the bake). */
export function pageCoord(c) {
  const p = Math.floor((c + WORLD_HALF * COARSE_PER_M) / PAGE_N);
  return p >= 0 && p < PAGES ? p : -1;
}

/** Page key (0..4095) for page grid (px, pz), or −1 outside. */
export function pageKey(px, pz) {
  return px >= 0 && px < PAGES && pz >= 0 && pz < PAGES ? pz * PAGES + px : -1;
}

/** Page key containing world position (x, z) metres, or −1 outside the bake. */
export function pageKeyAt(x, z) {
  return pageKey(pageCoord(Math.floor(x * COARSE_PER_M)), pageCoord(Math.floor(z * COARSE_PER_M)));
}

/** World coarse texel of a page's min corner. */
export function pageOriginCoarse(key, out) {
  out[0] = (key % PAGES) * PAGE_N - WORLD_HALF * COARSE_PER_M;
  out[1] = Math.floor(key / PAGES) * PAGE_N - WORLD_HALF * COARSE_PER_M;
  return out;
}

/** Index (within each word plane of the atlas) of coarse texel (ci, cj) local to a page in slot s. */
export function slotIndex(s, ci, cj) {
  return (s * PAGE_N + cj) * PAGE_N + ci;
}

/**
 * Rectangles of a moving fine window. Writes up to two rects [i0, j0, i1, j1) (world fine
 * texels) that are in window a but not in window b into out (flat, 4 per rect) and returns the
 * count. Call with (old, new) for outgoing strips and (new, old) for incoming ones.
 */
export function windowDifference(ai, aj, bi, bj, out) {
  const N = FINE_N;
  const ox0 = Math.max(ai, bi), ox1 = Math.min(ai + N, bi + N);
  const oz0 = Math.max(aj, bj), oz1 = Math.min(aj + N, bj + N);
  if (ox0 >= ox1 || oz0 >= oz1) { out[0] = ai; out[1] = aj; out[2] = ai + N; out[3] = aj + N; return 1; }
  let n = 0;
  // Columns of a left or right of the overlap (full height of a).
  if (ai < ox0) { out[n++] = ai; out[n++] = aj; out[n++] = ox0; out[n++] = aj + N; }
  else if (ai + N > ox1) { out[n++] = ox1; out[n++] = aj; out[n++] = ai + N; out[n++] = aj + N; }
  // Rows of a above or below the overlap, restricted to the overlap's columns.
  if (aj < oz0) { out[n++] = ox0; out[n++] = aj; out[n++] = ox1; out[n++] = oz0; }
  else if (aj + N > oz1) { out[n++] = ox0; out[n++] = oz1; out[n++] = ox1; out[n++] = aj + N; }
  return n / 4;
}

/** Page keys overlapped by a rect of world fine texels [i0, j0, i1, j1) — calls fn(key). */
export function forEachPageInRect(i0, j0, i1, j1, fn) {
  const c0 = Math.floor(i0 / RATIO), c1 = Math.floor((i1 - 1) / RATIO);
  const d0 = Math.floor(j0 / RATIO), d1 = Math.floor((j1 - 1) / RATIO);
  const off = WORLD_HALF * COARSE_PER_M;
  const px0 = Math.max(0, Math.floor((c0 + off) / PAGE_N)), px1 = Math.min(PAGES - 1, Math.floor((c1 + off) / PAGE_N));
  const pz0 = Math.max(0, Math.floor((d0 + off) / PAGE_N)), pz1 = Math.min(PAGES - 1, Math.floor((d1 + off) / PAGE_N));
  for (let pz = pz0; pz <= pz1; pz++) for (let px = px0; px <= px1; px++) fn(pz * PAGES + px);
}
