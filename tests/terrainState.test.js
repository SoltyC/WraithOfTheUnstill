// Terrain state: page-atlas addressing and closed-form healing (BRIEF §15 test list).
import { describe, it, expect } from 'vitest';
import {
  FINE_N, FINE_PER_M, RATIO, PAGE_N, PAGE_M, PAGES, WORDS, SLOTS, windowOrigin, fineIndex, pageCoord, pageKey,
  pageKeyAt, pageOriginCoarse, slotIndex, windowDifference, forEachPageInRect, COARSE_PER_M, WORLD_HALF,
} from '../src/terrain/state/layout.js';
import {
  toHalf, fromHalf, pack2, pack4, unpackPage, packPage, allocPlanes, healPlanes, DECAY, DIFFUSION, boxRadii, GAUSS_MAX,
} from '../src/terrain/state/healing.js';

const area = (r, n) => { let a = 0; for (let k = 0; k < n; k++) a += (r[k * 4 + 2] - r[k * 4]) * (r[k * 4 + 3] - r[k * 4 + 1]); return a; };

describe('fine window addressing', () => {
  it('snaps the origin to whole coarse texels and keeps the player inside the middle', () => {
    const o = [0, 0];
    for (const [x, z] of [[0, 0], [123.456, -987.01], [-4000.3, 3999.9], [0.01, -0.01]]) {
      windowOrigin(x, z, o);
      expect(o[0] % RATIO === 0 && o[1] % RATIO === 0).toBe(true);
      const pi = x * FINE_PER_M - o[0], pj = z * FINE_PER_M - o[1];
      expect(Math.abs(pi - FINE_N / 2)).toBeLessThanOrEqual(RATIO);
      expect(Math.abs(pj - FINE_N / 2)).toBeLessThanOrEqual(RATIO);
    }
  });
  it('maps world texels toroidally, including negatives', () => {
    expect(fineIndex(0, 0)).toBe(0);
    expect(fineIndex(FINE_N, FINE_N)).toBe(0);
    expect(fineIndex(-1, 0)).toBe(FINE_N - 1);
    expect(fineIndex(5, -1)).toBe((FINE_N - 1) * FINE_N + 5);
    // A window of N consecutive texels covers every storage cell exactly once.
    const seen = new Uint8Array(FINE_N);
    for (let i = -1234; i < -1234 + FINE_N; i++) seen[fineIndex(i, 0)]++;
    expect(seen.every((v) => v === 1)).toBe(true);
  });
  it('gains and loses whole coarse texels as the snapped window moves', () => {
    expect(FINE_N % RATIO).toBe(0);
    const a = [0, 0], b = [0, 0], r = new Array(8);
    windowOrigin(10.3, -7.9, a); windowOrigin(10.3 + 0.61, -7.9 - 1.37, b);
    for (const [p, q] of [[a, b], [b, a]]) {
      const n = windowDifference(p[0], p[1], q[0], q[1], r);
      for (let k = 0; k < n * 4; k++) expect(Math.abs(r[k] % RATIO)).toBe(0);
    }
  });
  it('splits a scroll into disjoint strips whose area is the window difference', () => {
    const r = new Array(8);
    const cases = [[0, 0, 12, 0], [0, 0, -24, 36], [100, -50, 100 + 4000, -50 - 12], [0, 0, 0, 0], [0, 0, 5000, 0]];
    for (const [ai, aj, bi, bj] of cases) {
      const n = windowDifference(ai, aj, bi, bj, r);
      const ox = Math.max(0, Math.min(ai, bi) + FINE_N - Math.max(ai, bi)), oz = Math.max(0, Math.min(aj, bj) + FINE_N - Math.max(aj, bj));
      expect(area(r, n)).toBe(FINE_N * FINE_N - ox * oz);
      for (let k = 0; k < n; k++) {
        // Inside a, outside b.
        const cx = (r[k * 4] + r[k * 4 + 2]) / 2, cz = (r[k * 4 + 1] + r[k * 4 + 3]) / 2;
        expect(cx >= ai && cx < ai + FINE_N && cz >= aj && cz < aj + FINE_N).toBe(true);
        expect(cx >= bi && cx < bi + FINE_N && cz >= bj && cz < bj + FINE_N).toBe(false);
      }
      if (n === 2) { // the strips must not overlap
        const ix = Math.min(r[2], r[6]) - Math.max(r[0], r[4]), iz = Math.min(r[3], r[7]) - Math.max(r[1], r[5]);
        expect(ix <= 0 || iz <= 0).toBe(true);
      }
    }
  });
});

describe('coarse page addressing', () => {
  it('covers the bake with 64 × 64 pages of 128 m', () => {
    expect(PAGES).toBe(64); expect(PAGE_M).toBe(128); expect(COARSE_PER_M * RATIO).toBe(FINE_PER_M);
    expect(pageKeyAt(-WORLD_HALF, -WORLD_HALF)).toBe(0);
    expect(pageKeyAt(WORLD_HALF - 0.01, WORLD_HALF - 0.01)).toBe(PAGES * PAGES - 1);
    expect(pageKeyAt(WORLD_HALF, 0)).toBe(-1);
    expect(pageKeyAt(-WORLD_HALF - 0.01, 0)).toBe(-1);
    expect(pageCoord(-1)).toBe(PAGES / 2 - 1);
    expect(pageCoord(0)).toBe(PAGES / 2);
  });
  it('round-trips page key ↔ origin for every page', () => {
    const o = [0, 0];
    for (let k = 0; k < PAGES * PAGES; k++) {
      pageOriginCoarse(k, o);
      expect(pageKey(pageCoord(o[0]), pageCoord(o[1]))).toBe(k);
      expect(pageKey(pageCoord(o[0] + PAGE_N - 1), pageCoord(o[1] + PAGE_N - 1))).toBe(k);
      expect(pageKeyAt((o[0] + 0.5) / COARSE_PER_M, (o[1] + 0.5) / COARSE_PER_M)).toBe(k);
    }
  });
  it('gives each slot texel a unique plane index', () => {
    expect(slotIndex(0, 0, 0)).toBe(0);
    expect(slotIndex(0, 1, 0)).toBe(1);
    expect(slotIndex(0, 0, 1)).toBe(PAGE_N);
    expect(slotIndex(1, 0, 0)).toBe(PAGE_N * PAGE_N);
    expect(slotIndex(2, PAGE_N - 1, PAGE_N - 1) + 1).toBe(slotIndex(3, 0, 0));
    // Each atlas plane and each fine plane fits one WebGPU storage binding (128 MiB default).
    expect(SLOTS * PAGE_N * PAGE_N * 4).toBeLessThanOrEqual(128 * 1024 * 1024);
    expect(FINE_N * FINE_N * 4).toBeLessThanOrEqual(128 * 1024 * 1024);
  });
  it('lists exactly the pages a fine rect touches', () => {
    const keys = [];
    // A strip one coarse texel wide straddling the page boundary at x = 0.
    const i0 = -RATIO, i1 = RATIO, j0 = 0, j1 = RATIO;
    forEachPageInRect(i0, j0, i1, j1, (k) => keys.push(k));
    expect(keys).toEqual([pageKeyAt(-0.1, 0.1), pageKeyAt(0.1, 0.1)]);
    keys.length = 0;
    forEachPageInRect(0, 0, FINE_N, FINE_N, (k) => keys.push(k)); // 85 m window from the origin
    expect(keys.length).toBe(1);
  });
});

describe('packing', () => {
  it('matches IEEE half precision rounding', () => {
    for (const v of [0, 1, -1, 0.5, 65504, 1e-5, -3.14159, 0.1, 2.5e-7, 6.1e-5, 1234.567, 0.0003]) {
      expect(fromHalf(toHalf(v))).toBe(Math.f16round(v));
    }
    let s = 12345;
    for (let k = 0; k < 20000; k++) {
      s = (s * 1103515245 + 12345) >>> 0;
      const v = ((s / 2 ** 32) - 0.5) * 2 ** ((s & 31) - 12);
      expect(fromHalf(toHalf(v))).toBe(Math.f16round(v));
    }
  });
  it('round-trips a page through pack/unpack', () => {
    const a = allocPlanes(), b = allocPlanes(), words = new Uint32Array(PAGE_N * PAGE_N * WORDS);
    for (let i = 0; i < PAGE_N * PAGE_N; i += 97) { a[0][i] = 0.3; a[1][i] = 0.05; a[2][i] = 0.85; a[3][i] = 0.4; a[4][i] = 0.75; a[5][i] = 7 / 255; a[6][i] = 0.2; a[7][i] = 1; }
    packPage(a, words); unpackPage(words, b);
    for (let p = 0; p < 8; p++) for (let i = 0; i < PAGE_N * PAGE_N; i += 97) expect(b[p][i]).toBeCloseTo(a[p][i], 2);
    expect(pack2(1, 0)).toBe(0x3c00);
    expect(pack4(1, 0, 0, 1)).toBe(0xff0000ff);
  });
});

describe('closed-form healing', () => {
  const snow = () => 0, sand = () => 1;
  it('is the identity for zero elapsed time', () => {
    const p = allocPlanes(), tmp = new Float32Array(PAGE_N * PAGE_N);
    p[0][1000] = 0.4; p[3][5] = 0.9;
    healPlanes(p, 0, snow, tmp);
    expect(p[0][1000]).toBeCloseTo(0.4, 6); expect(p[3][5]).toBeCloseTo(0.9, 6);
  });
  it('decays a uniform field exactly by e^(−kt) toward rest, and never heals transform', () => {
    const p = allocPlanes(), tmp = new Float32Array(PAGE_N * PAGE_N);
    p[0].fill(0.5); p[3].fill(1); p[4].fill(1); p[5].fill(9 / 255);
    const t = 300;
    healPlanes(p, t, snow, tmp);
    expect(p[0][777]).toBeCloseTo(0.5 * Math.exp(-DECAY[0] * t), 5);
    expect(p[4][777]).toBeCloseTo(Math.exp(-DECAY[4] * t), 5);  // frozen relaxes to 0
    expect(p[3][777]).toBeCloseTo(Math.exp(-DECAY[3] * t), 5);  // wetness dries
    expect(p[5][777]).toBeCloseTo(9 / 255, 6);                  // transform never heals
  });
  it('heals faster on fast materials', () => {
    const a = allocPlanes(), b = allocPlanes(), tmp = new Float32Array(PAGE_N * PAGE_N);
    a[0].fill(0.5); b[0].fill(0.5);
    healPlanes(a, 200, snow, tmp); healPlanes(b, 200, sand, tmp);
    expect(b[0][0]).toBeLessThan(a[0][0]);
  });
  it('keeps a trail clearly visible after 60 s (BRIEF §4.3)', () => {
    const p = allocPlanes(), tmp = new Float32Array(PAGE_N * PAGE_N);
    // A 1 m wide groove (4 coarse texels), 10 cm deep, across the page.
    for (let j = 0; j < PAGE_N; j++) for (let i = 254; i < 258; i++) p[0][j * PAGE_N + i] = 0.1;
    healPlanes(p, 60, snow, tmp);
    expect(p[0][256 * PAGE_N + 255]).toBeGreaterThan(0.08);
  });
  it('matches an explicit step simulation of diffusion + decay', () => {
    // Reference: small explicit steps of ∂v/∂t = D∇²v − k·v on a smooth bump.
    const N = PAGE_N, h = 1 / COARSE_PER_M, t = 240, k = DECAY[0];
    const ref = new Float64Array(N * N), nxt = new Float64Array(N * N);
    const p = allocPlanes(), tmp = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const dx = (i - 256) * h, dz = (j - 256) * h, v = 0.2 * Math.exp(-(dx * dx + dz * dz) / (2 * 0.6 * 0.6));
      ref[j * N + i] = v; p[0][j * N + i] = v;
    }
    const dt = 0.2 * h * h / DIFFUSION;
    const steps = Math.ceil(t / dt), s = t / steps, c = DIFFUSION * s / (h * h);
    for (let n = 0; n < steps; n++) {
      for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
        const q = j * N + i;
        nxt[q] = (ref[q] + c * (ref[q - 1] + ref[q + 1] + ref[q - N] + ref[q + N] - 4 * ref[q])) * Math.exp(-k * s);
      }
      ref.set(nxt);
    }
    healPlanes(p, t, snow, tmp);
    let err = 0, peak = 0;
    for (let q = 0; q < N * N; q++) { err = Math.max(err, Math.abs(p[0][q] - ref[q])); peak = Math.max(peak, ref[q]); }
    expect(err / peak).toBeLessThan(0.03);
  });
  it('composes: healing t1 then t2 ≈ healing t1 + t2', () => {
    const a = allocPlanes(), b = allocPlanes(), tmp = new Float32Array(PAGE_N * PAGE_N);
    for (let j = 200; j < 300; j++) for (let i = 240; i < 250; i++) { a[0][j * PAGE_N + i] = 0.15; b[0][j * PAGE_N + i] = 0.15; }
    healPlanes(a, 400, snow, tmp); healPlanes(a, 800, snow, tmp);
    healPlanes(b, 1200, snow, tmp);
    let err = 0;
    for (let q = 0; q < PAGE_N * PAGE_N; q++) err = Math.max(err, Math.abs(a[0][q] - b[0][q]));
    expect(err).toBeLessThan(0.15 * 0.04);
  });
  it('builds box radii whose variance approximates the Gaussian', () => {
    for (const sigma of [GAUSS_MAX, 12, 40, 150]) {
      const r = boxRadii(sigma);
      const variance = r.reduce((s, x) => s + ((2 * x + 1) ** 2 - 1) / 12, 0);
      expect(Math.abs(Math.sqrt(variance) - sigma) / sigma).toBeLessThan(0.08);
    }
  });
});
