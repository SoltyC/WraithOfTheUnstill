// The Lake Beacon as a climbable tube (docs/direction.md M1, the meadow's third piece; systems/beacon.js). The same contract
// as the Bellwether's neck (game/bellwether/bellwether.js neckEval: sp point, sn outward normal, st along, sc centre), so the
// Bellwether's own climb (game/bellwether/neckClimb.js, with these dims) climbs it: hold to hold, W/S along, A/D round, and
// three iron shutters on its flanks opened with a strike — the neck's three valves, met first on an old stone column.
// It stands still: no sway, no shake. Pure (tests/beacon.test.js).

export const BEACON = {
  segs: 10, segLen: 2.4,        // 24 m of column
  r0: 2.1, r1: 1.5,             // radius at the foot and under the lamp cage
  lean: 0.24, leanYaw: 1.25,    // rad from upright, toward this bearing (east-north-east, out over the lake)
  shutterS: [2.4, 5.4, 8.4], shutterTh: [0.9, -1.7, 2.5],
};
export const beaconRadius = (s) => BEACON.r0 - (BEACON.r0 - BEACON.r1) * Math.min(1, Math.max(0, s / BEACON.segs));
export const BEACON_DIMS = { segs: BEACON.segs, segLen: BEACON.segLen, radius: beaconRadius, valves: 3, valveS: BEACON.shutterS, valveTh: BEACON.shutterTh };

/** The tube at foot (x, y, z): axis along the lean; th = 0 is its upper side (as the neck's dorsal top). */
export function createBeaconTube(x, y, z) {
  const ax = Math.sin(BEACON.lean) * Math.sin(BEACON.leanYaw), ay = Math.cos(BEACON.lean), az = Math.sin(BEACON.lean) * Math.cos(BEACON.leanYaw);
  // Up-side normal: world up made perpendicular to the axis; right = axis × up.
  let ux = -ax * ay, uy = 1 - ay * ay, uz = -az * ay; { const l = Math.hypot(ux, uy, uz); ux /= l; uy /= l; uz /= l; }
  const rx = ay * uz - az * uy, ry = az * ux - ax * uz, rz = ax * uy - ay * ux;
  const tube = {
    active: true, shaking: 0, climbed: false, floorY: y,
    base: { x, y, z }, axis: [ax, ay, az],
    sp: new Float64Array(3), sn: new Float64Array(3), st: new Float64Array(3), sc: new Float64Array(3),
    valves: { open: new Uint8Array(3), x: new Float64Array(3), y: new Float64Array(3), z: new Float64Array(3) },
    neckEval(s, th, bump) {
      s = Math.max(0, Math.min(BEACON.segs, s));
      const L = s * BEACON.segLen, cx = x + ax * L, cy = y + ay * L, cz = z + az * L;
      const ct = Math.cos(th), st = Math.sin(th), nx = ux * ct + rx * st, ny = uy * ct + ry * st, nz = uz * ct + rz * st;
      const rr = beaconRadius(s) + bump;
      this.sc[0] = cx; this.sc[1] = cy; this.sc[2] = cz;
      this.sn[0] = nx; this.sn[1] = ny; this.sn[2] = nz;
      this.st[0] = ax; this.st[1] = ay; this.st[2] = az;
      this.sp[0] = cx + nx * rr; this.sp[1] = cy + ny * rr; this.sp[2] = cz + nz * rr;
    },
    openValve(k) { this.valves.open[k] = 1; },
  };
  for (let k = 0; k < 3; k++) {
    tube.neckEval(BEACON.shutterS[k], BEACON.shutterTh[k], 0.15);
    tube.valves.x[k] = tube.sp[0]; tube.valves.y[k] = tube.sp[1]; tube.valves.z[k] = tube.sp[2];
  }
  return tube;
}
