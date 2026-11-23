// The Wind Gap on the Western Edge (docs/direction.md M1, the meadow's second piece; data/quests/meadow-side.json "The Wind
// Gap"). Since the bell stopped, the sea wind comes up the Edge in fits: the air in the gap is drawn in (the grass leans
// toward the sea), then a wall of wind throws itself up it. Only stone between the Wraith and the sea shelters it — the
// Bellwether's gale on the forecourt, met first on the hill's own scale. The gap is a shallow gully from the crest (A, east)
// down to the Edge's lip (B, west, the sea below); old standing stones stand in it, staggered, a run apart. Going down it is
// going into the wind: stone to stone between the gusts (systems/windGap.js does the wind).

import { MAT, NS } from './architecture.js';

/** The path across the gap (A → B), the way the gusts blow (unit x, z), and the stones on its windward side. */
export const GAP = { a: [-738, 662], b: [-868, 662], wind: [1, 0], half: 34, stones: 7, stagger: 3.5 };

/** The stones' places: evenly down the gully from A to B, staggered either side of the path. */
export function gapStones() {
  const out = [], dx = GAP.b[0] - GAP.a[0], dz = GAP.b[1] - GAP.a[1], L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L;
  for (let k = 0; k < GAP.stones; k++) {
    const t = (k + 0.6) / GAP.stones, s = (k % 2 ? 1 : -1) * GAP.stagger;
    out.push([GAP.a[0] + dx * t + nx * s, GAP.a[1] + dz * t + nz * s]);
  }
  return out;
}

function stone(k) {
  return (b, facing, R) => {
    const h = 2.3 + R() * 0.8, w = 0.85 + R() * 0.3, d = 0.4 + R() * 0.15;
    // A slab, broad face to the sea, leaning a little downwind; a smaller one fallen at its foot now and then.
    b.box(0, 0, -0.9, h, w, d, 0, MAT.STONE, 10 + k, { solid: true, tilt: 0.05 + R() * 0.06, ruin: 0.25 });
    if (R() < 0.5) b.box(0.9 + R() * 0.5, (R() - 0.5) * 1.6, -0.3, 0.35, 0.5, 0.3, R() * 3, MAT.STONE, 30 + k, { solid: false, ...NS });
  };
}

/** One site per stone (seated each on its own ground), facing across the wind. */
export function windGapSites() {
  const face = Math.atan2(GAP.wind[0], GAP.wind[1]);
  return gapStones().map((p, k) => ({ id: 'gap-stone-' + k, at: p, facing: face, build: stone(k), footprint: 1.6, seatAt: 'center' }));
}
