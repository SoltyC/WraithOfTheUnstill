import { describe, it, expect } from 'vitest';
import { createKnockdown, knockTuning } from '../src/character/knockdown.js';

const ground = { qx: 0, qz: 0, h: 0, sample() { this.h = 0; } };

describe('knockdown', () => {
  it('throws the Wraith back onto its back, holds it down, then it gets up', () => {
    const k = createKnockdown(ground);
    k.hx = 0; k.hy = 0; k.hz = 0; k.hdx = 0; k.hdz = 1; k.hit();
    k.dt = 1 / 60; k.hold = true;
    let maxY = 0, landed = false;
    for (let i = 0; i < 180; i++) { k.update(); maxY = Math.max(maxY, k.y); landed = landed || k.landed; }
    expect(landed).toBe(true);
    expect(maxY).toBeGreaterThan(knockTuning.standHeight + 0.5);    // lifted
    expect(k.z).toBeGreaterThan(3);                                  // thrown back along +z
    expect(k.active).toBe(true);                                     // held down
    expect(k.uy).toBeLessThan(0.05);                                 // lying flat
    expect(k.fy).toBeGreaterThan(0.95);                              // on its back (chest up)
    expect(k.y).toBeCloseTo(knockTuning.lieHeight, 2);
    k.hold = false;
    for (let i = 0; i < 300 && k.active; i++) k.update();
    expect(k.active).toBe(false);
    expect(k.uy).toBeCloseTo(1, 3);                                  // standing
    expect(k.footY).toBeCloseTo(0, 2);
  });
});
