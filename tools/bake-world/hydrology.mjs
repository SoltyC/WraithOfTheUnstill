// Hydrology on a square grid (BRIEF §4.1): depression filling, D8 flow, accumulation, river
// carving, lakes and wetlands. Deterministic: ties are broken by cell index everywhere.
//
// Grid convention: n×n cells, row-major, cell (i, j) at x = -HALF + (i + 0.5)·cell,
// z = HALF - (j + 0.5)·cell (row 0 is the north edge).

// D8 neighbour offsets (dx, dz in grid rows: +j is south) and distances.
const DI = [1, 1, 0, -1, -1, -1, 0, 1];
const DJ = [0, 1, 1, 1, 0, -1, -1, -1];
const DL = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2];

/** Binary min-heap over (key, index) with index tie-break; typed arrays only. */
class Heap {
  constructor(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  less(a, b) { return this.k[a] < this.k[b] || (this.k[a] === this.k[b] && this.v[a] < this.v[b]); }
  swap(a, b) { const k = this.k[a]; this.k[a] = this.k[b]; this.k[b] = k; const v = this.v[a]; this.v[a] = this.v[b]; this.v[b] = v; }
  push(key, val) {
    let i = this.n++;
    this.k[i] = key; this.v[i] = val;
    while (i > 0) { const p = (i - 1) >> 1; if (!this.less(i, p)) break; this.swap(i, p); i = p; }
  }
  pop() {
    const top = this.v[0];
    this.n--;
    if (this.n > 0) {
      this.k[0] = this.k[this.n]; this.v[0] = this.v[this.n];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.n && this.less(l, m)) m = l;
        if (r < this.n && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
}

/**
 * Priority-flood fill with a tiny epsilon gradient so every land cell drains to the sea or the
 * map edge. Outlets: sea cells (h < seaLevel) and the map border.
 * @returns {Float32Array} filled heights
 */
export function priorityFlood(h, n, seaLevel = 0, eps = 1e-3) {
  const filled = Float32Array.from(h);
  const done = new Uint8Array(n * n);
  const heap = new Heap(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const c = j * n + i;
    if (i === 0 || j === 0 || i === n - 1 || j === n - 1 || h[c] < seaLevel) { done[c] = 1; heap.push(filled[c], c); }
  }
  while (heap.n > 0) {
    const c = heap.pop();
    const ci = c % n, cj = (c - ci) / n;
    for (let d = 0; d < 8; d++) {
      const i = ci + DI[d], j = cj + DJ[d];
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const q = j * n + i;
      if (done[q]) continue;
      done[q] = 1;
      const floor = filled[c] + eps * DL[d];
      if (filled[q] < floor) filled[q] = floor;
      heap.push(filled[q], q);
    }
  }
  return filled;
}

/**
 * Steepest-descent D8 receivers and flow accumulation (in cells).
 * @returns {{ recv: Int32Array, acc: Float32Array, order: Int32Array }}
 */
export function flowAccumulation(filled, n) {
  const N = n * n;
  const recv = new Int32Array(N).fill(-1);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const c = j * n + i;
    let best = -1, bestDrop = 0;
    for (let d = 0; d < 8; d++) {
      const ii = i + DI[d], jj = j + DJ[d];
      if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
      const q = jj * n + ii;
      const drop = (filled[c] - filled[q]) / DL[d];
      if (drop > bestDrop) { bestDrop = drop; best = q; }
    }
    recv[c] = best;
  }
  // Process cells from highest to lowest (index tie-break) and pass flow downstream.
  const order = new Int32Array(N);
  for (let c = 0; c < N; c++) order[c] = c;
  order.sort((a, b) => (filled[b] - filled[a]) || (a - b));
  const acc = new Float32Array(N).fill(1);
  for (let k = 0; k < N; k++) { const c = order[k]; const r = recv[c]; if (r >= 0) acc[r] += acc[c]; }
  return { recv, acc, order };
}

/** Separable box blur, `passes` times (≈ Gaussian). In-place on a copy; returns it. */
export function blur(src, n, radius, passes = 3) {
  let a = Float32Array.from(src), b = new Float32Array(n * n);
  const w = 2 * radius + 1;
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let i = -radius; i <= radius; i++) s += a[j * n + Math.min(n - 1, Math.max(0, i))];
      for (let i = 0; i < n; i++) {
        b[j * n + i] = s / w;
        s += a[j * n + Math.min(n - 1, i + radius + 1)] - a[j * n + Math.max(0, i - radius)];
      }
    }
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = -radius; j <= radius; j++) s += b[Math.min(n - 1, Math.max(0, j)) * n + i];
      for (let j = 0; j < n; j++) {
        a[j * n + i] = s / w;
        s += b[Math.min(n - 1, j + radius + 1) * n + i] - b[Math.max(0, j - radius) * n + i];
      }
    }
  }
  return a;
}

/**
 * Full hydrology pass. Heights are modified in place (rivers carved).
 * @param {Float32Array} h heights (m), n×n at `cell` metres
 * @returns {{ river: Float32Array, lake: Float32Array, lakeLevel: Float32Array, flowX: Float32Array, flowZ: Float32Array, wet: Float32Array, acc: Float32Array }}
 */
export function hydrology(h, n, cell, opts = {}) {
  const N = n * n;
  const cellArea = cell * cell;
  const riverKm2 = opts.riverKm2 ?? 0.8;       // catchment needed for a visible river
  // 1. Fill and route on the uncarved field.
  let filled = priorityFlood(h, n);
  let { recv, acc } = flowAccumulation(filled, n);

  // 2. Lakes: connected depressions (filled surface above terrain), kept or dropped per region
  //    by opts.keepLake(cellIndex, areaM2, maxDepth). Dropped depressions stay dry hollows: the
  //    terrain keeps its shape and only flow routing uses the filled surface.
  const lake = new Float32Array(N), lakeLevel = new Float32Array(N);
  const comp = new Int32Array(N).fill(-1);
  const stack = new Int32Array(N);
  let ncomp = 0;
  for (let c0 = 0; c0 < N; c0++) {
    if (comp[c0] >= 0 || h[c0] < 0 || filled[c0] - h[c0] <= 0.3) continue;
    // Flood the component (iterative DFS over 8-neighbours).
    let sp = 0, members = 0, maxDepth = 0;
    stack[sp++] = c0; comp[c0] = ncomp;
    const startList = [];
    while (sp > 0) {
      const c = stack[--sp];
      startList.push(c);
      members++;
      const d = filled[c] - h[c];
      if (d > maxDepth) maxDepth = d;
      const ci = c % n, cj = (c - ci) / n;
      for (let k = 0; k < 8; k++) {
        const i = ci + DI[k], j = cj + DJ[k];
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const q = j * n + i;
        if (comp[q] >= 0 || h[q] < 0 || filled[q] - h[q] <= 0.3) continue;
        comp[q] = ncomp; stack[sp++] = q;
      }
    }
    const keep = opts.keepLake ? opts.keepLake(c0, members * cellArea, maxDepth) : maxDepth > 1;
    if (keep) for (const c of startList) { lake[c] = Math.min(1, (filled[c] - h[c]) / 2); lakeLevel[c] = filled[c]; }
    ncomp++;
  }

  // 3. River strength from catchment (sqrt keeps it exact) and carving depth.
  const river = new Float32Array(N), carve = new Float32Array(N);
  const threshold = (riverKm2 * 1e6) / cellArea;
  for (let c = 0; c < N; c++) {
    if (h[c] < 0 || lake[c] > 0) continue;
    // No channels across dry depressions (routing there runs over the flat fill surface and would
    // cut straight D8 lines) or where the region forbids rivers.
    if (filled[c] - h[c] > 0.3) continue;
    if (opts.allowRiver && !opts.allowRiver(c)) continue;
    const a = acc[c];
    if (a < threshold) continue;
    const s = Math.sqrt(a / threshold); // 1 at the source, grows downstream
    river[c] = Math.min(1, (s - 1) * 0.25 + 0.2);
    carve[c] = Math.min(7, 1.2 + 0.9 * (s - 1));
  }
  // Banks: blur the carve so channels have sloped sides, keep the thalweg at full depth.
  const banks = blur(carve, n, 2, 2);
  for (let c = 0; c < N; c++) {
    const d = Math.max(carve[c], banks[c] * 1.8);
    if (d > 0 && h[c] >= 0) h[c] -= d;
  }
  // 4. Re-fill so carved channels always drain downhill, then recompute flow on the final surface.
  filled = priorityFlood(h, n, 0, 2e-4);
  for (let c = 0; c < N; c++) if (lake[c] === 0 && h[c] < filled[c] && river[c] > 0) h[c] = filled[c];
  ({ recv, acc } = flowAccumulation(filled, n));

  // 5. Flow direction field (unit vectors along D8 receivers), smoothed for water rendering.
  let fx = new Float32Array(N), fz = new Float32Array(N);
  for (let c = 0; c < N; c++) {
    const r = recv[c];
    if (r < 0) continue;
    const ci = c % n, cj = (c - ci) / n, ri = r % n, rj = (r - ri) / n;
    const dx = ri - ci, dz = cj - rj; // world z points north, rows go south
    const l = Math.sqrt(dx * dx + dz * dz);
    fx[c] = dx / l; fz[c] = dz / l;
  }
  fx = blur(fx, n, 2, 2); fz = blur(fz, n, 2, 2);

  // 6. Wetness: low slope + high accumulation + lake margins (the mire takes this further).
  const wet = new Float32Array(N);
  for (let c = 0; c < N; c++) {
    const a = Math.sqrt(acc[c] / threshold);
    wet[c] = Math.min(1, a * 0.15 + lake[c]);
  }
  return { river, lake, lakeLevel, flowX: fx, flowZ: fz, wet: blur(wet, n, 3, 2), acc };
}
