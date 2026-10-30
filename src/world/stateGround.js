// Collision-side view of a GPU terrain-state snapshot. Four floats per point: depression,
// displacement, valid sand mask, frozen fraction. Buffers arrive between frames; sampling never allocates.
export function createStateGround() {
  return { qx: 0.5, qz: 0.5, depr: 0.5, disp: 0.5, frozen: 0, sampleTime: -Infinity,
    x0: 0.5, z0: 0.5, step: 0.25, n: 0, data: null, enabled: false, maxRelief: 0, maxFrozen: 0,
    install(data, x0, z0, step, n, time) {
      this.data = data; this.x0 = x0; this.z0 = z0; this.step = step; this.n = n; this.sampleTime = time;
      let peak = 0, ice = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i + 2] > 0.5) {
        peak = Math.max(peak,Math.abs(data[i + 1] - data[i])); ice = Math.max(ice,data[i + 3]);
      }
      this.maxRelief = peak; this.maxFrozen = ice;
    },
    clear() { this.data = null; this.n = 0; this.sampleTime = -Infinity; this.maxRelief = 0; this.maxFrozen = 0; this.frozen = 0; },
    sample() {
      if (!this.enabled || !this.data) return false;
      const u = (this.qx - this.x0) / this.step, v = (this.qz - this.z0) / this.step;
      if (u < 0 || v < 0 || u >= this.n - 1 || v >= this.n - 1) return false;
      const x = Math.floor(u), z = Math.floor(v), fx = u - x, fz = v - z;
      const k = (z * this.n + x) * 4, right = k + 4, up = k + this.n * 4, diag = up + 4, d = this.data;
      if (d[k + 2] < 0.5 || d[right + 2] < 0.5 || d[up + 2] < 0.5 || d[diag + 2] < 0.5) return false;
      const dep0 = d[k] + (d[right] - d[k]) * fx, dep1 = d[up] + (d[diag] - d[up]) * fx;
      const dis0 = d[k + 1] + (d[right + 1] - d[k + 1]) * fx, dis1 = d[up + 1] + (d[diag + 1] - d[up + 1]) * fx;
      const ice0 = d[k + 3] + (d[right + 3] - d[k + 3]) * fx;
      const ice1 = d[up + 3] + (d[diag + 3] - d[up + 3]) * fx;
      this.frozen = ice0 + (ice1 - ice0) * fz;
      this.depr = dep0 + (dep1 - dep0) * fz; this.disp = dis0 + (dis1 - dis0) * fz;
      return true;
    },
  };
}

export const STATE_GRID_N = 129;
export const STATE_GRID_STEP = 0.25;
