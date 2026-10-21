// The Wraith's glide pose: off at 0 (unchanged), pitched and spread at 1, rolls with the bank.
import { describe, it, expect } from 'vitest';
import { Gait } from '../src/character/wraith/gait.js';
import { Body } from '../src/character/wraith/body.js';

const flat = { qx: 0, qz: 0, h: 0, sample() { this.h = 0; } };
function pose(glide, bank = 0, swim = 0) {
  const g = new Gait(flat), b = new Body();
  g.bx = 0; g.by = 10; g.bz = 0; g.yaw = 0; g.grounded = false; g.dt = 1 / 60; g.glide = glide; g.swim = swim;
  b.dt = 1 / 60; b.glide = glide; b.glideBank = bank; b.swim = swim;
  for (let i = 0; i < 400; i++) { g.update(); b.update(g); }
  return { g, b };
}

describe('glide pose', () => {
  it('is untouched at glide 0', () => {
    const { b } = pose(0, 0.5);
    expect(b.gBank).toBe(0);
    expect(b.lean).toBeLessThan(0.2);
  });
  it('pitches ~60° with the arms spread wide and the legs trailing', () => {
    const { g, b } = pose(1);
    expect(b.lean).toBeGreaterThan(0.95);
    expect(Math.abs(b.ha[0] - b.ha[3])).toBeGreaterThan(1.1);
    expect(b.ha[2]).toBeLessThan(b.sh[2] - 0.2); // swept back
    expect(g.fz[0]).toBeLessThan(g.pz - 0.5);
  });
  it('banks right: the right wing dips, the left rises', () => {
    const { b } = pose(1, 0.5);
    expect(b.ha[4]).toBeLessThan(b.ha[1]);
  });
  it('swimming wins over glide', () => {
    const { b } = pose(1, 0.5, 1);
    expect(Math.abs(b.gBank)).toBeLessThan(1e-3);
  });
});
