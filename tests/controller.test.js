import { describe, it, expect } from 'vitest';
import { CapsuleController, controllerTuning } from '../src/character/capsuleController.js';

/** Analytic ground implementing the query-object interface. */
function plane(slopeX = 0) {
  return {
    qx: 0, qz: 0, h: 0, nx: 0, ny: 1, nz: 0,
    sample() { this.h = this.qx * slopeX; },
    sampleNormal() { const l = Math.hypot(slopeX, 1); this.nx = -slopeX / l; this.ny = 1 / l; this.nz = 0; },
  };
}

function run(c, seconds) {
  c.dt = 1 / 90;
  for (let t = 0; t < seconds; t += 1 / 90) c.update();
}

describe('CapsuleController', () => {
  it('walks camera-relative at walk speed and faces the move direction', () => {
    const c = new CapsuleController(plane());
    c.teleport(0, 0);
    c.cameraYaw = Math.PI / 2; // camera looks down +x
    c.wishZ = 1;
    run(c, 2);
    expect(c.pos.x).toBeGreaterThan(8);
    expect(Math.abs(c.pos.z)).toBeLessThan(1e-6);
    expect(Math.hypot(c.vel.x, c.vel.z)).toBeCloseTo(controllerTuning.walkSpeed, 3);
    expect(c.yaw).toBeCloseTo(Math.PI / 2, 2);
  });

  it('stays glued to gentle slopes and stops when input ends', () => {
    const c = new CapsuleController(plane(0.3));
    c.teleport(0, 0);
    c.cameraYaw = Math.PI / 2;
    c.wishZ = 1;
    run(c, 1);
    expect(c.grounded).toBe(true);
    expect(c.pos.y).toBeCloseTo(c.pos.x * 0.3, 6);
    c.wishZ = 0;
    run(c, 1);
    expect(Math.hypot(c.vel.x, c.vel.z)).toBeLessThan(1e-6);
  });

  it('cannot walk up slopes steeper than the limit', () => {
    const c = new CapsuleController(plane(1.5)); // ~56°
    c.teleport(0, 0);
    c.cameraYaw = Math.PI / 2;
    c.wishZ = 1;
    run(c, 2);
    expect(c.pos.x).toBeLessThan(0.2);
  });

  it('jumps and lands', () => {
    const c = new CapsuleController(plane());
    c.teleport(0, 0);
    c.jumpRequested = true;
    c.dt = 1 / 90;
    c.update(); c.update();
    expect(c.grounded).toBe(false);
    let peak = 0;
    for (let i = 0; i < 200; i++) { c.update(); peak = Math.max(peak, c.pos.y); }
    const T = controllerTuning;
    expect(peak).toBeCloseTo((T.jumpSpeed * T.jumpSpeed) / (2 * T.gravity), 1);
    expect(c.grounded).toBe(true);
    expect(c.pos.y).toBe(0);
  });

  it('is deterministic for identical input', () => {
    const a = new CapsuleController(plane(0.1)), b = new CapsuleController(plane(0.1));
    for (const c of [a, b]) { c.teleport(0, 0); c.wishZ = 1; c.wishX = 0.3; c.cameraYaw = 0.7; run(c, 3); }
    expect(a.pos).toEqual(b.pos);
  });
});
