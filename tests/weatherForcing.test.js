import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createWeather } from '../src/world/weather.js';

const clear = () => {
  const w = createWeather();
  w.restored = 1; w.meadowRestored = 1; w.meadow = 1;
  w.override = 'clear'; w.dt = 0; w.update();
  return w;
};

describe('photo weather forcing', () => {
  it('forced rain wets the ground without requiring a wetness override', () => {
    const w = clear(); w.rainForce = 0.8; w.dt = 0.1;
    for (let i = 0; i < 600; i++) w.update();
    expect(w.rain).toBe(0.8);
    expect(w.wet).toBeGreaterThan(0.9);
    expect(w.puddle).toBeGreaterThan(0.4);
  });

  it('puddle and wetness overrides apply independently, including zero', () => {
    const p = clear(); p.puddleForce = 0.8; p.update();
    expect(p.puddle).toBe(0.8); expect(p.wet).toBe(0); expect(p.rain).toBe(0);
    const w = clear(); w.wetForce = 0.5; w.update();
    expect(w.wet).toBe(0.5); expect(w.puddle).toBe(0);
    w.override = 'storm'; w.snap = true;
    w.wetForce = 0; w.puddleForce = 0; w.rainForce = 0; w.update();
    expect(w.wet).toBe(0); expect(w.puddle).toBe(0); expect(w.rain).toBe(0);
  });

  it('releasing the overrides restores normal rain and drying', () => {
    const w = clear(); w.wetForce = 0.8; w.puddleForce = 0.7; w.rainForce = 1; w.update();
    w.wetForce = -1; w.puddleForce = -1; w.rainForce = -1; w.dt = 0.1;
    for (let i = 0; i < 6000; i++) w.update();
    expect(w.rain).toBeLessThan(0.01);
    expect(w.wet).toBeLessThan(0.01);
    expect(w.puddle).toBeLessThan(0.03);
  });

  it('reproduces each sand rain capture after weather snap', () => {
    const { spots } = JSON.parse(fs.readFileSync('data/photo-spots.json', 'utf8'));
    const sequence = spots.filter((s) => s.id.startsWith('p9s1-rain-'));
    expect(sequence).toHaveLength(6);
    for (const spot of sequence) {
      const w = clear();
      w.wetForce = spot.wet; w.puddleForce = spot.puddle; w.rainForce = spot.rain;
      w.snap = true; w.update();
      expect([w.wet, w.puddle, w.rain], spot.id).toEqual([spot.wet, spot.puddle, spot.rain]);
    }
  });
});
