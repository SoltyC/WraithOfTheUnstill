// The Ash Chapel: the pilgrims (docs/phase-11/ember-design.md §4.2). On a bench of the cone's south-west flank (≈ 710 m),
// 235 m from the crater — the nearest anyone lives to it — at the foot of a face that climbs east toward the summit:
//   the cells       five pumice cells cut into the face: ash-plaster fronts, a door, a slit window, the dark behind
//   the chapel      a small whitewashed drum under a dome, a bronze bell in a timber frame beside it
//   the ribbons     poles round the chapel, prayer ribbons hanging still in the dead air
//   the spring      the sacred spring in a grotto at the face's foot: a stone basin, the water gone yellow and warm
//   the scripture   a carved stele by the chapel door: the three omens, and what they ask of the faithful
// White and grey against the black ground. Heights: data/world/chapelHeights.json (tools/world/sowHeights.mjs).
// The still hollow (the birds) is not here but up at the summit's ring: HOLLOW.

import { MAT, NS, cloth } from './architecture.js';
import { stick } from './camp.js';
import { lifted } from './sow.js';

export const CHAPEL = { at: [2185, -2320] };
export const CHAPEL_GRID = { x0: -60, z0: -50, step: 2, nx: 61, nz: 51 };
export const CHAPEL_PTS = {
  chapel: [-5, 0], bell: [9, -7], scripture: [-4, -9.5], spring: [31, -32],
  cells: [[37, 22], [38, 11], [38, 0], [37, -11], [36, -21]],
  annick: [-12, 3], edda: [6, 6], corwen: [30, 12], lio: [28, -2], ysolt: [-14, 4], brannoc: [26, -28],
};
/** The still hollow: the summit's ring, where the birds lie (the mountain's breath sinks into it). */
export const HOLLOW = [2422, -2291];
export const chapelWorld = (p) => [CHAPEL.at[0] + p[0], CHAPEL.at[1] + p[1]];

function relFrom(baked) {
  const G = baked?.grid, H = baked?.h;
  return (x, z) => {
    if (!H) return 0;
    const u = (x - G.x0) / G.step, v = (z - G.z0) / G.step;
    const i = Math.max(0, Math.min(G.nx - 2, Math.floor(u))), j = Math.max(0, Math.min(G.nz - 2, Math.floor(v)));
    const fx = Math.max(0, Math.min(1, u - i)), fy = Math.max(0, Math.min(1, v - j)), k = j * G.nx + i;
    return (H[k] * (1 - fx) + H[k + 1] * fx) * (1 - fy) + (H[k + G.nx] * (1 - fx) + H[k + G.nx + 1] * fx) * fy;
  };
}

/** A cell in the face (the hill rises to +x): an ash-plaster front, a door, a slit window, its dark going into the rock. */
function cell(b, rel, [x, z], s) {
  const y = rel(x - 1.5, z);
  b.box(x + 3.5, z, y - 2, y + 3.6, 3.2, 2.2, 0, MAT.EMBER, s, { solid: true, plain: true, ...NS });
  b.box(x, z - 1.55, y - 1, y + 2.9, 0.35, 0.75, 0, MAT.PLASTER, s + 1, { course: 0.5 });
  b.box(x, z + 1.55, y - 1, y + 2.9, 0.35, 0.75, 0, MAT.PLASTER, s + 2, { course: 0.5 });
  b.box(x, z, y + 2.05, y + 2.9, 0.35, 0.82, 0, MAT.PLASTER, s + 3, { course: 0.5 });
  // A plaster lintel stepped out over the door, and the rock's hood above it.
  b.box(x - 0.12, z, y + 2.9, y + 3.15, 0.45, 1.45, 0, MAT.PLASTER, s + 4, { solid: false, ...NS });
  b.box(x + 1.8, z, y + 2.9, y + 5.2, 2.2, 2.6, 0, MAT.BASALT, s + 5, { course: 0.7, ruin: 0.4 });
  // The door: a weathered plank leaf ajar; a slit window in the left pier.
  b.box(x - 0.35, z + 0.3, y + 0.05, y + 2.0, 0.04, 0.55, 0.5, MAT.PLANK, s + 6, { solid: false, ...NS });
  b.box(x - 0.36, z - 1.55, y + 1.3, y + 1.9, 0.02, 0.08, 0, MAT.EMBER, s + 7, { solid: false, plain: true, ...NS });
}

function chapelBuild(baked) {
  const rel = relFrom(baked);
  return (b, facing, R) => {
    const P = CHAPEL_PTS;
    let s = 14000;
    P.cells.forEach((c, k) => cell(b, rel, c, s + k * 10));
    // The chapel: a whitewashed drum on a step, a dome of plaster rings, a bronze finial; its door to the west.
    { const [x, z] = P.chapel, y = Math.max(rel(x - 4, z), rel(x + 4, z), rel(x, z - 4), rel(x, z + 4)) + 0.1;
      b.drum(x, z, y - 2, y + 0.3, 4.6, 4.6, 24, MAT.STONE, s + 100);
      b.drum(x, z, y + 0.3, y + 3.8, 3.9, 3.8, 24, MAT.PLASTER, s + 101);
      for (let k = 0; k < 5; k++) { const a0 = k / 5 * Math.PI / 2, a1 = (k + 1) / 5 * Math.PI / 2; b.drum(x, z, y + 3.75 + 2.6 * Math.sin(a0), y + 3.75 + 2.6 * Math.sin(a1) + 0.02, 3.95 * Math.cos(a0), Math.max(0.15, 3.95 * Math.cos(a1)), 22, MAT.PLASTER, s + 102 + k, { solid: false }); }
      b.drum(x, z, y + 6.3, y + 7.1, 0.18, 0.05, 8, MAT.METAL, s + 108, { solid: false });
      b.box(x - 3.85, z, y + 0.3, y + 2.4, 0.12, 0.65, 0, MAT.PLANK, s + 109, { solid: false, ...NS });
      b.box(x - 3.9, z, y + 2.35, y + 2.6, 0.2, 0.85, 0, MAT.PLASTER, s + 110, { solid: false, ...NS });
      b.light(x - 4.6, y + 2.2, z, 6, 1.0, 0.62, 0.32, 0.9, 'candle');
    }
    // The bell: a timber frame, a bronze bell.
    { const [x, z] = P.bell, y = rel(x, z);
      stick(b, [x - 1.1, y - 0.4, z], [x - 1.1, y + 3.0, z], 0.1, 0.09, 6, MAT.WOOD, s + 120);
      stick(b, [x + 1.1, y - 0.4, z], [x + 1.1, y + 3.0, z], 0.1, 0.09, 6, MAT.WOOD, s + 121);
      stick(b, [x - 1.3, y + 2.95, z], [x + 1.3, y + 2.95, z], 0.11, 0.11, 6, MAT.WOOD, s + 122);
      b.drum(x, z, y + 1.85, y + 2.85, 0.55, 0.22, 14, MAT.METAL, s + 123, { solid: false });
    }
    // The scripture stele: carved, by the chapel door.
    { const [x, z] = P.scripture, y = rel(x, z);
      b.box(x, z, y - 0.6, y + 2.1, 0.55, 0.16, 0.3, MAT.GLYPH, s + 130, { carve: 1, tilt: 0.04 }); }
    // The spring's grotto at the face's foot: a plaster arch into the rock, a stone basin, the water yellowed.
    { const [x, z] = P.spring, y = rel(x - 2, z);
      b.box(x + 3, z, y - 1.5, y + 3.2, 2.8, 2.4, 0, MAT.EMBER, s + 140, { solid: true, plain: true, ...NS });
      for (const sd of [-1, 1]) b.box(x, z + sd * 2.1, y - 1, y + 2.6, 0.45, 0.4, 0, MAT.PLASTER, s + 141 + (sd > 0 ? 1 : 0), { course: 0.5 });
      b.box(x - 0.1, z, y + 2.5, y + 2.8, 0.55, 2.6, 0, MAT.PLASTER, s + 143, { solid: false, ...NS });
      b.box(x + 1.6, z, y + 2.7, y + 4.8, 2.0, 3.0, 0, MAT.BASALT, s + 144, { course: 0.7, ruin: 0.4 });
      b.drum(x - 1.4, z, y - 0.6, y + 0.55, 1.5, 1.45, 16, MAT.STONE, s + 145);
      b.drum(x - 1.4, z, y + 0.4, y + 0.47, 1.28, 1.28, 16, MAT.FLAG, s + 146, { solid: false });   // the crust
      b.drum(x - 1.4, z, y + 0.44, y + 0.5, 1.05, 1.05, 16, MAT.GLASS, s + 147, { solid: false });
      b.light(x - 0.5, y + 1.2, z, 5, 1.0, 0.85, 0.5, 0.5, 'candle');
    }
    // Prayer ribbons: poles round the chapel, ribbons hanging dead still.
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * Math.PI * 2 + 0.2, r = 10 + (k % 3) * 1.5, x = P.chapel[0] + Math.cos(a) * r, z = P.chapel[1] + Math.sin(a) * r, y = rel(x, z), hp = 3.2 + (k % 2) * 0.8;
      stick(b, [x, y - 0.4, z], [x, y + hp, z], 0.045, 0.035, 5, MAT.WOOD, s + 160 + k);
      const nx = P.chapel[0] + Math.cos(a + 0.7) * r, nz = P.chapel[1] + Math.sin(a + 0.7) * r, ny = rel(nx, nz) + 3.2 + ((k + 1) % 2) * 0.8;
      // A cord to the next pole, ribbons hanging from it.
      stick(b, [x, y + hp - 0.1, z], [nx, ny - 0.1, nz], 0.008, 0.008, 3, MAT.CANVAS, s + 170 + k);
      for (let q = 1; q < 6; q++) {
        const t = q / 6, cx = x + (nx - x) * t, cz = z + (nz - z) * t, cy = y + hp - 0.1 + (ny - y - hp) * t - 0.35 * Math.sin(Math.PI * t);
        const len = 0.6 + ((k * 7 + q * 3) % 5) * 0.12, w = 0.07;
        cloth(b, (u, v) => [cx + (u - 0.5) * w * Math.cos(a), cy - v * len, cz + (u - 0.5) * w * Math.sin(a) + v * 0.02], 1, 2, MAT.CANVAS, s + 180 + q);
      }
    }
    void R; void lifted;
  };
}

/** The dead birds in the still hollow: a few small grey bodies on the ash (hidden once the Wraith has taken one). */
function birdsBuild(b, facing, R) {
  for (let k = 0; k < 6; k++) {
    const a = k * 2.1, r = 1 + (k % 3) * 1.6, x = Math.cos(a) * r, z = Math.sin(a) * r;
    b.drum(x, z, 0.0, 0.09, 0.08, 0.06, 6, MAT.CANVAS, 14300 + k, { lie: 1, yaw: a + R(), solid: false });
    stick(b, [x, 0.05, z], [x + Math.cos(a + 1.2) * 0.16, 0.03, z + Math.sin(a + 1.2) * 0.16], 0.03, 0.005, 3, MAT.CANVAS, 14310 + k);
  }
}

/** The chapel's sites. baked: data/world/chapelHeights.json. */
export function chapelSites(baked) {
  if (!baked?.h) return [];
  return [
    { id: 'ash-chapel', at: CHAPEL.at, facing: 0, build: chapelBuild(baked), footprint: 50, seatAt: 'center' },
    { id: 'ash-birds', at: HOLLOW, facing: 0, build: birdsBuild, footprint: 4, seatAt: 'center' },
  ];
}
