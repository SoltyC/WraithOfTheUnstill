// The headland's salvaged things. All dimensions and wear come from the object's seed.

import { MAT, NS, cloth, rot } from './architecture.js';
import { stick } from './camp.js';
import { h2 } from './masonry.js';

const TAU = Math.PI * 2;
const EDGE_PATH = 2.5;
const PLOT_RADIUS = 10;
const SMALL_BOX = { ...NS, solid: false, plain: true };
const LOOSE = { solid: false, smooth: true };

/** The place of a peg, a wheel or a person in an object's own frame. */
function frame(x, z, yaw) {
  const turn = rot(yaw);
  return (u, y, f) => {
    const p = turn(u, y, f);
    return [x + p[0], y, z + p[2]];
  };
}

/** A loose board, stone or chest carried into camp. */
function block(B, at, yaw, u, y, f, hx, hy, hz, mat, seed, opt = {}) {
  const [x, , z] = at(u, y, f);
  B.box(x, z, y - hy, y + hy, hx, hz, yaw, mat, seed, { ...SMALL_BOX, ...opt });
}

/** A branch, spoke or rope between two points on the same object. */
function rod(B, at, a, b, r, mat, seed) {
  stick(B, at(...a), at(...b), r, r * 0.82, r >= 0.1 ? 5 : 3, mat, seed);
}

/** The places left for people on the ground, at a seat, or at the cliff. */
function peopleSlots(what, x, z, yaw, seed, opt = {}) {
  const seats = {
    tarpShelter: [[0, 1.6, Math.PI, 'crouch']],
    leanTo: [[0, 1.1, Math.PI, 'crouch']],
    loadedCart: [[1.45, -0.2, -Math.PI / 2, 'stand']],
    handcart: [[1.05, 0, -Math.PI / 2, 'stand']],
    barrow: [[0.85, 0, -Math.PI / 2, 'stand']],
    bundles: [[0, 1, Math.PI, 'crouch']],
    cookfire: [[-2.15, 0, Math.PI / 2, 'sit'], [2.15, 0, -Math.PI / 2, 'sit']],
    bedrolls: [[0, 0, 0, 'lie']],
    washLine: [[0, 0.9, Math.PI, 'stand']],
    pen: [[0, 2.05, Math.PI, 'stand']],
    lookout: [[-0.85, 0.45, 0, 'watch'], [0.7, 0.55, 0, 'watch'], [-0.8, -0.7 - h2(seed, 1) * 0.2, 0, 'sit']],
  };
  if (opt.cold || opt.abandoned) return [];
  const at = frame(x, z, yaw);
  const scale = opt.large ? 1.42 : 1;
  return seats[what].map(([u, f, a, pose]) => {
    const p = at(u * scale, 0, f * scale);
    return { x: p[0], z: p[2], yaw: yaw + a, pose };
  });
}

/** Record places for people without drawing their figures. */
function mark(B, what, x, z, yaw, seed, opt) {
  (B.slots ??= []).push(...peopleSlots(what, x, z, yaw, seed, opt));
}

/** A blanket laid on the ground or tied up for the road. */
function blanket(B, at, yaw, u, y, f, seed, rolled) {
  if (rolled) {
    const [x, , z] = at(u, y, f);
    B.piece(() => B.drum(x, z, y, y + 0.76, 0.14, 0.13, 7, MAT.CANVAS, seed,
      { ...LOOSE, lie: Math.PI / 2, yaw: yaw + Math.PI / 2 }));
    return;
  }
  const halfWidth = 0.36 + h2(seed, 3) * 0.11;
  const lump = 0.035 + h2(seed, 4) * 0.13;
  cloth(B, (a, b) => at(u + (2 * a - 1) * halfWidth,
    y + 0.035 + Math.sin(Math.PI * a) * Math.sin(Math.PI * b) * lump,
    f + (b - 0.5) * 1.85 + 0.035 * Math.sin(a * 9 + seed)), 4, 5, MAT.CANVAS, seed);
}

/** A cart cover pegged into a shelter, with a heavy sag and one unpegged corner. */
export function tarpShelter(B, x, z, yaw, seed, opt = {}) {
  const at = frame(x, z, yaw);
  const wide = 1.32 + h2(seed, 1) * 0.25;
  const deep = 1.05 + h2(seed, 2) * 0.25;
  const high = 1.65 + h2(seed, 3) * 0.48;
  const slope = h2(seed, 4) < 0.44;
  const ridge = slope ? 0.55 : 0;
  const sag = 0.13 + h2(seed, 5) * 0.14;
  for (const side of [-1, 1]) {
    const u = side * (wide - 0.1);
    rod(B, at, [u + 0.08, -0.17, ridge], [u, high + side * 0.06, ridge], 0.05, MAT.WOOD, seed + side);
  }
  rod(B, at, [-wide, high - 0.09, ridge], [wide, high + 0.05, ridge], 0.04, MAT.WOOD, seed + 2);

  for (const side of slope ? [-1] : [-1, 1]) {
    const hem = side < 0 ? -deep : deep * 0.55;
    const edgeY = side < 0 ? 0.12 : 0.83;
    cloth(B, (a, b) => {
      const u = (2 * a - 1) * (wide + 0.11 * b);
      const f = ridge * (1 - b) + hem * b + 0.085 * b * b * Math.sin(a * 12 + seed);
      const loose = Math.pow(a, 7) * Math.pow(b, 3) * (side < 0 ? 0.22 : 0.34);
      const y = (high + (a - 0.5) * 0.14) * (1 - b) + edgeY * b + loose
        - Math.sin(Math.PI * a) * Math.sin(Math.PI * b) * sag;
      return at(u, y, f);
    }, 4, 3, MAT.CANVAS, seed + side * 3);
    const peg = [-wide - 0.18, 0.07, hem + side * 0.28];
    rod(B, at, [-wide, edgeY, hem], peg, 0.013, MAT.WOOD, seed + 8 + side);
    rod(B, at, [peg[0] + 0.04, -0.13, peg[2]], peg, 0.028, MAT.WOOD, seed + 10 + side);
  }
  mark(B, 'tarpShelter', x, z, yaw, seed, opt);
}

/** A branch lean-to with a cloth laid over it and a blanket tucked underneath. */
export function leanTo(B, x, z, yaw, seed, opt = {}) {
  const at = frame(x, z, yaw);
  const wide = 1.05 + h2(seed, 1) * 0.35;
  const high = 1.35 + h2(seed, 2) * 0.37;
  const deep = 1.15 + h2(seed, 3) * 0.26;
  for (const side of [-1, 1]) {
    rod(B, at, [side * wide, -0.12, 0.5], [side * wide * 0.9, high, 0.3], 0.055, MAT.WOOD, seed + side);
  }
  rod(B, at, [-wide - 0.13, high, 0.32], [wide + 0.11, high - 0.07, 0.29], 0.055, MAT.WOOD, seed + 3);
  for (let i = 0; i < 4; i++) {
    const u = (i / 3 * 2 - 1) * wide;
    rod(B, at, [u, -0.08, -deep], [u + (h2(seed, i + 5) - 0.5) * 0.18, high, 0.33],
      0.036, MAT.WOOD, seed + i + 5);
  }
  cloth(B, (a, b) => at((2 * a - 1) * (wide + 0.08), high * (1 - b) + 0.09 * b
    - 0.11 * Math.sin(a * Math.PI) * Math.sin(b * Math.PI),
    0.36 * (1 - b) - deep * b + 0.09 * b * Math.sin(a * 11 + seed)), 4, 3, MAT.CANVAS, seed + 11);
  blanket(B, at, yaw, 0, 0, -0.35, seed + 12, false);
  mark(B, 'leanTo', x, z, yaw, seed, opt);
}

/** A sack with bowed cloth sides and a small pinched mouth. */
function sack(B, at, u, y, f, r, h, seed) {
  const bend = (h2(seed, 9) - 0.5) * r;
  cloth(B, (a, b) => {
    const theta = a * TAU;
    const belly = r * (0.12 * b + 0.91 * Math.sin(Math.PI * b) ** 0.7);
    const edge = belly * (1 + 0.12 * Math.sin(theta * 3 + seed));
    return at(u + b * bend + Math.cos(theta) * edge, y + h * b, f + Math.sin(theta) * edge * 0.85);
  }, 8, 5, MAT.CANVAS, seed);
  rod(B, at, [u + bend - 0.055, y + h - 0.025, f], [u + bend + 0.07, y + h, f], 0.018, MAT.WOOD, seed + 1);
}

/** A lidded plank chest with iron bands. */
function chest(B, at, yaw, u, y, f, seed) {
  const w = 0.34 + h2(seed, 1) * 0.12;
  B.piece(() => {
    block(B, at, yaw, u, y + 0.2, f, w, 0.2, 0.25, MAT.PLANK, seed);
    block(B, at, yaw, u, y + 0.42, f, w + 0.025, 0.04, 0.27, MAT.WOOD, seed + 1);
    for (const band of [-1, 1]) {
      block(B, at, yaw, u + band * w * 0.63, y + 0.456, f, 0.035, 0.012, 0.28, MAT.IRON, seed + band + 3);
    }
    block(B, at, yaw, u, y + 0.34, f + 0.255, 0.055, 0.068, 0.012, MAT.IRON, seed + 5);
  });
}

/** A pot or jar with a dark open mouth and a broken ring of worn metal. */
function vessel(B, at, u, y, f, r, h, mat, seed) {
  B.piece(() => {
    // A recessed floor and four rings leave the mouth visibly open.
    const rings = [[0.66, 0], [1, 0.82], [1.04, 1], [0.86, 1], [0.61, 0.19]];
    // One point on a ring, walking round the pot.
    const rim = ([rr, yy], i) => {
      const a = i * TAU / 8;
      return at(u + Math.cos(a) * r * rr, y + h * yy, f + Math.sin(a) * r * rr);
    };
    for (let k = 0; k < rings.length - 1; k++) {
      for (let i = 0; i < 8; i++) {
        B.quad(rim(rings[k], i), rim(rings[k], i + 1),
          rim(rings[k + 1], i + 1), rim(rings[k + 1], i), mat, seed + k);
      }
    }
    for (let i = 0; i < 8; i++) {
      B.tri(rim(rings[4], i), at(u, y + h * 0.19, f), rim(rings[4], i + 1), MAT.BASALT, seed);
    }
  });
}

/** A spoked wheel whose rim and hub stay with the cart until it breaks. */
function wheel(B, at, u, y, f, r, seed) {
  B.piece(() => {
    for (let i = 0; i < 10; i++) {
      const a = i * TAU / 10;
      const b = (i + 1) * TAU / 10;
      const p = [u, y + r * Math.cos(a), f + r * Math.sin(a)];
      const q = [u, y + r * Math.cos(b), f + r * Math.sin(b)];
      rod(B, at, p, q, r * 0.078, MAT.WOOD, seed + i);
      if (i % 2 === 0) rod(B, at, [u, y, f], p, r * 0.046, MAT.WOOD, seed + 10 + i);
    }
    rod(B, at, [u - 0.13, y, f], [u + 0.11, y, f], r * 0.21, MAT.WOOD, seed + 20);
  });
}

/** The board bed, axle, and dropped shafts of a cart parked in a hurry. */
function chassis(B, at, yaw, w, d, r, seed, oneWheel = false) {
  const deck = r + 0.25;
  B.piece(() => {
    block(B, at, yaw, 0, deck, 0, w, 0.071, d, MAT.PLANK, seed);
    for (const side of [-1, 1]) {
      block(B, at, yaw, side * (w - 0.045), deck + 0.17, 0, 0.045, 0.17, d, MAT.PLANK, seed + side);
      rod(B, at, [side * w * 0.77, deck - 0.04, 0.2], [side * w * 0.92, 0.085, d + 0.88],
        0.057, MAT.WOOD, seed + 3 + side);
    }
    block(B, at, yaw, 0, deck + 0.14, -d, w, 0.14, 0.046, MAT.PLANK, seed + 4);
    rod(B, at, [-w - 0.14, r, 0], [w + 0.14, r, 0], 0.07, MAT.WOOD, seed + 5);
  });
  if (oneWheel) {
    wheel(B, at, 0, r, -d - 0.15, r, seed + 6);
  } else {
    wheel(B, at, -w - 0.13, r, 0, r, seed + 6);
    wheel(B, at, w + 0.13, r, 0, r, seed + 29);
  }
  return deck + 0.07;
}

/** A chair packed seat down, with four legs sticking up through the ropes. */
function upsideDownChair(B, at, yaw, u, y, f, seed) {
  B.piece(() => {
    block(B, at, yaw, u, y + 0.35, f, 0.24, 0.033, 0.22, MAT.PLANK, seed, { tilt: 0.12 });
    for (const a of [-1, 1]) {
      for (const b of [-1, 1]) {
        rod(B, at, [u + a * 0.19, y + 0.35, f + b * 0.17],
          [u + a * 0.22, y + 0.76 + b * 0.035, f + b * 0.2], 0.028, MAT.WOOD, seed + a + 3 * b);
      }
    }
    block(B, at, yaw, u, y + 0.15, f - 0.2, 0.23, 0.09, 0.035, MAT.PLANK, seed + 8, { tilt: 0.12 });
  });
}

/** The farm's wagon, heaped above its sides with the household's things. */
export function loadedCart(B, x, z, yaw, seed, opt = {}) {
  const at = frame(x, z, yaw);
  const w = 0.71 + h2(seed, 1) * 0.13;
  const d = 1.10 + h2(seed, 2) * 0.17;
  const r = 0.58 + h2(seed, 3) * 0.12;
  const deck = chassis(B, at, yaw, w, d, r, seed);
  chest(B, at, yaw, -0.24, deck, -0.63, seed + 56);
  for (let i = 0; i < 5; i++) {
    const u = (i % 2 ? 0.35 : -0.27) + 0.12 * h2(seed, 10 + i);
    const f = -0.5 + i * 0.34 + 0.11 * h2(seed, 15 + i);
    const y = deck + (i === 4 ? 0.53 : 0);
    B.piece(() => sack(B, at, u, y, f, 0.33, 0.51 + 0.27 * h2(seed, 20 + i), seed + 61 + i));
  }
  blanket(B, at, yaw, 0.41, deck + 0.62, -0.35, seed + 68, true);
  upsideDownChair(B, at, yaw, -0.14 + h2(seed, 25) * 0.22, deck + 0.59, -0.44, seed + 72);
  for (const f of [-0.54, 0.4]) {
    rod(B, at, [w - 0.04, deck + 0.28, f], [w + 0.2, deck + 0.04, f], 0.022, MAT.IRON, seed + 82);
    vessel(B, at, w + 0.19, deck - 0.18, f, 0.12, 0.24, MAT.IRON, seed + 84 + Math.round(f * 10));
  }
  B.piece(() => {
    const a = [-w, deck + 0.17, 0.65];
    const b = [-0.42, deck + 0.91, 0.39];
    const c = [0.46, deck + 0.97, 0.35];
    const e = [w, deck + 0.17, 0];
    rod(B, at, a, b, 0.017, MAT.WOOD, seed + 90);
    rod(B, at, b, c, 0.017, MAT.WOOD, seed + 91);
    rod(B, at, c, e, 0.017, MAT.WOOD, seed + 92);
  });
  mark(B, 'loadedCart', x, z, yaw, seed, opt);
}

/** A small hand-drawn cart with a chest and a sack tucked in the bed. */
export function handcart(B, x, z, yaw, seed, opt = {}) {
  const at = frame(x, z, yaw);
  const deck = chassis(B, at, yaw, 0.51 + h2(seed, 1) * 0.09, 0.65, 0.32 + h2(seed, 2) * 0.1, seed);
  chest(B, at, yaw, 0, deck, -0.26, seed + 56);
  B.piece(() => sack(B, at, 0.12, deck, 0.37, 0.29, 0.49 + h2(seed, 3) * 0.18, seed + 59));
  mark(B, 'handcart', x, z, yaw, seed, opt);
}

/** A single-wheeled barrow put down with its bundle still in it. */
export function barrow(B, x, z, yaw, seed, opt = {}) {
  const at = frame(x, z, yaw);
  const deck = chassis(B, at, yaw, 0.37 + h2(seed, 1) * 0.06, 0.54, 0.25, seed, true);
  B.piece(() => sack(B, at, 0, deck, -0.07, 0.3, 0.42 + h2(seed, 2) * 0.15, seed + 35));
  mark(B, 'barrow', x, z, yaw, seed, opt);
}

/** What the family set down first: sacks and whatever could be carried under an arm. */
export function bundles(B, x, z, yaw, seed, opt = {}) {
  const at = frame(x, z, yaw);
  const count = opt.abandoned ? 1 : 5 + Math.floor(h2(seed, 2) * 4);
  for (let i = 0; i < count; i++) {
    const theta = i * TAU / count + 0.22 * h2(seed, i + 3);
    const radius = opt.abandoned ? 0 : 0.45 + 0.35 * h2(seed, i + 12);
    const u = Math.cos(theta) * radius;
    const f = Math.sin(theta) * radius;
    const k = seed + 19 * i;
    if (i === 2) {
      vessel(B, at, u, 0, f, 0.16, 0.3 + 0.11 * h2(k, 4), MAT.EARTH, k);
    } else if (i === 3) {
      vessel(B, at, u, 0, f, 0.22, 0.2, MAT.THATCH, k);
    } else if (i === 4 && h2(k, 6) > 0.5) {
      B.piece(() => {
        block(B, at, yaw, u, 0.16, f, 0.19, 0.07, 0.37, MAT.PLANK, k);
        for (const side of [-1, 1]) {
          block(B, at, yaw, u, 0.09, f + side * 0.21, 0.28, 0.055, 0.055, MAT.WOOD, k + side);
          block(B, at, yaw, u + side * 0.18, 0.24, f, 0.036, 0.08, 0.36, MAT.PLANK, k + 4 + side);
        }
      });
    } else if (i === 4) {
      chest(B, at, yaw, u, 0, f, k);
    } else {
      B.piece(() => sack(B, at, u, 0, f, 0.22 + 0.07 * h2(k, 2), 0.28 + 0.22 * h2(k, 3), k));
    }
  }
  mark(B, 'bundles', x, z, yaw, seed, opt);
}

/** A ring of stones, charred wood and, while tended, a pot hanging over the coals. */
export function cookfire(B, x, z, yaw, seed, opt = {}) {
  const at = frame(x, z, yaw);
  const scale = opt.large ? 1.42 : 1;
  for (let i = 0; i < 10; i++) {
    const a = (i + 0.42 * h2(seed, i)) / 10 * TAU;
    const r = (0.72 + h2(seed, i + 11) * 0.13) * scale;
    block(B, at, yaw + a, Math.sin(a) * r, 0.05, Math.cos(a) * r,
      0.15 + h2(seed, i + 22) * 0.1, 0.13, 0.14, MAT.STONE, seed + i);
  }
  B.piece(() => B.drum(x, z, -0.04, 0.065, 0.67 * scale, 0.66 * scale, 10,
    opt.cold ? MAT.BASALT : MAT.EMBER, seed + 36, { solid: false }));
  for (let i = 0; i < 4; i++) {
    const a = (i + h2(seed, i + 40) * 0.7) / 4 * TAU;
    rod(B, at, [Math.sin(a) * 0.48 * scale, 0.09, Math.cos(a) * 0.48 * scale],
      [-Math.sin(a) * 0.19, 0.19, -Math.cos(a) * 0.23], 0.07, MAT.BASALT, seed + 40 + i);
  }
  B.blockers.push({ site: B.site, kind: 'circle', x, z, r: 0.91 * scale, y0: -0.18, y1: 0.38 });
  if (opt.cold) return;

  const top = 1.6 + h2(seed, 44) * 0.31;
  const twist = h2(seed, 45) * TAU;
  B.struct(() => {
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3 + twist;
      rod(B, at, [Math.sin(a) * scale, -0.1, Math.cos(a) * scale],
        [-Math.sin(a) * 0.085, top + 0.11, -Math.cos(a) * 0.085], 0.042, MAT.WOOD, seed + 46 + i);
    }
    rod(B, at, [0, top, 0], [0, 0.96, 0], 0.016, MAT.IRON, seed + 50);
    rod(B, at, [-0.24, 0.68, 0], [0, 0.96, 0], 0.016, MAT.IRON, seed + 51);
    rod(B, at, [0, 0.96, 0], [0.24, 0.68, 0], 0.016, MAT.IRON, seed + 52);
    vessel(B, at, 0, 0.41, 0, 0.25 * scale, 0.29, MAT.IRON, seed + 53);
  });
  for (const side of [-1, 1]) {
    rod(B, at, [side * scale * 2.15, 0.17, -0.68], [side * scale * 2.15, 0.18, 0.68],
      0.21 + h2(seed, 55 + side) * 0.06, MAT.WOOD, seed + 55 + side);
  }
  B.light(x, 0.42, z, 9 * scale, 1, 0.5, 0.21, 1.6, 'fire');
  mark(B, 'cookfire', x, z, yaw, seed, opt);
}

/** Bedding on the ground, and one roll still packed for the road. */
export function bedrolls(B, x, z, yaw, seed, opt = {}) {
  const at = frame(x, z, yaw);
  blanket(B, at, yaw, 0, 0, 0, seed, false);
  blanket(B, at, yaw, -0.8, 0.01, 0.25, seed + 2, h2(seed, 1) > 0.35);
  blanket(B, at, yaw, 0.84, 0.02, -0.16, seed + 4, true);
  mark(B, 'bedrolls', x, z, yaw, seed, opt);
}

/** A low rope between crooked poles with a few cloths hung out to dry. */
export function washLine(B, x, z, yaw, seed, opt = {}) {
  const at = frame(x, z, yaw);
  const w = 1.45 + h2(seed, 1) * 0.28;
  const h = 1.45 + h2(seed, 2) * 0.23;
  for (const side of [-1, 1]) {
    rod(B, at, [side * w, -0.2, 0], [side * w * 0.97, h + 0.13, side * 0.07], 0.05, MAT.WOOD, seed + side);
  }
  B.piece(() => {
    rod(B, at, [-w, h, -0.07], [0, h - 0.15, 0], 0.015, MAT.WOOD, seed + 3);
    rod(B, at, [0, h - 0.15, 0], [w, h, 0.07], 0.015, MAT.WOOD, seed + 4);
  });
  for (let i = 0; i < 3; i++) {
    const u = i * w * 0.53 - w * 0.8;
    const len = 0.36 + 0.43 * h2(seed, i + 5);
    const width = 0.35 + 0.22 * h2(seed, i + 8);
    cloth(B, (a, b) => {
      const p = u + a * width;
      return at(p, h - 0.15 * (1 - Math.abs(p) / w) - len * b,
        p * 0.07 / w + b * (0.12 + 0.12 * Math.sin(a * 8 + seed + i)));
    }, 4, 3, MAT.CANVAS, seed + 12 + i);
  }
  mark(B, 'washLine', x, z, yaw, seed, opt);
}

/** An animal enclosure of low wattle hurdles with a gap beside the entrance. */
export function pen(B, x, z, yaw, seed, opt = {}) {
  const points = [[-1.6, 1.45], [-1.7, -1.3], [1.53, -1.38], [1.65, 1.4], [0.55, 1.43]];
  const at = frame(x, z, yaw);
  for (let k = 0; k < points.length - 1; k++) {
    const [u, f] = points[k];
    const [v, g] = points[k + 1];
    B.piece(() => {
      for (let j = 0; j < 3; j++) {
        const t = j / 2;
        const px = u + (v - u) * t;
        const pz = f + (g - f) * t;
        rod(B, at, [px, -0.17, pz], [px + 0.06, 0.82 + 0.17 * h2(seed, k * 3 + j), pz],
          0.045, MAT.WOOD, seed + k * 4 + j);
      }
      for (let j = 0; j < 3; j++) {
        const y = 0.23 + j * 0.22;
        const shift = (j % 2 ? 1 : -1) * 0.08;
        rod(B, at, [u, y, f], [(u + v) / 2 + shift, y + 0.035, (f + g) / 2 - shift],
          0.027, MAT.WOOD, seed + 20 + k + j);
        rod(B, at, [(u + v) / 2 + shift, y + 0.035, (f + g) / 2 - shift], [v, y - 0.035, g],
          0.027, MAT.WOOD, seed + 36 + k + j);
      }
    });
  }
  mark(B, 'pen', x, z, yaw, seed, opt);
}

/** A staff and a few stones where the refugees stop to watch the mountain. */
export function lookout(B, x, z, yaw, seed, opt = {}) {
  const at = frame(x, z, yaw);
  for (let i = 0; i < 4; i++) {
    const u = -0.8 + i * 0.52;
    const f = -0.7 - h2(seed, i + 1) * 0.2;
    block(B, at, yaw + h2(seed, i + 5), u, 0.06, f, 0.26, 0.21 + 0.09 * h2(seed, i + 9), 0.28,
      MAT.STONE, seed + i);
  }
  rod(B, at, [1.25, -0.24, 0.2], [1.16, 1.21 + h2(seed, 14) * 0.34, 0.12], 0.035, MAT.WOOD, seed + 14);
  mark(B, 'lookout', x, z, yaw, seed, opt);
}

const kit = {
  tarpShelter, leanTo, loadedCart, handcart, barrow, bundles, cookfire, bedrolls, washLine, pen, lookout,
};

/** Local angles are measured from north (the +z direction), like the figures' yaw. */
function heading([x, z]) {
  return Math.atan2(x, z);
}

/** Turn a shelter from the middle toward the lee, while keeping its entrance toward camp. */
function shelterYaw(inward, sea) {
  const lee = heading(sea) + Math.PI;
  const turn = Math.atan2(Math.sin(lee - inward), Math.cos(lee - inward));
  return inward + turn / 2;
}

/** A family's belongings in its clearing, leaving the lane outside the plot open. */
function plotItems(group, plot, seed, sea) {
  const at = frame(plot.x, plot.z, plot.yaw);
  const lee = shelterYaw(plot.yaw, sea);
  const items = [];
  // Put each piece in the family's frame, keeping its seed tied to this clearing.
  const place = (what, u, f, yaw, opt) => {
    const [x, , z] = at(u, 0, f);
    items.push({ what, x, z, yaw, seed: seed + 107 * items.length, opt });
  };
  place('cookfire', 0, 2.5, plot.yaw);
  place(group.kind === 'farm' ? 'loadedCart' : 'handcart', 4.7, 2.2, plot.yaw + 0.42);
  if (group.kind === 'town') place('barrow', 6.4, 4.1, plot.yaw - 0.18);
  place('bundles', 2.6, 5.3, plot.yaw - 0.22);
  place('bedrolls', -2.9, 4.9, plot.yaw + 0.17);
  place('washLine', -6.2, -0.65, plot.yaw + Math.PI / 2);
  if (group.kind === 'farm' && group.animals !== false) place('pen', -6.35, 3.6, plot.yaw);

  const count = Math.ceil(group.size / 4);
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / 4);
    const across = [0, -3.85, 3.85, 0.12, -3.85, 3.85, -6.35, 6.35][i];
    const depth = [-1.32, -2.1, -2.1, -5.6, -5.6, -5.6, -4.65, -4.65][i];
    const what = i === 1 || (row && h2(seed, 41 + i) < 0.44) ? 'leanTo' : 'tarpShelter';
    place(what, across, depth, lee);
  }
  return items;
}

/**
 * The camp for whoever got out. Groups have { id, size, kind } and may specify animals: false.
 * Mountain and sea are [dx, dz] directions. Pass a surveyed lookoutAt in camp-local metres if there is a cliff lip.
 */
export function campLayout(groups, {
  seed = 8517, mountain = [1630, 490], sea = [0, -1], radius = 45, lookoutAt,
} = {}) {
  const cold = groups.length === 0;
  const middle = [{ what: 'cookfire', x: 0, z: 0, yaw: 0, seed, opt: { cold, large: true } }];
  if (cold) {
    middle.push({ what: 'bundles', x: 2.7, z: 0.45, yaw: 0.4, seed: seed + 1, opt: { abandoned: true } });
    return { plots: [], middle, lookout: null, slots: [] };
  }

  const angle = heading(mountain);
  const step = TAU / groups.length;
  const ring = Math.min(31, radius - PLOT_RADIUS);
  const minRing = groups.length > 1 ? (PLOT_RADIUS * 2 + EDGE_PATH) / (2 * Math.sin(step / 2)) : 0;
  if (ring + 1e-9 < Math.max(16.5, minRing)) throw new RangeError('The headland is too small for these camp plots');

  const plots = groups.map((group, i) => {
    // The spoke toward the mountain runs between plots, leaving access to the lookout.
    const spoke = angle + (i + 0.5) * step;
    const x = Math.sin(spoke) * ring;
    const z = Math.cos(spoke) * ring;
    const plot = { id: group.id, x, z, yaw: spoke + Math.PI, r: PLOT_RADIUS };
    let plotSeed = seed;
    for (const c of group.id) plotSeed = (Math.imul(31, plotSeed) + c.charCodeAt(0)) >>> 0;
    return { ...plot, items: plotItems(group, plot, plotSeed, sea) };
  });

  const rim = radius - 2;
  // The headland can put the lookout on a surveyed cliff lip; an uncharted camp uses its mountainward rim.
  const [x, z] = lookoutAt ?? [Math.sin(angle) * rim, Math.cos(angle) * rim];
  if (Math.hypot(x, z) > rim + 1e-9
      || plots.some((plot) => Math.hypot(x - plot.x, z - plot.z) < plot.r + 2)
      || Math.hypot(x, z) < 6) {
    throw new RangeError('The lookout needs its own space at the edge of the camp');
  }
  const watch = { what: 'lookout', x, z, yaw: angle, seed: seed + 2 };
  const slots = [...middle, ...plots.flatMap((plot) => plot.items), watch]
    .flatMap(({ what, x, z, yaw, seed, opt }) => peopleSlots(what, x, z, yaw, seed, opt));
  return { plots, middle, lookout: watch, slots };
}

/** One built clearing, seated at its centre, with each object set down at its own ground height. */
function campSite(id, x, z, r, items, origin, heightAt, glow) {
  const at = [origin[0] + x, origin[1] + z];
  const slots = items.flatMap((item) => peopleSlots(
    item.what, item.x - x, item.z - z, item.yaw, item.seed, item.opt,
  ));
  return {
    id, at, facing: 0, footprint: r, seatAt: 'center', hidden: true, glow, slots,
    /** The belongings belonging to this clearing, in metres from its centre. */
    build(B) {
      const seat = heightAt?.(...at) ?? 0;
      for (const item of items) {
        const from = B.pos.length;
        const firstLight = B.lights.length;
        const firstBlocker = B.blockers.length;
        kit[item.what](B, item.x - x, item.z - z, item.yaw, item.seed, item.opt);
        if (!heightAt) continue;
        const lift = heightAt(origin[0] + item.x, origin[1] + item.z) - seat;
        for (let i = from + 1; i < B.pos.length; i += 3) B.pos[i] += lift;
        for (let i = firstLight; i < B.lights.length; i++) B.lights[i].y += lift;
        for (let i = firstBlocker; i < B.blockers.length; i++) {
          B.blockers[i].y0 += lift;
          B.blockers[i].y1 += lift;
        }
      }
    },
  };
}

/** The entire headland as architecture sites. The old emb-camp anchor is the middle. */
export function campSites(groups, { origin = [720, -2640], heightAt, ...options } = {}) {
  const layout = campLayout(groups, options);
  const middle = campSite('emb-camp', 0, 0, 4, layout.middle, origin, heightAt, groups.length ? 1 : 0);
  if (!layout.lookout) return [middle];

  const watch = layout.lookout;
  return [
    middle,
    ...layout.plots.map(({ id, x, z, r, items }) => campSite(
      'emb-camp-' + id, x, z, r, items, origin, heightAt, 1,
    )),
    campSite('emb-camp-lookout', watch.x, watch.z, 2, [watch], origin, heightAt, 0),
  ];
}
