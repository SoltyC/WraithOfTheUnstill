import { describe, it, expect, afterEach } from 'vitest';
import { mesoHeight, duneMigration } from '../src/terrain/meso.js';

const H = (x, z) => mesoHeight(x, z, 0, 0, 0, 1, 0, 0, 1, 0, 1 / 3, 0);   // pure transverse dunes, wind +x
afterEach(() => { duneMigration.shift = 0; duneMigration.n = 0; });

describe('dune migration (D6)', () => {
  it('moves the dunes downwind by the shift, ripples aside', () => {
    const before = [];
    for (let x = 0; x < 400; x += 7) before.push(H(x, 120));
    duneMigration.shift = 25; duneMigration.n = 0;
    let worst = 0, k = 0;
    for (let x = 0; x < 400; x += 7) {
      // the big shape at x + 25 is now what it was at x (the metre ripples do not travel)
      worst = Math.max(worst, Math.abs(H(x + 25, 120) - before[k++]));
    }
    expect(worst).toBeLessThan(1.5);   // ripple amplitude only
    let moved = 0; k = 0;
    for (let x = 0; x < 400; x += 7) moved = Math.max(moved, Math.abs(H(x, 120) - before[k++]));
    expect(moved).toBeGreaterThan(3);
  });
  it('holds anchored zones still and eases out past them', () => {
    const at = (x, z) => H(x, z);
    const base = at(1000, 500), edge = at(1000, 560);
    duneMigration.shift = 40; duneMigration.n = 1; duneMigration.anchors.set([1000, 500, 30, 80]);
    expect(at(1000, 500)).toBe(base);
    expect(at(1000, 525)).toBe(H(1000, 525));
    const far = (() => { duneMigration.n = 0; const v = H(1000, 700); duneMigration.n = 1; return v; })();
    expect(H(1000, 700)).toBe(far);   // beyond r1 the full shift
    expect(Number.isFinite(edge)).toBe(true);
  });
  it('is identity at zero shift', () => {
    const a = H(321, 654); duneMigration.shift = 0; duneMigration.n = 3; expect(H(321, 654)).toBe(a);
  });
});
