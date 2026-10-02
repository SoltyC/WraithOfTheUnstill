// Climate-derived layers: soft biome weights, base surface material, and wind climatology.
// Deterministic (no transcendental functions).

import { regions, coastDistance, smooth, VOLCANO_X, VOLCANO_Z } from './geography.mjs';
import { gfbm } from '../../src/terrain/gnoise.js';

/** Biome channel order used everywhere (bake, runtime, shaders). */
export const BIOMES = ['frost', 'meadow', 'mire', 'dunes', 'ember', 'coast'];

/** Surface material ids (BRIEF §4.1 material map). */
export const MATERIALS = { snow: 0, sand: 1, mud: 2, grass: 3, ash: 4, rock: 5, beach: 6, seabed: 7 };

const reg = { north: 0, west: 0, east: 0, volcano: 0, centre: 0 };

/**
 * Soft biome weights at (x, z) given height h (m) and wetness w (0..1). Writes 6 weights that sum to 1.
 * @param {Float64Array} out length 6
 */
export function biomeWeights(x, z, h, w, seed, out) {
  regions(x, z, seed, reg);
  const coast = coastDistance(x, z, seed);
  // Snow line descends from the north; altitude pushes frost anywhere high.
  const frost = Math.max(reg.north, smooth(780, 1100, h + 120 * gfbm(x / 500, z / 500, 3, seed + 201)));
  const ember = reg.volcano;
  const dunes = reg.east * (1 - ember);
  const mire = reg.west * (0.6 + 0.4 * w) * smooth(60, 25, h);
  const shore = smooth(260 + 120 * gfbm(x / 700, z / 700, 3, seed + 202), 0, coast) * smooth(-30, 2, h);
  let meadow = Math.max(0, reg.centre + reg.west * (1 - mire) * 0.7);
  const raw = [frost * (1 - shore), meadow * (1 - frost) * (1 - shore), mire * (1 - frost) * (1 - shore), dunes * (1 - frost) * (1 - shore), ember * (1 - frost * 0.6) * (1 - shore), shore + (h < 0 ? 1 : 0)];
  let s = 0;
  for (let k = 0; k < 6; k++) s += raw[k];
  if (s <= 1e-6) { out.fill(0); out[1] = 1; return; }
  for (let k = 0; k < 6; k++) out[k] = raw[k] / s;
}

/**
 * Base surface material from biome weights, slope (rise/run), height and wetness.
 * @param {Float64Array} bw biome weights
 */
export function material(bw, slope, h, w, coast) {
  if (h < -1.5) return MATERIALS.seabed;
  if (coast < 60 && h < 6 && slope < 0.35) return MATERIALS.beach;
  if (slope > 0.85) return MATERIALS.rock; // ~40°
  let best = 0;
  for (let k = 1; k < 6; k++) if (bw[k] > bw[best]) best = k;
  switch (BIOMES[best]) {
    case 'frost': return slope > 0.6 ? MATERIALS.rock : MATERIALS.snow;
    case 'meadow': return MATERIALS.grass;
    case 'mire': return w > 0.25 ? MATERIALS.mud : MATERIALS.grass;
    case 'dunes': return MATERIALS.sand;
    case 'ember': return MATERIALS.ash;
    default: return h < 8 ? MATERIALS.beach : MATERIALS.grass;
  }
}

/**
 * Prevailing wind (unit vector the wind blows toward, x east / z north) at (x, z).
 * Westerlies overall; katabatic flow off the northern ranges; dunes in a NE trade; onshore at the
 * coast; slight swirl around the volcano. Smooth by construction.
 */
export function wind(x, z, seed, out) {
  regions(x, z, seed, reg);
  let wx = 1, wz = -0.15;                                  // westerlies, slightly south
  wx += reg.north * 0.2; wz += reg.north * -0.9;           // katabatic: down off the ranges
  wx += reg.east * -0.4; wz += reg.east * 0.55;            // dune trade wind toward the north-east… then curled
  const coast = coastDistance(x, z, seed);
  const onshore = smooth(600, 0, coast);
  wx += onshore * 0.6; wz += onshore * 0.6;                // sea breeze pushes inland (to the NE)
  const vx = x - VOLCANO_X, vz = z - VOLCANO_Z;
  const vr = Math.sqrt(vx * vx + vz * vz) + 1;
  wx += reg.volcano * (-vz / vr) * 0.6; wz += reg.volcano * (vx / vr) * 0.6;
  wx += 0.25 * gfbm(x / 2500, z / 2500, 3, seed + 301);
  wz += 0.25 * gfbm(x / 2500 + 3.3, z / 2500, 3, seed + 302);
  const l = Math.sqrt(wx * wx + wz * wz) || 1;
  out[0] = wx / l; out[1] = wz / l;
}
