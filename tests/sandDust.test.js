import { describe, it, expect } from 'vitest';
import { createSandDustEvents, DUST_EVENTS } from '../src/world/sandDust.js';

describe('bounded sand disturbance visuals', () => {
  it('does not emit for freeze, wet paint, empty writes or invalid inputs', () => {
    const fx = createSandDustEvents();
    for (const kind of [3, 4]) { fx.kind = kind; fx.depth = 2; fx.emit(); }
    fx.kind = 0; fx.depth = 0; fx.emit();
    fx.depth = 0.5; fx.x = Infinity; fx.emit();
    fx.x = 0; fx.width = NaN; fx.emit();
    expect(fx.emitted).toBe(0);
    expect(Array.from(fx.events).filter((_, i) => i % 8 === 2).every(t => t < 0)).toBe(true);
  });
  it('retains the latest writes with fixed memory and bounded, normalized emitters', () => {
    const fx = createSandDustEvents(), data = fx.events;
    fx.width = 200; fx.halfLength = 100; fx.depth = 100; fx.dx = 3; fx.dz = 4;
    for (let i = 0; i < DUST_EVENTS * 3 + 5; i++) { fx.time = i; fx.x = i; fx.z = -i; fx.emit(); }
    expect(fx.events).toBe(data);
    expect(fx.events.length).toBe(DUST_EVENTS * 8);
    const times = [];
    for (let i = 0; i < DUST_EVENTS; i++) {
      const o = i * 8; times.push(data[o + 2]);
      expect(data[o]).toBe(data[o + 2]); expect(data[o + 1]).toBe(-data[o + 2]);
      expect(data[o + 3]).toBe(3); expect(data[o + 6]).toBe(8); expect(data[o + 7]).toBe(1);
      expect(Math.hypot(data[o + 4], data[o + 5])).toBeCloseTo(1, 6);
    }
    expect(times.sort((a, b) => a - b)).toEqual(Array.from({ length: DUST_EVENTS }, (_, i) => DUST_EVENTS * 2 + 5 + i));
  });
  it('clears live puffs on restore and accepts fresh footprints without reallocating', () => {
    const fx = createSandDustEvents(), data = fx.events;
    fx.time = 12; fx.kind = 0; fx.depth = 0.055; fx.width = 0.055; fx.halfLength = 0.115; fx.emit();
    expect(data[7]).toBeGreaterThan(0); expect(data[7]).toBeLessThan(1);
    fx.reset(); expect(fx.events).toBe(data);
    for (let i = 0; i < DUST_EVENTS; i++) expect(data[i * 8 + 2]).toBeLessThan(0);
    fx.time = 30; fx.emit(); expect(data[2]).toBe(30);
  });
});
