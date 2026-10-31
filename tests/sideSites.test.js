import { describe, it, expect } from 'vitest';
import { createMirage, MIRAGE, createFalls, FALLS, createGlassBattle, GLASS, FROST, STONE, createBuriedDoor, DOOR, createFloodGarden, FLOOD } from '../src/game/puzzles/sides.js';

describe('the Mirage Map', () => {
  it('bearings only at noon, and the cistern only where they cross', () => {
    const m = createMirage(), [x, z] = MIRAGE.cross;
    expect(m.take(0, 9)).toBe(false); expect(m.take(0, 12)).toBe(true); expect(m.take(0, 12)).toBe(false);
    for (let i = 0; i < 9; i++) expect(m.plough(x, z)).toBe(false); // one bearing is not enough
    m.take(1, 12);
    let r = false; for (let i = 0; i < MIRAGE.digs; i++) r = m.plough(x + 2, z - 1);
    expect(r).toBe(true); expect(m.found).toBe(true);
  });
  it('digging elsewhere finds nothing', () => {
    const m = createMirage(); m.take(0, 12); m.take(1, 12);
    for (let i = 0; i < 9; i++) m.plough(1000, 1000);
    expect(m.found).toBe(false);
  });
});
describe('the Frozen Falls', () => {
  it('a frozen fall thaws in 60 s of sun and keeps in shade', () => {
    const a = createFalls(), b = createFalls();
    a.freeze(FALLS.foot[0], FALLS.foot[1]); b.freeze(FALLS.foot[0], FALLS.foot[1]);
    for (let t = 0; t < 61; t++) { a.update(1, false); b.update(1, true); }
    expect(a.life[0]).toBe(0); expect(b.life[0]).toBeGreaterThan(0);
  });
  it('the window counts only from the top', () => {
    const f = createFalls(), [x, z, y] = FALLS.high;
    expect(f.arrive(x, 96, z)).toBe(false); expect(f.arrive(x, y, z)).toBe(true); expect(f.arrive(x, y, z)).toBe(false);
  });
});
describe('the Glass Battle', () => {
  const stand = (G) => [G.at[0] + G.from[0], G.at[1] + G.from[1]];
  it('needs Iven, the right place and the right element', () => {
    const b = createGlassBattle(), G = GLASS[0], [px, pz] = stand(G);
    expect(b.cast(FROST, ...G.at, px, pz)).toBe(-1);
    b.heard = true;
    expect(b.cast(STONE, ...G.at, px, pz)).toBe(-1);
    expect(b.cast(FROST, ...G.at, px - 40, pz)).toBe(-1);
    expect(b.cast(FROST, ...G.at, px, pz)).toBe(0);
    expect(b.cast(FROST, ...G.at, px, pz)).toBe(-1);
  });
  it('the fifth takes any element', () => {
    const b = createGlassBattle(); b.heard = true; const G = GLASS[4];
    expect(b.cast('gale', ...G.at, ...stand(G))).toBe(4);
  });
  it('all five can be done', () => {
    const b = createGlassBattle(); b.heard = true;
    GLASS.forEach((G) => b.cast(G.el === 'any' ? FROST : G.el, ...G.at, ...stand(G)));
    expect(b.count()).toBe(5);
  });
});
describe('the Buried Door', () => {
  const r = (b, k) => b.ridge(...DOOR.spots[k]);
  it('door, vent, stair opens it', () => { const b = createBuriedDoor(); r(b, 0); r(b, 1); r(b, 2); expect(b.open).toBe(true); });
  it('the wrong order buries what was cleared, and can be put right', () => {
    const b = createBuriedDoor(); r(b, 2); r(b, 1); expect(b.clear[2]).toBe(false);
    r(b, 0); expect(b.clear[1]).toBe(false); expect(b.open).toBe(false);
    r(b, 1); r(b, 2); expect(b.open).toBe(true);
  });
});
describe('the Flood Garden', () => {
  const run = (f, s, h = 18) => { let e = 0; for (let t = 0; t < s; t += 0.5) { const r = f.update(0.5, h); e = r || e; if (f.done) break; } return e; };
  const gate = (k) => FLOOD.gates[k].at;
  it('nothing runs before the dusk', () => { const f = createFloodGarden(); run(f, 20, 12); expect(f.level[0]).toBe(0); });
  it('a channel cut in dry sand slumps; wetted first, it holds (G5)', () => {
    const a = createFloodGarden(); a.brush('plough', ...gate(2)); run(a, 11, 12); expect(a.open[2]).toBe(false);
    const b = createFloodGarden(); b.brush('wet', ...gate(2)); b.brush('plough', ...gate(2)); run(b, 11, 12); expect(b.open[2]).toBe(true);
  });
  it('with all three gates held, all four cisterns fill in one run', () => {
    const f = createFloodGarden();
    f.brush('ridge', ...gate(0)); f.brush('wet', ...gate(2)); f.brush('plough', ...gate(2)); f.brush('ice', ...gate(1));
    for (let t = 0; t < 45 && !f.done; t += 5) { f.brush('ice', ...gate(1)); run(f, 5); }
    expect(f.done).toBe(true);
  });
  it('a run that falls short drains, and comes again the next dusk', () => {
    const f = createFloodGarden(); expect(run(f, 95)).toBe(-1); expect(f.level[0]).toBe(0);
    run(f, 2, 12); expect(f.t).toBe(-1); run(f, 2, 18); expect(f.t).toBeGreaterThanOrEqual(0);
  });
});
