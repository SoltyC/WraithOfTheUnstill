import { describe, it, expect } from 'vitest';
import { createReleaseCam, releaseCamTuning } from '../src/camera/releaseCam.js';
import { RELEASE_T } from '../src/game/warden/warden.js';

const ground = { qx: 0, qz: 0, h: 0, sample() { this.h = 0; } };

function started() {
  const rc = createReleaseCam(ground);
  rc.tx = 0; rc.ty = 6; rc.tz = 0; rc.hx = 0; rc.hy = 10; rc.hz = 8;
  rc.px = 0; rc.py = 0.9; rc.pz = -25; rc.wt = 0; rc.hitT = -1;
  rc.start();
  rc.dt = 1 / 60;
  return rc;
}
function run(rc, until, onFrame) {
  while (rc.wt < until && rc.active) { rc.wt += rc.dt; if (onFrame) onFrame(rc); rc.update(); }
}

describe('release camera', () => {
  it('shot A: low behind the Wraith, looking up at the Warden, letterboxed', () => {
    const rc = started();
    run(rc, 2);
    expect(rc.shot).toBe(1);
    expect(rc.bars).toBe(1);
    expect(rc.z).toBeLessThan(-25);                 // behind the Wraith (away from the Warden)
    expect(rc.pitch).toBeLessThan(0);               // looking up
  });
  it('cuts on the slam to a side-on camera, then cranes up and back after the hit', () => {
    const rc = started();
    run(rc, RELEASE_T.impact + 0.5);
    expect(rc.shot).toBe(2);
    expect(Math.abs(rc.x)).toBeGreaterThan(6);      // beside the Wraith
    rc.hitT = rc.wt;
    run(rc, rc.hitT + 9);
    expect(rc.shot).toBe(3);
    expect(rc.y).toBeGreaterThan(8);                // craned up
  });
  it('ends at its end time and drops the bars; can be skipped', () => {
    const rc = started();
    run(rc, releaseCamTuning.end + 1);
    expect(rc.active).toBe(false);
    for (let k = 0; k < 60; k++) rc.update();
    expect(rc.bars).toBe(0);
    const r2 = started();
    r2.update(); r2.skip = true; r2.update();
    expect(r2.active).toBe(false);
  });
});
