// The ravines' cliff lines for the wall kit (D7b, src/world/canyonKit.js). The canyon walls are
// 12 m strata ledges cut into the 2 m height (ravines.mjs); at 2–3 cells a riser is too narrow for
// the grid, which draws it as sawtooth facets. Here every riser is traced as a contour on the
// carved height (marching squares at a fixed height just above its foot), linked into polylines,
// resampled and smoothed (the grid's stair-steps gone), and measured: how far back and how high
// the riser climbs before the next tread or the rim (the cliff's cap). The game builds sandstone
// cliff faces along these lines in front of the terrain riser, which stays the collision.
//
// Also exported: the ravine spines (centre lines, half-widths and floor heights) for the slot kit.
// Deterministic: + − × ÷, comparisons, sqrt/floor/abs/min/max/atan2 only, fixed iteration order.

import { STRATA } from './ravinesData.mjs';
import { KIND } from './ravines.mjs';

const sqrt = Math.sqrt;
/** Height of the contour above its riser's foot (m): the face's foot sits just above the tread. */
export const ISO_UP = 1.5;
const STEP = 1.0;        // resample spacing (m)
const SMOOTH = 4;        // smoothing half-window (samples) — removes the 2 m grid's stair-steps
const OUT_STEP = 2;      // every 2nd resampled point is written (2 m); the game re-subdivides
const MIN_LEN = 14;      // shorter lines are dropped (m)
const MIN_RISE = 3;      // a riser lower than this above the contour is no cliff (m)

const r2 = (v) => Math.round(v * 100) / 100;

/**
 * @param {Uint16Array} h2  carved 2 m height
 * @param {Uint8Array} mask  ravines.mjs KIND per 2 m cell
 * @param {{ offset: number, scale: number }} enc
 * @param {any[]} feats  ravines.mjs features (spines)
 */
export function ravineWalls(h2, mask, n2, c2, half, enc, feats, roadDist = null) {
  // The window round the ravines' wall cells (with a margin), as floats.
  let i0 = n2, i1 = -1, j0 = n2, j1 = -1;
  for (let j = 0; j < n2; j++) for (let i = 0; i < n2; i++) if (mask[j * n2 + i] === KIND.wall) {
    if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j;
  }
  if (i1 < 0) return { iso: ISO_UP, walls: [], spines: [] };
  const M = 8; i0 = Math.max(0, i0 - M); j0 = Math.max(0, j0 - M); i1 = Math.min(n2 - 1, i1 + M); j1 = Math.min(n2 - 1, j1 + M);
  const W = i1 - i0 + 1, H = j1 - j0 + 1;
  const hf = new Float64Array(W * H), near = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) hf[j * W + i] = h2[(j + j0) * n2 + i + i0] / enc.scale - enc.offset;
  // Cells within 3 of a wall cell (the riser contour can sit at a wall's floor edge); none at a
  // ford (its walls ease into sand ramps: ravines.mjs).
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (mask[(j + j0) * n2 + i + i0] !== KIND.wall) continue;
    if (roadDist && roadDist(-half + (i + i0 + 0.5) * c2, half - (j + j0 + 0.5) * c2) < 60) continue;
    for (let b = -3; b <= 3; b++) for (let a = -3; a <= 3; a++) { const jj = j + b, ii = i + a; if (jj >= 0 && jj < H && ii >= 0 && ii < W) near[jj * W + ii] = 1; }
  }
  // World position of window grid point (i, j) (cell centres) and bilinear height at world (x, z).
  const wx = (i) => -half + (i + i0 + 0.5) * c2, wz = (j) => half - (j + j0 + 0.5) * c2;
  const hAt = (x, z) => {
    const u = (x + half) / c2 - 0.5 - i0, v = (half - z) / c2 - 0.5 - j0;
    let i = Math.floor(u), j = Math.floor(v); const fu = u - i, fv = v - j;
    i = i < 0 ? 0 : i > W - 2 ? W - 2 : i; j = j < 0 ? 0 : j > H - 2 ? H - 2 : j;
    const a = hf[j * W + i], b = hf[j * W + i + 1], d = hf[(j + 1) * W + i], e = hf[(j + 1) * W + i + 1];
    return (a + (b - a) * fu) + ((d + (e - d) * fu) - (a + (b - a) * fu)) * fv;
  };

  // Levels: every strata ledge whose foot lies within the window's height range.
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < W * H; k++) if (near[k]) { if (hf[k] < lo) lo = hf[k]; if (hf[k] > hi) hi = hf[k]; }
  // Marching squares over a field f (window grid) at level `iso`, within cells passing keep(k):
  // polylines of world points.
  const contours = (f, iso, keep) => {
    const segs = [];
    const pt = new Map();
    const cross = (i, j, e) => {
      const k = e === 0 ? (j * W + i) * 2 : (j * W + i) * 2 + 1; // 0: edge (i,j)-(i+1,j); 1: (i,j)-(i,j+1)
      if (!pt.has(k)) {
        const a = f[j * W + i], b = e === 0 ? f[j * W + i + 1] : f[(j + 1) * W + i], t = (iso - a) / (b - a);
        pt.set(k, e === 0 ? [wx(i) + t * c2, wz(j)] : [wx(i), wz(j) - t * c2]);
      }
      return k;
    };
    for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
      if (!keep(j * W + i)) continue;
      const a = f[j * W + i] > iso, b = f[j * W + i + 1] > iso, c = f[(j + 1) * W + i + 1] > iso, d = f[(j + 1) * W + i] > iso;
      const code = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const T = () => cross(i, j, 0), R = () => cross(i + 1, j, 1), B = () => cross(i, j + 1, 0), Lf = () => cross(i, j, 1);
      const add = (p, q) => segs.push([p, q]);
      switch (code) {
        case 1: case 14: add(Lf(), T()); break;
        case 2: case 13: add(T(), R()); break;
        case 3: case 12: add(Lf(), R()); break;
        case 4: case 11: add(R(), B()); break;
        case 6: case 9: add(T(), B()); break;
        case 7: case 8: add(Lf(), B()); break;
        case 5: add(Lf(), T()); add(R(), B()); break;
        case 10: add(T(), R()); add(Lf(), B()); break;
      }
    }
    // Link segments into polylines (each edge point joins at most two segments): open ends first.
    const adj = new Map();
    segs.forEach(([p, q], si) => { for (const k of [p, q]) { if (!adj.has(k)) adj.set(k, []); adj.get(k).push(si); } });
    const used = new Uint8Array(segs.length);
    const walk = (si, from) => {
      const line = [from]; let cur = si, at = from;
      while (cur >= 0 && !used[cur]) {
        used[cur] = 1;
        const [p, q] = segs[cur], nxt = p === at ? q : p;
        line.push(nxt); at = nxt;
        cur = -1; for (const t of adj.get(at)) if (!used[t]) { cur = t; break; }
      }
      return line;
    };
    const lines = [];
    for (const k of [...adj.keys()].sort((a, b) => a - b)) if (adj.get(k).length === 1) { const si = adj.get(k)[0]; if (!used[si]) lines.push(walk(si, k)); }
    for (let si = 0; si < segs.length; si++) if (!used[si]) lines.push(walk(si, segs[si][0]));
    return lines.map((keys) => keys.map((k) => pt.get(k)));
  };

  const walls = [];
  // Every strata riser: the contour just above its foot, on the height itself.
  for (let L = Math.floor(lo / STRATA); L * STRATA <= hi; L++) {
    const iso = L * STRATA + ISO_UP;
    for (const raw of contours(hf, iso, (k) => near[k])) {
      const runs = measure(resample(raw), () => iso, hAt);
      if (runs) for (const pts of runs) walls.push({ L, iso: r2(iso), pts });
    }
  }
  // The bottom riser of each wall: the canyon floor follows the ground, so it rarely sits on a
  // strata height and the step from it to the first ledge has no contour above. Trace it on the
  // height above the local floor (the nearest spine's) instead; its foot height varies per point.
  // The local floor: the nearest spine's floor height, interpolated along the spine (projected onto
  // its nearest segment). A per-point floor stepped at every spine point, and the field's contour
  // broke into scraps at each step.
  const floors = feats.filter((f) => f.F).map((f) => ({ x: f.c.x, z: f.c.z, F: f.F, n: f.c.n }));
  const floorAt = (x, z) => {
    let bd = 1e18, fl = 0;
    for (const sp of floors) for (let k = 0; k < sp.n - 1; k++) {
      const ax = sp.x[k], az = sp.z[k], ex = sp.x[k + 1] - ax, ez = sp.z[k + 1] - az, l2 = ex * ex + ez * ez || 1;
      let t = ((x - ax) * ex + (z - az) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - ax - ex * t, dz = z - az - ez * t, d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; fl = sp.F[k] + (sp.F[k + 1] - sp.F[k]) * t; }
    }
    return fl;
  };
  // Only within reach of a wall matters, but every cell gets its real value (a filler next to a
  // wall would have drawn a false contour along the edge of the zone).
  const above = new Float64Array(W * H);
  const reach = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (near[j * W + i]) for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
    const jj = j + b, ii = i + a; if (jj >= 0 && jj < H && ii >= 0 && ii < W) reach[jj * W + ii] = 1;
  }
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i; above[k] = reach[k] ? hf[k] - floorAt(wx(i), wz(j)) : 1e4; }
  // A cell is in play when its lowest corner is within one strata of the floor (a test on one
  // corner skipped the cells of a diagonal wall whose high corner it happened to be, breaking the line).
  const lowCell = (k) => near[k] && Math.min(above[k], above[k + 1], above[k + W], above[k + W + 1]) < STRATA + 4;
  for (const raw of contours(above, ISO_UP, lowCell)) {
    const runs = measure(resample(raw), (x, z) => floorAt(x, z) + ISO_UP, hAt);
    if (runs) for (const pts of runs) walls.push({ L: -1, iso: r2(pts[0][6]), pts });
  }
  // Spines for the slot kit and the map: every 4th point (8 m), with half-width and floor height.
  const spines = feats.filter((f) => f.F).map((f) => {
    const pts = [];
    for (let k = 0; k < f.c.n; k += 4) pts.push([r2(f.c.x[k]), r2(f.c.z[k]), r2(f.W[k]), r2(f.F[k])]);
    return { id: f.id, kind: f.kind, pts };
  });
  return { iso: ISO_UP, strata: STRATA, walls, spines };
}

/** Polyline → points every STEP m along it, then smoothed (ends pinned). */
function resample(P) {
  if (P.length < 2) return [];
  const out = [P[0]];
  let carry = 0;
  for (let k = 1; k < P.length; k++) {
    const [ax, az] = P[k - 1], [bx, bz] = P[k], dx = bx - ax, dz = bz - az, l = sqrt(dx * dx + dz * dz);
    let t = STEP - carry;
    while (t <= l) { out.push([ax + dx * t / l, az + dz * t / l]); t += STEP; }
    carry = l - (t - STEP);
  }
  const n = out.length, sm = [];
  for (let k = 0; k < n; k++) {
    const w = Math.min(SMOOTH, k, n - 1 - k);
    let sx = 0, sz = 0;
    for (let m = -w; m <= w; m++) { sx += out[k + m][0]; sz += out[k + m][1]; }
    sm.push([sx / (2 * w + 1), sz / (2 * w + 1)]);
  }
  return sm;
}

/**
 * For each point: the horizontal normal toward the low side (out of the wall) and how the riser
 * climbs behind it — marched in 0.5 m steps until the ground flattens (the next tread, or the rim
 * and the dunes beyond): `top` height and `depth` back from the line. Points where the riser is too
 * low split the line. Returns the runs, each [[x, z, nx, nz, top, depth, iso], …] (every OUT_STEP-th point), or null.
 */
function measure(P, isoAt, hAt) {
  const n = P.length;
  if (n * STEP < MIN_LEN) return null;
  const rows = [];
  for (let k = 0; k < n; k++) {
    const a = P[Math.max(0, k - 2)], b = P[Math.min(n - 1, k + 2)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = sqrt(tx * tx + tz * tz) || 1; tx /= tl; tz /= tl;
    let nx = -tz, nz = tx;
    const [x, z] = P[k];
    const iso = isoAt(x, z);
    // Out of the wall is downhill.
    if (hAt(x + nx * 2, z + nz * 2) > hAt(x - nx * 2, z - nz * 2)) { nx = -nx; nz = -nz; }
    let prev = hAt(x, z), top = prev, depth = 0;
    for (let u = 0.5; u <= 16; u += 0.5) {
      const h = hAt(x - nx * u, z - nz * u);
      if (u >= 1.5 && h - prev < 0.12) break;   // flattened: under 0.24 m per metre
      // A sheer wall (the Stride, the slots) has no tread: this face ends where the next band's
      // contour takes over, one strata up.
      if (h >= iso + STRATA) { top = iso + STRATA; depth = u; break; }
      top = h; depth = u; prev = h;
    }
    rows.push([x, z, nx, nz, top, depth, iso]);
  }
  // Keep runs where the cliff is tall enough (smooth the top a little first).
  const ok = rows.map((r) => r[4] - r[6] >= MIN_RISE);
  let s = -1;
  const runs = [];
  for (let k = 0; k <= n; k++) {
    if (k < n && ok[k]) { if (s < 0) s = k; continue; }
    if (s >= 0 && (k - s) * STEP >= MIN_LEN) runs.push([s, k]);
    s = -1;
  }
  return runs.map(([a, b]) => {
    const pts = [];
    for (let k = a; k < b; k += OUT_STEP) { const r = rows[k]; pts.push([r2(r[0]), r2(r[1]), r2(r[2]), r2(r[3]), r2(r[4]), r2(r[5]), r2(r[6])]); }
    if ((b - 1 - a) % OUT_STEP) { const r = rows[b - 1]; pts.push([r2(r[0]), r2(r[1]), r2(r[2]), r2(r[3]), r2(r[4]), r2(r[5]), r2(r[6])]); }
    return pts;
  });
}
