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
  b.drum(0, 0, -1.4, 0.4, 0.62, 0.52, 10, MAT.STONE, 1);
  b.drum(0, 0, 0.4, 2.3, 0.24, 0.18, 8, MAT.STONE, 2);
  b.drum(0, 0, 2.25, 2.62, 0.2, 0.62, 12, MAT.GLYPH, 3, { carve: 1, solid: false });
  b.drum(0, 0, 2.55, 2.64, 0.56, 0.52, 12, MAT.EMBER, 4, { solid: false });
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU + 0.4, x = Math.sin(a) * 1.9, z = Math.cos(a) * 1.9;
    stick(b, [x, -0.7, z], [x + (R() - 0.5) * 0.2, 1.5 + R() * 0.6, z + (R() - 0.5) * 0.2], 0.06, 0.045, 6, MAT.WOOD, 20 + k);
  }
}

/** A glide ring: stone hoop (radius `RING_R`) in the vertical plane across the course, ember studs that glow once it is flown through. */
export const RING_R = 7;
export function glideRing(b, facing, R) {
  const c = Math.cos(facing), s = Math.sin(facing), N = 28;
  const P = (u, y) => [u * c, y, -u * s];                       // u runs across the course (site-local right)
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
    sites.push({ id: 'side-glide-ring-' + k, at: pl.pos, facing: face, build: glideRing, footprint: 1, seatAt: 'center', lift: pl.y - pl.h });
  }
  return sites;
}
