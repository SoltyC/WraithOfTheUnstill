import { describe, it, expect } from 'vitest';
import { ROBES, ownedRobes, wornRobe, robeMods } from '../src/game/robes.js';

describe('robes', () => {
  it('owns the wanderer always and others by flag; wears only what it owns', () => {
    const flags = new Set(), vars = {};
    expect(ownedRobes(flags).map((r) => r.id)).toEqual(['wanderer']);
    vars.robe = 'runner';
    expect(wornRobe(flags, vars).id).toBe('wanderer');   // not owned yet
    flags.add('robe:runner');
    expect(wornRobe(flags, vars).id).toBe('runner');
    expect(ownedRobes(flags).map((r) => r.id)).toEqual(['wanderer', 'runner']);
  });
  it('each robe has at most one modest property (BRIEF §2.4)', () => {
    for (const r of ROBES) {
      const m = robeMods(r), changed = Object.values(m).filter((v) => v !== 1);
      expect(changed.length).toBeLessThanOrEqual(1);
      for (const v of changed) expect(Math.abs(v - 1)).toBeLessThanOrEqual(0.4);
    }
  });
});
