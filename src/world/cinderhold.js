// Cinderhold: the miners (docs/phase-11/ember-design.md §4.1). On a bench of the cone's west flank (≈ 540 m, above the Sow:
// its families carry figs up to the mine), at the foot of a face that climbs east toward the crater from x ≈ 1985, a mining
// town built into the rock, all basalt and iron:
//   the galleries   three timbered mouths in the face; the north one holds the guild's bell-thermometer in the deep seam
//   the deep shaft  an iron headframe over a basalt collar, a cage on its chain: the guild's monthly tithe goes down in it
//   the yard        rails from the middle gallery to the spoil heap, carts on them
//   the guild hall  a long basalt hall with a slate roof, iron-banded doors, lamps either side
//   the rows        miners' houses, low, lean-to slate roofs, a lamp at each door
// Lamps everywhere (the shifts never stop): `lamp` lights, steady, brighter by night. Heights: data/world/cinderHeights.json
// (tools/world/sowHeights.mjs; the exact ground over CINDER_GRID, relative to the anchor), so every piece sits on the hill.
// Sites: cin-town (always), cin-cage (the cage at the head of the shaft; hidden once it has gone down for good).

import { MAT, NS, lampPost } from './architecture.js';
import { stick } from './camp.js';
import { lifted } from './sow.js';
import { windingTower, towerHouse } from './towerKit.js';

/** The town's anchor (the yard's middle) and its heights' grid (metres off the anchor, world axes). */
export const CINDER = { at: [1915, -2010] };
export const CINDER_GRID = { x0: -100, z0: -90, step: 2, nx: 101, nz: 91 };
/** Points of note, offsets from the anchor (x east, z north). */
export const CINDER_PTS = {
  galleryN: [74, 42], galleryM: [77, -4], galleryS: [72, -46],
  thermo: [76.5, 42], shaft: [50, -32], engine: [39, -41], belfry: [-51.5, 39], hall: [-38, 36], hallDoor: [-38, 29.2], rows: [-68, -44], spoil: [-6, -2],
  orrin: [-40, 27.5], teg: [70, 39], vell: [-34, 27.8], bron: [46, -28], wyn: [20, -8], miner1: [-62, -39], miner2: [-50, -39],
};
export const cinderWorld = (p) => [CINDER.at[0] + p[0], CINDER.at[1] + p[1]];

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

/** A gallery mouth facing east: basalt piers and lintel, timber props, the dark going back into the hill. */
function gallery(b, rel, [x, z], seed, R) {
  const y = rel(x - 2, z);   // (the hill rises east: the mouth looks west over the yard)
  b.box(x + 5, z, y - 2, y + 4.2, 4.5, 2.4, 0, MAT.EMBER, seed, { solid: true, plain: true, ...NS });            // the dark inside
  for (const s of [-1, 1]) b.box(x, z + s * 2.2, y - 1.5, y + 3.6, 0.7, 0.55, 0, MAT.BASALT, seed + 1 + (s > 0 ? 1 : 0), { course: 0.5 });
  b.box(x, z, y + 3.5, y + 4.4, 0.8, 3.0, 0, MAT.BASALT, seed + 3, { course: 0.45 });
  // A hood of rock over it, dug into the face.
  b.box(x + 2.5, z, y + 4.2, y + 7.5, 3.4, 3.6, 0, MAT.BASALT, seed + 4, { course: 0.8, ruin: 0.3 });
  // Timber sets inside the mouth.
  for (let k = 0; k < 3; k++) {
    const xx = x + 0.6 + k * 1.4;
    stick(b, [xx, y - 0.2, z - 1.5], [xx, y + 3.2, z - 1.5], 0.12, 0.11, 6, MAT.WOOD, seed + 10 + k * 3);
    stick(b, [xx, y - 0.2, z + 1.5], [xx, y + 3.2, z + 1.5], 0.12, 0.11, 6, MAT.WOOD, seed + 11 + k * 3);
    stick(b, [xx, y + 3.2, z - 1.7], [xx, y + 3.2, z + 1.7], 0.13, 0.13, 6, MAT.WOOD, seed + 12 + k * 3);
  }
  b.light(x + 0.8, y + 2.6, z, 7, 1.0, 0.6, 0.3, 1.3, 'lamp');
  void R;
}

function townBuild(baked) {
  const rel = relFrom(baked);
  return (b, facing, R) => {
    const P = CINDER_PTS;
    let s = 12000;
    gallery(b, rel, P.galleryN, s, R); gallery(b, rel, P.galleryM, s + 40, R); gallery(b, rel, P.galleryS, s + 80, R);
    // The bell-thermometer in the north gallery: an iron rod down into the seam, a glass bell on top, a board of the guild's
    // marks beside it.
    { const [x, z] = P.thermo, y = rel(x - 3.5, z);
      stick(b, [x, y - 1.5, z], [x, y + 1.45, z], 0.04, 0.04, 6, MAT.IRON, s + 120);
      b.drum(x, z, y + 1.45, y + 1.85, 0.16, 0.08, 10, MAT.GLASS, s + 121, { solid: false });
      b.box(x - 0.2, z + 0.65, y + 0.5, y + 2.1, 0.03, 0.32, 0, MAT.PLANK, s + 122, { solid: false, ...NS });
      for (let k = 0; k < 6; k++) b.box(x - 0.24, z + 0.65, y + 0.7 + k * 0.24, y + 0.72 + k * 0.24, 0.01, 0.18, 0, MAT.IRON, s + 123 + k, { solid: false, plain: true, ...NS });
    }
    // The engine tower beside the shaft, and the guild's bell tower at the hall's west end: Cinderhold's tall buildings.
    { const [x, z] = P.engine, y = Math.min(rel(x - 3, z - 3), rel(x + 3, z - 3), rel(x - 3, z + 3), rel(x + 3, z + 3)); windingTower(b, x, z, y, 0.1, { seed: 17 }); }
    { const [x, z] = P.belfry, y = Math.min(rel(x - 3, z - 3), rel(x + 3, z - 3), rel(x - 3, z + 3), rel(x + 3, z + 3)); towerHouse(b, x, z, y, 0, { hw: 2.6, hd: 2.6, storeys: 4, storey: 3.2, seed: 23, mat: MAT.BASALT }); }
    // The deep shaft: a basalt collar, the dark going down, a four-legged iron headframe, the wheel, the chain.
    { const [x, z] = P.shaft, y = rel(x, z);
      b.drum(x, z, y - 2, y + 0.9, 2.6, 2.4, 22, MAT.BASALT, s + 140);
      b.drum(x, z, y + 0.6, y + 0.92, 2.0, 2.0, 18, MAT.EMBER, s + 141, { solid: false });
      const top = y + 10.5;
      for (const [dx, dz] of [[-3.2, -3.2], [3.2, -3.2], [3.2, 3.2], [-3.2, 3.2]]) stick(b, [x + dx, y - 0.3, z + dz], [x + dx * 0.18, top, z + dz * 0.18], 0.16, 0.12, 6, MAT.IRON, s + 142);
      for (const h of [3.5, 7]) { const k = 1 - (h + 0.3) / (top - y + 0.3) * 0.82;
        for (const [a, c] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) stick(b, [x + a[0] * 3.2 * k, y + h, z + a[1] * 3.2 * k], [x + c[0] * 3.2 * k, y + h, z + c[1] * 3.2 * k], 0.07, 0.07, 5, MAT.IRON, s + 143); }
      b.drum(x - 0.6, z, top - 0.2, top + 0.2, 1.3, 1.3, 16, MAT.WOOD, s + 144, { lie: 1, yaw: Math.PI / 2, solid: false });
      stick(b, [x, top - 1.2, z], [x, y + 5.4, z], 0.035, 0.035, 4, MAT.IRON, s + 145);
      b.light(x + 2.6, y + 3.2, z + 2.6, 8, 1.0, 0.6, 0.3, 1.2, 'lamp');
    }
    // Rails from the middle gallery to the spoil heap: sleepers and two iron rails, lying on the ground.
    { const [ax, az] = P.galleryM, [bx, bz] = P.spoil, n = Math.round(Math.hypot(bx - ax, bz - az) / 1.1);
      for (let k = 1; k < n; k++) {
        const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = rel(x, z), yaw = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
        b.box(x, z, y - 0.1, y + 0.08, 0.12, 0.75, yaw, MAT.WOOD, s + 160 + (k % 7), { solid: false, plain: true, ...NS });
        for (const sd of [-0.5, 0.5]) { const ox = Math.cos(yaw - Math.PI / 2) * 0, oz = 0; void ox; void oz;
          const px = x + Math.sin(yaw) * sd, pz = z + Math.cos(yaw) * sd;
          b.box(px, pz, y + 0.08, y + 0.16, 0.56, 0.035, yaw, MAT.IRON, s + 170, { solid: false, plain: true, ...NS }); }
      }
      // Two carts, one full of ore.
      for (const [t, full] of [[0.3, true], [0.62, false]]) {
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = rel(x, z) + 0.16, yaw = Math.atan2(bx - ax, bz - az);
        b.box(x, z, y + 0.35, y + 1.2, 0.6, 0.9, yaw, MAT.PLANK, s + 180 + t * 10, { solid: true });
        if (full) b.drum(x, z, y + 1.1, y + 1.45, 0.55, 0.3, 9, MAT.BASALT, s + 183, { solid: false });
        for (const sd of [-1, 1]) for (const fw of [-0.55, 0.55]) b.drum(x + Math.sin(yaw) * fw + Math.cos(yaw) * sd * 0.5, z + Math.cos(yaw) * fw - Math.sin(yaw) * sd * 0.5, y + 0.25 - 0.05, y + 0.25 + 0.05, 0.25, 0.25, 10, MAT.IRON, s + 184, { lie: 1, yaw: yaw + Math.PI / 2, solid: false });
      }
      // The spoil heap: broken basalt, tipped.
      const y = rel(bx, bz);
      b.cone(bx - 8, bz, y - 1, y + 6.5, 9, 14, MAT.BASALT, s + 190, { solid: true });
    }
    // The guild hall: long basalt walls, a slate roof, iron-banded doors facing south over the yard, lamps either side.
    { const [x, z] = P.hall, y = Math.max(rel(x - 9, z - 6), rel(x + 9, z - 6), rel(x - 9, z + 6), rel(x + 9, z + 6)) + 0.1;
      const L = 9, D = 6, H = 5.2;
      b.box(x, z, y - 3, y + 0.35, L + 0.6, D + 0.6, 0, MAT.BASALT, s + 220, { course: 0.45 });
      b.box(x, z + D - 0.35, y + 0.35, y + H, L, 0.35, 0, MAT.BASALT, s + 221, { course: 0.55 });
      b.box(x - L + 0.35, z, y + 0.35, y + H, 0.35, D - 0.7, 0, MAT.BASALT, s + 222, { course: 0.55 });
      b.box(x + L - 0.35, z, y + 0.35, y + H, 0.35, D - 0.7, 0, MAT.BASALT, s + 223, { course: 0.55 });
      // The front: either side of the doors.
      b.box(x - (L + 1.1) / 2 - 0.1, z - D + 0.35, y + 0.35, y + H, (L - 1.1) / 2, 0.35, 0, MAT.BASALT, s + 224, { course: 0.55 });
      b.box(x + (L + 1.1) / 2 + 0.1, z - D + 0.35, y + 0.35, y + H, (L - 1.1) / 2, 0.35, 0, MAT.BASALT, s + 225, { course: 0.55 });
      b.box(x, z - D + 0.35, y + 3.0, y + H, 1.25, 0.35, 0, MAT.BASALT, s + 226, { course: 0.5 });
      b.box(x, z - D + 0.5, y + 0.35, y + 3.0, 1.15, 0.08, 0, MAT.PLANK, s + 227, { solid: true, ...NS });
      for (const hb of [0.9, 2.1]) b.box(x, z - D + 0.42, y + hb, y + hb + 0.12, 1.2, 0.04, 0, MAT.IRON, s + 228, { solid: false, plain: true, ...NS });
      // Gables and the roof: two slate slopes on the long walls, the gable ends stepped basalt.
      const pitch = 0.55, rh = D * Math.tan(pitch);
      for (const sd of [-1, 1]) b.box(x, z + sd * D / 2, y + H + rh / 2 - 0.05, y + H + rh / 2 + 0.2, L + 0.5, D / Math.cos(pitch) / 2 + 0.3, 0, MAT.SLATE, s + 230 + sd, { solid: false, tilt: sd * pitch, ...NS });
      for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) { const w = D * (1 - (k + 0.5) / 5); b.box(x + sx * (L - 0.35), z, y + H + k * rh / 5, y + H + (k + 1) * rh / 5, 0.35, w, 0, MAT.BASALT, s + 235 + k, { solid: false, plain: true, ...NS }); }
      b.blockers.push({ site: b.site, kind: 'box', x, z, hx: L, hz: D, cos: 1, sin: 0, y0: y + H, y1: y + H + rh, cam: true });
      for (const sx of [-1, 1]) { const a = [x + sx * 2.6, z - D - 0.9, 2.9, Math.PI / 2 * (sx > 0 ? 1 : -1), s + 240 + sx, 1.1]; lifted(b, rel(a[0], a[1]), () => lampPost(b, ...a)); }
    }
    // The rows: four miners' houses, lean-to slate roofs, a lamp at each door.
    for (let k = 0; k < 4; k++) {
      const x = P.rows[0] + k * 10.5, z = P.rows[1], y = Math.max(rel(x - 4, z - 3), rel(x + 4, z - 3), rel(x - 4, z + 3), rel(x + 4, z + 3)) + 0.05;
      b.box(x, z, y - 2.5, y + 0.25, 4.6, 3.4, 0, MAT.BASALT, s + 260 + k * 10, { course: 0.4 });
      b.box(x, z - 2.8, y + 0.25, y + 2.6, 4.2, 0.3, 0, MAT.BASALT, s + 261 + k * 10, { course: 0.45 });
      b.box(x - 4.0, z, y + 0.25, y + 3.0, 0.3, 2.6, 0, MAT.BASALT, s + 262 + k * 10, { course: 0.45 });
      b.box(x + 4.0, z, y + 0.25, y + 3.0, 0.3, 2.6, 0, MAT.BASALT, s + 263 + k * 10, { course: 0.45 });
      b.box(x - 2.4, z + 2.8, y + 0.25, y + 3.4, 1.9, 0.3, 0, MAT.BASALT, s + 264 + k * 10, { course: 0.45 });
      b.box(x + 2.9, z + 2.8, y + 0.25, y + 3.4, 1.4, 0.3, 0, MAT.BASALT, s + 265 + k * 10, { course: 0.45 });
      b.box(x + 0.75, z + 2.85, y + 0.25, y + 2.3, 0.55, 0.05, 0, MAT.PLANK, s + 266 + k * 10, { solid: false, ...NS });
      b.box(x + 0.75, z + 2.8, y + 2.3, y + 3.4, 0.55, 0.3, 0, MAT.BASALT, s + 267 + k * 10, { solid: false, plain: true, ...NS });
      b.box(x, z, y + 3.0, y + 3.2, 4.6, 3.4, 0, MAT.SLATE, s + 268 + k * 10, { solid: false, tilt: 0.12, ...NS });
      { const a = [x + 2.0, z + 3.8, 2.4, Math.PI / 2, s + 269 + k * 10, 0.8]; lifted(b, rel(a[0], a[1]), () => lampPost(b, ...a)); }
    }
    // Lamps along the yard.
    for (const [x, z, d] of [[20, 10, 0], [0, 22, 1.6], [-24, -22, -1.6], [38, -14, 0]]) { const a = [x, z + 0, 2.8, d, s + 300 + x, 0.9]; lifted(b, rel(a[0], a[1]), () => lampPost(b, ...a)); }
  };
}

/** The tithe cage, hanging at the head of the shaft: iron bars, a plank floor, a board of names nailed to it. */
function cageBuild(baked) {
  const rel = relFrom(baked);
  return (b) => {
    const [x, z] = CINDER_PTS.shaft, y = rel(x, z) + 3.4, s = 12500;
    b.box(x, z, y, y + 0.1, 0.8, 0.8, 0, MAT.PLANK, s, { solid: false, plain: true, ...NS });
    b.box(x, z, y + 2.1, y + 2.2, 0.8, 0.8, 0, MAT.IRON, s + 1, { solid: false, plain: true, ...NS });
    for (let k = 0; k < 16; k++) { const t = (k % 4) / 3 * 1.6 - 0.8, side = Math.floor(k / 4); const [dx, dz] = [[t, -0.8], [0.8, t], [-t, 0.8], [-0.8, -t]][side]; stick(b, [x + dx, y, z + dz], [x + dx, y + 2.15, z + dz], 0.025, 0.025, 4, MAT.IRON, s + 2); }
    b.box(x, z - 0.83, y + 0.9, y + 1.6, 0.45, 0.02, 0, MAT.PLANK, s + 3, { solid: false, ...NS });
  };
}

/** Cinderhold's sites. baked: data/world/cinderHeights.json. */
export function cinderSites(baked) {
  if (!baked?.h) return [];
  return [
    { id: 'cin-town', at: CINDER.at, facing: 0, build: townBuild(baked), footprint: 100, seatAt: 'center', lamp: true },
    { id: 'cin-cage', at: CINDER.at, facing: 0, build: cageBuild(baked), footprint: 1, seatAt: 'center' },
  ];
}
