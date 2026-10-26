// The Bell-mace (docs/mace-design.md) and the great bell it hangs in at the Bell Ledge, built with the
// same builder and the same materials as the other weapons (render/weaponGeo.js): an oak haft bound
// in felt and iron, a cast-bronze bell for the head with its mouth ringed in bronze and a pale
// Shaper stone knob at the crown. The bell's lower flare, its lip and the disc inside its mouth are
// material BELL (7): bronze that glows from dull to white-gold with the height stored in it (the
// slot's tint.x; shaders/weapon.wgsl.js). Slot MACE is the weapon in hand; MACE_FIND the great bell
// with a mace hung in it for a clapper.

import { WMAT, SLOT, wobble } from './weaponBuilder.js';

/** A ring of tube radius r about the z axis at (cx, cy, z), radius R. */
function ringZ(B, cx, cy, z, R, r, n = 14) {
  const pts = [], rad = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push(cx + Math.cos(a) * R, cy + Math.sin(a) * R, z); rad.push(r); }
  B.tube(pts, rad, 5, false);
}

/**
 * A bell along a line in z (mouth toward +z), centred at (0, cy), crown at zc and mouth at zm, `s` the scale of a hand bell:
 * the upper shoulders are bronze, the flare and the lip are BELL material (they glow).
 */
function bell(B, cy, zc, zm, s) {
  const len = zm - zc;
  // The profile: radius against the share of the length from the crown.
  const prof = [[0, 0.2], [0.06, 0.42], [0.2, 0.55], [0.4, 0.6], [0.58, 0.7], [0.75, 0.85], [0.9, 1.0], [1, 1.04]];
  const at = (k) => zc + len * prof[k][0], rr = (k) => 0.17 * s * prof[k][1];
  const upper = [], upperR = [], lower = [], lowerR = [];
  for (let k = 0; k < prof.length; k++) {
    if (k <= 4) { upper.push(0, cy, at(k)); upperR.push(rr(k)); }
    if (k >= 4) { lower.push(0, cy, at(k)); lowerR.push(rr(k)); }
  }
  B.use(WMAT.BRONZE, 0.3).tube(upper, upperR, 12, true);
  B.use(WMAT.BELL, 0.45).tube(lower, lowerR, 12, false);
  B.use(WMAT.BELL, 0.62); ringZ(B, 0, cy, zm, 0.17 * s * 1.04, 0.012 * s);                         // the lip
  B.use(WMAT.BRONZE, 0.2); ringZ(B, 0, cy, zc + len * 0.4, 0.17 * s * 0.62, 0.008 * s);              // the waist band
  B.use(WMAT.BELL, 0.9).tube([0, cy, zm - len * 0.2, 0, cy, zm - len * 0.24], [0.15 * s, 0.15 * s], 12, true);   // inside the mouth, a disc that glows
  B.use(WMAT.IRON, 0.4).blob(0, cy - 0.02 * s, zm - len * 0.3, 0.022 * s, 0.026 * s, 0.022 * s, 6);       // the clapper
}

/** The mace: grip at the origin, haft to +1.14, the bell's axis along z, mouth forward. */
function mace(B) {
  const ys = [-0.45, -0.2, 0.1, 0.4, 0.7, 0.95, 1.1], pts = [], rad = [0.029, 0.031, 0.033, 0.034, 0.034, 0.033, 0.032], wb = wobble(ys.length, 0.004, 4.4);
  ys.forEach((y, i) => pts.push(wb[i], y, wb[(i + 3) % ys.length] * 0.6));
  B.use(WMAT.OAK, 0.55).tube(pts, rad, 10);
  B.use(WMAT.FELT, 0.3).column(0, 0, -0.38, 0.2, 0.0365, 0.0365, 10);
  B.use(WMAT.IRON, 0.45).column(0, 0, -0.5, -0.43, 0.038, 0.034, 10);
  for (const y of [0.5, 0.66]) B.use(WMAT.IRON, 0.3 + y).column(wb[3], 0, y, y + 0.03, 0.037, 0.037, 10);
  // The yoke: an iron socket where the haft meets the crown, two straps round the bell's shoulders.
  B.use(WMAT.IRON, 0.5).column(0, 0, 1.0, 1.2, 0.05, 0.04, 10);
  B.use(WMAT.IRON, 0.35).box(0, 1.14, -0.1, 0.045, 0.034, 0.075);
  B.use(WMAT.IRON, 0.7).box(0.1, 1.14, -0.02, 0.012, 0.062, 0.1); B.box(-0.1, 1.14, -0.02, 0.012, 0.062, 0.1);
  bell(B, 1.14, -0.16, 0.16, 1);
  // A pale Shaper stone knob at the crown, where the cord would be.
  B.use(WMAT.PALE, 0.31).blob(0, 1.14, -0.19, 0.04, 0.04, 0.035, 7);
}
export function buildMace(B) { B.slot = SLOT.MACE; mace(B); }

/** The great bell of the Bell Ledge, hung from the frame's beam (3.1 m up), mouth down, the mace hung in it for a clapper. Origin on the ledge. */
export function buildMaceFind(B) {
  B.slot = SLOT.MACE_FIND;
  // The great bell: axis vertical (a hand bell turned mouth-down: z becomes -y), crown at 2.95, mouth at 1.75. Built with the same profile, scaled.
  B.push(0, 3.0, 0, 0, Math.PI / 2, 0);
  bell(B, 0, 0.05, 1.25, 3.3);
  B.pop();
  // The cord: a bronze eye and a loop of cord to the beam.
  B.use(WMAT.BRONZE, 0.6).column(0, 0, 2.95, 3.1, 0.05, 0.035, 8);
  B.use(WMAT.FELT, 0.5).tube([0, 3.0, 0, 0.0, 3.12, 0], [0.03, 0.025], 6, true);
  // The mace hangs by its butt inside the bell, bell-head down below the mouth.
  B.push(0, 2.39, 0, 0, Math.PI, 0);
  mace(B);
  B.pop();
}
