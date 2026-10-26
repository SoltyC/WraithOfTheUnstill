// Ravines carved into the 2 m macro height (docs/phase-9/dunes-design.md §7): the Red Galleries
// (canyon with ledged strata walls), slot-canyon trenches (10 m wide, walls dressed later by the
// D7b kit), the Dry Braids (braided wadis) and the Stride (the rift). Cut-only: a cell only ever
// goes down, so everything outside a ravine's footprint is byte-identical to the bake without it.
//
// Canyons follow the ground: the floor is the low rim, low-passed along the spine, minus the wall
// depth; the strata ledges sit at multiples of STRATA above sea level so they line up across the
// canyon and with the rock material's bands. A caravan road crossing a canyon lays a ford: the
// depth fades out within ~130 m of it (the Dry Stair).
//
// Determinism (as the rest of the bake): + − × ÷, comparisons, sqrt/floor/abs/min/max and gnoise.

import { smooth } from './geography.mjs';
import { gfbm } from '../../src/terrain/gnoise.js';
import { CANYONS, SLOTS, WADIS, RIFT, STRATA } from './ravinesData.mjs';

const sqrt = Math.sqrt, SEED = 9100;
export const KIND = { none: 0, floor: 1, wall: 2, wadi: 3 };

/** Catmull-Rom through control points, ~step m apart: Float64Array of x, z pairs plus arc length. */
function densify(P, step) {
  const xs = [], zs = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i > 0 ? i - 1 : 0], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2 < P.length ? i + 2 : P.length - 1];
    const dx = p2[0] - p1[0], dz = p2[1] - p1[1], n = Math.max(2, Math.floor(sqrt(dx * dx + dz * dz) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      xs.push(f(p0[0], p1[0], p2[0], p3[0])); zs.push(f(p0[1], p1[1], p2[1], p3[1]));
    }
  }
  xs.push(P[P.length - 1][0]); zs.push(P[P.length - 1][1]);
  const n = xs.length, s = new Float64Array(n), nx = new Float64Array(n), nz = new Float64Array(n);
  for (let i = 1; i < n; i++) { const dx = xs[i] - xs[i - 1], dz = zs[i] - zs[i - 1]; s[i] = s[i - 1] + sqrt(dx * dx + dz * dz); }
  for (let i = 0; i < n; i++) {
    const a = i > 0 ? i - 1 : 0, b = i < n - 1 ? i + 1 : n - 1, dx = xs[b] - xs[a], dz = zs[b] - zs[a], l = sqrt(dx * dx + dz * dz) || 1;
    nx[i] = -dz / l; nz[i] = dx / l;
  }
  return { n, x: Float64Array.from(xs), z: Float64Array.from(zs), s, nx, nz, L: s[n - 1] };
}
/** Let the spine meander (lateral noise along its length), ends pinned. */
function wander(c, amp, seed) {
  for (let i = 0; i < c.n; i++) {
    const e = Math.min(smooth(0, 60, c.s[i]), smooth(0, 60, c.L - c.s[i])), o = amp * e * 1.6 * gfbm(c.s[i] / 240, 0.37, 3, seed);
    c.x[i] += c.nx[i] * o; c.z[i] += c.nz[i] * o;
  }
}
const lerp = (a, b, t) => a + (b - a) * t;
const terrace = (y) => { const q = y / STRATA, f = Math.floor(q); return (f + smooth(0.45, 0.9, q - f)) * STRATA; };

/**
 * @param {Uint16Array} h2 2 m height (u16, modified in place: cut only)
 * @param {{ offset: number, scale: number }} enc  stored = (h + offset) * scale
 * @param {Array<Array<[number, number]>>} roads  polylines the canyons ford (the Dry Stair)
 */
export function carveRavines(h2, n2, c2, half, enc, roads = []) {
  const orig = h2.slice();
  const mask = new Uint8Array(n2 * n2);
  const H = (i, j) => orig[(j < 0 ? 0 : j >= n2 ? n2 - 1 : j) * n2 + (i < 0 ? 0 : i >= n2 ? n2 - 1 : i)] / enc.scale - enc.offset;
  const ground = (x, z) => {
    const u = (x + half) / c2 - 0.5, v = (half - z) / c2 - 0.5, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const a = H(i, j), b = H(i + 1, j), d = H(i, j + 1), e = H(i + 1, j + 1);
    return (a + (b - a) * fu) + ((d + (e - d) * fu) - (a + (b - a) * fu)) * fv;
  };
  const roadD = roads.map((r) => densify(r, 20));
  const dRoad = (x, z) => { let best = 1e18; for (const r of roadD) for (let k = 0; k < r.n; k++) { const dx = x - r.x[k], dz = z - r.z[k], d2 = dx * dx + dz * dz; if (d2 < best) best = d2; } return sqrt(best); };
  const feats = [];
  const cut = (x, z, i, j, target, kind) => {
    const k = j * n2 + i;
    const g = orig[k] / enc.scale - enc.offset;
    if (target >= g - 0.02) return;
    const q = Math.round((target + enc.offset) * enc.scale);
    if (q < h2[k]) h2[k] = q;
    if (kind > mask[k]) mask[k] = kind;
  };
  // Nearest point on the spine: writes dist, t (fractional index) into out.
  const near = (c, x, z, out) => {
    let bk = 0, bd = 1e18;
    for (let k = 0; k < c.n; k++) { const dx = x - c.x[k], dz = z - c.z[k], d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; bk = k; } }
    let best = bd, bt = bk;
    for (let k = Math.max(0, bk - 1); k < Math.min(c.n - 1, bk + 1); k++) {
      const ax = c.x[k], az = c.z[k], ex = c.x[k + 1] - ax, ez = c.z[k + 1] - az, l2 = ex * ex + ez * ez || 1;
      let t = ((x - ax) * ex + (z - az) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + ex * t - x, pz = az + ez * t - z, d2 = px * px + pz * pz;
      if (d2 < best) { best = d2; bt = k + t; }
    }
    out.d = sqrt(best); out.t = bt;
  };
  const q = { d: 0, t: 0 };
  const bbox = (c, m) => {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let k = 0; k < c.n; k++) { if (c.x[k] < x0) x0 = c.x[k]; if (c.x[k] > x1) x1 = c.x[k]; if (c.z[k] < z0) z0 = c.z[k]; if (c.z[k] > z1) z1 = c.z[k]; }
    return { i0: Math.max(0, Math.floor((x0 - m + half) / c2)), i1: Math.min(n2 - 1, Math.floor((x1 + m + half) / c2)), j0: Math.max(0, Math.floor((half - z1 - m) / c2)), j1: Math.min(n2 - 1, Math.floor((half - z0 + m) / c2)) };
  };
  const at = (arr, t) => { const i = Math.min(arr.length - 2, Math.floor(t)); return lerp(arr[i], arr[i + 1], t - i); };

  // Trenches: canyons, galleries, slots and the rift share one routine.
  const trench = (def, c, W, F, jag, ledges) => {
    const m = Math.max(...W) + 130 + (def.slope < 3 ? 90 : 30), B = bbox(c, m);
    for (let j = B.j0; j <= B.j1; j++) for (let i = B.i0; i <= B.i1; i++) {
      const x = -half + (i + 0.5) * c2, z = half - (j + 0.5) * c2;
      near(c, x, z, q);
      if (q.d > m) continue;
      const w = at(W, q.t), f = at(F, q.t);
      const up = q.d - w - (jag > 0 ? jag * gfbm(x / 26, z / 26, 2, SEED + 31) : 0);
      if (up <= 0) { cut(x, z, i, j, f, KIND.floor); continue; }
      const raw = f + def.slope * up;
      cut(x, z, i, j, ledges ? Math.max(f, terrace(raw)) : raw, KIND.wall);
    }
  };
  const lowpass = (a, win) => { const out = new Float64Array(a.length); for (let k = 0; k < a.length; k++) { let s = 0, w = 0; for (let m = -win; m <= win; m++) { const kk = k + m; if (kk < 0 || kk >= a.length) continue; s += a[kk]; w++; } out[k] = s / w; } return out; };
  const spines = {};

  for (const def of CANYONS) {
    const c = densify(def.pts, 8); wander(c, def.wander, SEED + feats.length);
    const W = new Float64Array(c.n), F = new Float64Array(c.n), Gl = new Float64Array(c.n), D = new Float64Array(c.n);
    for (let k = 0; k < c.n; k++) {
      const n01 = (a) => { const v = 0.5 + 0.8 * a; return v < 0 ? 0 : v > 1 ? 1 : v; };
      W[k] = lerp(def.w[0], def.w[1], n01(gfbm(c.s[k] / 420, 1.7, 2, SEED + 11)));
      D[k] = lerp(def.depth[0], def.depth[1], n01(gfbm(c.s[k] / 350, 3.1, 2, SEED + 12)));
      let g = 1e9;
      for (const o of [0, 1, -1]) for (const r of [W[k] + 30, W[k] + 90]) g = Math.min(g, ground(c.x[k] + c.nx[k] * o * r, c.z[k] + c.nz[k] * o * r));
      Gl[k] = g;
    }
    const lp = lowpass(Gl, 18);
    for (let k = 0; k < c.n; k++) {
      const ford = smooth(40, 130, dRoad(c.x[k], c.z[k]));
      F[k] = lp[k] - D[k] * (0.1 + 0.9 * ford);
      W[k] *= 0.6 + 0.4 * ford;
    }
    if (def.parent) { // meet the parent's floor at the junction, then follow our own
      const p = spines[def.parent]; let bk = 0, bd = 1e18;
      for (let k = 0; k < p.c.n; k++) { const dx = c.x[0] - p.c.x[k], dz = c.z[0] - p.c.z[k], d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; bk = k; } }
      for (let k = 0; k < c.n; k++) F[k] = lerp(p.F[bk], F[k], smooth(0, 140, c.s[k]));
    }
    spines[def.id] = { c, W, F };
    trench(def, c, W, F, 5, true);
    feats.push({ id: def.id, kind: def.kind, c, W, F });
  }
  for (const def of SLOTS) {
    const c = densify(def.pts, 6); wander(c, def.wander, SEED + 50 + feats.length);
    const p = spines[def.parent]; let bk = 0, bd = 1e18;
    for (let k = 0; k < p.c.n; k++) { const dx = c.x[0] - p.c.x[k], dz = c.z[0] - p.c.z[k], d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; bk = k; } }
    const W = new Float64Array(c.n).fill(def.half), F = new Float64Array(c.n);
    for (let k = 0; k < c.n; k++) F[k] = p.F[bk] + def.rise * c.s[k];
    trench({ slope: 12 }, c, W, F, 0, false);
    feats.push({ id: def.id, kind: def.kind, c, W, F });
  }
  {
    const def = RIFT, c = densify(def.pts, 8); wander(c, def.wander, SEED + 90);
    const W = new Float64Array(c.n), F = new Float64Array(c.n), Gl = new Float64Array(c.n);
    for (let k = 0; k < c.n; k++) {
      W[k] = lerp(def.w[0], def.w[1], Math.max(0, Math.min(1, 0.5 + 0.8 * gfbm(c.s[k] / 200, 5.5, 2, SEED + 21))));
      let g = 1e9; for (const o of [0, 1, -1]) g = Math.min(g, ground(c.x[k] + c.nx[k] * o * 70, c.z[k] + c.nz[k] * o * 70));
      Gl[k] = g;
    }
    const lp = lowpass(Gl, 10);
    for (let k = 0; k < c.n; k++) {
      let br = 1; for (const b of def.bridges) br = Math.min(br, smooth(10, 34, Math.abs(c.s[k] - b * c.L)));
      F[k] = lp[k] - def.depth * br; W[k] *= 0.5 + 0.5 * br;
    }
    trench(def, c, W, F, 6, false);
    feats.push({ id: def.id, kind: def.kind, c, W, F, bridges: def.bridges.map((b) => b * c.L) });
  }
  // Wadis: a main bed and two braids round gravel bars; flat-bottomed with eased banks.
  for (const def of WADIS) {
    const main = densify(def.pts, 10); wander(main, 30, SEED + 70 + feats.length);
    for (const [name, off, wf, df] of [['main', 0, 0.5, 1], ['braid-l', -0.62, 0.34, 0.75], ['braid-r', 0.62, 0.3, 0.7]]) {
      const c = { ...main, x: Float64Array.from(main.x), z: Float64Array.from(main.z) };
      for (let k = 0; k < c.n; k++) { const o = off * def.half * (0.7 + 0.5 * gfbm(c.s[k] / 170, 8.8 + off, 2, SEED + 41)); c.x[k] += c.nx[k] * o; c.z[k] += c.nz[k] * o; }
      const wc = def.half * wf, B = bbox(c, wc + 8);
      for (let j = B.j0; j <= B.j1; j++) for (let i = B.i0; i <= B.i1; i++) {
        const x = -half + (i + 0.5) * c2, z = half - (j + 0.5) * c2;
        near(c, x, z, q);
        if (q.d > wc) continue;
        const e = q.t / (c.n - 1), pinch = smooth(0, 0.05, e) * smooth(0, 0.05, 1 - e);
        cut(x, z, i, j, ground(x, z) - def.depth * df * pinch * (1 - smooth(0.5, 1, q.d / wc)), KIND.wadi);
      }
      if (name === 'main') feats.push({ id: def.id, kind: def.kind, c, W: new Float64Array(c.n).fill(def.half) });
    }
  }
  return { mask, feats };
}

/** Flat weight (0..1) of the ravines at (x, z) for the dune-type map: floors and rims lose their dunes. */
export function ravineFlat(feats, x, z) {
  let f = 0;
  for (const ft of feats) {
    const c = ft.c, rim = ft.kind === 'wadi' ? 0.7 : 1, pad = ft.kind === 'rift' ? 36 : 56;
    for (let k = 0; k < c.n; k += 2) {
      const dx = x - c.x[k], dz = z - c.z[k], d2 = dx * dx + dz * dz, r = ft.W[k] + pad;
      if (d2 >= r * r) continue;
      const v = rim * (1 - smooth(ft.W[k] + 4, r, sqrt(d2)));
      if (v > f) f = v;
    }
  }
  return f;
}
