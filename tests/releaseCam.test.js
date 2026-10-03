import { describe, it, expect } from 'vitest';
import { createReleaseCam, releaseCamTuning } from '../src/camera/releaseCam.js';

function started() {
  const rc = createReleaseCam();
  rc.tx = 0; rc.ty = 6; rc.tz = 0; rc.groundY = 0;
  rc.x = 0; rc.y = 3; rc.z = -25; rc.start();
  rc.dt = 1 / 60;
  return rc;
}

describe('release camera', () => {
  it('orbits outside the Warden, looks at it, and letterboxes', () => {
    const rc = started();
    for (let k = 0; k < 6 * 60; k++) rc.update();
    expect(rc.active).toBe(true);
    expect(rc.bars).toBe(1);
    expect(Math.hypot(rc.x, rc.z)).toBeGreaterThan(30);
    expect(rc.y).toBeGreaterThan(rc.groundY + 1.5);
    // Looking at the target: the yaw points from the camera to it.
    expect(Math.abs(Math.sin(rc.yaw) * -rc.x + Math.cos(rc.yaw) * -rc.z) / Math.hypot(rc.x, rc.z)).toBeGreaterThan(0.99);
  });
  it('ends after its duration and drops the bars', () => {
    const rc = started();
    for (let k = 0; k < (releaseCamTuning.duration + 1) * 60; k++) rc.update();
    expect(rc.active).toBe(false);
    for (let k = 0; k < 60; k++) rc.update();
    expect(rc.bars).toBe(0);
  });
  it('can be skipped', () => {
    const rc = started();
    rc.update(); rc.skip = true; rc.update();
    expect(rc.active).toBe(false);
  });
});
