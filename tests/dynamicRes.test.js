import { describe, it, expect } from 'vitest';
import { DynamicRes, MIN_SCALE } from '../src/core/dynamicRes.js';

/** Feed `ms` at 60 Hz of sim time for `secs`, returning the controller's scale history. */
function run(c, t0, secs, ms, { max = 1, target = 14, gpu = true } = {}) {
  let t = t0;
  const changes = [];
  for (let i = 0; i < secs * 60; i++) {
    t += 1 / 60;
    c.push(ms);
    const before = c.scale;
    c.update(t, max, target, gpu);
    if (c.scale !== before) changes.push({ t, scale: c.scale });
  }
  return { t, changes };
}
const fresh = (s = 1) => { const c = new DynamicRes(); c.reset(s, 0); return c; };

describe('DynamicRes', () => {
  it('steps down one 0.05 step after sustained over-target', () => {
    const c = fresh();
    const { changes } = run(c, 0, 4, 18);
    expect(changes[0].scale).toBeCloseTo(0.95);
    expect(changes[0].t).toBeGreaterThan(1.5); // 1.5 s since start, plus window refill
  });
  it('ignores a brief spike and in-band frame time', () => {
    const c = fresh();
    expect(run(c, 0, 10, 14).changes).toHaveLength(0);
    expect(run(c, 10, 0.5, 30).changes).toHaveLength(0);
    expect(run(c, 10.5, 10, 14.5).changes).toHaveLength(0); // < target*1.05
  });
  it('steps up after sustained headroom, only after 3 s', () => {
    const c = fresh(0.7);
    const { changes } = run(c, 0, 8, 9, { max: 1 });
    expect(changes[0].scale).toBeCloseTo(0.75);
    expect(changes[0].t).toBeGreaterThanOrEqual(3);
  });
  it('changes at most once per 1.5 s and clears the window on change', () => {
    const c = fresh();
    const { changes } = run(c, 0, 30, 40);
    for (let i = 1; i < changes.length; i++) expect(changes[i].t - changes[i - 1].t).toBeGreaterThanOrEqual(1.5 - 1e-9);
    expect(changes.length).toBeGreaterThan(3);
  });
  it('clamps to [0.5, max]', () => {
    const c = fresh();
    run(c, 0, 120, 40);
    expect(c.scale).toBe(MIN_SCALE);
    const d = fresh(0.7);
    run(d, 0, 60, 2, { max: 0.8 });
    expect(d.scale).toBe(0.8);
  });
  it('quantises to 0.05 steps, with an off-grid max as the ceiling', () => {
    const c = fresh(0.67);
    const { changes } = run(c, 0, 4, 20, { max: 0.67 });
    expect(changes[0].scale).toBeCloseTo(0.6);
    const d = fresh(0.65);
    run(d, 0, 10, 2, { max: 0.67 });
    expect(d.scale).toBe(0.67);
    const e = fresh(1);
    run(e, 0, 30, 40);
    expect(Math.abs(e.scale / 0.05 - Math.round(e.scale / 0.05))).toBeLessThan(1e-6);
  });
  it('follows a lowered maximum immediately', () => {
    const c = fresh(1);
    c.update(10, 0.6, 14);
    expect(c.scale).toBe(0.6);
  });
  it('median resists outliers', () => {
    const c = fresh();
    for (let i = 0; i < 30; i++) c.push(i % 10 === 0 ? 100 : 10);
    expect(c.median()).toBe(10);
  });
  it('fallback (presented time) needs target + 3 ms and does not chase the refresh floor', () => {
    const a = fresh();
    expect(run(a, 0, 10, 16.7, { gpu: false }).changes).toHaveLength(0); // 60 Hz vsync floor
    const b = fresh();
    expect(run(b, 0, 10, 20, { gpu: false }).changes).toHaveLength(0); // floor == 20, steady
    // Spiky presented times: a 10 ms floor is visible, the median (20) is well over 14 + 3.
    const c = fresh();
    const f = [10, 20, 20];
    let t = 0, n = 0;
    const r = { changes: [] };
    for (let i = 0; i < 600; i++) {
      t += 1 / 60; c.push(f[n++ % 3]);
      const before = c.scale;
      c.update(t, 1, 14, false);
      if (c.scale !== before) r.changes.push(t);
    }
    expect(r.changes.length).toBeGreaterThan(0);
  });
});
