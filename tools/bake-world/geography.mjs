// Macro geography of the continent (BRIEF §2.3, §4.1): pure, deterministic functions of (x, z).
// World frame: x east, z north, metres, origin at the centre, extent ±HALF.
//
// Determinism: only + − × ÷, comparisons and Math.sqrt/floor/abs/min/max (all IEEE-exact), so
// the bake is byte-identical on any machine and Node version. No sin/cos/exp/pow.
//
// Layout (adjusted from the BRIEF table to compose well):
//   Frost Steppe   — north plateau (~550 m) under east–west ranges (peaks ~1500 m)
//   Highland Meadow— rolling centre uplands (~260 m), rivers rise here
//   Mirefen        — west lowlands (~15–30 m), meeting the west coast
//   Glass Dunes    — east basin (~150 m), dunes come from the runtime meso layer
//   Ember Waste    — south-east volcano (~950 m cone with crater) over ash plains
//   Coast & Sea    — south and west shores; the sea runs to the edge on those sides
//   Ring           — ranges along the north and east edges so land horizons never read flat

import { hash2 } from '../../src/terrain/noise.js';
import { gfbm, gridged, geroded } from './gnoise.mjs';

export const WORLD_SIZE = 8192;
export const HALF = WORLD_SIZE / 2;
export const SEA_LEVEL = 0;

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
/** Polynomial smooth minimum (rounds the corner where two distance fields meet). */
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

/** Multi-scale domain warp: writes the warped (x, z) to out[0..1]. */
function warp(x, z, seed, amp, scale, out) {
  out[0] = x + amp * gfbm(x / scale, z / scale, 4, seed) + amp * 0.3 * gfbm(x / (scale * 0.27), z / (scale * 0.27), 3, seed + 7);
  out[1] = z + amp * gfbm(x / scale + 7.7, z / scale - 3.1, 4, seed + 1) + amp * 0.3 * gfbm(x / (scale * 0.27) - 2.2, z / (scale * 0.27), 3, seed + 8);
}
const w2 = new Float64Array(2);

/**
 * Signed distance (m) into land from the south/west coastline: positive inland, negative at sea.
 * Two warped shorelines (west x≈-2900, south z≈-2900) joined by a smooth minimum; extra small
 * warps cut bays and headlands.
 */
export function coastDistance(x, z, seed) {
  warp(x, z, seed + 101, 700, 2600, w2);
  const wx = w2[0] + 70 * gfbm(x / 170, z / 170, 3, seed + 103);
  const wz = w2[1] + 70 * gfbm(x / 170 + 4.4, z / 170, 3, seed + 104);
  return smin(wx + 2900, wz + 2900, 1400);
}

/** Region weights (smooth, roughly partition of unity) used for elevation and biomes. */
export function regions(x, z, seed, out) {
  warp(x, z, seed + 40, 2000, 3000, w2);
  // Second, finer warp so region borders wander at the kilometre scale too.
  const wx = w2[0] + 800 * gfbm(x / 1100, z / 1100, 3, seed + 44);
  const wz = w2[1] + 800 * gfbm(x / 1100 - 6.6, z / 1100, 3, seed + 45);
  out.north = smooth(700, 2300, wz);
  out.west = smooth(-200, -1700, wx) * (1 - out.north);
  out.east = smooth(200, 1900, wx) * smooth(2400, 800, wz) * smooth(-2600, -900, wz);
  const vx = wx - VOLCANO_X, vz = wz - VOLCANO_Z;
  out.volcano = 1 - smooth(1000, 2900, Math.sqrt(vx * vx + vz * vz));
  const used = out.north + out.west + out.east + out.volcano;
  if (used > 1) { out.north /= used; out.west /= used; out.east /= used; out.volcano /= used; }
  out.centre = Math.max(0, 1 - out.north - out.west - out.east - out.volcano);
}

export const VOLCANO_X = 2350, VOLCANO_Z = -2150;

/** Volcano cone with crater, lava-flow ridges and gullies (m above the ash plain). */
function volcano(x, z, seed) {
  const dx = x - VOLCANO_X, dz = z - VOLCANO_Z;
  const r = Math.sqrt(dx * dx + dz * dz);
  const R = 1750, H = 820;
  const t = clamp01(1 - r / R);
  let h = H * t * t * (1.25 - 0.25 * t);       // concave cone: steep summit, long apron
  const rc = 240;                                  // crater
  if (r < rc * 1.6) { const c = clamp01(1 - r / rc); h -= 160 * c * c * (3 - 2 * c); }
  // Flank texture: ridged flows elongated downslope (sampled in a radially stretched frame away
  // from the summit, so there is no singularity), fading in from the crater rim.
  const away = smooth(rc * 1.2, rc * 3, r);
  const inv = 1 / (r + 1);
  // Radially stretched frame, its direction wobbled by noise so flows braid instead of radiating.
  const wob = 0.35 * gfbm(x / 700, z / 700, 3, seed + 63);
  const ux = dx * inv + wob, uz = dz * inv - wob * 0.7;
  const sx = ux * 420 + dx * 0.35, sz = uz * 420 + dz * 0.35;
  h += away * t * t * 95 * (gridged(sx / 230, sz / 230, 4, seed + 61) - 0.45);
  h += t * 35 * gfbm(x / 300, z / 300, 4, seed + 62);
  return h;
}

/** Peaks for a range band: eroded ridges, amplitude in metres. */
function range(x, z, seed, scale, amp) {
  const e = geroded(x / scale, z / scale, 8, seed, 1.4);
  const r = gridged(x / (scale * 1.6), z / (scale * 1.6), 5, seed + 5);
  return amp * (0.5 * (e * 0.5 + 0.5) + 0.8 * r * r);
}

const reg = { north: 0, west: 0, east: 0, volcano: 0, centre: 0 };

/**
 * Macro elevation in metres before hydrology (rivers and lakes are carved by the bake).
 * @param {number} seed
 */
export function macroHeight(x, z, seed) {
  regions(x, z, seed, reg);
  const coast = coastDistance(x, z, seed);

  // Regional base levels.
  const hCentre = 250 + 80 * geroded(x / 1500, z / 1500, 6, seed + 11, 0.9);
  const hNorth = 540 + 70 * geroded(x / 1900, z / 1900, 6, seed + 12, 0.9);
  const hWest = 20 + 8 * gfbm(x / 900, z / 900, 4, seed + 13);
  const hEast = 150 + 25 * gfbm(x / 1700, z / 1700, 4, seed + 14);
  const hVol = 175 + volcano(x, z, seed);
  let h = hNorth * reg.north + hWest * reg.west + hEast * reg.east + hVol * reg.volcano + hCentre * reg.centre;

  // Northern ranges above the plateau and the north/east edge ring, along warped bands.
  warp(x, z, seed + 70, 500, 2200, w2);
  const northRange = smooth(2400, 3300, w2[1]);
  const eastRing = smooth(3000, 3700, w2[0]) * smooth(-3000, -2000, w2[1]);
  const ring = Math.max(northRange, eastRing);
  if (ring > 0) h += ring * range(x, z, seed + 20, 1300, 1050);
  // Foothill ridges inside the plateau and the uplands.
  h += reg.north * 150 * gridged(x / 950, z / 950, 5, seed + 21);
  h += reg.centre * 55 * gridged(x / 750 + 3.3, z / 750, 4, seed + 22);

  // Coastline: land falls to the shore; south coast is cliffed, west coast low and sandy.
  const cliffiness = smooth(-2000, -2700, z) * smooth(-2400, -1200, x);
  const shore = smooth(0, lerp(1000, 180, cliffiness), coast);
  const seaH = -10 - 75 * smooth(0, 1600, -coast) + 5 * gfbm(x / 600, z / 600, 3, seed + 30);
  h = seaH + (h - seaH) * shore;
  if (cliffiness > 0 && coast > 0) h += cliffiness * 45 * smooth(10, 80, coast);
  return h;
}

/** Deterministic jitter in [0, 1) for placement. */
export const jitter = (i, j, seed) => hash2(i, j, seed);
