import { describe, it, expect } from 'vitest';
import { LightGrid, GRID_N, GRID_CELL, GRID_HALF, MAX_PER_CELL, MAX_LIGHTS, CELLS_OFFSET, LIGHTS_OFFSET } from '../src/render/lightGrid.js';
import { fillLightGrid } from '../src/systems/lights.js';

const cellList = (g, i, j) => {
  const base = CELLS_OFFSET + (j * GRID_N + i) * MAX_PER_CELL, out = [];
  for (let s = 0; s < MAX_PER_CELL; s++) { const v = g.data[base + s]; if (v > 0) out.push(v - 1); }
  return out;
};
const ci = (g, x) => Math.floor((x - g.originX) / GRID_CELL);

describe('light grid', () => {
  it('snaps its origin to whole cells around the camera', () => {
    const g = new LightGrid();
    g.begin(1003.7, -52.2);
    expect(Math.abs(g.originX % GRID_CELL)).toBe(0);
    expect(Math.abs(g.originZ % GRID_CELL)).toBe(0);
    expect(g.originX).toBe((Math.floor(1003.7 / 4) - 32) * 4);
    expect(g.data[0]).toBe(g.originX); expect(g.data[1]).toBe(g.originZ);
    const o = g.originX; g.begin(1003.9, -52.2);
    expect(g.originX).toBe(o); // same cell: no movement
    g.begin(1004.0, -52.2);
    expect(g.originX).toBe(o + GRID_CELL);
  });

  it('inserts a light into every cell its radius touches (and not the corners it misses)', () => {
    const g = new LightGrid();
    g.begin(0, 0);
    // centred on a cell corner, radius 5: spans 3x3 cells at least, corners of the 4x4 bounding box missed
    const x = g.originX + 10 * GRID_CELL, z = g.originZ + 10 * GRID_CELL;
    expect(g.add(x, 1, z, 5, 1, 0.5, 0.2, 2)).toBe(true);
    const ix = ci(g, x), jz = ci(g, z);
    for (const [di, dj] of [[-1, -1], [0, -1], [-2, 0], [1, 1], [1, -2]]) {
      const present = cellList(g, ix + di, jz + dj).includes(0);
      const nx = Math.max((ix + di) * GRID_CELL - (x - g.originX), 0, (x - g.originX) - (ix + di + 1) * GRID_CELL);
      const nz = Math.max((jz + dj) * GRID_CELL - (z - g.originZ), 0, (z - g.originZ) - (jz + dj + 1) * GRID_CELL);
      expect(present).toBe(nx * nx + nz * nz < 25);
    }
    expect(cellList(g, ix - 1, jz - 1)).toEqual([0]);
    expect(cellList(g, ix + 3, jz)).toEqual([]);
    const o = LIGHTS_OFFSET;
    expect([g.data[o], g.data[o + 3], g.data[o + 7]]).toEqual([x, 5, 2]);
  });

  it('keeps the 8 brightest per cell', () => {
    const g = new LightGrid();
    g.begin(0, 0);
    const x = g.originX + 100, z = g.originZ + 100; // well inside, near the camera
    for (let k = 0; k < 12; k++) g.add(x, 0, z, 2, 1, 1, 1, 1 + k); // brightness 1..12
    const i = ci(g, x), j = ci(g, z);
    const ids = cellList(g, i, j).sort((a, b) => a - b);
    expect(ids).toHaveLength(MAX_PER_CELL);
    expect(ids).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
    g.add(x, 0, z, 2, 1, 1, 1, 0.1); // dimmer than all: dropped from the cell
    expect(cellList(g, i, j)).not.toContain(12);
  });

  it('drops lights out of range, dark, NaN or over the cap; fades near the edge', () => {
    const g = new LightGrid();
    g.begin(0, 0);
    expect(g.add(GRID_HALF + 1, 0, 0, 5, 1, 1, 1, 1)).toBe(false);
    expect(g.add(0, 0, -GRID_HALF - 50, 5, 1, 1, 1, 1)).toBe(false);
    expect(g.add(NaN, NaN, NaN, 5, 1, 1, 1, 1)).toBe(false);
    expect(g.add(0, 0, 0, 5, 1, 1, 1, 0)).toBe(false);
    expect(g.lights).toBe(0);
    expect(g.add(10, 0, 10, 5, 1, 1, 1, 1)).toBe(true);
    expect(g.data[LIGHTS_OFFSET + 7]).toBe(1);
    g.add(GRID_HALF - 16, 0, 0, 5, 1, 1, 1, 1); // halfway through the fade
    expect(g.data[LIGHTS_OFFSET + 8 + 7]).toBeCloseTo(0.5, 5);
    g.add(GRID_HALF - 0.01, 0, 0, 5, 1, 1, 1, 1);
    expect(g.data[LIGHTS_OFFSET + 16 + 7]).toBeLessThan(1e-4);
    g.begin(0, 0);
    for (let k = 0; k < MAX_LIGHTS + 20; k++) g.add((k % 20) * 5 - 50, 0, Math.floor(k / 20) * 5 - 50, 2, 1, 1, 1, 1);
    expect(g.lights).toBe(MAX_LIGHTS);
  });

  it('rebuilds without allocating (same arrays, cleared each frame)', () => {
    const g = new LightGrid();
    const refs = [g.data, g.count, g.score];
    const list = [];
    for (let k = 0; k < 200; k++) list.push({ x: (k % 15) * 9 - 60, y: 1, z: Math.floor(k / 15) * 9 - 60, radius: 8, color: [1, 0.6, 0.3], intensity: 1, kind: 'lamp', phase: k, level: 1 });
    fillLightGrid(g, list, 0, 0, 0);
    expect(g.lights).toBe(200);
    for (let f = 0; f < 5; f++) fillLightGrid(g, list, f * 1.5, 0, f);
    expect([g.data, g.count, g.score]).toEqual(refs);
    expect(g.data).toBe(refs[0]); expect(g.count).toBe(refs[1]); expect(g.score).toBe(refs[2]);
    list.length = 0;
    fillLightGrid(g, list, 0, 0, 0);
    expect(g.lights).toBe(0);
    expect(cellList(g, 32, 32)).toEqual([]); // stale entries cleared
  });
});
