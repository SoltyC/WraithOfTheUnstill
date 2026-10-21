import { describe, it, expect } from 'vitest';
import { REACTIONS, CROSS, CHANNELS, SURFACES, ELEMENTS, reactionFor } from '../src/game/combat/reactions.js';
import { BRUSH } from '../src/shaders/terrainState.wgsl.js';

const names = (b) => (b == null ? [] : Array.isArray(b) ? b : [b]);

describe('reaction table', () => {
  it('has every surface with all five elements', () => {
    expect(Object.keys(REACTIONS).sort()).toEqual([...SURFACES].sort());
    for (const s of SURFACES) expect(Object.keys(REACTIONS[s]).sort()).toEqual([...ELEMENTS].sort());
  });
  it('gives each entry a result and valid, non-empty writes', () => {
    for (const s of SURFACES) for (const e of ELEMENTS) {
      const x = REACTIONS[s][e];
      expect(x.result.length, `${s}+${e}`).toBeGreaterThan(0);
      expect(x.writes.length, `${s}+${e}`).toBeGreaterThan(0);
      for (const w of x.writes) expect(CHANNELS, `${s}+${e}`).toContain(w);
    }
  });
  it('reactionFor returns entries, and null for unknown keys', () => {
    expect(reactionFor('sand', 'ember')).toBe(REACTIONS.sand.ember);
    expect(reactionFor('sand', 'ember').result).toMatch(/glass/);
    expect(reactionFor('lava', 'ember')).toBeNull();
    expect(reactionFor('sand', 'void')).toBeNull();
    expect(reactionFor('toString', 'frost')).toBeNull();
    expect(reactionFor('sand', 'constructor')).toBeNull();
  });
  it('names only brush programs that exist', () => {
    for (const s of SURFACES) for (const e of ELEMENTS) for (const n of names(REACTIONS[s][e].brush)) expect(BRUSH[n], n).toBeTypeOf('number');
    for (const c of Object.values(CROSS)) for (const n of names(c.brush)) expect(BRUSH[n], n).toBeTypeOf('number');
  });
  it('wires gale to FLATTEN and STRIP, and frost on grass to a freeze', () => {
    for (const s of ['snow', 'sand', 'grass', 'ash']) {
      const b = names(REACTIONS[s].gale.brush);
      expect(b).toContain('FLATTEN');
      expect(b).toContain('STRIP');
    }
    expect(names(REACTIONS.grass.frost.brush)).toContain('FREEZE');
    expect(REACTIONS.grass.frost.writes).toContain('flatten');
  });
  it('flags cross reactions, only gust-over-slush implemented', () => {
    expect(Object.keys(CROSS).sort()).toEqual(['gustSlush', 'updraftRibbon', 'vortexSnow']);
    expect(CROSS.gustSlush.implemented).toBe(true);
    expect(CROSS.gustSlush.brush).toBe('FLATTEN');
    expect(CROSS.vortexSnow.implemented).toBe(false);
    expect(CROSS.updraftRibbon.implemented).toBe(false);
  });
});
