// The kelp forest of the Sounding (Phase 10 U2; storylines.md "The descent": "the kelp forest, tall as the mangroves above it"):
// giant kelp on the pit's floor and the foot of its walls, each a holdfast of a few stipes rising 22–36 m, their blades hanging
// off them and their tops streaming in the canopy. It covers the floor, so every descent passes through it: that's where the
// Lung tears. A clear apron round the intake's column in the middle (the city's breath keeps it bare). Pure: placement by cell
// hash, the root's height from a ground query; tests/lung.test.js.

import { SOUNDING } from './sounding.js';

/** Grid cell (m), stipe heights (m), deepest root that grows (world y), canopy cap (world y), the clear apron round the column (m). */
export const KELP = { cell: 3.4, hMin: 22, hMax: 36, rootMax: -52, topMax: -46, apron: 13, reach: 0.85 };
/** The intake's column (the city's old breath): its axis, radius, and the height it rises to before it frays out. */
export const COLUMN = { x: SOUNDING.x + 6, z: SOUNDING.z - 4, r: 6, top: -56 };
/** The ledge among the kelp roots where the Wraith wakes after the tear (put out): 30 m from the column, facing it. */
export const LEDGE = { x: COLUMN.x + 26, z: COLUMN.z + 15, yaw: Math.atan2(-26, -15) };

const hash = (i, j, k) => {
  let x = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(k | 0, 0x9e3779b1);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d); x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
};

/**
 * The stipe in grid cell (i, j), if one grows: writes out = [x, rootY, z, height, phase, lean, scale] and returns true.
 * @param {(x: number, z: number) => number} groundAt
 */
export function kelpAt(i, j, groundAt, out) {
  const c = KELP.cell;
  const x = SOUNDING.x + (i + 0.15 + 0.7 * hash(i, j, 1)) * c, z = SOUNDING.z + (j + 0.15 + 0.7 * hash(i, j, 2)) * c;
  const d = Math.hypot(x - SOUNDING.x, z - SOUNDING.z);
  if (d > SOUNDING.r - 8) return false;
  const dc = Math.hypot(x - COLUMN.x, z - COLUMN.z);
  if (dc < KELP.apron) return false;
  // Thinner towards the apron and in drifts across the floor (glades between the stands), denser at the walls' foot.
  const glade = 0.5 + 0.5 * Math.sin(x * 0.045 + 1.3) * Math.sin(z * 0.038 - 0.7);
  const density = 0.62 * Math.min(1, (dc - KELP.apron) / 10) * (0.55 + 0.45 * glade) + 0.25 * Math.max(0, (d - 180) / 40);
  if (hash(i, j, 3) > density) return false;
  const y = groundAt(x, z);
  if (!(y < KELP.rootMax)) return false;
  const h = Math.min(KELP.hMin + (KELP.hMax - KELP.hMin) * hash(i, j, 4), KELP.topMax - y);
  if (h < 8) return false;
  out[0] = x; out[1] = y; out[2] = z; out[3] = h;
  out[4] = hash(i, j, 5) * 6.2832; out[5] = hash(i, j, 6) * 6.2832; out[6] = 0.8 + 0.4 * hash(i, j, 7);
  return true;
}

/** Cell index of a world coordinate (the grid's origin is the pit's centre). */
export const kelpCell = (v, o) => Math.floor((v - o) / KELP.cell);

/**
 * Is the body (a point at x, y, z) among a stipe's blades? The stipe nearest within reach, or null: [dx, dz, top] scratch.
 * @param {(x: number, z: number) => number} groundAt
 */
export function kelpContact(x, y, z, groundAt, tmp = new Array(7)) {
  const i0 = kelpCell(x, SOUNDING.x), j0 = kelpCell(z, SOUNDING.z);
  let best = Infinity;
  for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) {
    if (!kelpAt(i, j, groundAt, tmp)) continue;
    if (y < tmp[1] || y > tmp[1] + tmp[3] + 0.5) continue;
    // The blades spread wider near the canopy (where the fronds stream).
    const s = (y - tmp[1]) / tmp[3], reach = KELP.reach * tmp[6] * (1 + 0.8 * s * s);
    const dd = Math.hypot(x - tmp[0], z - tmp[2]);
    if (dd < reach && dd < best) best = dd;
  }
  return best < Infinity ? best : -1;
}

/** Inside the column (the axis's radius, under its top)? */
export function inColumn(x, y, z) {
  return y < COLUMN.top && Math.hypot(x - COLUMN.x, z - COLUMN.z) < COLUMN.r;
}

/** The canopy's middle: below it inside the pit the body has passed through the forest, touching or not. */
export const CANOPY_MID = -86;
