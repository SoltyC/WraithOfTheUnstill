import { describe, it, expect } from 'vitest';
import { createWeather, FROST_STATES } from '../src/world/weather.js';

const step = (w, seconds, dt = 0.1) => { for (let t = 0; t < seconds; t += dt) { w.dt = dt; w.update(); } };

describe('weather (frost)', () => {
  it('snaps to a forced state, then eases to the next over tens of seconds without popping', () => {
    const w = createWeather();
    w.restored = 1; w.override = 'clear'; w.snap = true; w.dt = 0; w.update();
    expect(w.cover).toBeCloseTo(FROST_STATES.clear.cover, 5);
    w.override = 'blizzard';
    let maxJump = 0, prev = w.fog;
    for (let i = 0; i < 600; i++) { w.dt = 0.1; w.update(); maxJump = Math.max(maxJump, Math.abs(w.fog - prev)); prev = w.fog; }
    // 60 s in: most of the way, never a jump bigger than ~1% per 100 ms.
    expect(w.fog).toBeGreaterThan(0.9);
    expect(maxJump).toBeLessThan(0.01);
    // 10 s in it is still clearly in transition (tens of seconds).
    const v = createWeather(); v.restored = 1; v.override = 'clear'; v.update(); v.override = 'blizzard';
    step(v, 10);
    expect(v.fog).toBeGreaterThan(0.2); expect(v.fog).toBeLessThan(0.75);
  });

  it('a stilled steppe never snows (still air): forced snowfall or blizzard falls back to overcast', () => {
    const w = createWeather();
    w.restored = 0; w.override = 'blizzard'; w.snap = true; w.update();
    expect(w.state).toBe('overcast');
    expect(w.snow).toBe(0);
    expect(w.gust).toBe(0);
  });

  it('the natural restored cycle visits every frost state and is deterministic', () => {
    const run = () => {
      const w = createWeather(); w.restored = 1; w.override = null; w.snap = true;
      const seen = new Set(), seq = [];
      for (let i = 0; i < 4 * 3600; i++) { w.dt = 1; w.update(); if (!seen.has(w.state)) { seen.add(w.state); } if (i % 60 === 0) seq.push(w.state); }
      return { seen, seq: seq.join(',') };
    };
    const a = run(), b = run();
    expect([...a.seen].sort()).toEqual(['blizzard', 'clear', 'overcast', 'snowfall']);
    expect(a.seq).toBe(b.seq);
  });
});
