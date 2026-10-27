// Phase 9 D0: dune types, the dune-type map, the ravines, the Dry Stair, the seats.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { mesoHeight } from '../src/terrain/meso.js';
import { barchanH, starH, seifH, transverseH } from '../src/terrain/dunes.js';

const range = (f, n = 20000, step = 7) => { let lo = 1e9, hi = -1e9; for (let i = 0; i < n; i++) { const h = f(i * step, (i % 97) * 11 + (i * 3.7) % 400); lo = Math.min(lo, h); hi = Math.max(hi, h); } return [lo, hi]; };
const dunes = (t, flat = 0, wF = 0) => (x, z) => mesoHeight(x, z, wF, 0, 0, 1, 0, 0, 0.85, 0.5, t, flat);

describe('dune types', () => {
  it('each type has its own relief: barchans ~11 m, transverse 22 m, stars 45–80 m, seifs ~13 m', () => {
    const wind = (f) => (x, z) => f(x * 0.85 + z * 0.5, -x * 0.5 + z * 0.85);
    const [, b] = range(wind(barchanH)), [, t] = range(wind(transverseH)), [, s] = range(wind(starH), 40000, 23), [, f] = range(wind(seifH));
    expect(b).toBeGreaterThan(6); expect(b).toBeLessThan(14);
    expect(t).toBeGreaterThan(14); expect(t).toBeLessThan(23);
    expect(s).toBeGreaterThan(40); expect(s).toBeLessThan(81);
    expect(f).toBeGreaterThan(8); expect(f).toBeLessThan(14);
  });
  it('is continuous (no seams between star cells) and deterministic', () => {
    for (let k = 0; k < 4000; k++) { const u = k * 3.1, v = (k % 53) * 41; expect(Math.abs(starH(u + 0.05, v) - starH(u, v))).toBeLessThan(0.5); }
    expect(starH(1234.5, 678.9)).toBe(starH(1234.5, 678.9));
  });
  it('the flat weight flattens everything (playas, pans, ravine floors, the arena)', () => {
    for (const t of [0, 1 / 3, 2 / 3, 1]) { const [lo, hi] = range(dunes(t, 1)); expect(hi - lo).toBeLessThan(0.6 * 1.5); }
  });
  it('the cold erg fills hollows with snow and leaves crests bare', () => {
    const [lo0] = range(dunes(1 / 3, 0, 0)), [lo1, hi1] = range(dunes(1 / 3, 0, 0.5));
    const [, hi0] = range(dunes(1 / 3, 0, 0));
    expect(lo1).toBeGreaterThan(lo0 + 3);          // hollows filled
    expect(hi1).toBeGreaterThan(hi0 - 2);          // crests still stand
  });
  it('the legacy call (no map) still gives today\'s transverse dunes', () => {
    expect(mesoHeight(300, 200, 0, 0, 0, 1, 0, 0, 1, 0)).toBe(mesoHeight(300, 200, 0, 0, 0, 1, 0, 0, 1, 0, 1 / 3, 0));
  });
});

describe('the baked erg', () => {
  const dir = 'data/world/', m = JSON.parse(fs.readFileSync(dir + 'manifest.json', 'utf8'));
  const dm = new Uint8Array(fs.readFileSync(dir + m.dunes.file));
  const at = (x, z) => { const i = Math.floor((x + 4096) / 32), j = Math.floor((4096 - z) / 32); return [dm[(j * 256 + i) * 2] / 255, dm[(j * 256 + i) * 2 + 1] / 255]; };
  it('writes the dune-type map: barchans at the margin, stars at the heart, seifs south of the belt', () => {
    expect(m.dunes.size).toBe(256);
    expect(at(1750, 900)[0]).toBeLessThan(0.15);
    expect(at(2600, 1200)[0]).toBeGreaterThan(0.6);
    expect(at(2500, -100)[0]).toBeGreaterThan(0.95);
    expect(at(2436, 1124)[1]).toBeGreaterThan(0.9);  // arena
  });
  it('carves the ravines: the canyon is 40+ m deep, the rift ~60 m', () => {
    const tile = (tx, tz) => new Uint16Array(fs.readFileSync(`${dir}height/${tx}_${tz}.u16`).buffer.slice(0));
    const h = (x, z) => { const i = Math.floor((x + 4096) / 2), j = Math.floor((4096 - z) / 2); return tile(i >> 8, j >> 8)[(j & 255) * 256 + (i & 255)] / 32 - 128; };
    expect(h(1650, 780) - h(1520, 780)).toBeGreaterThan(40);
    expect(h(2060, 1300) - h(2130, 1300)).toBeGreaterThan(40);
  });
  it('lays the Dry Stair at a caravan grade and seats the dunes\' sites', () => {
    const j = JSON.parse(fs.readFileSync(dir + 'pois.json', 'utf8'));
    const road = j.routes.find((r) => r.id === 'dry-stair');
    expect(road.drop).toBeGreaterThan(80);
    for (let k = 1; k < road.points.length; k++) { const a = road.points[k - 1], b = road.points[k]; expect(Math.abs(b[3] - a[3]) / (b[2] - a[2])).toBeLessThan(0.135); }
    const ids = new Set(j.pois.map((p) => p.id));
    for (const id of ['dry-stair-lip', 'camp-wellhouse', 'ruin-long-walker', 'glass-1', 'echo-dunes-1', 'cave-needle', 'arena-ring']) expect(ids.has(id), id).toBe(true);
  });
});
