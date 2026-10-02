// Ground queries against the built test-terrain grid (what the GPU actually draws).
// Height is interpolated inside the same triangle the mesh uses, so the capsule's feet sit
// exactly on the rendered surface.
//
// Hot-path calling convention (allocation-free regardless of inlining):
//   ground.qx = x; ground.qz = z; ground.sample();        → ground.h
//   ground.qx = x; ground.qz = z; ground.sampleNormal();  → ground.nx, ny, nz
// Passing doubles as arguments to a call V8 does not inline boxes each one (16 B apiece), and
// TurboFan's inlining budget runs out in larger functions, so hot code never passes doubles.
//
// Phase 1 replaces this with macro-bake + shared meso noise sampled identically on CPU and GPU.

import { GRID_CELLS } from './testTerrainBuild.js';

export class GridGround {
  /**
   * @param {Float32Array} positions  (n+1)² xyz from buildTestTerrain
   * @param {Float32Array} normals    (n+1)² xyz
   * @param {number} [n]  grid cells per side (derived from positions when omitted)
   */
  constructor(positions, normals, n = Math.round(Math.sqrt(positions.length / 3)) - 1 || GRID_CELLS) {
    this.n = n;
    this.v = n + 1;
    this.positions = positions;
    this.normals = normals;
    // Query inputs and outputs. Initialised with doubles so the fields keep a double
    // representation (stores then update in place).
    this.qx = 0.5; this.qz = 0.5;
    this.h = 0.5;
    this.nx = 0.5; this.ny = 0.5; this.nz = 0.5;
    // The grid is separable: x coordinates of row 0 equal z coordinates of column 0.
    this.axis = new Float64Array(this.v);
    for (let i = 0; i < this.v; i++) this.axis[i] = positions[i * 3];
  }

  /** Index of the cell containing c along the axis (clamped). */
  _cell(c) {
    const a = this.axis;
    let lo = 0, hi = this.n;
    if (c <= a[0]) return 0;
    if (c >= a[hi]) return hi - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (a[mid] <= c) lo = mid; else hi = mid;
    }
    return lo;
  }

  /** Convenience form for tools and tests. Not for per-frame code. */
  heightAt(x, z) { this.qx = x; this.qz = z; this.sample(); return this.h; }

  /** Convenience form for tools and tests. Not for per-frame code. */
  normalAt(x, z, out) {
    this.qx = x; this.qz = z; this.sampleNormal();
    out.x = this.nx; out.y = this.ny; out.z = this.nz;
    return out;
  }

  /** Height at (qx, qz) → h. */
  sample() {
    const x = this.qx, z = this.qz;
    const i = this._cell(x), j = this._cell(z);
    const a = this.axis, v = this.v, p = this.positions;
    let u = (x - a[i]) / (a[i + 1] - a[i]);
    let w = (z - a[j]) / (a[j + 1] - a[j]);
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    w = w < 0 ? 0 : w > 1 ? 1 : w;
    const k = j * v + i;
    const h00 = p[k * 3 + 1], h10 = p[(k + 1) * 3 + 1];
    const h01 = p[(k + v) * 3 + 1], h11 = p[(k + v + 1) * 3 + 1];
    // Same split as buildTestTerrain: odd cells use the b–c diagonal, even cells a–d
    // (a=00, b=10, c=01, d=11 in (u, w)).
    if ((i + j) & 1) {
      this.h = u + w <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * w : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - w);
    } else {
      this.h = u >= w ? h00 + (h10 - h00) * u + (h11 - h10) * w : h00 + (h01 - h00) * w + (h11 - h01) * u;
    }
  }

  /** Bilinear vertex normal at (qx, qz) → nx, ny, nz (smooth; used for slope limits). */
  sampleNormal() {
    const x = this.qx, z = this.qz;
    const i = this._cell(x), j = this._cell(z);
    const a = this.axis, v = this.v, nr = this.normals;
    let u = (x - a[i]) / (a[i + 1] - a[i]);
    let w = (z - a[j]) / (a[j + 1] - a[j]);
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    w = w < 0 ? 0 : w > 1 ? 1 : w;
    const k00 = (j * v + i) * 3, k10 = k00 + 3, k01 = k00 + v * 3, k11 = k01 + 3;
    const c00 = (1 - u) * (1 - w), c10 = u * (1 - w), c01 = (1 - u) * w, c11 = u * w;
    const nx = nr[k00] * c00 + nr[k10] * c10 + nr[k01] * c01 + nr[k11] * c11;
    const ny = nr[k00 + 1] * c00 + nr[k10 + 1] * c10 + nr[k01 + 1] * c01 + nr[k11 + 1] * c11;
    const nz = nr[k00 + 2] * c00 + nr[k10 + 2] * c10 + nr[k01 + 2] * c01 + nr[k11 + 2] * c11;
    const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
    this.nx = nx * inv; this.ny = ny * inv; this.nz = nz * inv;
  }
}
