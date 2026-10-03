import { describe, it, expect } from 'vitest';
import { CapsuleController } from '../src/character/capsuleController.js';
import { surfTuning } from '../src/character/surf.js';

// Ground: a plane y = sx·x + sz·z (slope), with its normal.
function plane(sx = 0, sz = 0) {
  const l = Math.sqrt(sx * sx + 1 + sz * sz);
  return { qx: 0, qz: 0, h: 0, nx: 0, ny: 1, nz: 0,
    sample() { this.h = sx * this.qx + sz * this.qz; },
    sampleNormal() { this.nx = -sx / l; this.ny = 1 / l; this.nz = -sz / l; } };
}
function run(c, seconds, fn) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) { if (fn) fn(t); c.dt = dt; c.update(); }
}
function speed(c) { return Math.hypot(c.vel.x, c.vel.z); }

describe('snow-surf', () => {
  it('engages from a standstill and settles at cruise on the flat', () => {
    const c = new CapsuleController(plane()); c.teleport(0, 0);
    c.surf.want = true; c.surf.canSurf = true;
    run(c, 1);
    expect(c.surf.active).toBe(true);
    expect(speed(c)).toBeGreaterThan(4);
    run(c, 8);
    expect(speed(c)).toBeGreaterThan(surfTuning.cruise * 0.85);
    expect(speed(c)).toBeLessThan(surfTuning.cruise * 1.02);
  });
  it('runs faster downhill and slower uphill, within the cap', () => {
    const down = new CapsuleController(plane(0, -0.35)); down.teleport(0, 0);
    const up = new CapsuleController(plane(0, 0.35)); up.teleport(0, 0);
    for (const c of [down, up]) { c.surf.want = true; c.surf.canSurf = true; c.yaw = 0; }
    run(down, 10); run(up, 10);
    expect(speed(down)).toBeGreaterThan(surfTuning.cruise + 4);
    expect(speed(down)).toBeLessThanOrEqual(surfTuning.maxSpeed + 1e-6);
    expect(speed(up)).toBeLessThan(surfTuning.cruise - 3);
  });
  it('carves with a grip limit: wide turns at speed, leaning into the turn, bleeding speed', () => {
    const c = new CapsuleController(plane()); c.teleport(0, 0);
    c.surf.want = true; c.surf.canSurf = true;
    run(c, 8);
    const v0 = speed(c);
    let maxLat = 0;
    run(c, 2, () => { c.surf.steer = 1; maxLat = Math.max(maxLat, Math.abs(c.surf.latAccel)); });
    expect(maxLat).toBeLessThanOrEqual(surfTuning.latMax + 1e-6);
    expect(c.surf.lean).toBeGreaterThan(0.5);                    // leaning right into a right turn
    expect(speed(c)).toBeLessThan(v0);
    // Radius of a full-grip carve at cruise: v²/a ≈ 10 m (not a pivot).
    expect(v0 * v0 / surfTuning.latMax).toBeGreaterThan(8);
  });
  it('eases out when let go: brakes smoothly down to a walk, then walks', () => {
    const c = new CapsuleController(plane()); c.teleport(0, 0);
    c.surf.want = true; c.surf.canSurf = true;
    run(c, 8);
    c.surf.want = false;
    let prev = speed(c), maxDrop = 0, t = 0;
    while (c.surf.active && t < 5) { c.dt = 1 / 60; c.update(); const s = speed(c); if (c.surf.active) maxDrop = Math.max(maxDrop, prev - s); prev = s; t += 1 / 60; }
    expect(c.surf.active).toBe(false);
    expect(t).toBeGreaterThan(0.4);                               // not a snap
    expect(maxDrop).toBeLessThan(0.5);                            // < 30 m/s² per frame step
    expect(speed(c)).toBeLessThanOrEqual(surfTuning.exitSpeed + 0.3);
  });
  it('does not engage where the ground cannot be surfed', () => {
    const c = new CapsuleController(plane()); c.teleport(0, 0);
    c.surf.want = true; c.surf.canSurf = false;
    run(c, 1);
    expect(c.surf.active).toBe(false);
  });
});
