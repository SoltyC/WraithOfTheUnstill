// F0 acceptance: the grown fen stays inside its mask. tests/fixtures/f0-baseline.json was taken from the committed bake before it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fenMask } from '../tools/bake-world/geography.mjs';

const dir = 'data/world/';
const base = JSON.parse(fs.readFileSync('tests/fixtures/f0-baseline.json', 'utf8'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const rd = (f) => fs.readFileSync(dir + f);
const east = (f, n, ch) => { const a = rd(f), p = []; for (let j = 0; j < n; j++) p.push(a.subarray((j * n + n * 3 / 8) * ch, (j * n + n) * ch)); return sha(Buffer.concat(p)); };
const north = (f, n, ch) => sha(rd(f).subarray(0, Math.floor(n * (4096 - 1408) / 8192) * n * ch));
const tiles = (t0, t1, j0, j1) => { const p = []; for (let tj = j0; tj < j1; tj++) for (let ti = t0; ti < t1; ti++) p.push(rd(`height/${ti}_${tj}.u16`)); return sha(Buffer.concat(p)); };
const u16 = (f) => { const b = rd(f); return new Uint16Array(b.buffer, b.byteOffset, b.length / 2); };
const MAPS = [['biomeA', 'biome_a.rgba8', 1024, 4], ['biomeB', 'biome_b.rgba8', 1024, 4], ['surface', 'surface.rgba8', 2048, 4], ['hydro', 'hydro.rgba8', 2048, 4], ['lakeLevel', 'lake_level.u16', 2048, 2]];

describe('F0: the fen grows and nothing else moves', () => {
  it.each(MAPS)('%s is byte-identical east of x = -1024 and north of z = 1408', (k, f, n, ch) => {
    expect(east(f, n, ch)).toBe(base[k + 'East']);
    expect(north(f, n, ch)).toBe(base[k + 'North']);
  });
  it('the height tiles outside the fen are byte-identical', () => {
    expect(tiles(6, 16, 0, 16)).toBe(base.heightEast);
    expect(tiles(0, 6, 0, 5)).toBe(base.heightNorth);
  });
  it('the mask is exactly 0 where the fen must not reach', () => {
    for (let z = -4000; z <= 4000; z += 37) expect(fenMask(-1030, z, 1)).toBe(0);
    for (let x = -4000; x <= 0; x += 37) { expect(fenMask(x, 1400, 1)).toBe(0); expect(fenMask(x, -2680, 1)).toBe(0); }
  });

  const m = JSON.parse(rd('manifest.json')), P = JSON.parse(rd('pois.json')).pois, n4 = m.surface.size, c4 = m.surface.texel, no = m.height.overview.size;
  const O = u16('height_overview.u16'), L = u16('lake_level.u16'), hy = rd('hydro.rgba8');
  const dec = (v) => v / 32 - 128, cell = (x, z) => Math.floor((4096 - z) / c4) * n4 + Math.floor((x + 4096) / c4);
  const groundAt = (j, i) => dec(O[Math.floor((j + 0.5) * no / n4) * no + Math.floor((i + 0.5) * no / n4)]);
  const sites = P.filter((p) => p.pos[0] < -1024);

  it('is near 7 km² of mire, 40 to 50 % of it water', () => {
    const c8 = m.biome.texel, n = m.biome.size, a = rd('biome_a.rgba8'), b = rd('biome_b.rgba8');
    let dominant = 0, ground = 0, water = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const o = (j * n + i) * 4, w = [a[o], a[o + 1], a[o + 2], a[o + 3], b[o], b[o + 1]];
      const q = n4 / n, c = Math.floor((j + 0.5) * q) * n4 + Math.floor((i + 0.5) * q), h = groundAt(Math.floor((j + 0.5) * q), Math.floor((i + 0.5) * q));
      const mire = w[2] >= Math.max(...w), x = -4096 + (i + 0.5) * c8, z = 4096 - (j + 0.5) * c8;
      if (mire) dominant++;
      if (h < -4 || (!mire && !(h < 0 && fenMask(x, z, 1) > 0.3))) continue;
      ground++;
      if ((hy[c * 4 + 1] > 0 && L[c] > 0) || h < 0) water++;
    }
    expect(dominant * c8 * c8 / 1e6).toBeGreaterThan(7);
    expect(water / ground).toBeGreaterThan(0.4);
    expect(water / ground).toBeLessThan(0.5);
  });
  it('every site in the west stays dry', () => {
    for (const p of sites) expect(hy[cell(...p.pos) * 4 + 1], p.id).toBe(0);
    expect(sites.length).toBe(10);
  });
  it('every site in the west can be walked to, wading no deeper than a metre', () => {
    const ok = new Uint8Array(n4 * n4), seen = new Uint8Array(n4 * n4);
    for (let j = 0; j < n4; j++) for (let i = 0; i < n4; i++) { const c = j * n4 + i; ok[c] = (L[c] ? dec(L[c]) : 0) - groundAt(j, i) < 1 ? 1 : 0; }
    const st = [cell(-950, -700)]; seen[st[0]] = 1;
    while (st.length) { const k = st.pop(); for (const q of [k - 1, k + 1, k - n4, k + n4]) if (q >= 0 && q < n4 * n4 && ok[q] && !seen[q]) { seen[q] = 1; st.push(q); } }
    for (const p of sites) expect(seen[cell(...p.pos)], p.id).toBe(1);
  });
});
