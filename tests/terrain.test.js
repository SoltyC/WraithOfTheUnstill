import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { hashU32, valueNoise, fbm } from '../src/terrain/noise.js';
import { mesoHeight } from '../src/terrain/meso.js';
import { WorldData } from '../src/world/worldData.js';
import { PatchGround } from '../src/world/patchGround.js';

describe('noise (shared JS/WGSL definitions; golden values pin cross-platform determinism)', () => {
  it('hash is a stable 32-bit integer function', () => {
    expect(hashU32(0)).toBe(0);
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
  it('meso layers only appear where their biome is present', () => {
    expect(mesoHeight(100, 200, 0, 0, 0, 0, 0, 0, 1, 0)).toBe(0);
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < 400; i++) { const h = mesoHeight(i * 1.5, 0, 0, 0, 0, 1, 0, 0, 1, 0); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    expect(hi - lo).toBeGreaterThan(8); // dunes have real relief
  });
});

function loadWorld() {
  const m = JSON.parse(fs.readFileSync('data/world/manifest.json', 'utf8'));
  const w = new WorldData(m);
  const u8 = (f) => new Uint8Array(fs.readFileSync('data/world/' + f));
  w.overview = new Uint16Array(u8(m.height.overview.file).buffer);
  w.biomeA = u8(m.biome.files[0]); w.biomeB = u8(m.biome.files[1]); w.wind = u8(m.wind.file);
  return { w, m, u8 };
}

describe('WorldData (collision height = macro + meso)', () => {
  it('Catmull-Rom macro reproduces texel values at texel centres once a tile is resident', () => {
    const { w, u8 } = loadWorld();
    const tile = new Uint16Array(u8('height/7_7.u16').buffer);
    w.setTile(7, 7, tile);
    for (const [li, lj] of [[10, 20], [128, 128], [200, 31]]) {
      const i = 7 * 256 + li, j = 7 * 256 + lj;
      w.qx = -4096 + (i + 0.5) * 2; w.qz = 4096 - (j + 0.5) * 2;
      w._macro();
      expect(w.macro).toBeCloseTo(tile[lj * 256 + li] / 32 - 128, 6);
    }
  });
  it('falls back to the overview until a tile is resident, then changes only locally', () => {
    const { w, u8 } = loadWorld();
    const x = -4096 + 3 * 512 + 100, z = 4096 - 9 * 512 - 100;
    const before = w.heightAt(x, z);
    w.setTile(3, 9, new Uint16Array(u8('height/3_9.u16').buffer));
    const after = w.heightAt(x, z);
    expect(Math.abs(after - before)).toBeLessThan(3); // overview and detail agree to metres
    const far = w.heightAt(1000, -1000);
    expect(Number.isFinite(far)).toBe(true);
  });
});

describe('PatchGround', () => {
  const plane = (x0, z0, n, step, f) => {
    const h = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = f(x0 + i * step, z0 + j * step);
    return { x0, z0, n, step, heights: h, version: 1 };
  };
  it('samples fine first, falls back to coarse, and reports coverage', () => {
    const g = new PatchGround();
    g.install(plane(-100, -100, 101, 2, (x, z) => 0.1 * x + 5), false);
    g.install(plane(-10, -10, 81, 0.25, (x, z) => 0.1 * x + 5 + 0.25), true);
    g.qx = 0; g.qz = 0; g.sample(); expect(g.h).toBeCloseTo(5.25, 5);
    expect(g.coversFine()).toBe(true);
    g.qx = 50; g.qz = 0; g.sample(); expect(g.h).toBeCloseTo(10, 5);
    expect(g.coversFine()).toBe(false);
    g.qx = 1; g.qz = 2; g.sampleNormal();
    expect(g.nx).toBeCloseTo(-0.1 / Math.sqrt(1.01), 4);
    expect(g.ready).toBe(true);
  });
});
