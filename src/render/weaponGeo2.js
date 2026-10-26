// The glaive and the lantern flail (docs §11.2), and the two finds they lie in: built with the same
// builder and the same materials as the other weapons (render/weaponGeo.js), so they read as relics
// of the same hands. The glaive is one rigid piece (slot GLAIVE); the flail is four: the haft
// (FLAIL), two stretched chain segments (CHAIN1, CHAIN2) and the lantern head (HEAD) with its flame
// (FLAME) — systems/weaponView.js simulates the head on its chain and stretches the segments between
// the haft and the head, so the weight really swings.

import { WMAT, SLOT, wobble } from './weaponBuilder.js';

/** A closed ring (a torus) of radius R and tube radius r, lying in the plane square to `axis` (0 x, 1 y, 2 z) at (cx, cy, cz). */
function ring(B, cx, cy, cz, R, r, axis, n = 10) {
  const pts = [], rad = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, c = Math.cos(a) * R, s = Math.sin(a) * R;
    if (axis === 0) pts.push(cx, cy + c, cz + s); else if (axis === 1) pts.push(cx + c, cy, cz + s); else pts.push(cx + c, cy + s, cz);
    rad.push(r);
  }
  B.tube(pts, rad, 5, false);
}

/** The glaive's whole body (grip at the origin, butt spike at −0.62, the blade standing from 1.62 to 2.26), in the slot already set. */
function glaiveBody(B) {
  const ys = [-0.55, -0.3, -0.05, 0.25, 0.55, 0.85, 1.15, 1.45, 1.62], pts = [], rad = [0.024, 0.026, 0.028, 0.027, 0.026, 0.025, 0.024, 0.023, 0.022], wb = wobble(ys.length, 0.004, 3.7);
  ys.forEach((y, i) => pts.push(wb[i], y, wb[(i + 4) % ys.length] * 0.6));
  B.use(WMAT.OAK, 0.45).tube(pts, rad, 8);
  // Felt wrapped at the grip and again where the off hand rides; an iron butt-cap and a short spike.
  B.use(WMAT.FELT, 0.35).column(0, 0, -0.22, 0.12, 0.0295, 0.0295, 8); B.column(wb[5] * 0.5, 0, 0.7, 0.9, 0.0285, 0.0285, 8);
  B.use(WMAT.IRON, 0.3).column(0, 0, -0.6, -0.5, 0.027, 0.026, 8);
  B.use(WMAT.IRON, 0.5).tube([0, -0.5, 0, 0, -0.62, 0], [0.012, 0.002], 6, true);
  // The socket: a bronze collar, iron langets down the shaft, and a tassel of cord below the blade.
  B.use(WMAT.BRONZE, 0.25).column(0, 0, 1.56, 1.66, 0.034, 0.03, 8);
  B.use(WMAT.IRON, 0.4).column(0, 0, 1.66, 1.74, 0.03, 0.024, 8);
  B.use(WMAT.IRON, 0.35).box(0.03, 1.3, 0, 0.004, 0.22, 0.012); B.box(-0.03, 1.3, 0, 0.004, 0.22, 0.012);
  B.use(WMAT.FELT, 0.7);
  for (const dx of [-0.014, 0, 0.014]) B.tube([dx, 1.54, 0.02, dx * 2.2, 1.4, 0.05, dx * 3, 1.27, 0.06], [0.008, 0.007, 0.005], 5, true);
  // The blade: a long leaf, edges on both sides, a central ridge; a notch of bronze inlay at its root.
  B.use(WMAT.IRON, 0.62, 0).leaf(1.7, 0.6, 0.068, 0.012, 12);
  B.use(WMAT.BRONZE, 0.5).column(0, 0, 1.69, 1.72, 0.032, 0.03, 8);
}
export function buildGlaive(B) { B.slot = SLOT.GLAIVE; glaiveBody(B); }

/** Chain of unit length along +y from the origin: alternating flat links, scaled to a segment by the view. */
function chain(B, links = 6) {
  const step = 1 / links;
  for (let i = 0; i < links; i++) {
    const y = (i + 0.5) * step, odd = i % 2 === 0;
    B.use(WMAT.IRON, 0.3 + 0.07 * i);
    if (odd) B.box(0, y, 0, 0.013, step * 0.78, 0.0045); else B.box(0, y, 0, 0.0045, step * 0.78, 0.013);
    if (odd) B.box(0, y, 0, 0.011, step * 0.5, 0.012);
  }
}

/** The lantern head: origin at the ring the chain hangs from, +y running outward. A bronze-capped iron cage with a bronze weight and spikes. */
function lanternHead(B) {
  B.use(WMAT.IRON, 0.4); ring(B, 0, 0, 0, 0.03, 0.007, 2);
  B.use(WMAT.BRONZE, 0.25).column(0, 0, 0.02, 0.11, 0.075, 0.03, 8);          // cap
  B.use(WMAT.BRONZE, 0.4).column(0, 0, 0.11, 0.135, 0.09, 0.09, 8);
  B.use(WMAT.IRON, 0.55);
  for (let i = 0; i < 8; i++) {                                                 // the cage's bars
    const a = (i / 8) * Math.PI * 2 + 0.2, c = Math.cos(a), s = Math.sin(a);
    B.tube([c * 0.082, 0.135, s * 0.082, c * 0.1, 0.24, s * 0.1, c * 0.082, 0.345, s * 0.082], [0.0075, 0.0075, 0.0075], 5, false);
  }
  B.use(WMAT.IRON, 0.7); ring(B, 0, 0.24, 0, 0.1, 0.0065, 1, 12);
  B.use(WMAT.BRONZE, 0.55).column(0, 0, 0.345, 0.42, 0.09, 0.075, 8);          // the weight
  B.use(WMAT.IRON, 0.3);
  B.tube([0, 0.42, 0, 0, 0.56, 0], [0.026, 0.002], 6, true);                    // the centre spike
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.8, c = Math.cos(a), s = Math.sin(a);
    B.tube([c * 0.05, 0.4, s * 0.05, c * 0.11, 0.48, s * 0.11], [0.016, 0.002], 6, true);
  }
}

/** The flame (origin at its foot, standing up +y, 0.2 tall): a teardrop of emissive material, driven by the view. */
function flame(B) {
  B.use(WMAT.FLAME, 0.5).blob(0, 0.09, 0, 0.05, 0.1, 0.05, 8);
  B.blob(0, 0.2, 0, 0.018, 0.07, 0.018, 6);
}

/** The haft of the flail: grip at the origin, up to the swivel eye at +0.8. */
function flailHaft(B) {
  const ys = [-0.3, -0.12, 0.1, 0.3, 0.5, 0.7, 0.78], pts = [], rad = [0.029, 0.03, 0.03, 0.029, 0.028, 0.027, 0.026], wb = wobble(ys.length, 0.004, 5.3);
  ys.forEach((y, i) => pts.push(wb[i], y, wb[(i + 2) % ys.length] * 0.5));
  B.use(WMAT.OAK, 0.8).tube(pts, rad, 8);
  B.use(WMAT.FELT, 0.2).column(0, 0, -0.24, 0.1, 0.0335, 0.0335, 8);
  B.use(WMAT.IRON, 0.5).column(0, 0, -0.36, -0.28, 0.036, 0.03, 8);                // pommel cap
  B.use(WMAT.BRONZE, 0.3).column(0, 0, 0.62, 0.68, 0.036, 0.036, 8);               // band
  B.use(WMAT.IRON, 0.35).column(0, 0, 0.76, 0.84, 0.04, 0.03, 8);
  ring(B, 0, 0.87, 0, 0.026, 0.0065, 2);
}

export function buildFlail(B) {
  B.slot = SLOT.FLAIL; flailHaft(B);
  B.slot = SLOT.CHAIN1; chain(B);
  B.slot = SLOT.CHAIN2; chain(B);
  B.slot = SLOT.HEAD; lanternHead(B);
  B.slot = SLOT.FLAME; flame(B);
}

/** The two finds: the glaive planted in a cairn, the flail hung from an iron post with its flame lit. */
export function buildFinds(B) {
  // The glaive: a ring of fallen stones at the foot of the planted shaft, a pennon of felt knotted below the blade.
  B.slot = SLOT.GLAIVE_FIND;
  B.use(WMAT.STONE, 0.12).push(0.05, 0, -0.02, 0.3).box(0, 0.11, 0, 0.34, 0.11, 0.3).pop();
  B.use(WMAT.PALE, 0.44).push(0.28, 0, 0.18, -0.6).box(0, 0.09, 0, 0.2, 0.09, 0.15).pop();
  B.use(WMAT.STONE, 0.7).push(-0.3, 0, -0.1, 0.9).box(0, 0.07, 0, 0.18, 0.07, 0.13).pop();
  B.use(WMAT.PALE, 0.2).push(-0.05, 0, 0.3, 0.2).box(0, 0.06, 0, 0.14, 0.06, 0.1).pop();
  B.push(0, 0.78, 0, 0, 0.09, -0.05);
  glaiveBody(B);
  B.pop();
  B.use(WMAT.FELT, 0.9);
  B.tube([0.0, 2.1, 0.05, 0.1, 2.0, 0.1, 0.22, 1.9, 0.16, 0.3, 1.86, 0.2], [0.014, 0.012, 0.009, 0.005], 5, true);
  // The flail: an iron post and crossbar on a stone footing, the haft laid across it, the chain and the lit lantern hanging.
  B.slot = SLOT.FLAIL_FIND;
  B.use(WMAT.PALE, 0.33).box(0, 0.09, 0, 0.32, 0.09, 0.28);
  B.use(WMAT.IRON, 0.25).tube([0, 0.0, 0, 0, 0.8, 0.01, 0, 1.55, 0], [0.04, 0.032, 0.026], 8);
  B.use(WMAT.BRONZE, 0.25).column(0, 0, 1.52, 1.6, 0.04, 0.03, 8);
  B.use(WMAT.IRON, 0.45).box(0.32, 1.5, 0, 0.42, 0.025, 0.025);
  B.push(0.28, 1.58, 0, 0, 0, -Math.PI / 2 + 0.04);
  flailHaft(B);
  B.pop();
  // The chain hangs from the haft's end (the swivel eye) in two pieces; the lantern below it, its flame lit.
  const hx = 0.28 + 0.87 * Math.cos(0.04), hy = 1.58 + 0.87 * Math.sin(0.04) - 0.0;
  B.push(hx, hy - 0.04, 0, 0, 0, Math.PI); B.scaleY(0.42); chain(B); B.pop();
  B.push(hx, hy - 0.46, 0, 0, 0, Math.PI); B.scaleY(0.42); chain(B); B.pop();
  B.push(hx, hy - 0.88, 0, 0, 0, Math.PI); lanternHead(B); B.push(0, 0.14, 0); flame(B); B.pop(); B.pop();
}
