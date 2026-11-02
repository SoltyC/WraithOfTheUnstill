import { describe, it, expect } from 'vitest';
import { shotAt, evalShot, totalLength } from '../src/game/director.js';

const shots = [
  { dur: 4, ease: 1, keys: [{ t: 0, p: [0, 1, 0], at: [0, 1, 10], fov: 0.8 }, { t: 1, p: [0, 1, 4], at: [0, 1, 10], fov: 0.6 }] },
  { dur: 6, ease: 0, drift: 0.05, keys: [{ t: 0, p: [5, 2, 5], at: [0, 1, 10], focus: 6 }, { t: 0.5, p: [6, 2, 5], at: [0, 1, 10], focus: 6 }, { t: 1, p: [7, 2, 5], at: [0, 1, 10], focus: 8 }] },
];

describe('the director timeline', () => {
  it('finds the shot and flags the cut on its first frame only', () => {
    expect(totalLength(shots)).toBe(10);
    expect(shotAt(shots, 1, 1 / 60).i).toBe(0);
    const c = shotAt(shots, 4.005, 1 / 60);
    expect(c.i).toBe(1); expect(c.cut).toBe(true);
    expect(shotAt(shots, 4.05, 1 / 60).cut).toBe(false);
    expect(shotAt(shots, 99).i).toBe(1);
  });
  it('eases a shot in and out through its keys', () => {
    const o = new Float64Array(8);
    evalShot(shots[0], 0, 0, o); expect(o[2]).toBeCloseTo(0, 6);
    evalShot(shots[0], 1, 0, o); expect(o[2]).toBeCloseTo(4, 6); expect(o[6]).toBeCloseTo(0.6, 6);
    evalShot(shots[0], 0.05, 0, o); expect(o[2]).toBeLessThan(0.05 * 4 * 0.5);   // eased: slow off the mark
    evalShot(shots[0], 0.5, 0, o); expect(o[7]).toBeCloseTo(Math.hypot(0, 0, 10 - o[2]), 5);   // focus: the look-at's distance
  });
  it('moves smoothly: no step between consecutive frames, the drift small', () => {
    const a = new Float64Array(8), b = new Float64Array(8);
    let worst = 0;
    for (let f = 0; f < 600; f++) {
      const t0 = f / 60, t1 = (f + 1) / 60, s0 = shotAt(shots, t0), i0 = s0.i, u0 = s0.u, s1 = shotAt(shots, t1);
      if (s1.i !== i0) continue;   // a cut is meant to jump
      evalShot(shots[i0], u0, t0, a); evalShot(shots[i0], s1.u, t1, b);
      worst = Math.max(worst, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    expect(worst).toBeLessThan(0.05);
    const o = new Float64Array(8);
    evalShot(shots[1], 0.5, 3.3, o); expect(Math.abs(o[0] - 6)).toBeLessThan(0.06);
    expect(o[7]).toBeCloseTo(6, 5);
  });
});

import { CUTSCENES, build } from '../src/game/cutscenes.js';
import { EBB_ORIGIN } from '../src/world/ebbhold.js';
describe('cutscenes as data', () => {
  it('build the bakehouse into world-space shots with their crowds', () => {
    const b = build(CUTSCENES.bakehouse);
    expect(b.shots.length).toBe(4);
    expect(b.shots[0].keys[0].p[0]).toBeCloseTo(4 + EBB_ORIGIN.x, 6);
    expect(b.shots[0].crowd.length).toBeGreaterThan(30);
    expect(b.shots[3].crowd).toBe(null);
    expect(b.opt.blendIn).toBeGreaterThan(0);
  });
});
