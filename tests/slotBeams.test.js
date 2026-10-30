import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { slotBends } from '../src/render/slotShafts.js';

const { spines } = JSON.parse(fs.readFileSync(new URL('../data/world/ravines.json', import.meta.url), 'utf8'));

describe('slot beams', () => {
  it('picks a few bends per slot, spaced, deep enough, deterministic', () => {
    const rimAt = (x, z) => 150;   // a flat rim for the test
    const a = slotBends(spines, rimAt), b = slotBends(spines, rimAt);
    expect(a).toEqual(b);
    const slots = spines.filter((s) => s.kind === 'slot').length;
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThanOrEqual(4 * slots);
    for (const [x, z, top, depth, dx, dz] of a) {
      expect(depth).toBeGreaterThan(8);
      expect(top).toBe(149);
      expect(Math.hypot(dx, dz)).toBeCloseTo(1, 5);
      for (const o of a) if (o !== a.find((q) => q[0] === x && q[1] === z) && Math.hypot(o[0] - x, o[1] - z) < 30) expect(Math.hypot(o[0] - x, o[1] - z)).toBeGreaterThanOrEqual(30);
    }
  });
});
