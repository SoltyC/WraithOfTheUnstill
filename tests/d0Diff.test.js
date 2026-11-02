// D0 acceptance: the grown erg (and everything after it) must leave the frost and the meadow alone.
// Every hash in tests/fixtures/d0-baseline.json was taken from the committed bake before D0
// (43f2e8a); the committed bake today must reproduce them for the regions D0 must not touch.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import crypto from 'node:crypto';

const dir = 'data/world/';
const base = JSON.parse(fs.readFileSync('tests/fixtures/d0-baseline.json', 'utf8'));
const band = JSON.parse(fs.readFileSync('tests/fixtures/f0-baseline.json', 'utf8'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const rd = (f) => fs.readFileSync(dir + f);
// From x = -1024: the fen (F0) took everything west of that, and tests/f0Diff.test.js holds it to its own mask.
const bandCols = (f, rows, cols, ch, west) => {
  const a = rd(f), parts = [], from = cols * 3 / 8;
  for (let j = 0; j < rows; j++) parts.push(a.subarray((j * cols + from) * ch, (j * cols + west) * ch));
  return sha(Buffer.concat(parts));
};

describe('D0 leaves the frost, the meadow and Hearn alone', () => {
  it('biome weights from x = -1024 to 1000 are byte-identical (frost, meadow, all six channels)', () => {
    expect(bandCols('biome_a.rgba8', 1024, 1024, 4, 637)).toBe(band.d0BiomeA);
    expect(bandCols('biome_b.rgba8', 1024, 1024, 4, 637)).toBe(band.d0BiomeB);
  });
  it('the surface map from x = -1024 to 1000 is unchanged', () => {
    expect(bandCols('surface.rgba8', 2048, 2048, 4, 1274)).toBe(band.d0Surface);
  });
  it('the height tiles from x = -1024 to 512 (Hearn, the hill, the stair) are unchanged', () => {
    const parts = [];
    for (let tj = 0; tj < 16; tj++) for (let ti = 6; ti < 9; ti++) parts.push(rd(`height/${ti}_${tj}.u16`));
    expect(sha(Buffer.concat(parts))).toBe(band.d0Height);
  });
  it('the village mask, the village layout and the hill stair are unchanged', () => {
    expect(sha(rd('village_mask.rgba8'))).toBe(base.villageMask);
    expect(sha(rd('village.json'))).toBe(base.village);
    const pois = JSON.parse(rd('pois.json').toString());
    expect(sha(JSON.stringify(pois.routes[1]))).toBe(base.hillStair);
    expect(sha(JSON.stringify(pois.pois.filter((p) => ['hub', 'manor', 'stair-foot', 'warden-meadow'].includes(p.id))))).toBe(base.hillPois);
  });
  it('the erg has grown: dunes dominate more than 8 km² (baseline 4.3)', () => {
    const a = rd('biome_a.rgba8');
    let n = 0;
    for (let c = 0; c < 1024 * 1024; c++) if (a[c * 4 + 3] > 127) n++;
    expect(n * 64 / 1e6).toBeGreaterThan(8);
  });
});
