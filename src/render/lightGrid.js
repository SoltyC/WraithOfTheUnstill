// World-space light grid (docs/village/plan-render.md §2): a camera-centred square of cells, each
// holding up to MAX_PER_CELL indices into one light array, rebuilt on the CPU every frame and
// uploaded as ONE storage buffer (`lightGrid`, array<vec4f> in WGSL; shaders/common.wgsl.js
// GRID_LIGHT_WGSL reads it). Pure data — no Babylon — so it is unit-tested directly.
//
// Buffer layout (floats; every section is vec4-aligned):
//   [0 .. 3]                        header: originX, originZ (world m of cell (0,0)'s corner), cell size, grid N
//   [4 .. 4 + N·N·8)                cells, row-major (j·N + i), 8 floats each: light index + 1 (0 = end of list)
//   [LIGHTS_OFFSET .. + 8·count)    lights, 8 floats each: x, y, z, radius | r, g, b, intensity
// Allocation-free: every array is preallocated; begin() clears, add() inserts.

export const GRID_N = 64;           // cells per side
export const GRID_CELL = 4;         // m
export const GRID_HALF = GRID_N * GRID_CELL / 2; // 128 m: the grid reaches this far from the camera
export const GRID_FADE = 32;        // m: lights fade out over the last stretch of the half-size
export const MAX_PER_CELL = 8;
export const MAX_LIGHTS = 512;
export const HEADER_FLOATS = 4;
export const CELLS_OFFSET = HEADER_FLOATS;
export const LIGHTS_OFFSET = CELLS_OFFSET + GRID_N * GRID_N * MAX_PER_CELL;
export const GRID_FLOATS = LIGHTS_OFFSET + MAX_LIGHTS * 8;
/** The light array's start in vec4 units (the shader's LIGHTS_BASE). */
export const LIGHTS_VEC4 = LIGHTS_OFFSET / 4;

export class LightGrid {
  constructor() {
    this.data = new Float32Array(GRID_FLOATS);
    this.count = new Uint8Array(GRID_N * GRID_N);
    this.score = new Float32Array(GRID_N * GRID_N * MAX_PER_CELL);
    this.lights = 0;
    this.originX = 0; this.originZ = 0;
    this.camX = 0; this.camZ = 0;
  }

  /** Re-centre on the camera (origin snapped to whole cells) and clear. */
  begin(camX, camZ) {
    this.camX = camX; this.camZ = camZ;
    const ox = (Math.floor(camX / GRID_CELL) - GRID_N / 2) * GRID_CELL;
    const oz = (Math.floor(camZ / GRID_CELL) - GRID_N / 2) * GRID_CELL;
    this.originX = ox; this.originZ = oz;
    const d = this.data;
    d[0] = ox; d[1] = oz; d[2] = GRID_CELL; d[3] = GRID_N;
    d.fill(0, CELLS_OFFSET, LIGHTS_OFFSET);
    this.count.fill(0);
    this.lights = 0;
  }

  /** Insert a light into every cell its radius touches. Returns false when dropped (out of range,
   *  dark, or the light array is full). Intensity fades over the last GRID_FADE m of the half-size
   *  (Chebyshev distance from the camera), so a light never pops at the grid's edge. */
  add(x, y, z, radius, r, g, b, intensity) {
    if (this.lights >= MAX_LIGHTS || !(radius > 0)) return false;
    const e = Math.max(Math.abs(x - this.camX), Math.abs(z - this.camZ));
    if (!(e < GRID_HALF)) return false; // also drops NaN
    let k = 1;
    if (e > GRID_HALF - GRID_FADE) { const t = (GRID_HALF - e) / GRID_FADE; k = t * t * (3 - 2 * t); }
    const I = intensity * k;
    if (!(I > 0)) return false;
    const lx = x - this.originX, lz = z - this.originZ;
    const i0 = Math.max(0, Math.floor((lx - radius) / GRID_CELL)), i1 = Math.min(GRID_N - 1, Math.floor((lx + radius) / GRID_CELL));
    const j0 = Math.max(0, Math.floor((lz - radius) / GRID_CELL)), j1 = Math.min(GRID_N - 1, Math.floor((lz + radius) / GRID_CELL));
    const id = this.lights, score = I * radius, r2 = radius * radius, d = this.data, cnt = this.count, sc = this.score;
    let touched = false;
    for (let j = j0; j <= j1; j++) {
      const dz = Math.max(j * GRID_CELL - lz, 0, lz - (j + 1) * GRID_CELL);
      for (let i = i0; i <= i1; i++) {
        const dx = Math.max(i * GRID_CELL - lx, 0, lx - (i + 1) * GRID_CELL);
        if (dx * dx + dz * dz >= r2) continue; // the circle misses this cell's corner
        const c = j * GRID_N + i, base = c * MAX_PER_CELL;
        let slot;
        if (cnt[c] < MAX_PER_CELL) slot = cnt[c]++;
        else { // full: replace the dimmest if this one is brighter
          slot = 0;
          for (let s = 1; s < MAX_PER_CELL; s++) if (sc[base + s] < sc[base + slot]) slot = s;
          if (sc[base + slot] >= score) continue;
        }
        sc[base + slot] = score;
        d[CELLS_OFFSET + base + slot] = id + 1;
        touched = true;
      }
    }
    if (!touched) return false;
    const o = LIGHTS_OFFSET + id * 8;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = radius;
    d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = I;
    this.lights = id + 1;
    return true;
  }
}
