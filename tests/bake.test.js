import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bake, HEIGHT_OFFSET, HEIGHT_SCALE } from '../tools/bake-world/index.mjs';
import { priorityFlood, flowAccumulation } from '../tools/bake-world/hydrology.mjs';

describe('world bake', () => {
  it('is byte-identical across runs (reduced scale)', async () => {
    const a = fs.mkdtempSync(path.join(os.tmpdir(), 'bake-a-')), b = fs.mkdtempSync(path.join(os.tmpdir(), 'bake-b-'));
    const ma = await bake({ seed: 7, out: a, scale: 8 });
    const mb = await bake({ seed: 7, out: b, scale: 8 });
    expect(Object.keys(ma.files).length).toBeGreaterThan(5);
    expect(mb.files).toEqual(ma.files);
    const mc = await bake({ seed: 8, out: b, scale: 8 });
    expect(mc.files['height_overview.u16']).not.toBe(ma.files['height_overview.u16']);
    fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true });
  }, 60000);

  it('committed manifest describes a consistent full-scale world', () => {
    const m = JSON.parse(fs.readFileSync('data/world/manifest.json', 'utf8'));
    expect(m.worldSize).toBe(8192);
    expect(m.height.texel).toBe(2);
    expect(m.height.tiles * m.height.tile).toBe(m.height.size);
    expect(Object.keys(m.files).filter((f) => f.startsWith('height/')).length).toBe(m.height.tiles * m.height.tiles);
    const pois = JSON.parse(fs.readFileSync('data/world/pois.json', 'utf8')).pois;
    expect(pois.find((p) => p.id === 'monastery')?.biome).toBe('frost');
    expect(pois.filter((p) => p.kind === 'warden-arena').length).toBe(6);
    // Height encoding round-trips at 1/32 m.
    const v = Math.round((123.456 + HEIGHT_OFFSET) * HEIGHT_SCALE);
    expect(Math.abs(v / HEIGHT_SCALE - HEIGHT_OFFSET - 123.456)).toBeLessThan(1 / 64);
  });
});

describe('hydrology', () => {
  it('priority flood leaves no interior pits and accumulation conserves flow', () => {
    const n = 32;
    const h = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = 10 + ((i * 7 + j * 13) % 5) - (i === 16 && j === 16 ? 8 : 0);
    const f = priorityFlood(h, n, -1);
    for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
      const c = j * n + i;
      let lower = false;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if ((di || dj) && f[(j + dj) * n + i + di] < f[c]) lower = true;
      expect(lower).toBe(true);
    }
    const { acc, recv } = flowAccumulation(f, n);
    let outflow = 0;
    for (let c = 0; c < n * n; c++) if (recv[c] < 0) outflow += acc[c];
    expect(outflow).toBe(n * n);
  });
});
