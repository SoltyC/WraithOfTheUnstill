// The Dry Stair: the escarpment descent from the meadow to the erg, a caravan road found by search
// like the hill stair and the Shapers' Run (story.mjs, hill.mjs): the route that needs the least
// earthwork at a caravan's grade, then graded onto the 4 m macro height (cut and fill, walls eased).
//
//   1. A* over an 8 m grid: moves are limited to a natural grade, cost is length plus the cross-slope
//      (the cut a road would need), with a small turn penalty (switchbacks come out where the face
//      is too steep to traverse straight).
//   2. The path is smoothed, then its floor follows the ground at no more than MAX_GRADE.
//   3. Floor and walls are written into h4 (only east of x = 1000: the meadow stays untouched).
//
// Determinism (as the rest of the bake): + − × ÷, comparisons, sqrt/floor/abs/min/max.

import { smooth } from './geography.mjs';

export const DRY_STAIR = {
  id: 'dry-stair',
  /** Top of the descent (on the meadow's lip) and the foot, at the Wellhouse's playa. */
  from: [1040, 380], to: [1800, 700],
  box: [1000, 150, 1900, 900],       // x0, z0, x1, z1 of the search
  half: 4.5, wall: 6, wallPerM: 0.9,  // road half-width, wall blend (base, per m of cut)
  maxGrade: 0.12, stepGrade: 0.17,    // the road's grade; the natural grade a search move may cross
};

const sqrt = Math.sqrt;

function sample(h4, n4, c4, half, x, z) {
  const u = (x + half) / c4 - 0.5, v = (half - z) / c4 - 0.5;
  const i = Math.max(0, Math.min(n4 - 2, Math.floor(u))), j = Math.max(0, Math.min(n4 - 2, Math.floor(v)));
  const fu = Math.max(0, Math.min(1, u - i)), fv = Math.max(0, Math.min(1, v - j));
  const a = h4[j * n4 + i], b = h4[j * n4 + i + 1], d = h4[(j + 1) * n4 + i], e = h4[(j + 1) * n4 + i + 1];
  return (a + (b - a) * fu) + ((d + (e - d) * fu) - (a + (b - a) * fu)) * fv;
}

/** A* on an 8 m grid; returns [[x, z], …] from `from` to `to`. */
function search(h, D) {
  const G = 8, [bx0, bz0, bx1, bz1] = D.box, W = Math.floor((bx1 - bx0) / G), H = Math.floor((bz1 - bz0) / G);
  const X = (i) => bx0 + (i + 0.5) * G, Z = (j) => bz0 + (j + 0.5) * G;
  const cell = (p) => [Math.max(0, Math.min(W - 1, Math.floor((p[0] - bx0) / G))), Math.max(0, Math.min(H - 1, Math.floor((p[1] - bz0) / G)))];
  const hh = new Float64Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) hh[j * W + i] = h(X(i), Z(j));
  const moves = [];
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
    if (!di && !dj) continue;
    if ((Math.abs(di) === 2 && Math.abs(dj) === 2)) continue;
    moves.push([di, dj, sqrt(di * di + dj * dj) * G]);
  }
  const s = cell(D.from), t = cell(D.to), S = s[1] * W + s[0], T = t[1] * W + t[0];
  const g = new Float64Array(W * H).fill(1e18), came = new Int32Array(W * H).fill(-1), dir = new Int8Array(W * H).fill(-1);
  const heap = [[0, S]];
  const push = (e) => { heap.push(e); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { let m = k; const l = 2 * k + 1, r = l + 1; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  g[S] = 0;
  const hx = (c) => { const i = c % W, j = (c - i) / W; return sqrt((i - t[0]) * (i - t[0]) + (j - t[1]) * (j - t[1])) * G; };
  while (heap.length) {
    const [, c] = pop();
    if (c === T) break;
    const i = c % W, j = (c - i) / W;
    for (let m = 0; m < moves.length; m++) {
      const ni = i + moves[m][0], nj = j + moves[m][1];
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const n = nj * W + ni, len = moves[m][2];
      const dh = hh[n] - hh[c];
      if (Math.abs(dh) > D.stepGrade * len) continue;
      // Cross-slope: the ground's rise sideways at the midpoint (what the road would have to cut).
      const mx = (X(i) + X(ni)) / 2, mz = (Z(j) + Z(nj)) / 2, ux = (X(ni) - X(i)) / len, uz = (Z(nj) - Z(j)) / len;
      const side = (h(mx - uz * 8, mz + ux * 8) - h(mx + uz * 8, mz - ux * 8)) / 16;
      let cost = len * (1 + 14 * side * side + 2 * Math.abs(dh) / len);
      const pd = dir[c];
      if (pd >= 0) { const px = moves[pd][0] * G, pz = moves[pd][1] * G, pl = moves[pd][2]; const cosA = (px * ux * len + pz * uz * len) / (pl * len); cost += 20 * (1 - cosA); }
      const ng = g[c] + cost;
      if (ng < g[n]) { g[n] = ng; came[n] = c; dir[n] = m; push([ng + hx(n) * 1.0, n]); }
    }
  }
  const path = [];
  for (let c = T; c >= 0; c = came[c]) { path.push([X(c % W), Z((c - (c % W)) / W)]); if (c === S) break; }
  path.reverse();
  path[0] = [D.from[0], D.from[1]]; path[path.length - 1] = [D.to[0], D.to[1]];
  return path;
}

/** Moving-average smoothing (ends pinned), then ~6 m spacing. */
function smoothPath(P, iters) {
  let Q = P.map((p) => [p[0], p[1]]);
  for (let it = 0; it < iters; it++) {
    const R = Q.map((p) => [p[0], p[1]]);
    for (let i = 1; i < Q.length - 1; i++) { R[i][0] = (Q[i - 1][0] + 2 * Q[i][0] + Q[i + 1][0]) / 4; R[i][1] = (Q[i - 1][1] + 2 * Q[i][1] + Q[i + 1][1]) / 4; }
    Q = R;
  }
  const out = [Q[0]];
  for (let i = 1; i < Q.length; i++) {
    const dx = Q[i][0] - Q[i - 1][0], dz = Q[i][1] - Q[i - 1][1], n = Math.max(1, Math.round(sqrt(dx * dx + dz * dz) / 6));
    for (let k = 1; k <= n; k++) out.push([Q[i - 1][0] + dx * k / n, Q[i - 1][1] + dz * k / n]);
  }
  return out;
}

/**
 * Carve the Dry Stair into h4 (in place). Returns the route: { id, kind, width, length, drop, points: [x, z, s, floor] } .
 */
export function carveDryStair(h4, n4, c4, half, D = DRY_STAIR) {
  const h = (x, z) => sample(h4, n4, c4, half, x, z);
  const raw = search(h, D);
  const pts = smoothPath(smoothPath(raw, 6), 0), n = pts.length;
  const s = new Float64Array(n);
  for (let i = 1; i < n; i++) { const dx = pts[i][0] - pts[i - 1][0], dz = pts[i][1] - pts[i - 1][1]; s[i] = s[i - 1] + sqrt(dx * dx + dz * dz); }
  // Floor: the ground, low-passed (±30 m), held to the road's grade forward and back.
  const nat = new Float64Array(n), lp = new Float64Array(n), floor = new Float64Array(n);
  for (let i = 0; i < n; i++) nat[i] = h(pts[i][0], pts[i][1]);
  for (let i = 0; i < n; i++) { let a = 0, w = 0; for (let k = -5; k <= 5; k++) { const q = i + k; if (q < 0 || q >= n) continue; a += nat[q]; w++; } lp[i] = a / w; }
  floor[0] = lp[0];
  for (let i = 1; i < n; i++) { const d = D.maxGrade * (s[i] - s[i - 1]); floor[i] = Math.max(floor[i - 1] - d, Math.min(floor[i - 1] + d, lp[i])); }
  for (let i = n - 2; i >= 0; i--) { const d = D.maxGrade * (s[i + 1] - s[i]); floor[i] = Math.max(floor[i + 1] - d, Math.min(floor[i + 1] + d, floor[i])); }
  const X = (i) => -half + (i + 0.5) * c4, Z = (j) => half - (j + 0.5) * c4;
  const margin = D.half + D.wall + D.wallPerM * 40;
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  for (const p of pts) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }
  const i0 = Math.max(0, Math.floor((minx - margin + half) / c4)), i1 = Math.min(n4 - 1, Math.floor((maxx + margin + half) / c4));
  const j0 = Math.max(0, Math.floor((half - maxz - margin) / c4)), j1 = Math.min(n4 - 1, Math.floor((half - minz + margin) / c4));
  const edits = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = X(i), z = Z(j);
    if (x < 1030) continue;                       // the meadow stays untouched
    let best = 0, bd = 1e18;
    for (let q = 0; q < n; q++) { const dx = x - pts[q][0], dz = z - pts[q][1], d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = q; } }
    const d = sqrt(bd);
    if (d > margin) continue;
    const c = j * n4 + i, cur = h4[c], target = floor[best], delta = cur - target;
    const wall = D.wall + D.wallPerM * Math.abs(delta);
    const w = d <= D.half ? 1 : 1 - smooth(D.half, D.half + wall, d);
    if (w > 0) edits.push(c, cur + (target - cur) * w);
  }
  for (let q = 0; q < edits.length; q += 2) h4[edits[q]] = edits[q + 1];
  const points = [];
  let next = 0;
  for (let i = 0; i < n; i++) if (s[i] >= next || i === n - 1) { points.push([Math.round(pts[i][0] * 10) / 10, Math.round(pts[i][1] * 10) / 10, Math.round(s[i] * 10) / 10, Math.round(floor[i] * 10) / 10]); next += 12; }
  return { id: D.id, kind: 'road', width: D.half * 2, length: Math.round(s[n - 1] * 10) / 10, drop: Math.round((floor[0] - floor[n - 1]) * 10) / 10, points, dense: pts };
}
