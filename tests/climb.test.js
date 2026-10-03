import { describe, it, expect } from 'vitest';
import { createWarden, WARDEN_SHAPE } from '../src/game/warden/warden.js';
import { createClimb } from '../src/game/warden/climb.js';

function rig() {
  const ground = { qx: 0, qz: 0, h: 0, sample() { this.h = 0; } };
  const warden = createWarden({ ts: { stamp() { this.bk = 0; } }, fx: { emit() {} }, ground });
  warden.place(0, 0, 0);
  warden.px = 0; warden.pz = -60; warden.dt = 1 / 60; for (let k = 0; k < 30; k++) warden.update();
  let focus = 100;
  const climb = createClimb({ warden });
  climb.spend = (c) => { if (focus < c) return false; focus -= c; return true; };
  return { warden, climb, get focus() { return focus; }, set focus(v) { focus = v; } };
}
const step = (r, n, set) => { for (let k = 0; k < n; k++) { if (set) set(); r.climb.dt = 1 / 60; r.climb.update(); r.warden.dt = 1 / 60; r.warden.update(); } };

describe('climbing the Warden', () => {
  it('grabs a leg from beside its foot, climbs it, hands off onto the flank and reaches the back', () => {
    const r = rig(), b = r.warden.body;
    // Stand beside the front-left foot.
    r.climb.px = b.fx[0] + 1.2; r.climb.py = 0; r.climb.pz = b.fz[0]; r.climb.grip = true;
    step(r, 1);
    expect(r.climb.climbing).toBe(true);
    expect(r.climb.mode).toBe(1);
    const y0 = r.climb.y;
    let maxY = y0, bodyReached = false;
    step(r, 60 * 14, () => { r.climb.mz = 1; r.climb.mx = 0; r.focus = 100; if (r.climb.mode === 2) bodyReached = true; maxY = Math.max(maxY, r.climb.y); });
    expect(bodyReached).toBe(true);
    expect(maxY - y0).toBeGreaterThan(WARDEN_SHAPE.hip * 0.8);
    // Pelvis stays at its standoff from the surface: never inside the Warden.
    expect(Number.isFinite(r.climb.x + r.climb.y + r.climb.z)).toBe(true);
  });
  it('gripping spends focus; with none left the Wraith slips off', () => {
    const r = rig(), b = r.warden.body;
    r.climb.px = b.fx[1] - 1.2; r.climb.py = 0; r.climb.pz = b.fz[1]; r.climb.grip = true;
    step(r, 1);
    expect(r.climb.climbing).toBe(true);
    r.focus = 2;
    let fell = 0;
    step(r, 120, () => { r.climb.mz = 1; if (r.climb.fell) fell = r.climb.fell; });
    expect(r.climb.climbing).toBe(false);
    expect(fell).toBe(3);
  });
  it('the Warden bucks when climbed, and a buck throws a Wraith that cannot pay for its grip', () => {
    const r = rig(), b = r.warden.body;
    r.climb.px = b.fx[0] + 1.2; r.climb.py = 0; r.climb.pz = b.fz[0]; r.climb.grip = true;
    step(r, 1);
    let shook = false, fell = 0;
    step(r, 60 * 12, () => { r.climb.mz = 0; r.focus = Math.min(r.focus, 20) + 0.03; if (r.warden.shaking) shook = true; if (r.climb.fell) fell = r.climb.fell; });
    expect(shook).toBe(true);
    expect(fell).toBe(1);
  });
  it('letting go drops the Wraith with momentum away from the surface', () => {
    const r = rig(), b = r.warden.body;
    r.climb.px = b.fx[0] + 1.2; r.climb.py = 0; r.climb.pz = b.fz[0]; r.climb.grip = true;
    step(r, 30, () => { r.climb.mz = 1; r.focus = 100; });
    r.climb.grip = false; step(r, 1);
    expect(r.climb.climbing).toBe(false);
    expect(r.climb.fell).toBe(2);
    expect(Math.hypot(r.climb.vx, r.climb.vz)).toBeGreaterThan(1);
  });
});

describe('hold-to-hold climbing', () => {
  it('moves in reaches and pulls: the holding hand stays planted while the body pulls up', () => {
    const r = rig(), b = r.warden.body;
    r.climb.px = b.fx[0] + 1.2; r.climb.py = 0; r.climb.pz = b.fz[0]; r.climb.grip = true;
    step(r, 1);
    r.warden.state = 0; r.warden.climbed = false;   // dormant and still: no bucking
    const hold = r.climb.holds;
    let pulls = 0, maxSlip = 0, sawReach = false, prev = r.climb.cycle, y0 = r.climb.y;
    const still = new Float64Array(3);
    for (let k = 0; k < 120; k++) {
      r.focus = 100; r.climb.mz = 1; r.climb.dt = 1 / 60; r.climb.update();
      r.warden.state = 0; r.warden.shakeT = 0;
      const c = r.climb.cycle, other = (1 - r.climb.lead) * 3;
      if (c === 1) sawReach = true;
      if (c === 2 && prev !== 2) { pulls++; still[0] = hold[other]; still[1] = hold[other + 1]; still[2] = hold[other + 2]; }
      if (c === 2) maxSlip = Math.max(maxSlip, Math.hypot(hold[other] - still[0], hold[other + 1] - still[1], hold[other + 2] - still[2]));
      prev = c;
    }
    expect(sawReach).toBe(true);
    expect(pulls).toBeGreaterThanOrEqual(2);
    expect(maxSlip).toBeLessThan(0.02);            // the gripping hand does not slide
    expect(r.climb.y - y0).toBeGreaterThan(0.8);   // and the body has gone up
  });
});
