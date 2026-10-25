// The nooks (data/nooks.json, docs/gameplay-design.md §6): small finds on the natural routes, each built
// from the same stone, timber, felt and bronze as the places round it. Sites like the side-quest ones
// (world/sideSites.js): { id, at, facing, build, footprint, seatAt }, built into the one architecture mesh
// at load. The frost ones stand in snow (a snow cap on top, but no banked drift: a nook is small and a drift would bury it); the
// meadow ones pass NS (no snow). `facing` is where the nook looks: a view's target, a marker's goal, the way across a stream.

import { MAT, NS } from './architecture.js';
import { stick } from './camp.js';

const TAU = Math.PI * 2;
/** Site-local (right, forward) under the nook's yaw. */
const frame = (yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return (u, f) => [u * c + f * s, -u * s + f * c]; };

/** A pile of stones: `n` layers of fewer, smaller, turned blocks, a carved glyph slab standing on top when `slab` (its yaw). */
function stack(b, R, o, n, w, slab, seed) {
  let id = seed;
  for (let k = 0; k < n; k++) {
    const per = Math.max(1, 5 - k - (k > 2 ? 1 : 0)), r = 0.62 * w * (1 - k * 0.24), y0 = -0.3 + k * 0.3, a0 = R() * TAU;
    for (let j = 0; j < per; j++) {
      const a = a0 + j / per * TAU + (R() - 0.5) * 0.5, hx = w * (0.44 - k * 0.05) * (0.8 + R() * 0.4);
      b.box(per === 1 ? (R() - 0.5) * 0.1 : Math.cos(a) * r, per === 1 ? (R() - 0.5) * 0.1 : Math.sin(a) * r, y0, y0 + 0.28 + R() * 0.1, hx, hx * (0.7 + R() * 0.3), R() * TAU, MAT.STONE, id++, { solid: k < 1, tilt: (R() - 0.5) * 0.12, ...o });
    }
  }
  if (slab !== undefined) b.box(0, 0, -0.3 + n * 0.3, -0.3 + n * 0.3 + 0.18, 0.3, 0.26, slab, MAT.STONE, id, { solid: false, tilt: (R() - 0.5) * 0.08, ...o });   // the capstone
}

const SHAPES = {
  // A cairn: a stack of turned stones, a carved slab leaning on it (the line the nook reads), a few stones round its foot.
  cairn(b, f, R, o) {
    stack(b, R, o, 4 + (R() * 2 | 0), 1.0, f, 10);
    // The carved line: a glyph slab leaning against the pile on its front side.
    { const P = frame(f), [sx, sz] = P(0, 0.95); b.box(sx, sz, -0.35, 1.25, 0.32, 0.09, f, MAT.GLYPH, 11, { carve: 1, solid: false, tilt: -0.22, ...o }); }
    for (let k = 0; k < 3; k++) { const a = R() * TAU; b.box(Math.cos(a) * 1.3, Math.sin(a) * 1.3, -0.3, 0.1 + R() * 0.12, 0.26, 0.2, a, MAT.STONE, 30 + k, { solid: false, ...o }); } },
  // A seat on a rise: a low stone bench, its back to the view's far side, a glyph slab behind it.
  seat(b, f, R, o) {
    const P = frame(f), [bx, bz] = P(0, -0.55), [sx, sz] = P(1.3, -0.4), [tx, tz] = P(-1.3, -0.4);
    b.box(0, 0, -0.3, 0.46, 1.15, 0.4, f, MAT.STONE, 1, { solid: false, ...o });
    b.box(bx, bz, -0.2, 1.1, 0.95, 0.13, f, MAT.GLYPH, 2, { carve: 1, solid: false, ...o });
    b.box(sx, sz, -0.3, 0.32, 0.3, 0.26, f + 0.5, MAT.STONE, 3, { solid: false, ...o });
    b.box(tx, tz, -0.3, 0.24, 0.26, 0.22, f - 0.4, MAT.STONE, 4, { solid: false, ...o });
  },
  // An offering at a spring: three stones, a raised altar slab, a bowl of ice-melt, a red thread, a heel of bread.
  offering(b, f, R, o) {
    const P = frame(f);
    for (let k = 0; k < 3; k++) { const [x, z] = P((k - 1) * 0.95, -0.95); b.box(x, z, -0.4, 1.0 + R() * 0.6, 0.24, 0.17, f + (k - 1) * 0.25, MAT.STONE, 1 + k, { solid: false, tilt: (R() - 0.5) * 0.1, ...o }); }
    b.box(0, 0, -0.4, 0.62, 0.75, 0.5, f, MAT.STONE, 5, { solid: false, ...o, cap: false });
    b.drum(0.2, 0.05, 0.62, 0.78, 0.2, 0.16, 10, MAT.ICE, 6, { solid: false });
    b.drum(0.2, 0.05, 0.76, 0.8, 0.14, 0.14, 10, MAT.ICE, 7, { solid: false });
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, a2 = (k + 1) / 8 * TAU; stick(b, [-0.3 + Math.cos(a) * 0.14, 0.64, 0.1 + Math.sin(a) * 0.1], [-0.3 + Math.cos(a2) * 0.14, 0.64, 0.1 + Math.sin(a2) * 0.1], 0.014, 0.014, 4, MAT.CANVAS, 8 + k); }
    b.box(-0.5, -0.15, 0.62, 0.74, 0.12, 0.08, 0.6, MAT.WOOD, 20, { solid: false, drift: false, cap: false });
  },
  // A Shaper marker: a tall glyph slab, a ring of low stones, a pointer slab laid along the line to what it shows.
  marker(b, f, R, o) {
    const P = frame(f);
    b.box(0, 0, -0.5, 2.3, 0.42, 0.2, f + Math.PI / 2, MAT.GLYPH, 1, { carve: 2, tilt: (R() - 0.5) * 0.05, ...o });
    b.box(0, 0, 2.3, 2.45, 0.34, 0.16, f + Math.PI / 2, MAT.STONE, 2, { solid: false, ...o });
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + 0.3; b.box(Math.cos(a) * 1.3, Math.sin(a) * 1.3, -0.3, 0.2 + R() * 0.2, 0.3, 0.22, a, MAT.STONE, 5 + k, { solid: false, ...o }); }
    const [px, pz] = P(0, 1.9);
    b.box(px, pz, -0.25, 0.12, 0.22, 0.95, f, MAT.GLYPH, 12, { carve: 3, solid: false, ...o, cap: false });
  },
  // A hidden find: a heap of fieldstones with a corner of bronze (or a rotted purse) showing, and a stick to mark it.
  glint(b, f, R, o) {
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.5; b.box(Math.cos(a) * 0.55, Math.sin(a) * 0.55, -0.3, 0.1 + R() * 0.12, 0.3, 0.24, a, MAT.STONE, 1 + k, { solid: false, ...o }); }
    b.box(0.05, 0, -0.1, 0.36, 0.24, 0.07, 0.5, MAT.METAL, 6, { solid: false, tilt: 0.5, drift: false, cap: false });
    b.box(-0.18, 0.12, -0.1, 0.3, 0.16, 0.06, -0.8, MAT.METAL, 7, { solid: false, roll: 0.6, drift: false, cap: false });
    b.box(0.3, -0.15, -0.1, 0.22, 0.12, 0.06, 1.9, MAT.METAL, 8, { solid: false, tilt: -0.4, drift: false, cap: false });
    stick(b, [1.0, -0.2, 0.3], [1.05, 1.1, 0.35], 0.035, 0.03, 5, MAT.WOOD, 9);
    b.box(1.03, 0.33, 0.9, 1.0, 0.12, 0.01, 0.2, MAT.CANVAS, 10, { solid: false, drift: false, cap: false });
  },
  // A sled left standing: bed, two runners, lashings, and the driver's things dropped along the trail.
  sled(b, f, R, o) {
    const P = frame(f);
    b.box(0, 0, 0.18, 0.28, 0.5, 1.15, f, MAT.WOOD, 1, { solid: false, ...o });
    for (const s of [-1, 1]) { const [x, z] = P(s * 0.46, 0); b.box(x, z, 0, 0.18, 0.05, 1.35, f, MAT.WOOD, 2 + s, { solid: false, ...o }); b.box(x, z, 0.28, 0.36, 0.04, 1.1, f, MAT.WOOD, 5 + s, { solid: false, ...o }); }
    for (const t of [-0.6, 0, 0.6]) { const [x, z] = P(0, t); b.box(x, z, 0.28, 0.33, 0.55, 0.035, f, MAT.CANVAS, 9, { solid: false, ...o }); }
    b.box(...P(0.15, -0.2), 0.33, 0.62, 0.34, 0.3, f + 0.3, MAT.CANVAS, 11, { solid: false, ...o });
    // Dropped along the trail: a mitten, a lantern, another mitten.
    for (const [u, t, w] of [[-0.8, 2.3, 0], [0.4, 3.9, 1], [-0.3, 5.6, 0]]) {
      const [x, z] = P(u, t);
      if (w === 0) b.box(x, z, 0, 0.05, 0.08, 0.11, R() * 6, MAT.CANVAS, 12, { solid: false, ...o });
      else { for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) stick(b, [x + sx * 0.06, 0, z + sz * 0.06], [x + sx * 0.06, 0.26, z + sz * 0.06], 0.007, 0.007, 4, MAT.METAL, 13); b.box(x, z, 0.04, 0.24, 0.045, 0.045, 0, MAT.EMBER, 14, { solid: false, drift: false, cap: false }); }
    }
  },
  // A lantern on a flat stone, burnt low, its glass turned south.
  lantern(b, f, R, o) {
    b.box(0, 0, -0.4, 0.6, 0.55, 0.45, f, MAT.STONE, 1, { solid: false, ...o, cap: false });
    b.box(0.7, 0.3, -0.3, 0.25, 0.28, 0.22, f + 0.7, MAT.STONE, 2, { solid: false, ...o });
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) stick(b, [sx * 0.11, 0.64, sz * 0.11], [sx * 0.11, 1.1, sz * 0.11], 0.012, 0.012, 4, MAT.METAL, 3);
    b.box(0, 0, 0.6, 0.64, 0.14, 0.14, 0, MAT.METAL, 4, { solid: false, drift: false, cap: false });
    b.box(0, 0, 0.66, 1.06, 0.1, 0.1, 0, MAT.EMBER, 5, { solid: false, drift: false, cap: false });
    b.drum(0, 0, 1.1, 1.2, 0.15, 0.03, 8, MAT.METAL, 6, { solid: false });
    stick(b, [0, 1.2, 0], [0, 1.34, 0], 0.012, 0.012, 4, MAT.METAL, 7);
    b.light(0, 0.9, 0, 6, 1, 0.6, 0.28, 1.0, 'candle');
  },
  // A cart on its side, black to the axle: the bed, one wheel up, the other lying off, spilled sacks.
  cart(b, f, R, o) {
    const P = frame(f);
    b.box(0, 0, 0.05, 1.05, 1.05, 0.12, f, MAT.WOOD, 1, { solid: false, roll: 0.08, ...o });
    b.box(...P(0, 0.5), 0.05, 0.75, 1.05, 0.08, f, MAT.WOOD, 2, { solid: false, ...o });
    b.box(...P(0, -0.5), 0.05, 0.75, 1.05, 0.08, f, MAT.WOOD, 3, { solid: false, ...o });
    const wheel = (cx, cy, cz, r, seed) => {
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU, a2 = (k + 1) / 12 * TAU; stick(b, [cx, cy + Math.cos(a) * r, cz + Math.sin(a) * r], [cx, cy + Math.cos(a2) * r, cz + Math.sin(a2) * r], 0.05, 0.05, 5, MAT.IRON, seed + k); }
      for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI; stick(b, [cx, cy - Math.cos(a) * r, cz - Math.sin(a) * r], [cx, cy + Math.cos(a) * r, cz + Math.sin(a) * r], 0.03, 0.03, 4, MAT.WOOD, seed + 20 + k); }
    };
    { const [wx, wz] = P(-1.1, 0.1); wheel(wx, 0.85, wz, 0.75, 10); }
    stick(b, [-1.4, 0.85, 0.1], [1.3, 0.85, 0.1], 0.055, 0.055, 6, MAT.IRON, 40);
    for (let k = 0; k < 3; k++) { const [x, z] = P(1.6 + R() * 0.9, (R() - 0.5) * 1.6); b.box(x, z, 0, 0.3, 0.32, 0.22, R() * 6, MAT.CANVAS, 50 + k, { solid: false, ...o }); }
  },
  // A fallen pine laid across a stream, flat on top, with a groove-worn rail: walkable.
  log(b, f, R, o) {
    const P = frame(f);
    b.box(0, 0, 0.3, 0.9, 0.34, 3.4, f, MAT.WOOD, 1, { platform: true, solid: false, ...o });
    b.box(...P(0, -3.35), -0.3, 0.7, 0.9, 0.6, f, MAT.STONE, 2, { solid: false, ...o });
    b.box(...P(0, 3.35), -0.3, 0.7, 0.9, 0.6, f, MAT.STONE, 3, { solid: false, ...o });
    for (let k = 0; k < 4; k++) { const [x, z] = P(0.42, -2.5 + k * 1.7); stick(b, [x, 0.9, z], [x, 1.55, z], 0.035, 0.03, 5, MAT.WOOD, 5 + k); }
    { const [ax, az] = P(0.42, -2.5), [cx, cz] = P(0.42, 2.3); stick(b, [ax, 1.55, az], [cx, 1.55, cz], 0.03, 0.03, 5, MAT.WOOD, 9); }
  },
  // A mason's tools on a flat stone, left to rust: mallet, chisel, plumb line, a half-dressed block.
  tools(b, f, R, o) {
    const P = frame(f);
    b.box(0, 0, -0.3, 0.42, 0.8, 0.55, f, MAT.STONE, 1, { solid: false, ...o });
    b.box(...P(1.6, 0.3), -0.3, 0.62, 0.55, 0.45, f + 0.3, MAT.STONE, 2, { solid: false, ...o });
    stick(b, [-0.35, 0.45, 0.05], [0.05, 0.47, -0.15], 0.025, 0.022, 6, MAT.WOOD, 3);
    b.box(-0.4, 0.06, 0.42, 0.56, 0.07, 0.06, 0.4, MAT.WOOD, 4, { solid: false, drift: false, cap: false });
    stick(b, [0.2, 0.43, 0.25], [0.5, 0.46, 0.0], 0.012, 0.007, 5, MAT.METAL, 5);
    stick(b, [-0.5, 0.43, 0.3], [-0.5, 0.2, 0.3], 0.004, 0.004, 3, MAT.CANVAS, 6);     // the plumb line and its bob
    b.drum(-0.5, 0.3, 0.1, 0.22, 0.015, 0.03, 6, MAT.METAL, 7, { solid: false });
  },
  // A shepherd's fire gone out: a ring of black stones, ash, charred logs, a crook leaned, a bundle of wool.
  fire(b, f, R, o) {
    for (let k = 0; k < 9; k++) { const a = k / 9 * TAU; b.box(Math.cos(a) * 0.95, Math.sin(a) * 0.95, -0.3, 0.3 + R() * 0.2, 0.3, 0.24, a, MAT.IRON, 1 + k, { solid: false, ...NS }); }
    b.drum(0, 0, -0.1, 0.06, 0.8, 0.76, 10, MAT.IRON, 12, { solid: false });
    for (let k = 0; k < 3; k++) b.drum(Math.cos(k * 2.1) * 0.2, Math.sin(k * 2.1) * 0.2, 0.06, 1.1, 0.1, 0.1, 6, MAT.IRON, 13 + k, { lie: 1, yaw: f + k * 1.2, solid: false });
    stick(b, [1.6, -0.2, 0.3], [1.2, 1.8, 0.1], 0.035, 0.03, 6, MAT.WOOD, 20);
    stick(b, [1.2, 1.8, 0.1], [0.95, 1.95, 0.0], 0.03, 0.024, 6, MAT.WOOD, 21);
    b.box(-1.6, 0.4, -0.1, 0.45, 0.45, 0.34, 0.7, MAT.CANVAS, 22, { solid: false, ...NS });
  },
  // A boat far from water: a flat hull with a pointed bow, tarred, lashed down with ropes to stakes.
  boat(b, f, R, o) {
    const P = frame(f);
    b.box(0, 0, 0.05, 0.4, 0.6, 1.5, f, MAT.WOOD, 1, { solid: false, tilt: 0.02, ...NS });
    for (const s of [-1, 1]) {
      const [x, z] = P(s * 0.66, -0.2), [bx, bz] = P(s * 0.4, 1.9);
      b.box(x, z, 0.1, 0.82, 0.07, 1.5, f, MAT.WOOD, 2 + s, { solid: false, roll: -s * 0.12, ...NS });
      b.box(bx, bz, 0.1, 0.86, 0.07, 0.85, f - s * 0.5, MAT.WOOD, 4 + s, { solid: false, roll: -s * 0.12, ...NS });
    }
    b.box(...P(0, 2.5), 0.1, 0.95, 0.07, 0.1, f, MAT.WOOD, 7, { solid: false, ...NS });
    b.box(...P(0, -1.75), 0.1, 0.84, 0.6, 0.07, f, MAT.WOOD, 6, { solid: false, ...NS });
    b.box(0, 0, 0.42, 0.5, 0.5, 0.04, f, MAT.WOOD, 8, { solid: false, ...NS });
    for (const [t, s] of [[-0.9, -1], [-0.9, 1], [0.9, -1], [0.9, 1]]) {
      const [x, z] = P(s * 1.6, t), [hx, hz] = P(s * 0.7, t);
      stick(b, [hx, 0.8, hz], [x, 0.1, z], 0.014, 0.014, 4, MAT.CANVAS, 9);
      stick(b, [x, -0.3, z], [x + 0.03, 0.5, z], 0.04, 0.035, 5, MAT.WOOD, 10);
    }
  },
  // Wind-plates: tin plates on cords from a crossbar, a post, hanging still.
  chimes(b, f, R, o) {
    stick(b, [0, -0.4, 0], [0.02, 2.5, 0], 0.07, 0.055, 6, MAT.WOOD, 1);
    stick(b, [-1.0, 2.35, 0], [1.1, 2.4, 0], 0.04, 0.035, 6, MAT.WOOD, 2);
    stick(b, [0.5, -0.2, 0.4], [0.05, 1.6, 0.0], 0.035, 0.03, 5, MAT.WOOD, 3);
    for (let k = 0; k < 5; k++) {
      const x = -0.85 + k * 0.45, len = 0.55 + R() * 0.5;
      stick(b, [x, 2.38, 0], [x, 2.38 - len, 0], 0.006, 0.006, 3, MAT.CANVAS, 4 + k);
      b.box(x, 0, 2.38 - len - 0.32, 2.38 - len, 0.13, 0.012, 0, MAT.METAL, 9 + k, { solid: false, drift: false, cap: false });
    }
  },
};

const SEAT = { cart: 1.6, log: 3.4, boat: 1.8 };

/** The sites of every nook placed on the baked world (data/nooks.json, written by tools/world/placeNooks.mjs). */
export function nookSites(nooks) {
  const out = [];
  for (const n of nooks) {
    const build = SHAPES[n.shape];
    if (!build || !n.pos) continue;
    const o = n.biome === 'meadow' ? NS : { drift: false };
    out.push({ id: n.id, at: n.pos, facing: n.facing ?? 0, build: (b, f, R) => build(b, f, R, o), footprint: SEAT[n.shape] ?? 1.4, seatAt: n.shape === 'log' ? 'top' : 'center' });
  }
  return out;
}
