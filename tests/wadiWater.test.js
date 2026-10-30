import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { wadiRibbons } from '../src/render/wadiWater.js';

const ravines = JSON.parse(fs.readFileSync(new URL('../data/world/ravines.json', import.meta.url), 'utf8'));

describe('wadi water ribbons', () => {
  it('the bake exports the three wadis\' braids with sane beds', () => {
    expect(ravines.wadis.length).toBe(9);
    for (const w of ravines.wadis) {
      expect(w.pts.length).toBeGreaterThan(10);
      for (const [x, z, hw, bed] of w.pts) { expect(Number.isFinite(x + z + bed)).toBe(true); expect(hw).toBeGreaterThan(4); }
    }
  });
  it('builds a closed strip per braid, deterministic, indices in range', () => {
    const a = wadiRibbons(ravines.wadis), b = wadiRibbons(ravines.wadis);
    expect(a.pos).toEqual(b.pos);
    const n = a.pos.length / 3;
    expect(a.attr.length).toBe(n * 4);
    expect(a.idx.length % 6).toBe(0);
    expect(Math.max(...a.idx)).toBeLessThan(n);
    // across −1..1, the end fade 0..1, metres along non-negative
    for (let i = 0; i < n; i++) { const u = a.attr[i * 4], s = a.attr[i * 4 + 1], f = a.attr[i * 4 + 3]; expect(Math.abs(u)).toBeLessThanOrEqual(1); expect(s).toBeGreaterThanOrEqual(0); expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThanOrEqual(1); }
    // rows every 3 m: a few thousand over the braids, not tens of thousands
    expect(n / 7).toBeGreaterThan(1000); expect(n / 7).toBeLessThan(6000);
  });
  it('an empty list builds nothing', () => { expect(wadiRibbons([]).pos.length).toBe(0); });
});
