// The built things of the meadow side quests and shrines (data/quests/meadow-side.json `places`):
// the six meadow shrines, the Fen Lamp, the Ring of Nine with its fallen stone (and that stone
// raised), the three Listening Stones and the six glide rings. Sites like the frost chapter's
// (world/architecture.js): { id, at, facing, build, footprint, seatAt }, built into the one
// architecture mesh at load. Everything here is plain geometry with no snow (NO_SNOW).

import { MAT, NS, meadowShrine, echoStone } from './architecture.js';
import { stick } from './camp.js';

const TAU = Math.PI * 2;

/** The Ring of Nine (nine stones on a circle of `r` m; the one at angle `gap` fell outward and lies along it). */
export const RING = { r: 9, count: 9, gap: 0.6, stoneH: 5.2, len: 5.4 };
/** Where the Ring of Nine's parts are: the empty socket, the lying stone's centre and heading, and the three marks along it (head, middle, foot). */
export function stoneRingGeometry(c) {
  const dx = Math.sin(RING.gap), dz = Math.cos(RING.gap);
  const sx = c[0] + dx * RING.r, sz = c[1] + dz * RING.r, half = RING.len / 2;
  const marks = [0.88, 0.5, 0.12].map((t) => [sx + dx * RING.len * t, sz + dz * RING.len * t]);
  return { socket: [sx, sz], fallen: [sx + dx * half, sz + dz * half], facing: Math.atan2(dx, dz), marks };
}

function ringStones(b, facing, R) {
  for (let k = 1; k < RING.count; k++) {
    const a = RING.gap + (k / RING.count) * TAU, x = Math.sin(a) * RING.r, z = Math.cos(a) * RING.r, h = 3.7 + R() * 1.1;
    b.box(x, z, -0.7, h, 0.55 + R() * 0.12, 0.4, a + Math.PI / 2, k % 3 === 0 ? MAT.GLYPH : MAT.STONE, 10 + k, { carve: k % 3 === 0 ? 1 : 0, tilt: (R() - 0.5) * 0.05, ...NS });
  }
  // The empty socket: a low collar of stone where the ninth stood.
  const sx = Math.sin(RING.gap) * RING.r, sz = Math.cos(RING.gap) * RING.r;
  b.drum(sx, sz, -0.7, 0.18, 1.05, 0.95, 12, MAT.STONE, 40, { solid: false });
}
function fallenStone(b, facing, R) {
  b.box(0, 0, -0.1, 0.95, 0.52, RING.len / 2, facing, MAT.GLYPH, 3, { carve: 1, solid: false, roll: 0.04, ...NS });
  b.box(0, RING.len / 2 - 0.2, 0.0, 0.5, 0.7, 0.5, facing + 0.4, MAT.STONE, 4, { solid: false, ...NS });
}
function raisedStone(b, facing, R) {
  b.box(0, 0, -1.4, RING.stoneH, 0.52, 0.4, facing + Math.PI / 2, MAT.GLYPH, 3, { carve: 1, ...NS });
  b.box(0, 0, RING.stoneH, RING.stoneH + 0.2, 0.42, 0.3, facing + Math.PI / 2, MAT.STONE, 4, { solid: false, ...NS });
}

/** The Fen Lamp: a stone post and bowl on the reed shore, with timber stakes. Its flame is the shared brazier fire (`fire`). */
const FEN_FIRE = 2.62;
function fenLamp(b, facing, R) {
  // A stepped Shaper plinth, the post with a carved band, the bowl, and a stone cage of four ribs and a cap over the flame: a lamp, not a stake.
  b.drum(0, 0, -1.4, 0.14, 1.45, 1.3, 12, MAT.STONE, 1);
  b.drum(0, 0, 0.1, 0.5, 0.95, 0.72, 12, MAT.STONE, 5);
  b.drum(0, 0, 0.5, 2.3, 0.3, 0.19, 8, MAT.STONE, 2);
  b.drum(0, 0, 1.15, 1.34, 0.34, 0.3, 10, MAT.GLYPH, 6, { carve: 1, solid: false });
  b.drum(0, 0, 2.25, 2.62, 0.2, 0.66, 12, MAT.GLYPH, 3, { carve: 1, solid: false });
  b.drum(0, 0, 2.55, 2.64, 0.6, 0.56, 12, MAT.EMBER, 4, { solid: false });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + 0.4;
    stick(b, [Math.sin(a) * 0.62, 2.6, Math.cos(a) * 0.62], [Math.sin(a) * 0.1, 3.55, Math.cos(a) * 0.1], 0.085, 0.055, 5, MAT.STONE, 30 + k);
  }
  b.drum(0, 0, 3.5, 3.72, 0.3, 0.08, 10, MAT.STONE, 34, { solid: false });
  // Three timber props leaning from the reed bed to the post, braced like a tripod (the post stands in soft ground).
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + 0.9, x = Math.sin(a) * 1.9, z = Math.cos(a) * 1.9;
    stick(b, [x, -0.5, z], [Math.sin(a) * 0.3, 1.25, Math.cos(a) * 0.3], 0.08, 0.06, 6, MAT.WOOD, 20 + k);
  }
}

/** A glide ring: stone hoop (radius `RING_R`) in the vertical plane across the course, ember studs that glow once it is flown through. */
export const RING_R = 7;
/** The highest ring (centre above the ground, m) that stands on a pier (about 15 m of pier). */
const PIER_MAX = 22;
export function glideRing(b, facing, R, lift = 0) {
  const c = Math.cos(facing), s = Math.sin(facing), N = 28;
  const P = (u, y) => [u * c, y, -u * s];                       // u runs across the course (site-local right)
  // The support: a tapered Shaper pier from the ground under the ring (the site hangs `lift` m up): a stepped footing, courses that
  // narrow as they climb with a carved band between each, a capstone, and two stout arms that cradle the hoop's underside.
  // A pier taller than ~15 m reads as a modern pylon (lead review), so a ring hung higher than PIER_MAX has none: it rides
  // the wind under a carved Shaper plumb-stone (a deliberate float, the stone that keeps it level), its arms cradling the hoop.
  if (lift > PIER_MAX) {
    const top = -RING_R - 2.6;
    b.drum(0, 0, top - 4.2, top - 2.0, 0.12, 1.15, 10, MAT.STONE, 150, { solid: false });          // the plumb's point, hanging
    b.drum(0, 0, top - 2.0, top - 1.4, 1.15, 1.2, 10, MAT.GLYPH, 151, { carve: 1, solid: false });   // its carved band
    b.drum(0, 0, top - 1.4, top + 0.7, 1.2, 0.7, 10, MAT.STONE, 152, { solid: false });             // the shoulder up to the arms
    for (const sg of [-1, 1]) { const a = Math.PI + sg * 0.66, [x, y, z] = P(Math.sin(a) * RING_R, Math.cos(a) * RING_R); stick(b, [0, top + 0.5, 0], [x, y + 0.1, z], 0.5, 0.3, 6, MAT.STONE, 92 + (sg > 0 ? 1 : 0)); }
  } else if (lift > 1) {
    const y0 = -lift - 3, top = -RING_R - 2.6, r0 = Math.min(3.4, 1.2 + lift * 0.045), r1 = 0.75;
    const n = Math.max(2, Math.ceil((top - y0) / 7)), dy = (top - y0) / n;
    const rAt = (u) => r1 + (r0 - r1) * Math.pow(1 - u, 1.35);
    b.drum(0, 0, y0, y0 + 0.9, r0 * 1.9, r0 * 1.6, 10, MAT.STONE, 90, { solid: false });
    b.drum(0, 0, y0 + 0.9, y0 + 1.9, r0 * 1.45, r0 * 1.25, 10, MAT.STONE, 91, { solid: false });
    for (let i = 0; i < n; i++) {
      const ya = y0 + 1.9 * (i === 0 ? 1 : 0) + i * dy, yb = y0 + (i + 1) * dy - 0.5, ua = i / n, ub = (i + 1) / n;
      b.drum(0, 0, ya, yb, rAt(ua), rAt(ub) * 1.02, 10, MAT.STONE, 100 + i);
      b.drum(0, 0, yb, yb + 0.5, rAt(ub) + 0.18, rAt(ub) + 0.18, 10, MAT.GLYPH, 120 + i, { carve: 1, solid: false });
    }
    b.drum(0, 0, top - 0.1, top + 0.7, r1 + 0.5, r1 + 0.9, 10, MAT.STONE, 140, { solid: false });
    for (const sg of [-1, 1]) { const a = Math.PI + sg * 0.66, [x, y, z] = P(Math.sin(a) * RING_R, Math.cos(a) * RING_R); stick(b, [0, top + 0.5, 0], [x, y + 0.1, z], 0.55, 0.3, 6, MAT.STONE, 92 + (sg > 0 ? 1 : 0)); }
  }
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * TAU, a1 = ((k + 1) / N) * TAU;
    stick(b, P(Math.sin(a0) * RING_R, Math.cos(a0) * RING_R), P(Math.sin(a1) * RING_R, Math.cos(a1) * RING_R), 0.2, 0.2, 6, MAT.STONE, 1 + k);
    if (k % 4 === 0) { const [x, y, z] = P(Math.sin(a0) * RING_R, Math.cos(a0) * RING_R); b.box(x, z, y - 0.2, y + 0.2, 0.28, 0.28, facing, MAT.EMBER, 50 + k, { solid: false, ...NS }); }
  }
}

/** Every site of the meadow side quests and shrines. `table`: the chapter's places by id (baked POIs and data places). */
export function sideSites(table) {
  const sites = [];
  const P = (id) => table[id].pos;
  // The meadow shrines (rest, travel, attune like the frost ones).
  Object.values(table).filter((p) => p.kind === 'shrine' && p.biome === 'meadow').sort((a, b) => (a.id < b.id ? -1 : 1))
    .forEach((p, i) => sites.push({ id: p.id, at: p.pos, facing: 0.7 + i * 1.3, build: meadowShrine, footprint: 4.6, seatAt: 'center' }));
  if (table['side-fen-lamp']) sites.push({ id: 'side-brazier-fen', at: P('side-fen-lamp'), facing: 0, build: fenLamp, footprint: 2.2, seatAt: 'center', fire: FEN_FIRE });
  if (table['side-stone-ring']) {
    const c = P('side-stone-ring'), g = stoneRingGeometry(c);
    sites.push({ id: 'side-stone-ring', at: c, facing: 0, build: ringStones, footprint: RING.r + 1.5, seatAt: 'center' });
    sites.push({ id: 'side-stone-fallen', at: g.fallen, facing: g.facing, build: fallenStone, footprint: 3.2, seatAt: 'center' });
    sites.push({ id: 'side-stone-raised', at: g.socket, facing: g.facing, build: raisedStone, footprint: 1.2, seatAt: 'center', pillar: true, pillarH: RING.stoneH });
  }
  for (let k = 1; k <= 3; k++) if (table['side-echo-' + k]) sites.push({ id: 'side-echo-' + k, at: P('side-echo-' + k), facing: k * 0.9, build: echoStone, footprint: 2.4, seatAt: 'center' });
  // The glide course: rings facing along the line to the next one, hung at their height over the baked ground (`h`).
  for (let k = 1; k <= 6; k++) {
    const pl = table['side-ring-' + k], nx = table['side-ring-' + (k + 1)] || null, pv = table['side-ring-' + (k - 1)] || null;
    if (!pl) continue;
    const a = nx ? nx.pos : pl.pos, b0 = pv ? pv.pos : pl.pos;
    const face = nx || pv ? Math.atan2(a[0] - b0[0], a[1] - b0[1]) : 0;
    sites.push({ id: 'side-glide-ring-' + k, at: pl.pos, facing: face, build: (b, f, R) => glideRing(b, f, R, pl.y - pl.h), footprint: 1, seatAt: 'center', lift: pl.y - pl.h });
  }
  return sites;
}
