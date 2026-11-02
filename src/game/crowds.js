// Crowds for the cutscenes (render/crowd.js plays them): the city alive, as the flashbacks show it (release-cinematic.md shot 3,
// "the great hall alive"), and the people working behind a hero. Each figure: { x, y, z (world), yaw, scale, motion, t, walk, dye }.
// Seeded: the same crowd every time. Pure (tests/crowds.test.js).

import { EBB_ORIGIN as O, HALL } from '../world/ebbhold.js';

const DYES = [[2.1, 1.25, 0.85], [1.15, 1.6, 1.2], [1.1, 1.3, 1.65], [2.2, 2.1, 1.85], [0.8, 0.85, 1.05], [2.0, 1.6, 0.9], [1.6, 1.0, 1.0], [1.3, 1.45, 1.3]];
const SCALES = [0.9, 0.96, 1.0, 1.04, 1.1];

function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** The Tide Hall alive: people walking the causeway both ways, standing in talk at the platform, at work along the galleries. */
export function hallAlive(seed = 7, max = 48) {
  const r = rng(seed), out = [];
  const fig = (x, y, z, yaw, motion, extra = {}) => out.length < max && out.push({ x: x + O.x, y: y + O.y, z: z + O.z, yaw, motion, scale: SCALES[Math.floor(r() * SCALES.length)], t: r() * 9, dye: DYES[Math.floor(r() * DYES.length)], ...extra });
  // The causeway: two streams, east on the north half, west on the south half (walkers wrap over their range, fading at its ends).
  const along = (lo, hi, w) => lo + w / 2 + r() * Math.max(0, hi - lo - w);   // a walk's middle, its whole range between lo and hi
  for (let k = 0; k < 18; k++) { const east = k % 2 === 0, w = 24 + r() * 20; fig(along(2, 95, w), HALL.walk, (east ? 1.6 : -1.6) + (r() - 0.5) * 1.6, east ? Math.PI / 2 : -Math.PI / 2, 'walk', { walk: w }); }
  // Knots of people standing, facing each other, on the causeway's edges and the platform; a father with a baby.
  for (let k = 0; k < 6; k++) {
    const cx = k < 3 ? 22 + k * 22 + r() * 6 : 114 + r() * 32, cz = k < 3 ? (k % 2 ? 3.6 : -3.6) : (r() - 0.5) * 40;
    for (let j = 0; j < 3; j++) { const a = (j / 3) * Math.PI * 2 + r(); fig(cx + Math.sin(a) * 0.9, HALL.walk, cz + Math.cos(a) * 0.9, a + Math.PI, j === 2 && k === 1 ? 'rock' : 'stand'); }
  }
  // The walk galleries: people walking their length.
  // (between the colonnade and the stairs: 37–39 m out)
  for (let k = 0; k < 6; k++) { const s = k % 2 ? 1 : -1, w = 30 + r() * 30; fig(along(3, HALL.L - 3, w), HALL.walk, s * (HALL.HW - 6.5 - r() * 1.5), r() < 0.5 ? Math.PI / 2 : -Math.PI / 2, 'walk', { walk: w }); }
  // The first gallery: a few more, high up.
  for (let k = 0; k < 6; k++) { const s = k % 2 ? 1 : -1; fig(along(3, HALL.L - 3, 30), HALL.g1, s * (HALL.HW - 7), r() < 0.5 ? Math.PI / 2 : -Math.PI / 2, 'walk', { walk: 30 }); }
  return out;
}

/** Behind Hanne (the bakehouse): the oven's people — one standing at the wall, two crossing with the bread. */
export function bakehouseBehind(seed = 3) {
  const r = rng(seed), out = [];
  const fig = (x, z, yaw, motion, extra = {}) => out.push({ x: x + O.x, y: HALL.walk + O.y, z: z + O.z, yaw, motion, scale: 0.92 + r() * 0.15, t: r() * 7, dye: DYES[Math.floor(r() * DYES.length)], ...extra });
  fig(45.5, 59.5, -2.2, 'stand');
  fig(39, 52.4, Math.PI / 2, 'walk', { walk: 14 });
  fig(39, 59.7, -Math.PI / 2, 'walk', { walk: 14, t: 4 });
  return out;
}
