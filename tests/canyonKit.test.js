// The ravine wall kit (world/canyonKit.js) built from the baked cliff lines (world/ravines.json).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { buildCanyonKit, cliffOffset, CANYON_LODS, WALL } from '../src/world/canyonKit.js';

const data = JSON.parse(fs.readFileSync(new URL('../data/world/ravines.json', import.meta.url)));
const chunks = buildCanyonKit(data);

describe('canyon wall kit', () => {
  it('has cliff lines for every kind of ravine wall', () => {
    expect(data.walls.length).toBeGreaterThan(100);
    for (const k of ['canyon', 'slot', 'rift']) expect(data.spines.some((s) => s.kind === k), k).toBe(true);
    // Every strata ledge line carries x, z, normal, top, depth, foot height; the normal is unit.
    for (const w of data.walls) for (const p of w.pts) { expect(p.length).toBe(7); expect(Math.abs(Math.hypot(p[2], p[3]) - 1)).toBeLessThan(0.05); }
  });
  it('builds finite geometry with unit normals at every level of detail', () => {
    expect(chunks.length).toBeGreaterThan(30);
    for (const c of chunks.slice(0, 12)) for (let l = 0; l < CANYON_LODS.length; l++) {
      const g = c.build(l), n = g.positions.length / 3;
      expect(n, c.key + ' lod ' + l).toBeGreaterThan(0);
      for (const v of g.positions) expect(Number.isFinite(v)).toBe(true);
      for (let i = 0; i < n; i++) expect(Math.abs(Math.hypot(g.normals[i * 3], g.normals[i * 3 + 1], g.normals[i * 3 + 2]) - 1)).toBeLessThan(1e-3);
      let maxI = 0; for (const i of g.indices) maxI = Math.max(maxI, i);
      expect(maxI).toBeLessThan(n);
    }
  });
  it('keeps the near level within a frame-safe size per chunk', () => {
    let worst = 0;
    for (const c of chunks) worst = Math.max(worst, c.build(0).positions.length / 3);
    expect(worst).toBeLessThan(90000);
  });
  it('never sets the face behind the terrain riser it hides', () => {
    // The riser climbs from iso (at the line) to top, depth metres back: a face point at height y
    // must stand in front of (y − iso)·depth/(top − iso).
    for (let s = 0; s < 400; s += 3.7) for (let y = 100; y <= 112; y += 0.5) for (const kind of [WALL.canyon, WALL.slot]) {
      const iso = 100, top = 111, depth = 5;
      const o = cliffOffset(s, y, iso, top, depth, 0.37, kind);
      expect(o).toBeGreaterThanOrEqual(-((y - iso) * depth / (top - iso) - 0.3) - 1e-9);
    }
  });
  it('gives the slot and rift kinds only inside their own trenches', () => {
    // The wall nearest the Galleries' floor at the canyon's middle is canyon rock.
    const kinds = new Set();
    for (const c of chunks) { const g = c.far; for (let i = 2; i < g.cliff.length; i += 4) kinds.add(g.cliff[i]); }
    expect([...kinds].sort()).toEqual([WALL.canyon, WALL.rift, WALL.slot]);
  });
});
