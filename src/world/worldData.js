// CPU side of the baked world (BRIEF §4.2 collision parity). Holds the 8 m overview, biome
// weights, wind, and every 2 m height tile once streamed (raw u16, ≤ 32 MB, never evicted so CPU
// and GPU always see the same texels). Height = macro (Catmull-Rom over 2 m texels, each texel
// falling back to the overview where its tile is not resident) + meso (src/terrain/meso.js).
// The GPU clipmap (src/shaders/clipmap.wgsl.js) implements the identical rule.
//
// Hot-path calling convention (see DECISIONS.md): set qx/qz, call sample() → h, or
// sampleNormal() → nx/ny/nz. No doubles cross call boundaries.

import { mesoHeight } from '../terrain/meso.js';

export const WORLD_HALF = 4096;
const H_OFFSET = 128, H_SCALE = 32;

export class WorldData {
  /** @param {any} manifest */
  constructor(manifest) {
    this.manifest = manifest;
    this.n2 = manifest.height.size;          // 4096
    this.c2 = manifest.height.texel;         // 2 m
    this.tile = manifest.height.tile;        // 256
    this.tiles = manifest.height.tiles;      // 16
    this.n8 = manifest.height.overview.size; // 1024
    this.c8 = manifest.height.overview.texel;
    this.nw = manifest.wind.size; this.cw = manifest.wind.texel;
    /** @type {Uint16Array|null} */ this.overview = null;
    /** @type {Uint8Array|null} */ this.biomeA = null;
    /** @type {Uint8Array|null} */ this.biomeB = null;
    /** @type {Uint8Array|null} */ this.wind = null;
    /** Raw u16 tiles by index tz*tiles+tx; null until resident. */
    this.tileData = new Array(this.tiles * this.tiles).fill(null);
    // Query fields (doubles from the start so their representation stays double).
    this.qx = 0.5; this.qz = 0.5;
    this.h = 0.5; this.nx = 0.5; this.ny = 0.5; this.nz = 0.5;
    this.macro = 0.5; this.meso = 0.5;
    // Biome weights and wind at the last sample.
    this.w0 = 0.5; this.w1 = 0.5; this.w2 = 0.5; this.w3 = 0.5; this.w4 = 0.5; this.w5 = 0.5;
    this.windX = 0.5; this.windZ = 0.5;
  }

  /** Mark a tile resident (called when both CPU data and GPU upload are done). */
  setTile(tx, tz, data) { this.tileData[tz * this.tiles + tx] = data; }

  /** Overview height (m) at 8 m texel (i, j), clamped. */
  _ov(i, j) {
    const n = this.n8;
    i = i < 0 ? 0 : i >= n ? n - 1 : i;
    j = j < 0 ? 0 : j >= n ? n - 1 : j;
    return this.overview[j * n + i] / H_SCALE - H_OFFSET;
  }

  /** Height (m) of 2 m texel (i, j): the tile texel if resident, else the overview bilinear at its centre. */
  _texel(i, j) {
    const n = this.n2;
    i = i < 0 ? 0 : i >= n ? n - 1 : i;
    j = j < 0 ? 0 : j >= n ? n - 1 : j;
    const T = this.tile, tx = i >> 8, tz = j >> 8;
    const t = this.tileData[tz * this.tiles + tx];
    if (t !== null) return t[(j - tz * T) * T + (i - tx * T)] / H_SCALE - H_OFFSET;
    // Overview fallback: 2 m texel centre in 8 m texel space (ratio 4: centre offset -0.375).
    const u = (i + 0.5) * 0.25 - 0.5, v = (j + 0.5) * 0.25 - 0.5;
    const i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0;
    const a = this._ov(i0, j0), b = this._ov(i0 + 1, j0), c = this._ov(i0, j0 + 1), d = this._ov(i0 + 1, j0 + 1);
    return (a + (b - a) * fu) + ((c + (d - c) * fu) - (a + (b - a) * fu)) * fv;
  }

  /** Catmull-Rom macro height at (qx, qz) → this.macro. */
  _macro() {
    const u = (this.qx + WORLD_HALF) / this.c2 - 0.5, v = (WORLD_HALF - this.qz) / this.c2 - 0.5;
    const i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0;
    const fu2 = fu * fu, fu3 = fu2 * fu, fv2 = fv * fv, fv3 = fv2 * fv;
    const ua = 0.5 * (-fu3 + 2 * fu2 - fu), ub = 0.5 * (3 * fu3 - 5 * fu2 + 2), uc = 0.5 * (-3 * fu3 + 4 * fu2 + fu), ud = 0.5 * (fu3 - fu2);
    const va = 0.5 * (-fv3 + 2 * fv2 - fv), vb = 0.5 * (3 * fv3 - 5 * fv2 + 2), vc = 0.5 * (-3 * fv3 + 4 * fv2 + fv), vd = 0.5 * (fv3 - fv2);
    let h = 0;
    for (let m = -1; m <= 2; m++) {
      const j = j0 + m;
      const row = ua * this._texel(i0 - 1, j) + ub * this._texel(i0, j) + uc * this._texel(i0 + 1, j) + ud * this._texel(i0 + 2, j);
      h += row * (m === -1 ? va : m === 0 ? vb : m === 1 ? vc : vd);
    }
    this.macro = h;
  }

  /** Bilinear biome weights and wind at (qx, qz) → w0..w5, windX/windZ. */
  _climate() {
    const n = this.n8;
    let u = (this.qx + WORLD_HALF) / this.c8 - 0.5, v = (WORLD_HALF - this.qz) / this.c8 - 0.5;
    let i0 = Math.floor(u), j0 = Math.floor(v);
    const fu = u - i0, fv = v - j0;
    const i1 = i0 + 1 >= n ? n - 1 : i0 + 1 < 0 ? 0 : i0 + 1, j1 = j0 + 1 >= n ? n - 1 : j0 + 1 < 0 ? 0 : j0 + 1;
    i0 = i0 < 0 ? 0 : i0 >= n ? n - 1 : i0; j0 = j0 < 0 ? 0 : j0 >= n ? n - 1 : j0;
    const A = this.biomeA, B = this.biomeB;
    const k00 = (j0 * n + i0) * 4, k10 = (j0 * n + i1) * 4, k01 = (j1 * n + i0) * 4, k11 = (j1 * n + i1) * 4;
    const c00 = (1 - fu) * (1 - fv), c10 = fu * (1 - fv), c01 = (1 - fu) * fv, c11 = fu * fv;
    const s = 1 / 255;
    this.w0 = (A[k00] * c00 + A[k10] * c10 + A[k01] * c01 + A[k11] * c11) * s;
    this.w1 = (A[k00 + 1] * c00 + A[k10 + 1] * c10 + A[k01 + 1] * c01 + A[k11 + 1] * c11) * s;
    this.w2 = (A[k00 + 2] * c00 + A[k10 + 2] * c10 + A[k01 + 2] * c01 + A[k11 + 2] * c11) * s;
    this.w3 = (A[k00 + 3] * c00 + A[k10 + 3] * c10 + A[k01 + 3] * c01 + A[k11 + 3] * c11) * s;
    this.w4 = (B[k00] * c00 + B[k10] * c10 + B[k01] * c01 + B[k11] * c11) * s;
    this.w5 = (B[k00 + 1] * c00 + B[k10 + 1] * c10 + B[k01 + 1] * c01 + B[k11 + 1] * c11) * s;
    // Wind (32 m), bilinear, renormalised.
    const nw = this.nw, W = this.wind;
    u = (this.qx + WORLD_HALF) / this.cw - 0.5; v = (WORLD_HALF - this.qz) / this.cw - 0.5;
    let a0 = Math.floor(u), b0 = Math.floor(v);
    const gu = u - a0, gv = v - b0;
    const a1 = a0 + 1 >= nw ? nw - 1 : a0 + 1 < 0 ? 0 : a0 + 1, b1 = b0 + 1 >= nw ? nw - 1 : b0 + 1 < 0 ? 0 : b0 + 1;
    a0 = a0 < 0 ? 0 : a0 >= nw ? nw - 1 : a0; b0 = b0 < 0 ? 0 : b0 >= nw ? nw - 1 : b0;
    const e00 = (b0 * nw + a0) * 2, e10 = (b0 * nw + a1) * 2, e01 = (b1 * nw + a0) * 2, e11 = (b1 * nw + a1) * 2;
    const d00 = (1 - gu) * (1 - gv), d10 = gu * (1 - gv), d01 = (1 - gu) * gv, d11 = gu * gv;
    let wx = ((W[e00] * d00 + W[e10] * d10 + W[e01] * d01 + W[e11] * d11) - 128) / 127;
    let wz = ((W[e00 + 1] * d00 + W[e10 + 1] * d10 + W[e01 + 1] * d01 + W[e11 + 1] * d11) - 128) / 127;
    const l = Math.sqrt(wx * wx + wz * wz) || 1;
    this.windX = wx / l; this.windZ = wz / l;
  }

  /** Beyond the baked extent, macro falls below sea level over 2 km (shader twin: edgeFalloff). */
  _edgeFalloff() {
    const ax = this.qx < 0 ? -this.qx : this.qx, az = this.qz < 0 ? -this.qz : this.qz;
    const out = (ax > az ? ax : az) - WORLD_HALF;
    if (out <= 0) return;
    let t = out / 2000; t = t > 1 ? 1 : t;
    t = t * t * (3 - 2 * t);
    this.macro = this.macro + (-60 - this.macro) * t;
  }

  /** Full collision height (macro + meso) at (qx, qz) → this.h. */
  sample() {
    this._macro();
    this._edgeFalloff();
    this._climate();
    this.meso = mesoHeight(this.qx, this.qz, this.w0, this.w1, this.w2, this.w3, this.w4, this.w5, this.windX, this.windZ);
    this.h = this.macro + this.meso;
  }

  /** Surface normal at (qx, qz) by central differences (0.25 m) → nx/ny/nz. */
  sampleNormal() {
    const x = this.qx, z = this.qz, e = 0.25;
    this.qx = x + e; this.sample(); const hx1 = this.h;
    this.qx = x - e; this.sample(); const hx0 = this.h;
    this.qx = x; this.qz = z + e; this.sample(); const hz1 = this.h;
    this.qz = z - e; this.sample(); const hz0 = this.h;
    this.qz = z;
    const gx = (hx1 - hx0) / (2 * e), gz = (hz1 - hz0) / (2 * e);
    const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
    this.nx = -gx * inv; this.ny = inv; this.nz = -gz * inv;
  }

  /** Convenience (tools/tests). */
  heightAt(x, z) { this.qx = x; this.qz = z; this.sample(); return this.h; }
}
