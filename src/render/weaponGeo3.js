// The Bell-mace (docs/mace-design.md) and the great bell it hangs in at the Bell Ledge, built with the
// same builder as the other weapons (render/weaponGeo.js): an oak haft bound in felt and iron, and for
// the head a real cast bell, crown at the tip, mouth facing back down the haft, the haft's iron stalk
// ending in a clapper inside it, held by a yoke of two straps. Old dark bronze (material 8) with a
// worn brighter lip; the flare, the lip and the disc inside the mouth are material BELL (7), which
// glows from dull to white-gold with the height stored in it (the slot's tint.x; shaders/weapon.wgsl.js:
// the glow comes from inside the mouth). Slot MACE is the weapon in hand; MACE_FIND the great bell with a
// mace hung in it for a clapper (the mace head hangs below its mouth, the haft visible).

import { WMAT, SLOT, wobble } from './weaponBuilder.js';

/** A ring (tube radius r) about the z axis at (0, cy, z), radius R. */
function ringZ(B, cy, z, R, r, n = 16) {
  const pts = [], rad = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push(Math.cos(a) * R, cy + Math.sin(a) * R, z); rad.push(r); }
  B.tube(pts, rad, 5, false);
}

/**
 * A cast bell with its axis along local z, crown at z = zc, mouth at z = zm (> zc), at height cy: a narrow crown with a
 * cap, shoulders, a waist, a flared mouth with a worn lip ring and a glowing inside. `r` is the mouth's radius.
 */
function bell(B, cy, zc, zm, r) {
  const len = zm - zc;
  // Share of the length from the crown, and the radius as a share of the mouth's.
  const prof = [[0, 0.16], [0.05, 0.3], [0.16, 0.5], [0.34, 0.58], [0.5, 0.64], [0.66, 0.74], [0.82, 0.88], [0.94, 0.99], [1, 1.04]];
  const upper = [], upperR = [], lower = [], lowerR = [];
  for (let k = 0; k < prof.length; k++) {
    const z = zc + len * prof[k][0], rr = r * prof[k][1];
    if (k <= 5) { upper.push(0, cy, z); upperR.push(rr); }
    if (k >= 5) { lower.push(0, cy, z); lowerR.push(rr); }
  }
  B.use(WMAT.OLD, 0.3).tube(upper, upperR, 14, true);                                           // crown, shoulders, waist
  B.use(WMAT.BELL, 0.45).tube(lower, lowerR, 14, false);                                         // the flare: this is where the glow shows
  B.use(WMAT.OLD, 0.55, 1); ringZ(B, cy, zm, r * 1.04, r * 0.07);                                // the lip, worn bright
  B.use(WMAT.OLD, 0.2); ringZ(B, cy, zc + len * 0.34, r * 0.6, r * 0.04); ringZ(B, cy, zc + len * 0.62, r * 0.72, r * 0.035);   // the waist bands
  B.use(WMAT.OLD, 0.8).blob(0, cy, zc - r * 0.05, r * 0.14, r * 0.14, r * 0.12, 6);                // the cap on the crown
  B.use(WMAT.BELL, 0.9).tube([0, cy, zm - len * 0.3, 0, cy, zm - len * 0.33], [r * 0.7, r * 0.7], 14, true);   // inside the mouth: a disc that glows
}

/** The mace: grip at the origin, haft to 1.0, the bell's crown at 1.4, its mouth at 1.12 facing back down the haft. */
function mace(B) {
  const ys = [-0.45, -0.2, 0.1, 0.4, 0.7, 0.9, 1.04], pts = [], rad = [0.029, 0.031, 0.033, 0.034, 0.034, 0.033, 0.03], wb = wobble(ys.length, 0.004, 4.4);
  ys.forEach((y, i) => pts.push(wb[i], y, wb[(i + 3) % ys.length] * 0.6));
  B.use(WMAT.OAK, 0.55).tube(pts, rad, 10);
  B.use(WMAT.FELT, 0.3).column(0, 0, -0.38, 0.2, 0.0365, 0.0365, 10);
  B.use(WMAT.IRON, 0.45).column(0, 0, -0.5, -0.43, 0.038, 0.034, 10);
  for (const y of [0.5, 0.66]) B.use(WMAT.IRON, 0.3 + y).column(wb[3], 0, y, y + 0.03, 0.037, 0.037, 10);
  // The socket, the stalk that runs up into the bell and ends in a clapper, and the yoke: two straps round the bell to its crown cap.
  B.use(WMAT.IRON, 0.5).column(0, 0, 0.98, 1.1, 0.05, 0.04, 10);
  B.use(WMAT.IRON, 0.4).column(0, 0, 1.08, 1.34, 0.012, 0.01, 6);
  B.blob(0, 1.22, 0, 0.032, 0.036, 0.032, 6);
  for (const sx of [-1, 1]) B.use(WMAT.IRON, 0.7).tube([sx * 0.045, 1.08, 0, sx * 0.25, 1.14, 0, sx * 0.255, 1.3, 0, sx * 0.12, 1.46, 0, 0, 1.52, 0], [0.013, 0.012, 0.012, 0.011, 0.011], 5, true);
  // The bell: built along z, turned so its mouth (z+) faces down the haft (y−).
  B.push(0, 1.12, 0, 0, Math.PI / 2, 0);
  bell(B, 0, -0.34, 0, 0.22);
  B.pop();
}
export function buildMace(B) { B.slot = SLOT.MACE; mace(B); }

/** The great bell of the Bell Ledge, 1.8 m tall and 2.2 m across the mouth, hung from the lintel (4.2 m above the ledge), the mace hung in it for a clapper. Origin on the ledge. */
export function buildMaceFind(B) {
  B.slot = SLOT.MACE_FIND;
  B.push(0, 4.1, 0, 0, Math.PI / 2, 0);
  bell(B, 0, 0, 1.8, 1.05);
  B.pop();
  B.use(WMAT.OLD, 0.6).column(0, 0, 4.0, 4.3, 0.09, 0.06, 8);                                    // the crown's eye
  B.use(WMAT.FELT, 0.5).tube([0, 4.1, 0, 0, 4.3, 0], [0.05, 0.04], 6, true);
  // The mace by its butt in the great bell, its own bell hanging below the mouth (2.3 m up), the haft showing between.
  B.push(0, 2.7, 0, 0, Math.PI, 0);
  mace(B);
  B.pop();
}
