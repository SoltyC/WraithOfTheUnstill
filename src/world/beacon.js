// The Lake Beacon (game/beacon.js; systems/beacon.js): an old column of stacked stone drums leaning out over the meadow lake from
// its west shoulder, each drum stepped a little further along the lean, an iron lamp-cage at its head. Three iron shutters on its
// flanks (up it and round it) stuck shut the night the bell stopped; Orrin kept the beacon. Sites: the column (always) and one
// per shutter (hidden once struck open). All share the column's footprint, so they share its seat.

import { MAT, NS } from './architecture.js';
import { BEACON, beaconRadius, createBeaconTube } from '../game/beacon.js';

const STEP = 1.2;   // m of column per drum

function column(b) {
  const t = createBeaconTube(0, 0, 0), L = BEACON.segs * BEACON.segLen;
  // A footing of big blocks, then the drums.
  b.drum(0, 0, -1.5, 0.4, BEACON.r0 + 0.7, BEACON.r0 + 0.5, 12, MAT.STONE, 3, { solid: true });
  for (let k = 0, y = 0; y < L - 0.01; k++, y += STEP) {
    const mid = (y + STEP / 2) / BEACON.segLen;
    t.neckEval(mid, 0, 0);
    const r = beaconRadius(mid) + (k % 3 === 1 ? 0.06 : 0);
    b.drum(t.sc[0], t.sc[2], t.sc[1] - STEP / 2 * t.axis[1], t.sc[1] + STEP / 2 * t.axis[1] + 0.02, r, r - 0.04, 14, MAT.STONE, 10 + k, { solid: true });
  }
  // The head: an iron cage on a capstone.
  t.neckEval(BEACON.segs, 0, 0);
  const [hx, hy, hz] = [t.sc[0], t.sc[1], t.sc[2]];
  b.drum(hx, hz, hy, hy + 0.45, BEACON.r1 + 0.35, BEACON.r1 + 0.25, 12, MAT.STONE, 50, { solid: true });
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; b.box(hx + Math.cos(a) * 1.05, hz + Math.sin(a) * 1.05, hy + 0.45, hy + 2.6, 0.06, 0.06, a, MAT.IRON, 60 + k, { solid: false, ...NS }); }
  b.drum(hx, hz, hy + 2.55, hy + 2.75, 1.2, 1.15, 12, MAT.IRON, 70, { solid: false });
  b.drum(hx, hz, hy + 0.45, hy + 0.9, 0.7, 0.6, 10, MAT.EMBER, 71, { solid: false });   // the cold bowl
}

function shutter(k) {
  return (b) => {
    const t = createBeaconTube(0, 0, 0);
    t.neckEval(BEACON.shutterS[k], BEACON.shutterTh[k], 0.12);
    const yaw = Math.atan2(t.sn[0], t.sn[2]);
    // An iron plate on the surface (its broad face out), riveted, rust-dark.
    b.box(t.sp[0], t.sp[2], t.sp[1] - 0.6, t.sp[1] + 0.6, 0.55, 0.07, yaw + Math.PI / 2, MAT.IRON, 80 + k, { solid: false, ...NS });
    b.box(t.sp[0], t.sp[2], t.sp[1] - 0.05, t.sp[1] + 0.05, 0.62, 0.1, yaw + Math.PI / 2, MAT.IRON, 90 + k, { solid: false, ...NS });
  };
}

/** The beacon's sites at the chapter place `meadow-beacon` (none without it). */
export function beaconSites(table) {
  const p = table['meadow-beacon'];
  if (!p) return [];
  return [
    { id: 'beacon-column', at: p.pos, facing: 0, build: column, footprint: 3, seatAt: 'center' },
    ...[0, 1, 2].map((k) => ({ id: 'beacon-shutter-' + k, at: p.pos, facing: 0, build: shutter(k), footprint: 3, seatAt: 'center' })),
  ];
}
