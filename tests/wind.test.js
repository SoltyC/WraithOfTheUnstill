import { describe, it, expect } from 'vitest';
import { createWind, sampleInto, FRONT_SPEED } from '../src/world/wind.js';

const at = (w, x, z) => { w.sx = x; w.sz = z; w.sample(); return { x: w.outX, z: w.outZ, s: w.speed }; };

describe('wind field', () => {
  it('is deterministic: the same place and time give the same wind', () => {
    const a = createWind(), b = createWind();
    for (const w of [a, b]) { w.dirX = 0.6; w.dirZ = -0.8; w.strength = 0.9; w.gustiness = 0.5; w.time = 123.4; w.update(); }
    expect(at(a, 41, -77)).toEqual(at(b, 41, -77));
  });
  it('is still when the strength is 0 (stilled air), bursts aside', () => {
    const w = createWind(); w.strength = 0; w.gustiness = 1; w.time = 5; w.update();
    expect(at(w, 10, 20).s).toBe(0);
  });
  it('blows along the prevailing direction', () => {
    const w = createWind(); w.dirX = 0; w.dirZ = 1; w.strength = 1; w.gustiness = 0.5; w.time = 3; w.update();
    const v = at(w, 0, 0);
    expect(v.z).toBeCloseTo(1, 5); expect(v.s).toBeGreaterThan(0);
  });
  it('gust fronts travel downwind at the front speed', () => {
    const w = createWind(); w.dirX = 1; w.dirZ = 0; w.strength = 1; w.gustiness = 1;
    const speeds = (t) => { w.time = t; w.update(); const r = []; for (let x = 0; x < 300; x += 1) r.push(at(w, x, 0).s); return r; };
    const s0 = speeds(10), s1 = speeds(12);
    // The profile at t+2 is the profile at t shifted by ~FRONT_SPEED·2 m (best-matching shift).
    let best = 0, bestErr = Infinity;
    for (let sh = 0; sh < 40; sh++) { let e = 0; for (let i = 0; i < 200; i++) e += (s1[i + sh] - s0[i]) ** 2; if (e < bestErr) { bestErr = e; best = sh; } }
    // Within 5 m: the second family runs 20 % faster and the slow wander drifts the phase ~2–3 m.
    expect(Math.abs(best - FRONT_SPEED * 2)).toBeLessThanOrEqual(5);
  });
  it('a burst pushes outward from its point and dies away', () => {
    const w = createWind(); w.strength = 0; w.time = 0; w.update();
    w.burst(100, 100, 3);
    w.time = 0.5; w.update();
    const v = at(w, 107, 100); // the ring is ~7 m out at 0.5 s
    expect(v.s).toBeGreaterThan(0.1); expect(v.x).toBeGreaterThan(0.9);
    w.time = 3; w.update();
    expect(at(w, 107, 100).s).toBe(0);
  });
  it('sampleInto works on a bare block', () => {
    const o = { outX: 0, outZ: 0, speed: 0 };
    sampleInto([1, 0, 0, 0, 0, 8, 0, 0, ...new Array(16).fill(0)], 1, 1, o);
    expect(o.speed).toBe(0);
  });
});
