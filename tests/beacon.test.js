import { describe, it, expect } from 'vitest';
import { createBeaconTube, BEACON, beaconRadius } from '../src/game/beacon.js';
import { createNeckClimb } from '../src/game/bellwether/neckClimb.js';
import { BEACON_DIMS } from '../src/game/beacon.js';

describe('The Lake Beacon (M1: the climb taught before the fight)', () => {
  const t = createBeaconTube(0, 100, 0);
  it('is a leaning tube: its surface lies at the radius from its axis, the shutters on it', () => {
    for (const [s, th] of [[1, 0], [5, 1.3], [9, -2.5]]) {
      t.neckEval(s, th, 0);
      expect(Math.hypot(t.sp[0] - t.sc[0], t.sp[1] - t.sc[1], t.sp[2] - t.sc[2])).toBeCloseTo(beaconRadius(s), 5);
      expect(t.sn[0] * t.st[0] + t.sn[1] * t.st[1] + t.sn[2] * t.st[2]).toBeCloseTo(0, 6);
    }
    t.neckEval(BEACON.segs, 0, 0);
    expect(t.sc[1] - 100).toBeGreaterThan(20);
    for (let k = 0; k < 3; k++) expect(t.valves.y[k]).toBeGreaterThan(100);
  });
  it('the Bellwether\'s climb climbs it to a shutter', () => {
    const c = createNeckClimb({ bell: t, dims: BEACON_DIMS, tuning: { thMax: 3.0 } });
    c.spend = () => true;
    // Grip at its foot, on the side of the first shutter, and climb.
    t.neckEval(0.6, BEACON.shutterTh[0], 0.6);
    Object.assign(c, { px: t.sp[0], py: t.sp[1] - 0.6, pz: t.sp[2], grip: true, mx: 0, mz: 1, crx: 1, crz: 0, dt: 1 / 60 });
    let near = -1;
    for (let i = 0; i < 1200 && near < 0; i++) { c.update(); near = c.nearValve; }
    expect(c.climbing).toBe(true);
    expect(near).toBe(0);
  });
});
