import { describe, it, expect } from 'vitest';
import { hashU32, valueNoise, fbm } from '../src/terrain/noise.js';
import { heightAt } from '../src/terrain/testHeightfield.js';
import { buildTestTerrain, gridCoord } from '../src/terrain/testTerrainBuild.js';
import { GridGround } from '../src/terrain/testGround.js';

describe('noise (shared JS/WGSL definitions; golden values pin cross-platform determinism)', () => {
  it('hash is a stable 32-bit integer function', () => {
    expect(hashU32(0)).toBe(0);
    expect(hashU32(1)).toBe(hashU32(1));
    expect([hashU32(1), hashU32(12345), hashU32(0xffffffff)]).toMatchSnapshot();
  });
  it('value noise and fbm are deterministic and bounded', () => {
    const samples = [];
    for (let i = 0; i < 64; i++) {
      const x = i * 1.37 - 40, z = i * -0.91 + 7;
      const v = valueNoise(x, z, 99);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
      samples.push(+fbm(x, z, 4, 7).toFixed(12));
    }
    expect(samples).toMatchSnapshot();
  });
  it('test heightfield is reproducible', () => {
    expect([heightAt(0, 0), heightAt(123.4, -56.7), heightAt(-1500, 900)].map((h) => +h.toFixed(9))).toMatchSnapshot();
  });
});

describe('test terrain grid and collision parity', () => {
  const n = 96;
  const t = buildTestTerrain(n);
  const g = new GridGround(t.positions, t.normals);

  it('derives the grid size and a monotonic axis', () => {
    expect(g.n).toBe(n);
    for (let i = 1; i <= n; i++) expect(gridCoord(i, n)).toBeGreaterThan(gridCoord(i - 1, n));
    expect(gridCoord(n / 2, n)).toBe(0);
  });

  it('matches mesh vertices exactly', () => {
    for (let k = 0; k < 400; k++) {
      const i = (k * 7) % (n + 1), j = (k * 13) % (n + 1);
      const v = (j * (n + 1) + i) * 3;
      expect(g.heightAt(t.positions[v], t.positions[v + 2])).toBeCloseTo(t.positions[v + 1], 4);
    }
  });

  it('interpolates inside the same triangles the mesh draws', () => {
    // A point on a triangle's plane: the average of its three vertices.
    const v = n + 1, P = t.positions;
    for (let k = 0; k < 200; k++) {
      const i = (k * 5) % n, j = (k * 11) % n;
      const a = j * v + i, b = a + 1, c = a + v, d = c + 1;
      const tri = (i + j) & 1 ? [a, b, c] : [a, b, d];
      let x = 0, y = 0, z = 0;
      for (const q of tri) { x += P[q * 3] / 3; y += P[q * 3 + 1] / 3; z += P[q * 3 + 2] / 3; }
      expect(g.heightAt(x, z)).toBeCloseTo(y, 3);
    }
  });

  it('at full resolution, stays within 2 cm of the analytic field near the player', () => {
    const full = buildTestTerrain();
    const fg = new GridGround(full.positions, full.normals);
    for (let k = 0; k < 100; k++) {
      const x = Math.sin(k) * 20, z = Math.cos(k * 1.3) * 20;
      expect(Math.abs(fg.heightAt(x, z) - heightAt(x, z))).toBeLessThan(0.02);
    }
  });

  it('returns unit normals', () => {
    const o = { x: 0, y: 0, z: 0 };
    g.normalAt(13.3, -7.1, o);
    expect(Math.hypot(o.x, o.y, o.z)).toBeCloseTo(1, 6);
    expect(o.y).toBeGreaterThan(0);
  });
});
