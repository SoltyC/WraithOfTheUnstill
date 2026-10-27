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
  it('flags cross reactions: gust-over-slush and the Stone pairs on the surfaces that exist are implemented', () => {
    expect(Object.keys(CROSS).sort()).toEqual(['bloomVortex', 'gustSlush', 'ridgeFrost', 'shardRibbon', 'updraftRibbon', 'vortexSnow']);
    expect(CROSS.gustSlush.implemented).toBe(true);
    expect(CROSS.ridgeFrost.implemented).toBe(true);
    expect(CROSS.shardRibbon.implemented).toBe(true);
    expect(CROSS.bloomVortex.implemented).toBe(false);   // needs sand (D1)
    expect(CROSS.bloomVortex.stub).toBeTruthy();
    expect(CROSS.gustSlush.brush).toBe('FLATTEN');
    expect(CROSS.vortexSnow.implemented).toBe(false);
    expect(CROSS.updraftRibbon.implemented).toBe(false);
  });
});

describe('the Stone column (D4)', () => {
  const BUILT_SURFACES = ['snow', 'grass', 'water'];   // the surfaces that exist now (rock reads as snow here)
  it('gives every Stone cell a brush or an explicit nothing', () => {
    for (const s of SURFACES) {
      const x = REACTIONS[s].stone;
      expect(Boolean(x.nothing) !== (names(x.brush).length > 0), `${s}+stone: exactly one of a brush and an explicit nothing`).toBe(true);
    }
  });
  it('implements the built surfaces with the Stone programs, and stubs the later ones explicitly', () => {
    for (const s of ['snow', 'grass']) {
      expect(names(REACTIONS[s].stone.brush), s).toEqual(expect.arrayContaining(['PRESS', 'MOUND', 'RIDGE', 'CRATER']));
      expect(REACTIONS[s].stone.stub, s).toBeUndefined();
    }
    expect(REACTIONS.water.stone.nothing).toBe(true);
    expect(REACTIONS.water.stone.result).toMatch(/splash/i);
    for (const s of SURFACES.filter((x) => !BUILT_SURFACES.includes(x))) expect(REACTIONS[s].stone.stub, s).toBeTruthy();
  });
  it('says what snow, grass and water do with Stone in the table\'s own words', () => {
    expect(REACTIONS.snow.stone.result).toMatch(/snow and earth/i);
    expect(REACTIONS.grass.stone.result).toMatch(/turf/i);
    expect(REACTIONS.grass.stone.writes).toContain('flatten');   // the turf regrows (the blades recover)
  });
});
