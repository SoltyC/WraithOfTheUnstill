// The built things of the restored world (data/restored.json; systems/restored/*): the banners that mark a stream (a
// stone footing, a tall pole, a long pennant streaming downwind), the Shelf cairn where the summit course begins, its six
// glide rings (the side quests' hoop, unchanged), the pennants that stand for a finished request, Dunn's threshing floor
// with its chaff and its sacks, and the lantern on the green with the lantern that rises. Sites like world/sideSites.js:
// { id, at, facing, build, footprint, seatAt }. Everything is plain geometry in stone, timber and felt.
// Frost ids start `rw-`, meadow ids `side-rw-` (no snow on them: architecture NO_SNOW).

import { MAT, NS, cloth, rot } from './architecture.js';
import { stick } from './camp.js';
import { glideRing } from './sideSites.js';

const TAU = Math.PI * 2;
/** The yaw that points a site's forward axis downwind (wx, wz = the climatology's wind there, unit). */
export const downwind = (wx, wz) => Math.atan2(wx, wz);

/** A pennant pole: stones heaped at its foot, a tall pole, a long felt streamer flying downwind (forward), two tails. */
function pole(h, len) {
  return (b, facing, R) => {
    const P = rot(facing);
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + 0.3, r = 0.55 + R() * 0.2; b.box(Math.cos(a) * r, Math.sin(a) * r, -1.3, -0.15 + R() * 0.55, 0.3, 0.24, a, MAT.STONE, 1 + k, { solid: false, ...NS }); }
    b.drum(0, 0, -1.3, 0.35, 0.5, 0.36, 8, MAT.STONE, 7, { solid: false });
    stick(b, [0, 0.2, 0], [0, h, 0], 0.085, 0.045, 6, MAT.WOOD, 8);
    stick(b, [0, h - 0.05, 0], P(0, h + 0.1, 0.8), 0.03, 0.02, 4, MAT.WOOD, 9);
    for (let t = 0; t < 2; t++) {
      const drop = 0.95 - t * 0.25, y0 = h - 0.1 - t * 0.5, flare = 0.35 + t * 0.3;
      cloth(b, (u, v) => P(flare * Math.sin(v * 6.5 + t) * v * 0.45, y0 - u * drop * (1 - 0.7 * v) - 0.22 * v * v * len * 0.25, 0.05 + v * len * (1 - t * 0.18)), 1, 10, MAT.CANVAS, 20 + t);
    }
  };
}

/** The Shelf cairn: a heaped cairn with a carved slab leaning on it and a pennant pole beside it. */
function shelfCairn(b, facing, R) {
  const P = rot(facing);
  for (let k = 0; k < 5; k++) b.drum(0, 0, -0.4 + k * 0.34, -0.4 + k * 0.34 + 0.4, 0.95 - k * 0.14, 0.82 - k * 0.14, 9, MAT.STONE, 30 + k, { solid: false });
  { const [x, , z] = P(0, 0, 1.0); b.box(x, z, -0.3, 1.5, 0.45, 0.1, facing, MAT.GLYPH, 40, { carve: 1, solid: false, tilt: -0.2, ...NS }); }
  const [px, , pz] = P(1.6, 0, -0.4);
  stick(b, [px, -0.3, pz], [px, 4.6, pz], 0.075, 0.045, 6, MAT.WOOD, 41);
  cloth(b, (u, v) => { const [x, y, z] = P(1.6 + 0.2 * Math.sin(v * 6) * v * 0.4, 4.5 - u * 0.8 * (1 - 0.7 * v) - 0.2 * v * v, -0.4 + 0.05 + v * 2.8); return [x, y, z]; }, 1, 10, MAT.CANVAS, 42);
}

/** Dunn's threshing floor: a worn circle of flags on a low terrace (the hillside falls about a metre across it), a flail post. */
const FL = 0.75;
function floor(b, facing, R) {
  b.drum(0, 0, -2.2, FL, 4.3, 4.3, 18, MAT.FLAG, 1, { solid: false });
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; b.box(Math.cos(a) * 4.5, Math.sin(a) * 4.5, -2.2, FL + 0.5, 0.18, 0.3, a + Math.PI / 2, MAT.STONE, 2 + k, { solid: false, ...NS }); }
  stick(b, [-3.6, FL - 0.1, 2.0], [-3.3, FL + 1.8, 1.8], 0.05, 0.04, 5, MAT.WOOD, 12);
  stick(b, [-3.3, FL + 1.8, 1.8], [-2.2, FL + 2.1, 1.1], 0.035, 0.03, 4, MAT.WOOD, 13);
}
/** The chaff: straw heaps on the floor, drifting off. */
function chaff(b, facing, R) {
  for (let k = 0; k < 7; k++) { const a = R() * TAU, r = 0.5 + R() * 2.6; b.drum(Math.cos(a) * r, Math.sin(a) * r, FL - 0.1, FL + 0.35 + R() * 0.3, 0.9 + R() * 0.5, 0.2, 9, MAT.THATCH, 1 + k, { solid: false }); }
}
/** The winnowed grain: sacks stacked at the floor's edge. */
function sacks(b, facing, R) {
  for (let k = 0; k < 6; k++) {
    const row = k % 3, tier = (k / 3) | 0;
    b.box(row * 0.62 - 0.6, 0, -0.3 + tier * 0.46, 0.12 + tier * 0.46, 0.27, 0.36, 0.1 + R() * 0.3, MAT.CANVAS, 1 + k, { solid: false, ...NS });
  }
  b.box(0.1, 0, 0.62, 0.88, 0.25, 0.3, 0.4, MAT.CANVAS, 9, { solid: false, ...NS });
}

/** The lantern's stand on the green: a low stone and a hooked post. */
function lanternStand(b, facing, R) {
  b.drum(0, 0, -0.5, 0.3, 0.6, 0.5, 9, MAT.STONE, 1, { solid: false });
  stick(b, [0, 0.2, 0], [0, 2.2, 0], 0.06, 0.04, 6, MAT.WOOD, 2);
  stick(b, [0, 2.15, 0], [0.55, 2.3, 0], 0.03, 0.025, 4, MAT.WOOD, 3);
}
/** The paper lantern (on its hook at first; the system lifts the site): a felt shell round an ember. */
function lantern(b, facing, R) {
  b.box(0.55, 0, 1.8, 2.2, 0.17, 0.17, 0, MAT.CANVAS, 1, { solid: false, ...NS });
  b.box(0.55, 0, 1.86, 2.14, 0.12, 0.12, 0, MAT.EMBER, 2, { solid: false, ...NS });
  b.drum(0.55, 0, 2.2, 2.26, 0.12, 0.03, 8, MAT.METAL, 3, { solid: false });
  b.drum(0.55, 0, 1.74, 1.8, 0.06, 0.12, 8, MAT.METAL, 4, { solid: false });
  stick(b, [0.55, 2.24, 0], [0.55, 2.3, 0], 0.012, 0.012, 4, MAT.METAL, 5);
}

const banner = pole(6.6, 3.8), tall = pole(8.4, 4.6), small = pole(4.6, 2.8);

/**
 * Every site of the restored world. `table`: the chapter's places by id. `data`: data/restored.json. `wind`: { frost: [wx, wz], meadow: [wx, wz] }
 * (the climatology's unit wind where each biome's sites stand; the pennants fly the way it blows).
 */
export function restoredSites(table, data, wind) {
  const sites = [];
  const fly = (biome) => downwind(...wind[biome]);
  for (const bn of data.banners) {
    const biome = bn.stream.startsWith('frost') ? 'frost' : 'meadow';
    sites.push({ id: bn.id, at: bn.pos, facing: fly(biome), build: banner, footprint: 1.4, seatAt: 'center', hidden: true });
  }
  const sh = table['rw-shelf'];
  if (sh) sites.push({ id: 'rw-shelf-cairn', at: sh.pos, facing: fly('frost'), build: shelfCairn, footprint: 1.6, seatAt: 'center', hidden: true });
  const R = data.summit.rings;
  R.forEach((r, k) => {
    const nx = R[k + 1] || null, pv = R[k - 1] || null, a = nx ? nx.pos : r.pos, b0 = pv ? pv.pos : r.pos;
    sites.push({ id: 'rw-ring-' + (k + 1), at: r.pos, facing: nx || pv ? Math.atan2(a[0] - b0[0], a[1] - b0[1]) : 0, build: (b, f, R) => glideRing(b, f, R, r.y - r.h), footprint: 1, seatAt: 'center', lift: r.y - r.h, hidden: true });
  });
  const vr = table['varo-rise'];
  if (vr) sites.push({ id: 'rw-varo-pennant', at: [vr.pos[0] + 5, vr.pos[1] + 3], facing: fly('frost'), build: small, footprint: 1.2, seatAt: 'center', hidden: true });
  const green = table['side-rw-road-start'];
  if (green) sites.push({ id: 'side-rw-windsock', at: [green.pos[0] + 4, green.pos[1] - 6], facing: fly('meadow'), build: tall, footprint: 1.4, seatAt: 'center', hidden: true });
  const c = data.chaff;
  sites.push({ id: 'side-rw-floor', at: c.pos, facing: 0.4, build: floor, footprint: 4.3, seatAt: 'center' });
  sites.push({ id: 'side-rw-chaff', at: c.pos, facing: 0.4, build: chaff, footprint: 4, seatAt: 'center' });
  sites.push({ id: 'side-rw-sacks', at: [c.pos[0] + 6.4, c.pos[1] + 0.5], facing: 0.4, build: sacks, footprint: 1.4, seatAt: 'center', hidden: true });
  const l = data.lantern;
  sites.push({ id: 'side-rw-lantern-stand', at: l.pos, facing: 0, build: lanternStand, footprint: 0.8, seatAt: 'center' });
  sites.push({ id: 'side-rw-lantern', at: l.pos, facing: 0, build: lantern, footprint: 0.5, seatAt: 'center', pillar: true, pillarH: 0.01, hidden: true });
  return sites;
}
