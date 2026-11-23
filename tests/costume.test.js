import { describe, it, expect } from 'vitest';
import { buildStrawHat, buildBasket } from '../src/render/costumeGeo.js';
import { COSTUMES } from '../src/game/costumes.js';

describe('Costume parts (render/costumeGeo.js)', () => {
  for (const [name, build] of [['hat', buildStrawHat], ['basket', buildBasket]]) {
    it(`${name}: finite, unit normals everywhere (a zero normal at a pole turned every frame black)`, () => {
      const d = build(1);
      for (const k of ['positions', 'normals', 'uvs', 'tangents', 'info']) for (const v of d[k]) expect(Number.isFinite(v)).toBe(true);
      for (let i = 0; i < d.normals.length; i += 3) expect(Math.hypot(d.normals[i], d.normals[i + 1], d.normals[i + 2])).toBeCloseTo(1, 3);
      expect(d.indices.length / 3).toBeLessThan(60000);
      for (const i of d.indices) expect(i).toBeLessThan(d.positions.length / 3);
    });
  }
  it('the Sow costume names only parts that exist', () => {
    expect(COSTUMES.sow.hat && COSTUMES.sow.basket).toBe(true);
    expect(COSTUMES.sow.fur).toBe(false);
  });
});
