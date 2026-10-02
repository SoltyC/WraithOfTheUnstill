// Builds the Phase 0 test terrain mesh data (pure; runs on a worker).
// A single N×N grid whose spacing grows with distance from the origin: ~0.35 m cells at the
// centre, tens of metres at the 3 km edge. Normals come from grid neighbours of the same height
// function; a per-vertex cavity term (from the height Laplacian) darkens hollows.

import { heightAt } from './testHeightfield.js';

export const GRID_CELLS = 640;
export const GRID_EXTENT = 3200; // metres from centre to edge
const S0 = 0.35; // centre cell size (m)

/** Grid index → world coordinate along one axis. Monotonic, odd-symmetric. */
export function gridCoord(i, n = GRID_CELLS) {
  const u = (i / n) * 2 - 1;
  const a = Math.abs(u);
  const lin = S0 * (n / 2);
  const x = lin * a + (GRID_EXTENT - lin) * a * a * a;
  return u < 0 ? -x : x;
}

/**
 * @returns {{ positions: Float32Array, normals: Float32Array, cavity: Float32Array, indices: Uint32Array }}
 */
export function buildTestTerrain(n = GRID_CELLS) {
  const v = n + 1;
  const coords = new Float64Array(v);
  for (let i = 0; i < v; i++) coords[i] = gridCoord(i, n);
  const heights = new Float64Array(v * v);
  for (let j = 0; j < v; j++) for (let i = 0; i < v; i++) heights[j * v + i] = heightAt(coords[i], coords[j]);

  const positions = new Float32Array(v * v * 3);
  const normals = new Float32Array(v * v * 3);
  const cavity = new Float32Array(v * v);
  for (let j = 0; j < v; j++) {
    const j0 = j > 0 ? j - 1 : j, j1 = j < n ? j + 1 : j;
    for (let i = 0; i < v; i++) {
      const k = j * v + i;
      const i0 = i > 0 ? i - 1 : i, i1 = i < n ? i + 1 : i;
      const h = heights[k];
      positions[k * 3] = coords[i];
      positions[k * 3 + 1] = h;
      positions[k * 3 + 2] = coords[j];
      const dx = coords[i1] - coords[i0], dz = coords[j1] - coords[j0];
      const gx = (heights[j * v + i1] - heights[j * v + i0]) / dx;
      const gz = (heights[j1 * v + i] - heights[j0 * v + i]) / dz;
      const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
      normals[k * 3] = -gx * inv;
      normals[k * 3 + 1] = inv;
      normals[k * 3 + 2] = -gz * inv;
      // Laplacian scaled by local cell size: positive in hollows.
      const lap = (heights[j * v + i1] + heights[j * v + i0] + heights[j1 * v + i] + heights[j0 * v + i] - 4 * h) / (0.25 * (dx + dz) + 1e-3);
      cavity[k] = Math.max(-1, Math.min(1, lap * 0.6));
    }
  }

  const indices = new Uint32Array(n * n * 6);
  let p = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * v + i, b = a + 1, c = a + v, d = c + 1;
      // Alternate the diagonal so the grid has no directional bias. Wound so faces point up
      // under Babylon's front-face convention (verified by capture: the reverse culls the ground).
      if ((i + j) & 1) { indices[p++] = a; indices[p++] = b; indices[p++] = c; indices[p++] = b; indices[p++] = d; indices[p++] = c; }
      else { indices[p++] = a; indices[p++] = d; indices[p++] = c; indices[p++] = a; indices[p++] = b; indices[p++] = d; }
    }
  }
  return { positions, normals, cavity, indices };
}
