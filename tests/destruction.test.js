// The destruction system: pieces (world/fracture.js), the collapse (game/collapse.js), the eruption's fronts
// (systems/eruption.js frontAt), the crater (world/crater.js).
import { describe, it, expect, beforeAll } from 'vitest';
import { buildDebris } from '../src/world/fracture.js';
import { createCollapse, physicsReady } from '../src/game/collapse.js';
import { MAT } from '../src/world/architecture.js';
import { towerHouse } from '../src/world/towerKit.js';
import { craterTarget, PIT, LEDGE, LAKE_LEVEL } from '../src/world/crater.js';
import { frontAt } from '../src/systems/eruption.js';

const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const tower = { id: 't', facing: 0, build: (b) => { towerHouse(b, 0, 0, 0, 0, { storeys: 3, seed: 5 }); b.box(8, 0, 0, 3, 3, 0.25, 0, MAT.PLASTER, 9); } };

describe('fracture', () => {
  const d = buildDebris(tower, 3, rng(7));
  it('breaks a building into many pieces, each vertex belonging to one', () => {
    expect(d.frags.length).toBeGreaterThan(80);
    const n = d.positions.length / 3;
    expect(d.frag.length / 4).toBe(n);
    for (let v = 0; v < n; v += 97) expect(d.frag[v * 4]).toBeLessThan(d.frags.length);
    for (let k = 0; k < d.indices.length; k += 31) expect(d.indices[k]).toBeLessThan(n);
  });
  it('keeps every vertex near its own piece (pivots are the pieces\' centres)', () => {
    for (let v = 0; v < d.positions.length / 3; v += 53) {
      const f = d.frags[d.frag[v * 4]], r = Math.hypot(d.positions[v * 3], d.positions[v * 3 + 1], d.positions[v * 3 + 2]);
      expect(r).toBeLessThan(Math.hypot(...f.half) + 0.5);
    }
  });
  it('splits a plaster slab into blocks and marks a tower as one structure', () => {
    const plaster = d.frags.filter((f) => f.mat === MAT.PLASTER);
    expect(plaster.length).toBeGreaterThan(6);
    for (const f of plaster) expect(Math.max(...f.half)).toBeLessThan(1.4);
    expect(new Set(d.frags.filter((f) => f.struct >= 0).map((f) => f.struct)).size).toBe(1);
  });
  it('is deterministic', () => {
    const e = buildDebris(tower, 3, rng(7));
    expect(e.frags.length).toBe(d.frags.length);
    expect(e.positions[123]).toBe(d.positions[123]);
  });
  it('stamps every vertex with the site index (the shader\'s site uniforms)', () => { expect(d.info[0]).toBe(3); expect(d.info[d.info.length - 4]).toBe(3); });
});

describe('collapse (Rapier)', () => {
  const d = buildDebris(tower, 0, rng(7));
  const runs = {};
  const run = (seed) => { if (!runs[seed]) { const c = createCollapse(d, { origin: [0, 10, 0], ground: () => 10, force: [1, 0], seed }); c.finish(); runs[seed] = c; } return runs[seed]; };
  beforeAll(async () => { await physicsReady; run(3); run(4); }, 120000);
  it('comes to rest, nothing lost under the ground or thrown into the air', () => {
    const c = run(3);
    expect(c.done).toBe(true);
    d.frags.forEach((f, i) => { if (f.fixed) return; const y = c.xf[i * 8 + 1]; expect(y).toBeGreaterThan(8.8); expect(y).toBeLessThan(10 + 9); });
  });
  it('brings the tower down when the lava eats its foot: its top pieces end low', () => {
    const c = run(3), top = d.frags.map((f, i) => [f, i]).filter(([f]) => f.pivot[1] > 9 && !f.fixed);
    expect(top.length).toBeGreaterThan(3);
    const low = top.filter(([, i]) => c.xf[i * 8 + 1] < 10 + 6).length;
    expect(low / top.length).toBeGreaterThan(0.7);
  });
  it('breaks bonds: the building ends as many bodies', () => {
    const c = run(3);
    expect(c.bonds.filter((b) => b.broken).length).toBeGreaterThan(c.bonds.length * 0.2);
    expect(c.clusters.filter((cl) => !cl.dead).length).toBeGreaterThan(20);
  });
  it('differs between seeds', () => { expect(Array.from(run(3).xf)).not.toEqual(Array.from(run(4).xf)); });
  it('quaternions stay unit', () => {
    const c = run(3);
    for (let i = 0; i < d.frags.length; i += 7) expect(Math.hypot(c.xf[i * 8 + 4], c.xf[i * 8 + 5], c.xf[i * 8 + 6], c.xf[i * 8 + 7])).toBeCloseTo(1, 3);
  });
  it('builds a heap: rubble stands over the ground where the tower fell', () => { expect(Math.max(...run(3).heap().h)).toBeGreaterThan(0.5); });
});

describe('the crater and the eruption', () => {
  it('the pit: a lake floor in the middle, the ledge above the highest lava', () => {
    expect(craterTarget(PIT.x, PIT.z)).toBeLessThan(PIT.floor + 1);
    expect(craterTarget(LEDGE.x, LEDGE.z)).toBeGreaterThan(Math.max(...LAKE_LEVEL) + 5);
    expect(craterTarget(PIT.x + 400, PIT.z)).toBe(Infinity);
  });
  it('a front advances with time along its flow and stops at its end', () => {
    const f = { pts: [[0, 0, 0, 5, 0], [10, 0, 0, 5, 2], [20, 0, 0, 5, 6]] }, along = [0, 10, 20];
    expect(frontAt(f, along, 0)).toBe(0);
    expect(frontAt(f, along, 1)).toBeCloseTo(5);
    expect(frontAt(f, along, 4)).toBeCloseTo(15);
    expect(frontAt(f, along, 99)).toBe(20);
  });
});
