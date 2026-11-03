// The jetty on the Sounding (storylines.md "The jetty"; release-cinematic.md shot 10): a rotted timber jetty running out from
// the east rim over the shallows, where Morrow sits with her lantern and her pile of brass. An architecture site (world/
// architecture.js Builder: the village's timber, weathered and lit like the rest), its deck walkable. Pure: tests/jetty.test.js.
//
// Local frame: u across, f out along the jetty (towards the pit's middle), y up; y = 0 is the deck's top.

import { MAT, NS, rot, lampPost } from './architecture.js';
import { stick } from './camp.js';
import { SOUNDING } from './sounding.js';

/** Where it is: from the rim (land end) out over the shallows, its deck this high over the water (m). */
export const JETTY = { len: 52, half: 1.2, deckOver: 1.55, water: 1.41, landR: 266 };
/** The land end (world x, z), its facing (towards the middle: −x), and the deck's height (world y). */
export const JETTY_AT = [SOUNDING.x + JETTY.landR, SOUNDING.z];
export const JETTY_FACING = -Math.PI / 2;
export const JETTY_DECK = JETTY.water + JETTY.deckOver;

const h = (a, b) => { let x = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1); x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d); return ((x ^ (x >>> 13)) >>> 0) / 4294967296; };

/** A point out along the jetty (f m from the land end, u across, y over the deck) in world coordinates. */
export function jettyPoint(f, u = 0, y = 0) {
  const p = rot(JETTY_FACING)(u, y, f);
  return [JETTY_AT[0] + p[0], JETTY_DECK + p[1], JETTY_AT[1] + p[2]];
}

/** The deck sags a little between the piles, more towards the far end, where the water has had it longest. */
export const sag = (f) => -0.04 * Math.abs(Math.sin(f / 3.2 * Math.PI)) - 0.12 * Math.max(0, (f - 30) / 22) ** 2;

export function jetty(b, facing) {
  const P = rot(facing), { len, half } = JETTY;
  // Piles in pairs every 3.2 m, out of the shelf, leaning a little, their heads standing proud of the deck at the edges.
  for (let k = 0, f = 1.2; f < len; k++, f += 3.2) for (const s of [-1, 1]) {
    const lean = (h(k, s) - 0.5) * 0.12, top = 0.25 + 0.3 * h(k, s + 7) + (k % 5 === 0 ? 0.6 : 0);
    const a = P(s * (half + 0.12), -6.5, f + lean), c = P(s * (half + 0.12) + lean * 0.3, top + sag(f), f);
    stick(b, a, c, 0.15, 0.13, 7, MAT.WOOD, 100 + k * 2 + (s > 0 ? 1 : 0));
    // A cross brace under every third pair.
    if (k % 3 === 1 && s > 0) stick(b, P(-half - 0.1, -0.35 + sag(f), f), P(half + 0.1, -1.6, f + 3.0), 0.06, 0.06, 5, MAT.WOOD, 300 + k);
  }
  // Two stringers under the planks, broken into lengths.
  for (const s of [-1, 1]) for (let f = 0; f < len; f += 6.4) {
    const f1 = Math.min(len, f + 6.4), a = P(s * 0.85, -0.22 + sag(f), f), c = P(s * 0.85, -0.22 + sag(f1), f1);
    stick(b, a, c, 0.11, 0.11, 6, MAT.WOOD, 400 + f);
  }
  // The planks: across, each its own width and wear; some gone, some broken short, the odd one sprung.
  let i = 0;
  for (let f = 0.2; f < len - 0.2; f += 0.3 + 0.04 * h(i, 3), i++) {
    const r = h(i, 1), end = f > len - 4;
    if (!end && r < 0.07) continue;                                              // gone
    const short = !end && r < 0.15 ? 0.35 + 0.4 * h(i, 2) : 1;                 // broken off short
    const side = h(i, 4) < 0.5 ? -1 : 1, w = half * short, cu = short < 1 ? side * (half - w) : 0;
    const y = sag(f) + (r > 0.97 ? 0.06 : 0), [x, , z] = P(cu, 0, f);
    b.box(x, z, y - 0.07, y, 0.13 + 0.02 * h(i, 5), w, facing + Math.PI / 2 + (h(i, 6) - 0.5) * 0.05, MAT.PLANK, 500 + i, { solid: false, ...NS });
  }
  // Walkable: the deck in lengths (over the gaps too: a foot finds the stringers).
  for (let f = 0; f < len; f += 4) {
    const [x, , z] = P(0, 0, f + 2);
    b.platforms.push({ site: b.site, x, z, hx: half, hz: 2, cos: Math.cos(facing), sin: Math.sin(facing), top: sag(f + 2) });
  }
  // The far end: a lantern post at the corner, and Morrow's pile of brass — old Lungs, bladders and fittings.
  const [lx, , lz] = P(-half + 0.1, 0, len - 0.6);
  lampPost(b, lx, lz, 2.4, facing + Math.PI / 2, 900, 0.8);
  for (let k = 0; k < 6; k++) {
    const [x, , z] = P(half - 0.45 - 0.25 * h(k, 9), 0, len - 1.4 - 0.45 * k + 0.2 * h(k, 8)), y0 = sag(len - 1.4) + (k > 3 ? 0.18 : 0);
    b.drum(x, z, y0, y0 + 0.16 + 0.08 * h(k, 7), 0.13 + 0.05 * h(k, 6), 0.09, 10, MAT.METAL, 950 + k, { solid: false, lie: k % 2 ? 1 : 0, yaw: facing + h(k, 5) * 3 });
  }
}

/** The jetty as an architecture site. */
export function soundingSites() {
  return [{ id: 'sounding-jetty', at: JETTY_AT, facing: JETTY_FACING, build: jetty, footprint: 3, seatY: JETTY_DECK, seatAt: 'center' },
    // Morrow's Lung across her lap, on her left hand; her knife in her right (systems/npcs.js places them at the hands).
    { id: 'prop-morrow', npc: 'morrow', kind: 'lap', build: big(lungProp), at: [0, 0], facing: 0, footprint: 0, prop: true },
    { id: 'prop-morrow-knife', npc: 'morrow', kind: 'blade', build: knifeProp, at: [0, 0], facing: 0, footprint: 0, prop: true },
    // The bladder, whole and then slumping as the air goes out of the cut (SLUMP stages), and the gash the knife opens along its
    // seam: in pieces from her end out as the blade passes, then whole on each slumped bladder. Which shows follows
    // the cut's progress (n.gash: systems/morrow.js, read by systems/npcs.js placeProp through show).
    ...Array.from({ length: SLUMP }, (_, s) => prop(`bladder-${s}`, big((b) => bladder(b, s)), (o) => slumpOf(o) === s)),
    ...Array.from({ length: GASH }, (_, k) => prop(`gash-${k}`, big((b) => gash(b, 0, k, k + 1)), (o) => o > GASH - 1 - k && slumpOf(o) === 0)),
    ...Array.from({ length: SLUMP - 1 }, (_, s) => prop(`gash-slumped-${s + 1}`, big((b) => gash(b, s + 1, 0, GASH)), (o) => slumpOf(o) === s + 1))];
}

/** The Lung is built at this scale (its own frame below is in units of it): a big thing, a diver's whole breath for a long dive,
 *  and it has to read past the sleeves of the arms that hold it. */
export const LUNG_K = 1.6;
/** Where the Lung's middle rides from the hand it is cradled on (systems/npcs.js 'lap'): back along her facing, to her right, up
 *  (m) — near over the hand, so its length is out in front of her, not against her. */
export const LAP = [0.04, 0.1, 0.06 * LUNG_K];
/** A builder that scales what it builds about the prop's origin by LUNG_K. */
const big = (build) => (b) => { const v0 = b.pos.length; build(b); for (let i = v0; i < b.pos.length; i++) b.pos[i] *= LUNG_K; };

/** One of Morrow's props on the Lung's frame (systems/npcs.js 'lap'), shown while show(cut progress) holds. */
const prop = (id, build, show) => ({ id: `prop-morrow-${id}`, npc: 'morrow', kind: 'lap', build, show, at: [0, 0], facing: 0, footprint: 0, prop: true });

/** The gash in this many pieces along the seam (a from SEAM[0] to SEAM[1], the Lung's own frame); the bladder slumps in SLUMP
 *  stages (the first whole). The cut's progress o: 0..GASH as the blade opens it, then GASH..GASH + SLUMP − 1 as it slumps. */
export const GASH = 6, SLUMP = 4;
export const SEAM = [0.06, -0.12];
export const slumpOf = (o) => (o < GASH + 1 ? 0 : Math.min(SLUMP - 1, Math.floor(o - GASH)));

/** The bladder's pieces: centre u, y, a, length, radius at the near end, at the far end; each stage of its slump scales the
 *  radii, its underside kept on the bottle. */
const BLADDER = [[0.008, 0.095, -0.04, 0.16, 0.05, 0.072], [-0.01, 0.1, 0.05, 0.12, 0.068, 0.055], [0, 0.088, 0.12, 0.05, 0.05, 0.022]];
const SCALE = [1, 0.8, 0.64, 0.5];
const piece = ([cu, cy, ca, len, r0, r1], s) => { const k = SCALE[s], rm = Math.max(r0, r1); return [cu, cy - rm * (1 - k), ca, len, r0 * k, r1 * k]; };
/** The bladder's surface over the seam at stage s: its height at (a, u) (the highest of its pieces there). */
export function bladderTop(a, u = 0, s = 0) {
  let top = -1;
  for (const p of BLADDER) {
    const [cu, cy, ca, len, r0, r1] = piece(p, s);
    const t = (a - (ca - len / 2)) / len; if (t < 0 || t > 1) continue;
    const r = r0 + (r1 - r0) * t, du = Math.min(Math.abs(u - cu), r);   // (past its side: the side's height)
    top = Math.max(top, cy + Math.sqrt(r * r - du * du));
  }
  return top;
}

/** The bladder's radius under its crown at a (stage s): the gash is never wider than the hide it is cut in. */
function crownR(a, s) {
  let best = 0, top = -1;
  for (const p of BLADDER) {
    const [, cy, ca, len, r0, r1] = piece(p, s), t = (a - (ca - len / 2)) / len; if (t < 0 || t > 1) continue;
    const r = r0 + (r1 - r0) * t; if (cy + r > top) { top = cy + r; best = r; }
  }
  return best;
}

const M = ([u, y, a]) => [-a, y, u];
/** A piece of the Lung centred at (a, y, u), len long, radius r0 at its near end (−a) to r1 at its far end (+a). (A lying drum
 *  rests at y0 with its axis at y0 + r0, its length y1 − y0; along +x at yaw π/2 — so the far end is drawn first, radii swapped.) */
const seg = (b, u, y, a, len, r0, r1, n, mat, seed) => b.drum(-a, u, y - r1, y - r1 + len, r1, r0, n, mat, seed, { solid: false, lie: 1, yaw: Math.PI / 2 });

/** The bladder at stage s: oiled hide lying along the top of the bottle, tied off at the valve end; whole, it shows the seam
 *  where it tore once and was mended (a thin dark line). */
function bladder(b, s) {
  BLADDER.forEach((p, i) => { const [u, y, a, len, r0, r1] = piece(p, s); seg(b, u, y, a, len, r0, r1, i < 2 ? 12 : 10, MAT.CANVAS, 4 + i); });
  if (s === 0) for (let k = 0; k < 8; k++) {
    const a0 = SEAM[0] + k * (SEAM[1] - SEAM[0]) / 8, a1 = a0 + (SEAM[1] - SEAM[0]) / 8;
    stick(b, M([0, bladderTop(a0) + 0.001, a0]), M([0, bladderTop(a1) + 0.001, a1]), 0.0025, 0.0025, 4, MAT.IRON, 10);
  }
}

/** The opened seam from piece k0 to k1 (of GASH) on the bladder at stage s, laid on its crown: a dark V cut into the hide (two
 *  faces going down to its floor), its lips rolled back either side; widest in the middle of the cut, gaping as it slumps. */
function gash(b, s, k0, k1) {
  const d = (SEAM[1] - SEAM[0]) / GASH, n = 3 * (k1 - k0), g = 1 + 0.35 * s;
  const wd = (a) => Math.min(0.6 * crownR(a, s), (0.005 + 0.022 * Math.sin(Math.PI * (a - SEAM[0]) / (SEAM[1] - SEAM[0]))) * g);
  const y = (a, u) => bladderTop(a, u, s) + 0.0015, deep = (w) => w * 1.6;
  for (let j = 0; j < n; j++) {
    const a0 = SEAM[0] + (k0 + j / 3) * d, a1 = SEAM[0] + (k0 + (j + 1) / 3) * d, w0 = wd(a0), w1 = wd(a1);
    const L0 = M([-w0, y(a0, -w0), a0]), L1 = M([-w1, y(a1, -w1), a1]), R0 = M([w0, y(a0, w0), a0]), R1 = M([w1, y(a1, w1), a1]);
    const F0 = M([0, y(a0, 0) - deep(w0), a0]), F1 = M([0, y(a1, 0) - deep(w1), a1]);
    for (const [p, q, r, t] of [[L0, L1, F1, F0], [F0, F1, R1, R0]]) { b.quad(p, q, r, t, MAT.IRON, 20); b.quad(t, r, q, p, MAT.IRON, 20); }
    for (const sg of [-1, 1]) stick(b, M([sg * w0 * 1.15, y(a0, sg * w0) + 0.002, a0]), M([sg * w1 * 1.15, y(a1, sg * w1) + 0.002, a1]), 0.0045, 0.0045, 5, MAT.CANVAS, 21);
  }
}

/** Where the knife's point is from her fist: ahead along her facing, below (m). */
export const KNIFE = [0.055, 0.29];

/** Morrow's knife, in her fist (the origin), its blade down and forward into the seam (the point KNIFE out and below). A prop is placed but never turned, so it
 *  is built for her facing on the jetty (−x: out along it); the blade's flat lies along x, the seam's line. */
export function knifeProp(b) {
  stick(b, [0.005, 0.06, 0], [0, -0.035, 0], 0.012, 0.014, 7, MAT.WOOD, 1);             // the grip (most of it in her fist)
  b.drum(0.005, 0, 0.06, 0.072, 0.017, 0.012, 8, MAT.METAL, 2, { solid: false });          // the pommel
  stick(b, [-0.024, -0.035, 0], [0.024, -0.035, 0], 0.006, 0.006, 5, MAT.METAL, 3);       // the guard
  // The blade: a flat leaf, both faces, its flat to her sides (it is drawn along the Lung, towards her: the edge at +x), the
  // point down and out. Long — a gutting knife — so it shows past the cuff of her sleeve.
  const base0 = [-0.018, -0.04, 0], base1 = [0.022, -0.04, 0], mid0 = [-0.05, -0.18, 0], mid1 = [-0.012, -0.18, 0], tip = [-KNIFE[0], -KNIFE[1], 0];
  b.quad(base0, base1, mid1, mid0, MAT.METAL, 4); b.quad(mid0, mid1, base1, base0, MAT.METAL, 4);
  b.tri(mid0, mid1, tip, MAT.METAL, 4); b.tri(tip, mid1, mid0, MAT.METAL, 4);
}

/** The Lung (storylines.md): a diver's breathing bladder of brass and oiled hide — a squat brass bottle, a hide bag lashed to it
 *  with straps, a short hose and mouthpiece; lengthwise across her lap (systems/npcs.js 'lap'). Built round its middle. */
export function lungProp(b) {
  // Built along a: lengthwise out from her lap (−x: the way she faces on the jetty; a prop is placed, never turned), u across (z).
  // (Its bladder and the gash are props of their own: bladder(), gash().)
  // The bottle: brass, its ends domed, a band at each shoulder, a short neck and the valve's wheel at the far end.
  seg(b, 0, 0, 0, 0.24, 0.075, 0.075, 16, MAT.METAL, 1);
  seg(b, 0, 0, 0.14, 0.04, 0.075, 0.05, 16, MAT.METAL, 1);
  seg(b, 0, 0, 0.17, 0.02, 0.05, 0.022, 12, MAT.METAL, 1);
  seg(b, 0, 0, 0.19, 0.03, 0.02, 0.02, 10, MAT.METAL, 1);
  seg(b, 0, 0, 0.205, 0.008, 0.042, 0.042, 12, MAT.IRON, 2);
  seg(b, 0, 0, -0.14, 0.04, 0.05, 0.075, 16, MAT.METAL, 1);
  seg(b, 0, 0, -0.165, 0.012, 0.03, 0.05, 12, MAT.METAL, 1);
  for (const a of [-0.105, 0.105]) seg(b, 0, 0, a, 0.014, 0.079, 0.079, 16, MAT.METAL, 3);
  // Two straps round bottle and bladder both.
  for (const a of [-0.06, 0.07]) {
    const pts = [[0.08, -0.01], [0.082, 0.07], [0.055, 0.15], [0, 0.18], [-0.055, 0.15], [-0.082, 0.07], [-0.08, -0.01], [-0.05, -0.065], [0, -0.08], [0.05, -0.065], [0.08, -0.01]];
    for (let k = 0; k + 1 < pts.length; k++) stick(b, M([pts[k][0], pts[k][1], a]), M([pts[k + 1][0], pts[k + 1][1], a]), 0.007, 0.007, 4, MAT.IRON, 7);
  }
  // The hose: out of the bladder's tied end, a loop down and back, to the mouthpiece.
  const hose = [[0, 0.09, 0.145], [0.02, 0.1, 0.19], [0.05, 0.07, 0.23], [0.075, 0.02, 0.235], [0.085, -0.03, 0.2], [0.09, -0.05, 0.15]];
  for (let k = 0; k + 1 < hose.length; k++) stick(b, M(hose[k]), M(hose[k + 1]), 0.012, 0.012, 6, MAT.CANVAS, 8);
  b.drum(-0.15, 0.09, -0.075, -0.035, 0.016, 0.022, 10, MAT.METAL, 9, { solid: false });
}
