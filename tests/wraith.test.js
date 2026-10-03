import { describe, it, expect } from 'vitest';
import { Wraith } from '../src/character/wraith/wraith.js';

function setup(h = 0) {
  const ground = { qx: 0, qz: 0, h: 0, H: h, sample() { this.h = this.H; } };
  return { w: new Wraith(ground), ground };
}
function frame(w, x, y, z, vx, vz, dt = 1 / 60) {
  w.bx = x; w.by = y; w.bz = z; w.vx = vx; w.vz = vz; if (vx || vz) w.yaw = Math.atan2(vx, vz); w.grounded = true; w.dt = dt; w.time += dt;
  w.update();
}
function range(w, id) {
  const g = w.garments[id], p = w.cloth.p; let mn = Infinity, mx = -Infinity;
  for (let k = 0; k < g.rows * g.cols; k++) { const y = p[(g.start + k) * 3 + 1]; mn = Math.min(mn, y); mx = Math.max(mx, y); }
  return [mn, mx];
}

describe('Wraith cloth', () => {
  it('hangs correctly after a purely vertical spawn jump (same x/z)', () => {
    const { w, ground } = setup(0);
    for (let i = 0; i < 5; i++) frame(w, -220, 0, 580, 0, 0, 0);
    ground.H = 228.39;
    for (let i = 0; i < 30; i++) frame(w, -220, 228.39, 580, 0, 0, 0);
    const [lo, hi] = range(w, 0);
    expect(lo - 228.39).toBeLessThan(0.15);   // the hem reaches the snow
    expect(hi - 228.39).toBeLessThan(1.5);    // the top sits at the shoulders
    const [mlo] = range(w, 1);
    expect(mlo - 228.39).toBeLessThan(1.0);   // the mantle hangs down the back
  });

  it('stays sane while running and stopping (no NaN, no flipping, bounded stretch)', () => {
    const { w } = setup(0);
    let x = 0;
    for (let i = 0; i < 600; i++) {
      const v = i < 400 ? 5.2 : 0;
      x += v / 60; frame(w, x, 0, 0, v, 0);
      const [lo, hi] = range(w, 0);
      expect(Number.isFinite(lo) && Number.isFinite(hi)).toBe(true);
      expect(hi).toBeLessThan(1.6);
    }
    const [lo] = range(w, 0);
    expect(lo).toBeLessThan(0.2);
  });
});
