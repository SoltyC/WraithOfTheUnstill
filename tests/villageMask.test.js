import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { bakeVillageMask, maskAt } from '../tools/bake-world/villageMask.mjs';
import { villageKeepout } from '../src/world/villageKeepout.js';

const sq = (cx, cz, r) => [[cx + r, cz], [cx, cz + r], [cx - r, cz], [cx, cz - r]];
const V = () => ({
  roads: [
    { id: 'a', pts: [[0, 0], [40, 0]], width: 6, surface: 'cobble', kind: 'street' },
    { id: 'b', pts: [[0, 20], [40, 20]], width: 4, surface: 'earth', kind: 'lane' },
  ],
  plots: [{ kind: 'house', at: [20, -20], facing: 0, w: 8, d: 6 }],
  greens: [{ id: 'square', kind: 'square', at: [60, 0], r: 10, poly: sq(60, 0, 10) }],
  meta: { market: [60, 0], marketRadius: 10 },
});

describe('village ground mask', () => {
  const m = bakeVillageMask(V());
  it('covers the bounding box + 40 m at 0.5 m', () => {
    expect(m.texel).toBe(0.5);
    expect(m.data.length).toBe(m.size * m.size * 4);
    expect(m.x0).toBeLessThanOrEqual(-3 - 40 + 1);
    expect(m.size * m.texel).toBeGreaterThanOrEqual(70 + 80);
  });
  it('paints a cobble road along its centreline, not beside it', () => {
    expect(maskAt(m, 20, 0)[0]).toBe(255);
    expect(maskAt(m, 20, 2.5)[0]).toBeGreaterThan(100);
    expect(maskAt(m, 20, 6)[0]).toBe(0);
    expect(maskAt(m, 20, 3.8)[1]).toBeGreaterThan(30); // earth ring just outside the stones
  });
  it('paints an earth road in G only', () => {
    const [r, g] = maskAt(m, 20, 20);
    expect(r).toBe(0); expect(g).toBeGreaterThan(200);
  });
  it('paves the square, flagstone at its middle', () => {
    expect(maskAt(m, 60, 0)[0]).toBe(255);
    expect(maskAt(m, 64, 4)[0]).toBe(255);
    expect(maskAt(m, 60, 0)[3]).toBeGreaterThan(220); // t ~ 3
    expect(maskAt(m, 60, 14)[0]).toBe(0);
  });
  it('rings the plots with trodden ground, stronger at the door', () => {
    const front = maskAt(m, 20, -20 + 3 + 1)[2]; // facing 0: the front is +z
    const back = maskAt(m, 20, -20 - 3 - 1)[2];
    expect(front).toBeGreaterThan(80);
    expect(front).toBeGreaterThan(back);
    expect(maskAt(m, 20, -20 + 3 + 6)[2]).toBe(0);
  });
  it('is zero outside the box', () => {
    expect(maskAt(m, 1e5, 1e5)).toEqual([0, 0, 0, 0]);
    expect(maskAt(m, m.x0 - 1, m.z0 - 1)).toEqual([0, 0, 0, 0]);
  });
  it('is deterministic', () => {
    const b = bakeVillageMask(V());
    expect(Buffer.from(b.data).equals(Buffer.from(m.data))).toBe(true);
  });
  it('the committed bake matches village.json', () => {
    const v = JSON.parse(fs.readFileSync('data/world/village.json', 'utf8'));
    const buf = fs.readFileSync('data/world/village_mask.rgba8');
    expect(v.mask.texel).toBe(0.5);
    expect(buf.length).toBe(v.mask.size * v.mask.size * 4);
  });
});

describe('village keep-out', () => {
  const k = villageKeepout(V());
  it('keeps trees and rocks off roads (half width + 2 m) and plots (+2 m)', () => {
    expect(k(20, 0)).toBe(true);
    expect(k(20, 4.5)).toBe(true);
    expect(k(20, 6)).toBe(false);
    expect(k(20, -20)).toBe(true);
    expect(k(20 + 4 + 1.5, -20)).toBe(true);
    expect(k(20 + 4 + 3, -20)).toBe(false);
    expect(k(20 + 4 + 3, -20, 2)).toBe(true); // a rock's radius counts
    expect(k(60, 0)).toBe(true);
    expect(k(500, 500)).toBe(false);
  });
});
