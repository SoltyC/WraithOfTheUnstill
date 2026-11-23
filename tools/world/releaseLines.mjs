#!/usr/bin/env node
// The release lines (docs/direction.md M4, user 2026-11-22 "now"): paths the land opens when a Warden is released, each
// running toward the next Warden. This bakes their centre lines into data/world/releaseLines.json.
//   The Melt (after the frost): meltwater from the frost Warden's tarn down the fall line to the foot of the Bellwether's
//   manor hill: traced downhill on the height overview (8 m), with momentum so it does not zig-zag, smoothed (Chaikin) and
//   resampled every 20 m. Points are [x, z, half-width of the bed (m), ground height (m)] like ravines.json `wadis`, so
//   render/wadiWater.js draws them.
//   node tools/world/releaseLines.mjs
import fs from 'node:fs';

const N = 1024, raw = fs.readFileSync(new URL('../../data/world/height_overview.u16', import.meta.url));
const H = new Uint16Array(raw.buffer, raw.byteOffset, N * N);
function h(x, z) {
  let i = (x + 4096) / 8 - 0.5, j = (4096 - z) / 8 - 0.5;
  i = Math.min(Math.max(i, 0), N - 1.001); j = Math.min(Math.max(j, 0), N - 1.001);
  const i0 = Math.floor(i), j0 = Math.floor(j), fi = i - i0, fj = j - j0, v = (a, b) => H[b * N + a] / 32 - 128;
  return (v(i0, j0) * (1 - fi) + v(i0 + 1, j0) * fi) * (1 - fj) + (v(i0, j0 + 1) * (1 - fi) + v(i0 + 1, j0 + 1) * fi) * fj;
}

// Lakes and the sea (hydro lake mask + lake_level at 4 m, the same encoding; 0 = none): water lies flat at its level.
const LN = 2048, lraw = fs.readFileSync(new URL('../../data/world/lake_level.u16', import.meta.url));
const LL = new Uint16Array(lraw.buffer, lraw.byteOffset, LN * LN);
function lake(x, z) {
  const i = Math.min(LN - 1, Math.max(0, Math.floor((x + 4096) / 4))), j = Math.min(LN - 1, Math.max(0, Math.floor((4096 - z) / 4)));
  const v = LL[j * LN + i]; return v ? v / 32 - 128 : -Infinity;
}
/** The surface water runs on: the ground, or a lake's or the sea's level over it. */
const surf = (x, z) => Math.max(h(x, z), lake(x, z));

/** The way water would go from `from` to `goal`: the cheapest path on an 8 m grid (Dijkstra, 8 neighbours) where each step costs
 *  its length, plus 60 per metre climbed (water spills over a basin's lowest lip rather than climbing out of it) and a little
 *  per metre of height (it keeps to the valley floor). A greedy downhill walk circled in the tarn's basin. */
function trace(from, goal) {
  const C = 8, x0 = Math.min(from[0], goal[0]) - 400, z0 = Math.min(from[1], goal[1]) - 400;
  const W = Math.ceil((Math.max(from[0], goal[0]) + 400 - x0) / C), Hn = Math.ceil((Math.max(from[1], goal[1]) + 400 - z0) / C);
  const hh = new Float32Array(W * Hn); for (let j = 0; j < Hn; j++) for (let i = 0; i < W; i++) hh[j * W + i] = surf(x0 + i * C, z0 + j * C);
  const dist = new Float64Array(W * Hn).fill(Infinity), prev = new Int32Array(W * Hn).fill(-1), done = new Uint8Array(W * Hn);
  const idx = (x, z) => Math.round((z - z0) / C) * W + Math.round((x - x0) / C);
  const s0 = idx(...from), g0 = idx(...goal);
  // A binary heap of [cost, cell].
  const heap = []; const push = (c, k) => { heap.push([c, k]); let n = heap.length - 1; while (n > 0) { const p = (n - 1) >> 1; if (heap[p][0] <= heap[n][0]) break; [heap[p], heap[n]] = [heap[n], heap[p]]; n = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let n = 0; for (;;) { const l = 2 * n + 1, r = l + 1; let m = n; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === n) break; [heap[m], heap[n]] = [heap[n], heap[m]]; n = m; } } return top; };
  dist[s0] = 0; push(0, s0);
  while (heap.length) {
    const [c, k] = pop(); if (done[k]) continue; done[k] = 1; if (k === g0) break;
    const i = k % W, j = (k / W) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= Hn) continue;
      const n = nj * W + ni, dh = hh[n] - hh[k], len = C * Math.hypot(di, dj);
      const nc = c + len + 60 * Math.max(0, dh) + 0.4 * Math.abs(dh);
      if (nc < dist[n]) { dist[n] = nc; prev[n] = k; push(nc, n); }
    }
  }
  const pts = []; for (let k = g0; k >= 0; k = prev[k]) pts.push([x0 + (k % W) * C, z0 + ((k / W) | 0) * C]);
  return pts.reverse();
}
function chaikin(p, n) {
  for (let r = 0; r < n; r++) {
    const q = [p[0]];
    for (let k = 0; k < p.length - 1; k++) { const [a, b] = [p[k], p[k + 1]]; q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); }
    q.push(p[p.length - 1]); p = q;
  }
  return p;
}
function resample(p, step) {
  const out = [p[0]]; let carry = 0;
  for (let k = 0; k < p.length - 1; k++) {
    const [ax, az] = p[k], [bx, bz] = p[k + 1], L = Math.hypot(bx - ax, bz - az);
    let s = step - carry;
    while (s <= L) { out.push([ax + (bx - ax) * (s / L), az + (bz - az) * (s / L)]); s += step; }
    carry = L - (s - step);
  }
  out.push(p[p.length - 1]);
  return out;
}

const LINES = [
  // The frost Warden's tarn (just below its ground, on the side toward the meadow) to the foot of the manor hill.
  { id: 'melt', after: 'frost', name: 'The Melt', from: [1060, 2240], to: [430, 1010], stop: 30, hw: 16 },
  // The meadow's west line: from Hearn's west edge through the meadow lake and down its outflow to the sea, and over the sea to
  // the landing of the Sounding's jetty (world/jetty.js JETTY_AT).
  { id: 'outflow', after: 'meadow', name: 'The Outflow', from: [-150, 1000], to: [-2505, -1400], stop: 30, hw: 24, keepHead: true },
];
const out = { _note: 'Baked by tools/world/releaseLines.mjs (docs/direction.md M4). pts: [x, z, bed half-width (m), ground (m)] every 20 m.', lines: [] };
for (const L of LINES) {
  const raw = trace(L.from, L.to);
  let pts = resample(chaikin(raw, 3), 20).map(([x, z], k, a) => {
    // Narrow where it leaves the tarn, widest on the long run, narrowing into the meadow.
    const t = k / (a.length - 1), hw = L.hw * (0.6 + 0.4 * Math.min(1, t * 6)) * (1 - 0.25 * Math.max(0, t - 0.8) / 0.2);
    return [+x.toFixed(2), +z.toFixed(2), +hw.toFixed(1), +surf(x, z).toFixed(1)];
  });
  // The water starts where it spills over the basin's lip: drop the climb out of the tarn (the highest point in the first
  // fifth), so the line falls from its head (a rider started in the basin slid back into it).
  if (!L.keepHead) { let top = 0; for (let k = 0; k < pts.length / 5; k++) if (pts[k][3] > pts[top][3]) top = k; pts.splice(0, top); }
  let len = 0, rise = 0;
  for (let k = 1; k < pts.length; k++) { len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); rise = Math.max(rise, pts[k][3] - pts[k - 1][3]); }
  console.log(L.id, pts.length, 'points', Math.round(len), 'm, drop', Math.round(pts[0][3] - pts[pts.length - 1][3]), 'm, worst uphill step', rise.toFixed(1), 'm');
  out.lines.push({ id: L.id, after: L.after, name: L.name, pts });
}
fs.writeFileSync(new URL('../../data/world/releaseLines.json', import.meta.url), JSON.stringify(out) + '\n');
