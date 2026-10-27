import { describe, it, expect } from 'vitest';
import { dotCover, uniformWet, spread, localWet, dropRadius, SAND_RAIN } from '../src/world/sandRain.js';

describe('sand wetting under rain', () => {
  it('shows individual dots before any darkening', () => {
    expect(dotCover(0.0)).toBe(0);
    expect(dotCover(0.01)).toBe(0);
    const first = dotCover(0.12);
    expect(first).toBeGreaterThan(0.001);           // drops have landed
    expect(first).toBeLessThan(0.06);                // but the sand is still mostly dry
    expect(uniformWet(0.12)).toBe(0);                // no overall darkening yet
    expect(spread(0.12)).toBe(0);
  });
  it('grows monotonically: more and bigger drops, then blotches, then uniform dark', () => {
    let prev = -1, prevU = -1, prevS = -1;
    for (let w = 0; w <= 1.0001; w += 0.02) {
      const c = dotCover(w), u = uniformWet(w), s = spread(w);
      expect(c).toBeGreaterThanOrEqual(prev - 1e-9); expect(u).toBeGreaterThanOrEqual(prevU); expect(s).toBeGreaterThanOrEqual(prevS);
      prev = c; prevU = u; prevS = s;
    }
    expect(dotCover(0.3)).toBeGreaterThan(dotCover(0.12) * 3);
    expect(uniformWet(0.5)).toBe(0);                 // dots and blotches come first
    expect(uniformWet(0.98)).toBe(1);                // then fully wet
  });
  it('drops are 5-15 mm at arrival and grow to merge', () => {
    for (const r4 of [0, 0.5, 1]) {
      const r = dropRadius(SAND_RAIN.thrMin + 0.001, SAND_RAIN.thrMin, r4);
      expect(r).toBeGreaterThanOrEqual(0.005); expect(r).toBeLessThanOrEqual(0.015);
    }
    expect(dropRadius(0.9, 0.1, 0.5)).toBeGreaterThan(dropRadius(0.11, 0.1, 0.5) * 2.5);
    expect(dropRadius(0.05, 0.1, 0.5)).toBe(0);      // not yet landed
  });
  it('dries back: dots linger as it lightens, hollows stay wet longer than crests', () => {
    // After rain the fast wetness falls while the slow puddle value stays high.
    const w = 0.5, pud = 0.8;
    const crest = localWet(w, pud, 0), hollow = localWet(w, pud, 1);
    expect(hollow).toBeGreaterThan(crest);
    expect(crest).toBeLessThan(w); expect(hollow).toBeGreaterThan(w);
    // While wetting (puddle behind wetness) the topography does not skew it.
    expect(localWet(0.5, 0.1, 0)).toBe(0.5); expect(localWet(0.5, 0.1, 1)).toBe(0.5);
    // Back through the dots: coverage falls with wetness, and no darkening remains once w is low.
    expect(dotCover(0.2)).toBeLessThan(dotCover(0.5));
    expect(uniformWet(0.2)).toBe(0);
  });
  it('keeps local wetness bounded at dry crests and saturated hollows', () => {
    for (const w of [0, 0.01, 0.5, 0.99, 1]) {
      for (const pud of [0, 0.5, 1]) {
        const crest = localWet(w, pud, 0), hollow = localWet(w, pud, 1);
        expect(crest).toBeGreaterThanOrEqual(0);
        expect(hollow).toBeLessThanOrEqual(1);
        expect(hollow).toBeGreaterThanOrEqual(crest);
      }
    }
  });
});
