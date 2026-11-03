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
    // Morrow's Lung, in both hands (systems/npcs.js places a held prop between them).
    { id: 'prop-morrow', npc: 'morrow', kind: 'held', build: lungProp, at: [0, 0], facing: 0, footprint: 0, prop: true }];
}

/** The Lung (storylines.md): a diver's breathing bladder of brass and oiled hide — a squat brass bottle, a hide bag lashed to it
 *  with straps, a short hose and mouthpiece; held in both hands (systems/npcs.js puts it between them). Built round its middle. */
export function lungProp(b) {
  b.drum(0, 0, -0.11, 0.11, 0.1, 0.085, 12, MAT.METAL, 1, { solid: false, lie: 1, yaw: 0 });              // the brass bottle, lying across
  b.drum(0, 0.05, -0.09, 0.07, 0.12, 0.1, 10, MAT.CANVAS, 2, { solid: false, lie: 1, yaw: 0.0 });          // the hide bag over it
  for (const x of [-0.07, 0.07]) b.drum(x, 0, -0.125, 0.125, 0.125, 0.125, 12, MAT.IRON, 3, { solid: false, lie: 1, yaw: Math.PI / 2 }); // straps
  stick(b, [0.1, 0.02, 0], [0.2, 0.08, 0.06], 0.018, 0.016, 5, MAT.CANVAS, 4);                          // the hose
  b.drum(0.2, 0.06, 0.08, 0.11, 0.024, 0.02, 8, MAT.METAL, 5, { solid: false });                          // the mouthpiece
}
