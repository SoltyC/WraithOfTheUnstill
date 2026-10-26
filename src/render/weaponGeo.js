// The weapons' geometry (docs §11.2), built once on the CPU in the Shapers' visual language — carved
// stone, oak, iron, wrapped cord — the way world/architecture.js builds its sites: primitives into
// one mesh, each vertex tagged with (slot, material, seed, edge) in `info`. A slot is one placed
// object: the shader moves each slot's vertices by its own transform every frame (render/
// weaponView.js), so a weapon is drawn where the hands are and a find lies where it was left.
//
// Local frames: a held weapon's origin is the grip and its shaft runs along +y; blades curve
// toward +z. Materials: 0 dressed stone, 1 oak, 2 iron, 3 wrapped felt, 4 bronze, 5 pale stone.

import { Builder, wobble, WMAT, SLOT } from './weaponBuilder.js';
import { buildGlaive, buildFlail, buildFinds } from './weaponGeo2.js';
import { buildMace, buildMaceFind } from './weaponGeo3.js';

export { WMAT, SLOT };

/** The pilgrim's staff: grip at the origin, butt at −0.7, the crook's bead at +1.3. */
function staff(B) {
  B.slot = SLOT.STAFF;
  // Shaft: a hand-hewn oak pole, a touch thicker at the grip, a gentle bow.
  const ys = [-0.7, -0.4, -0.1, 0.2, 0.5, 0.8, 1.05, 1.18], pts = [], rad = [0.02, 0.022, 0.025, 0.024, 0.023, 0.022, 0.021, 0.019], wb = wobble(ys.length, 0.004, 1.3);
  ys.forEach((y, i) => pts.push(wb[i], y, wb[(i + 3) % ys.length] * 0.7));
  B.use(WMAT.OAK, 0.3).tube(pts, rad, 8);
  // The crook: the pole curls forward over itself.
  const cp = [], cr = [];
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * 2.5; cp.push(0.0, 1.18 + 0.11 * Math.sin(a), 0.11 - 0.11 * Math.cos(a)); cr.push(0.019 - 0.004 * (i / 8)); }
  B.tube(cp, cr, 8);
  // A Shaper stone bead at the end of the crook, with a bronze collar.
  const ex = cp[cp.length - 3], ey = cp[cp.length - 2], ez = cp[cp.length - 1];
  B.use(WMAT.STONE, 0.62).blob(ex, ey - 0.03, ez + 0.01, 0.036, 0.04, 0.036, 8);
  B.use(WMAT.BRONZE, 0.2).column(0, 0, 1.12, 1.15, 0.03, 0.03, 8);
  // Iron ferrule, felt bindings at the grip and halfway, and a tassel of cord from the crook.
  B.use(WMAT.IRON, 0.4).column(0, 0, -0.76, -0.62, 0.026, 0.024, 8);
  B.use(WMAT.FELT, 0.5);
  B.column(wb[2], wb[5] * 0.7, -0.14, 0.12, 0.0275, 0.0275, 8); B.column(wb[4], wb[7] * 0.7, 0.5, 0.58, 0.0255, 0.0255, 8);
  for (const dx of [-0.012, 0.012, 0]) B.tube([dx, 1.12, 0.0, dx * 2, 0.98, -0.01, dx * 3, 0.86, -0.012], [0.006, 0.0055, 0.004], 5, true);
}

/** One sickle, grip at the origin (in `slot`): oak handle, iron collar, a hooked blade curving toward +z. */
function sickle(B, slot) {
  B.slot = slot;
  B.use(WMAT.OAK, 0.2 + slot * 0.1).tube([0, -0.13, 0, 0, 0.05, 0.002, 0, 0.2, 0], [0.019, 0.017, 0.016], 8);
  B.use(WMAT.FELT, 0.4).column(0, 0, -0.1, 0.06, 0.0205, 0.0205, 8);
  B.use(WMAT.IRON, 0.2).column(0, 0, -0.145, -0.12, 0.024, 0.02, 8);         // pommel cap
  B.use(WMAT.IRON, 0.3).column(0, 0, 0.19, 0.235, 0.021, 0.016, 8);           // collar
  B.use(WMAT.IRON, 0.6, 1).blade(0.22, 0.3, 2.0, 0.06, 0.006);
}

/** The Shaper maul: grip at the origin, haft to +1.08, a dressed-stone head along z, iron-capped. */
function maul(B, slot = SLOT.MAUL) {
  B.slot = slot;
  const ys = [-0.45, -0.2, 0.1, 0.4, 0.7, 1.0, 1.14], pts = [], rad = [0.03, 0.032, 0.035, 0.036, 0.036, 0.034, 0.033], wb = wobble(ys.length, 0.004, 2.1);
  ys.forEach((y, i) => pts.push(wb[i], y, wb[(i + 2) % ys.length] * 0.6));
  B.use(WMAT.OAK, 0.7).tube(pts, rad, 10);
  B.use(WMAT.FELT, 0.2).column(0, 0, -0.38, 0.2, 0.0385, 0.0385, 10);
  B.use(WMAT.IRON, 0.5).column(0, 0, -0.5, -0.43, 0.04, 0.036, 10);
  for (const y of [0.45, 0.62]) B.use(WMAT.IRON, 0.3 + y).column(wb[3], 0, y, y + 0.03, 0.039, 0.039, 10);
  // The head: an eight-sided dressed-stone drum lying along z, iron end caps, a bronze band, a collar around the haft.
  B.push(0, 1.14, 0, 0, Math.PI / 2, Math.PI / 8);
  B.use(WMAT.STONE, 0.37).column(0, 0, -0.2, 0.2, 0.14, 0.14, 8);
  B.use(WMAT.IRON, 0.55).column(0, 0, -0.27, -0.2, 0.125, 0.15, 8); B.column(0, 0, 0.2, 0.27, 0.15, 0.125, 8);
  B.use(WMAT.BRONZE, 0.3).column(0, 0, -0.045, 0.045, 0.148, 0.148, 8);
  B.pop();
  B.use(WMAT.IRON, 0.5).column(0, 0, 1.02, 1.26, 0.055, 0.04, 10);
}

/** The reaper's stand: a weathered oak post and crossbar on a stone footing, a pair of sickles hung on it. */
function stand(B) {
  B.slot = SLOT.STAND;
  B.use(WMAT.STONE, 0.15).box(0, 0.09, 0, 0.3, 0.09, 0.26);
  B.use(WMAT.OAK, 0.5).push(0, 0, 0, 0.1, 0.03, -0.02).box(0, 0.8, 0, 0.065, 0.75, 0.06).pop();
  B.use(WMAT.OAK, 0.8).box(0, 1.34, 0, 0.5, 0.05, 0.045);
  B.use(WMAT.IRON, 0.3).box(0, 1.34, 0.05, 0.07, 0.07, 0.01);
  B.use(WMAT.FELT, 0.3).tube([0.3, 1.31, 0.05, 0.3, 1.2, 0.07], [0.012, 0.01], 5, true); B.tube([-0.3, 1.31, 0.05, -0.3, 1.2, 0.07], [0.012, 0.01], 5, true);
  // Two sickles hung by their handles from cords, blades down and swung a little.
  for (const [sx, r] of [[0.3, 0.12], [-0.3, -0.08]]) {
    B.push(sx, 1.2, 0.08, Math.PI, 0, Math.PI + r);
    const keep = B.slot; B.slot = SLOT.STAND;
    B.use(WMAT.OAK, 0.3).tube([0, -0.13, 0, 0, 0.05, 0.002, 0, 0.2, 0], [0.019, 0.017, 0.016], 8);
    B.use(WMAT.IRON, 0.3).column(0, 0, 0.19, 0.235, 0.021, 0.016, 8);
    B.use(WMAT.IRON, 0.6, 1).blade(0.22, 0.3, 2.0, 0.06, 0.006);
    B.slot = keep; B.pop();
  }
  // A bundle of cut straw at the foot.
  B.use(WMAT.FELT, 0.85);
  for (let i = 0; i < 6; i++) B.tube([0.36 + 0.02 * i, 0.02, 0.1 - 0.04 * i, 0.42 + 0.03 * i, 0.3, 0.06 - 0.03 * i], [0.012, 0.004], 4, true);
}

/** The cold forge: a broken anvil-stone and its fallen half, a cracked trough, the maul leaning on it. */
function forge(B) {
  B.slot = SLOT.FORGE;
  B.use(WMAT.STONE, 0.22).box(0, 0.22, 0, 0.42, 0.22, 0.3);
  B.use(WMAT.PALE, 0.31).push(0, 0, 0, 0.12).box(0, 0.55, 0, 0.55, 0.11, 0.3).pop();            // the anvil's face
  B.use(WMAT.PALE, 0.41).push(0.95, 0, 0.1, -0.5, 0, 0.12).box(0, 0.16, 0, 0.3, 0.16, 0.24).pop();   // the broken horn
  B.use(WMAT.STONE, 0.5).push(-1.1, 0, 0.5, 0.4).box(0, 0.12, 0, 0.5, 0.12, 0.2).pop();              // a trough stone
  B.use(WMAT.IRON, 0.35).push(0.2, 0.66, -0.1, 0.5).box(0, 0.015, 0, 0.14, 0.015, 0.06).pop();       // a lump of old iron
  // The maul, leaning against the anvil's flank, head up.
  B.push(-0.52, 0.0, 0.34, -0.35, -0.18, 0.2);
  const keep = B.slot; maul(B, SLOT.FORGE); B.slot = keep; B.pop();
}

/** Build the whole mesh data once. */
export function buildWeaponMesh() {
  const B = new Builder();
  staff(B);
  sickle(B, SLOT.SICKLE_R); sickle(B, SLOT.SICKLE_L);
  maul(B, SLOT.MAUL);
  stand(B); forge(B);
  buildGlaive(B); buildFlail(B); buildFinds(B);
  buildMace(B); buildMaceFind(B);
  return B.data();
}
