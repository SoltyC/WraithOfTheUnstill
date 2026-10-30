import { describe, it, expect } from 'vitest';
import { HAUNTS, CAMP, CAMP_KEEP } from '../src/systems/ergHaunts.js';
import { glassSites } from '../src/world/glassKit.js';

describe('erg haunts (the user\'s placement choice)', () => {
  it('keep every kind to its own ground, none within reach of the camp, groups within the Shaped cap', () => {
    for (const [id, x, z, group] of HAUNTS) {
      expect(Math.hypot(x - CAMP[0], z - CAMP[1])).toBeGreaterThan(CAMP_KEEP + 60);
      expect(group.length).toBeGreaterThan(0); expect(group.length).toBeLessThanOrEqual(4);
      const kinds = new Set(group.map((s) => s[0]));
      if (id.startsWith('glass-')) expect(kinds.has('glasssworn')).toBe(true); else expect(kinds.has('glasssworn')).toBe(false);
    }
  });
  it('puts a Glass-sworn at each of the five glass fields', () => {
    const hearts = glassSites({}).filter((s) => s.id.endsWith('-heart'));
    for (const h of hearts) expect(HAUNTS.some(([id, x, z, g]) => g.some((s) => s[0] === 'glasssworn') && Math.hypot(x - h.at[0], z - h.at[1]) < 5)).toBe(true);
  });
});
