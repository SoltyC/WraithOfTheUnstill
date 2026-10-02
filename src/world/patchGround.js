// Main-thread ground queries over collision patches computed by the world worker.
// Two levels: a fine patch (0.25 m) around the player and a coarse patch (2 m, 256 m) for camera
// probes and fast motion. Bilinear sampling; the query-object convention keeps it allocation-free:
//   ground.qx = x; ground.qz = z; ground.sample();        → ground.h
//   ground.qx = x; ground.qz = z; ground.sampleNormal();  → ground.nx, ny, nz
//
// Patches are replaced wholesale when a newer one arrives (between frames, in onmessage).

export class PatchGround {
  constructor() {
    this.qx = 0.5; this.qz = 0.5;
    this.h = 0.5; this.nx = 0.5; this.ny = 0.5; this.nz = 0.5;
    // Fine and coarse patch state: origin (x0, z0 = min corner), spacing, size, data.
    this.f = { x0: 0.5, z0: 0.5, step: 0.25, n: 0, data: null, version: -1 };
    this.c = { x0: 0.5, z0: 0.5, step: 2.5, n: 0, data: null, version: -1 };
    /** True once at least the coarse patch exists. */
    this.ready = false;
  }

  /** Install a patch from the worker. */
  install(p, fine) {
    const t = fine ? this.f : this.c;
    t.x0 = p.x0; t.z0 = p.z0; t.step = p.step; t.n = p.n; t.data = p.heights; t.version = p.version;
    if (!fine) this.ready = true;
  }

  /** Bilinear lookup in patch t at (qx, qz); returns false when outside (uses this.h as output). */
  _from(t) {
    if (t.data === null) return false;
    const u = (this.qx - t.x0) / t.step, v = (this.qz - t.z0) / t.step;
    const n = t.n;
    if (u < 0 || v < 0 || u > n - 1.001 || v > n - 1.001) return false;
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const d = t.data, k = j * n + i;
    const a = d[k], b = d[k + 1], c = d[k + n], e = d[k + n + 1];
    this.h = (a + (b - a) * fu) + ((c + (e - c) * fu) - (a + (b - a) * fu)) * fv;
    return true;
  }

  /** Height at (qx, qz) → h. Fine patch first, then coarse; 0 if neither covers the point. */
  sample() {
    if (this._from(this.f)) return;
    if (this._from(this.c)) return;
    this.h = 0;
  }

  /** Normal at (qx, qz) → nx/ny/nz, from central differences at the active patch spacing. */
  sampleNormal() {
    const x = this.qx, z = this.qz;
    const e = this._inside(this.f) ? this.f.step : this.c.step;
    this.qx = x + e; this.sample(); const hx1 = this.h;
    this.qx = x - e; this.sample(); const hx0 = this.h;
    this.qx = x; this.qz = z + e; this.sample(); const hz1 = this.h;
    this.qz = z - e; this.sample(); const hz0 = this.h;
    this.qz = z;
    const gx = (hx1 - hx0) / (2 * e), gz = (hz1 - hz0) / (2 * e);
    const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
    this.nx = -gx * inv; this.ny = inv; this.nz = -gz * inv;
  }

  /** True when the fine patch covers (qx, qz) with a margin (safe to place the player). */
  coversFine() { return this._inside(this.f); }

  _inside(t) {
    if (t.data === null) return false;
    const u = (this.qx - t.x0) / t.step, v = (this.qz - t.z0) / t.step;
    return u >= 1 && v >= 1 && u <= t.n - 2 && v <= t.n - 2;
  }
}
