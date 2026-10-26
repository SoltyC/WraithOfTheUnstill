// The way a traveller would walk between two points of the baked world: a least-effort path over a
// 12 m grid (effort grows with slope, lakes and cliffs are closed, a stream costs a wade). Used by
// tools/world/payoff.mjs so the payoff interval is measured along real routes, not straight lines.
import { createWorldSampler } from './sample.mjs';

const CELL = 12;

export function createRouter(S = createWorldSampler()) {
  const cache = new Map();
  const cost = (x, z) => {
    const k = Math.round(x / CELL) + ',' + Math.round(z / CELL);
    let c = cache.get(k);
    if (c === undefined) {
      const w = S.water(x, z), sl = S.slope(x, z);
      c = w.lake > 30 || sl > 0.95 ? Infinity : 1 + sl * sl * 5 + (w.river > 60 ? 3 : 0);
      cache.set(k, c);
    }
    return c;
  };
  /** Path from a to b ([x, z]) as a list of [x, z] about 12 m apart; straight if no path is found within the search box. */
  return function route(a, b, { pad = 500 } = {}) {
    const x0 = Math.min(a[0], b[0]) - pad, x1 = Math.max(a[0], b[0]) + pad, z0 = Math.min(a[1], b[1]) - pad, z1 = Math.max(a[1], b[1]) + pad;
    const nx = Math.ceil((x1 - x0) / CELL) + 1, nz = Math.ceil((z1 - z0) / CELL) + 1;
    const idx = (i, j) => j * nx + i, pos = (i, j) => [x0 + i * CELL, z0 + j * CELL];
    const si = Math.round((a[0] - x0) / CELL), sj = Math.round((a[1] - z0) / CELL), ti = Math.round((b[0] - x0) / CELL), tj = Math.round((b[1] - z0) / CELL);
    const g = new Float32Array(nx * nz).fill(Infinity), from = new Int32Array(nx * nz).fill(-1), closed = new Uint8Array(nx * nz);
    const heap = [[0, si, sj]];
    g[idx(si, sj)] = 0;
    const push = (e) => { heap.push(e); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { let m = k; const l = 2 * k + 1, r = l + 1; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    while (heap.length) {
      const [, i, j] = pop(), id = idx(i, j);
      if (closed[id]) continue;
      closed[id] = 1;
      if (i === ti && j === tj) break;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
        const [x, z] = pos(ni, nj), c = cost(x, z);
        if (c === Infinity) continue;
        const nid = idx(ni, nj), ng = g[id] + c * (di && dj ? 1.414 : 1);
        if (ng < g[nid]) { g[nid] = ng; from[nid] = id; push([ng + Math.hypot(ti - ni, tj - nj), ni, nj]); }
      }
    }
    const tid = idx(ti, tj);
    if (from[tid] < 0 && tid !== idx(si, sj)) return [a, b];
    const out = [];
    for (let id = tid; id >= 0; id = from[id]) out.push(pos(id % nx, Math.floor(id / nx)));
    out.reverse();
    out[0] = a; out[out.length - 1] = b;
    return out;
  };
}
