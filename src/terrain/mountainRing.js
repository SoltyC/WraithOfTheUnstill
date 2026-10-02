// Distant mountain ring (BRIEF §2.3): an impostor range standing in the sea beyond the 8 km bake,
// so no horizon reads as flat or simply ends. Pure and deterministic: a polar grid around the
// continent centre whose heights come from the bake's gradient noise. Generated off the main
// thread (ring.worker.js) and drawn as one static mesh; aerial perspective does most of its look.
//
// Character by bearing (matching the continent): tall snowy ranges to the north continue the
// Frost Steppe, dark volcanic massifs to the east, middling ranges to the west, and open sea to
// the south with a few far islands. Valleys drown below sea level, so the ring reads as distant
// mountain coasts and islands rather than one continuous shore.

import { gfbm, gridged, geroded } from './gnoise.js';

export const RING = {
  inner: 12000,    // m from the centre: the ring rises out of the sea floor here
  outer: 28000,    // m: back slopes end here (inside the 40 km far plane from anywhere on land)
  crest: 18500,    // m: mean crest radius (wanders ±3 km with bearing)
  base: -150,      // m: below the clay-view sea floor (−60) so the foot is hidden
  azimuth: 2048,   // segments around (≈57 m apart along the crest)
  radial: 128,     // rings from inner to outer (125 m apart)
};

const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

/** Peak height scale (m) for a unit bearing (dx, dz); x east, z north. */
function amplitude(dx, dz, seed) {
  const n = Math.max(0, dz), s = Math.max(0, -dz), e = Math.max(0, dx), w = Math.max(0, -dx);
  // Squared lobes blend smoothly between the four characters.
  const north = n * n, south = s * s, east = e * e, west = w * w;
  const sum = north + south + east + west;
  // South: open sea; a slow noise along the bearing raises a few far islands.
  const isles = 1500 * Math.max(0, 2.2 * gfbm(dx * 3.1, dz * 3.1, 3, seed + 5) - 0.25);
  return (north * 2900 + east * 2000 + west * 1500 + south * isles) / sum;
}

/** Height (m) at world (x, z); r = distance from the centre. */
export function ringHeight(x, z, seed) {
  const r = Math.sqrt(x * x + z * z);
  if (r <= RING.inner || r >= RING.outer) return RING.base;
  const dx = x / r, dz = z / r;
  const crest = RING.crest + 3000 * gfbm(dx * 2.3 + 11, dz * 2.3, 3, seed + 3);
  const env = smooth(RING.inner, crest - 1500, r) * smooth(RING.outer, crest + 3500, r);
  const A = amplitude(dx, dz, seed);
  // Eroded massifs carrying ridged crests: sharp skylines, smoothed flanks; the low ground
  // between massifs sinks below the sea (offset), cutting the ring into ranges and islands.
  const ridge = gridged(x / 4800, z / 4800, 6, seed + 17);
  const mass = geroded(x / 11000, z / 11000, 5, seed + 23, 1.5) * 0.5 + 0.5;
  const h = A * (1.1 * ridge * (0.35 + 0.65 * mass) + 0.5 * mass * mass - 0.32) - 90;
  return RING.base + (h - RING.base) * env;
}

/**
 * Builds the ring mesh: positions and normals (xyz), uint32 indices. Seam-free: the last azimuth
 * column wraps to the first.
 */
export function buildRing(seed) {
  const NA = RING.azimuth, NR = RING.radial + 1;
  const pos = new Float32Array(NA * NR * 3);
  const nrm = new Float32Array(NA * NR * 3);
  const h = new Float64Array(NA * NR);
  const dr = (RING.outer - RING.inner) / RING.radial;
  const cosA = new Float64Array(NA), sinA = new Float64Array(NA);
  for (let a = 0; a < NA; a++) { const t = (a / NA) * 2 * Math.PI; cosA[a] = Math.cos(t); sinA[a] = Math.sin(t); }
  for (let j = 0; j < NR; j++) {
    const r = RING.inner + j * dr;
    for (let a = 0; a < NA; a++) {
      const x = r * cosA[a], z = r * sinA[a], k = j * NA + a;
      h[k] = ringHeight(x, z, seed);
      pos[k * 3] = x; pos[k * 3 + 1] = h[k]; pos[k * 3 + 2] = z;
    }
  }
  // Normals from the grid (central differences along the azimuth and radial directions).
  for (let j = 0; j < NR; j++) {
    const j0 = j > 0 ? j - 1 : j, j1 = j < NR - 1 ? j + 1 : j;
    for (let a = 0; a < NA; a++) {
      const a0 = (a + NA - 1) % NA, a1 = (a + 1) % NA, k = j * NA + a;
      // Tangent along the azimuth (t) and along the radius (u), each between neighbours.
      const tx = pos[(j * NA + a1) * 3] - pos[(j * NA + a0) * 3], ty = h[j * NA + a1] - h[j * NA + a0], tz = pos[(j * NA + a1) * 3 + 2] - pos[(j * NA + a0) * 3 + 2];
      const ux = pos[(j1 * NA + a) * 3] - pos[(j0 * NA + a) * 3], uy = h[j1 * NA + a] - h[j0 * NA + a], uz = pos[(j1 * NA + a) * 3 + 2] - pos[(j0 * NA + a) * 3 + 2];
      // n = t × u, oriented upward.
      let nx = ty * uz - tz * uy, ny = tz * ux - tx * uz, nz = tx * uy - ty * ux;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nrm[k * 3] = nx / l; nrm[k * 3 + 1] = ny / l; nrm[k * 3 + 2] = nz / l;
    }
  }
  const idx = new Uint32Array(NA * (NR - 1) * 6);
  let o = 0;
  for (let j = 0; j < NR - 1; j++) {
    for (let a = 0; a < NA; a++) {
      const a1 = (a + 1) % NA;
      const k00 = j * NA + a, k01 = j * NA + a1, k10 = (j + 1) * NA + a, k11 = (j + 1) * NA + a1;
      idx[o++] = k00; idx[o++] = k10; idx[o++] = k01;
      idx[o++] = k01; idx[o++] = k10; idx[o++] = k11;
    }
  }
  return { positions: pos, normals: nrm, indices: idx };
}
