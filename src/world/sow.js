// The Sow: the farmers of the Ember Waste (docs/phase-11/ember-design.md §4.3; the chapter's slice, §9). Not a village: six
// farmsteads scattered down the green valley on the cone's west side (x 730–950, z −1640…−2260, 170–205 m; the bake's
// gentlest ember ground), each a family and an elder. Their own kit, not Hearn's:
//   the house    low, dry-stone, under a lime-washed barrel vault; one door, one shuttered window
//   the byre     a smaller vault beside it, open-fronted
//   water        a plastered cistern (or Gwil's well with its windlass, Aled's trough by the fold)
//   the yard     a dry-stone wall round house and byre, a gap for the cart; a threshing floor of flags; a drying rack
//   the fields   three terraces down the slope below the house, staked in rows (the vines)
// Every height off the house's seat follows the 8 m overview (the streamer's, passed in), so walls and terraces lie on the
// hill. The family's state shows on the farm (§5, bodies and things, no meter): the door shut until they go (then left open),
// bundles packed by the door once they believe, the cart loaded when they are leaving, gone with them. Sites per farm:
//   sow-<id>-farm  (always)   sow-<id>-door (the shut leaf)   sow-<id>-bundles   sow-<id>-cart   sow-<id>-load
// Each farm's sign (the proof on their own land, systems/sow.js) is at SOW_SIGNS[id], a point in the farm's frame.
// The mountain's own sign for the slice, the new steam on the north-west flank (§3), is three fissures: emb-fissure-<k>.

import { MAT, NS, rot, cloth } from './architecture.js';
import { stick } from './camp.js';
import { layWall } from './masonry.js';
import { towerHouse } from './towerKit.js';

/** The farms: id, the house's place, facing (down the slope, so the house looks out over its own terraces). */
export const SOW_FARMS = [
  { id: 'aled', at: [800, -1640], facing: 2.68 },
  { id: 'bethan', at: [945, -1720], facing: -1.63 },
  { id: 'huw', at: [910, -1860], facing: -1.74 },
  { id: 'ffion', at: [950, -1960], facing: -0.82 },
  { id: 'gwil', at: [730, -2110], facing: -0.57 },
  { id: 'mari', at: [790, -2260], facing: -0.78 },
];
/** Where each farm's sign is, in its frame (u right, f forward = downhill): what it is is the chapter data's. */
export const SOW_SIGNS = {
  aled: [9.5, -7.5],     // the trough by the fold: warm, the flock won't drink
  bethan: [-8.5, 2.5],   // the cistern: sunk overnight, its plaster cracked at the old waterline
  huw: [8.5, 6.5],       // the threshing floor: a crack across it, breathing warm air
  ffion: [6.8, 0.4],     // the byre: the hens dead on the floor, nothing on them
  gwil: [-7.5, 6.5],     // the well: the bucket comes up hot
  mari: [1.5, 24],       // the lowest terrace: the vines scorched at the root, the soil warm
};
/** The headland camp: where the families who leave go (the cliffs over the sea, 250 m up; systems/sow.js ROAD). */
export const CAMP = { at: [720, -2640] };
/** The fissures (the mountain's sign): on the north-west flank, ~540 m from the crater, 500 m up. */
export const FISSURES = [[2045, -1704], [2066, -1690], [2031, -1722]];

/** The baked heights' grid over each farm's frame (tools/world/sowHeights.mjs → data/world/sowHeights.json). */
export const SOW_GRID = { u0: -26, f0: -22, step: 2, nu: 27, nf: 33 };

const HOUSE = { L: 4.6, D: 2.9, H: 2.5, T: 0.5 };   // half length, half depth, wall height, wall thickness
const BYRE = { L: 2.8, D: 2.3, H: 2.1, T: 0.45 };
/** The farms with a tower-house: where it stands in the farm's frame (u, f) and its storeys. */
const TOWERS = { gwil: [-HOUSE.L - 1.2, -HOUSE.D - 3.2, 4], ffion: [-HOUSE.L - 1.2, -HOUSE.D - 3.2, 3], huw: [-HOUSE.L - 1.2, -HOUSE.D - 3.2, 3], bethan: [HOUSE.L + 2 * BYRE.L + 1.5, -HOUSE.D - 3.2, 3] };

/** World point of a farm-frame point (u, f). */
export function sowPoint(farm, u, f) { const p = rot(farm.facing)(u, 0, f); return [farm.at[0] + p[0], farm.at[1] + p[2]]; }

/** Height off the overview (u16, h = v/32 − 128, 8 m, row 0 north), bilinear. */
function ovHeight(ov) {
  const N = 1024;
  return (x, z) => {
    let i = (x + 4096) / 8 - 0.5, j = (4096 - z) / 8 - 0.5;
    i = Math.min(Math.max(i, 0), N - 1.001); j = Math.min(Math.max(j, 0), N - 1.001);
    const i0 = Math.floor(i), j0 = Math.floor(j), fi = i - i0, fj = j - j0, v = (a, b) => ov[b * N + a] / 32 - 128;
    return (v(i0, j0) * (1 - fi) + v(i0 + 1, j0) * fi) * (1 - fj) + (v(i0, j0 + 1) * (1 - fi) + v(i0 + 1, j0 + 1) * fi) * fj;
  };
}

/** A vaulted building in the farm's frame: centre (cu, cf), yaw off the farm's facing (0: door to the front). */
function vaulted(b, P, cu, cf, dims, door, seed, { open = false } = {}) {
  const { L, D, H, T } = dims;
  const at = (u, y, f) => { const p = P(cu + u, y, cf + f); return p; };
  const yaw = P.yaw;
  const box = (u, f, y0, y1, hu, hf, mat, s, o) => { const p = at(u, 0, f); b.box(p[0], p[2], y0, y1, hu, hf, yaw, mat, s, o); };
  const wall = (u, f, y0, y1, hu, hf, s) => { const p = at(u, 0, f); layWall(b, p[0], p[2], y0, y1, hu, hf, yaw, MAT.STONE, s, { course: 0.32, blockLen: 0.7 }); };
  // A footing course the house stands on (the hill is cut and built up under it).
  box(0, 0, -2.6, 0.12, L + 0.25, D + 0.25, MAT.STONE, seed, { course: 0.4 });
  // Side walls (along the length) and the back.
  wall(0, -D + T / 2, 0.12, H, L, T / 2, seed + 1);
  // The front: the door (1.1 m) in from one end, a window.
  if (open) { wall(-L + 0.4, D - T / 2, 0.12, H, 0.4, T / 2, seed + 2); wall(L - 0.4, D - T / 2, 0.12, H, 0.4, T / 2, seed + 3); box(0, D - T / 2, H - 0.32, H, L - 0.8, T / 2, MAT.WOOD, seed + 4, { solid: false }); }
  else {
    const d0 = door - 0.55, d1 = door + 0.55;
    wall((-L + d0) / 2, D - T / 2, 0.12, H, (d0 + L) / 2, T / 2, seed + 2);
    wall((d1 + L) / 2, D - T / 2, 0.12, H, (L - d1) / 2, T / 2, seed + 3);
    wall(door, D - T / 2, 2.15, H, 0.55, T / 2, seed + 5);
    box(door, D - T / 2, 2.05, 2.18, 0.75, T / 2 + 0.04, MAT.WOOD, seed + 6, { solid: false, ...NS });            // the lintel
    box(door, D - 0.45, 0.12, 0.2, 0.55, 0.28, MAT.FLAG, seed + 7, { solid: false, plain: true, ...NS });         // the step
    // The dark inside the doorway (seen when the door stands open).
    box(door, D - T - 0.2, 0.12, 2.1, 0.7, 0.2, MAT.EMBER, seed + 8, { solid: true, plain: true, ...NS });
    // A small window, shuttered, the far side of the door.
    const wu = door > 0 ? -L * 0.55 : L * 0.55;
    box(wu, D + 0.02, 1.15, 1.75, 0.36, 0.05, MAT.WOOD, seed + 9, { solid: false, ...NS });
    box(wu, D + 0.02, 1.08, 1.13, 0.46, 0.12, MAT.STONE, seed + 10, { solid: false, plain: true, ...NS });
  }
  // End walls, up to the springing.
  wall(-L + T / 2, 0, 0.12, H, T / 2, D - T, seed + 11);
  wall(L - T / 2, 0, 0.12, H, T / 2, D - T, seed + 12);
  // The vault: a segmental barrel over the length, lime-washed, a hand's breadth over the walls.
  const th0 = 1.05, Rv = (D + 0.12) / Math.sin(th0), rise = Rv - Rv * Math.cos(th0);
  cloth(b, (u, v) => { const th = -th0 + 2 * th0 * v; return at(-L - 0.12 + u * (2 * L + 0.24), H + Rv * Math.cos(th) - Rv * Math.cos(th0), Rv * Math.sin(th)); }, 2, 12, MAT.PLASTER, seed + 13);
  // Its ends: the lunettes, in stone (both faces).
  for (const su of [-1, 1]) {
    const pts = []; for (let k = 0; k <= 12; k++) { const th = -th0 + 2 * th0 * k / 12; pts.push(at(su * (L - 0.02), H + Rv * Math.cos(th) - Rv * Math.cos(th0) - 0.02, Rv * Math.sin(th) * 0.97)); }
    const c = at(su * (L - 0.02), H - 0.02, 0);
    for (let k = 0; k < 12; k++) { b.tri(c, pts[k], pts[k + 1], MAT.STONE, seed + 14); b.tri(c, pts[k + 1], pts[k], MAT.STONE, seed + 14); }
  }
  // A camera blocker over it (the roof is not solid for the body).
  const pc = at(0, 0, 0);
  b.blockers.push({ site: b.site, kind: 'box', x: pc[0], z: pc[2], hx: L, hz: D, cos: Math.cos(yaw), sin: Math.sin(yaw), y0: H, y1: H + rise, cam: true });
}

/** A run of dry-stone wall from a to b (farm-frame), lying on the hill (rel: height off the seat at a farm-frame point). */
function dryWall(b, P, rel, a, c, h, seed) {
  const n = Math.max(1, Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / 4));
  for (let k = 0; k < n; k++) {
    const u0 = a[0] + (c[0] - a[0]) * k / n, f0 = a[1] + (c[1] - a[1]) * k / n, u1 = a[0] + (c[0] - a[0]) * (k + 1) / n, f1 = a[1] + (c[1] - a[1]) * (k + 1) / n;
    const um = (u0 + u1) / 2, fm = (f0 + f1) / 2, len = Math.hypot(u1 - u0, f1 - f0);
    const y = Math.min(rel(u0, f0), rel(u1, f1)) - 0.25, yt = Math.max(rel(u0, f0), rel(u1, f1)) + h;
    const p = P(um, 0, fm), yaw = P.yaw + Math.atan2(u1 - u0, f1 - f0);
    // Dry stone: a battered body of fieldstone rubble (the cobble scans on its faces), footed well into the hill, capped with
    // a row of rough stones set on edge.
    b.frustum(p[0], p[2], y - 0.9, yt, 0.36, len / 2 + 0.06, 0.24, len / 2 + 0.06, yaw, MAT.COBBLE, seed + k);
    const nc = Math.max(2, Math.round(len / 0.55)), cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (let c = 0; c < nc; c++) {
      const t = (c + 0.5) / nc - 0.5, cx = p[0] + sy * t * len, cz = p[2] + cy * t * len, hh = 0.16 + 0.1 * ((seed * 7 + c * 13) % 5) / 5;
      b.box(cx, cz, yt - 0.04, yt + hh, 0.2, len / nc * 0.45, yaw + (((c * 37) % 7) - 3) * 0.04, MAT.COBBLE, seed * 3 + c, { solid: false, plain: true, ...NS, tilt: (((c * 53) % 5) - 2) * 0.05 });
    }
    b.blockers.push({ site: b.site, kind: 'box', x: p[0], z: p[2], hx: 0.3, hz: len / 2 + 0.06, cos: Math.cos(yaw), sin: Math.sin(yaw), y0: y, y1: yt });
  }
}

/** Build fn's geometry dy higher (vertices, blockers, platforms, lights it adds). */
export function lifted(b, dy, fn) {
  const v0 = b.pos.length, k0 = b.blockers.length, p0 = b.platforms.length, l0 = b.lights.length;
  fn();
  for (let i = v0 + 1; i < b.pos.length; i += 3) b.pos[i] += dy;
  for (let i = k0; i < b.blockers.length; i++) { if (b.blockers[i].y0 !== undefined) b.blockers[i].y0 += dy; if (b.blockers[i].y1 !== undefined) b.blockers[i].y1 += dy; }
  for (let i = p0; i < b.platforms.length; i++) b.platforms[i].top += dy;
  for (let i = l0; i < b.lights.length; i++) b.lights[i].y += dy;
}
/** The house's terrace above the seat (the highest ground under house and byre: cut into the hill, built up below). */
function terraceY(rel) {
  let top = 0;
  for (const [u, f] of [[-HOUSE.L, -HOUSE.D], [HOUSE.L, -HOUSE.D], [-HOUSE.L, HOUSE.D], [HOUSE.L, HOUSE.D], [HOUSE.L + 2 * BYRE.L + 1.1, -BYRE.D], [HOUSE.L + 2 * BYRE.L + 1.1, BYRE.D]]) top = Math.max(top, rel(u, f));
  return top + 0.05;
}

function farmBuild(farm, rel) {
  const id = farm.id;
  return (b, facing) => {
    const P0 = rot(facing), P = (u, y, f) => P0(u, y, f); P.yaw = facing;
    const at = (u, f, y = 0) => P(u, y, f);
    let s = 7000 + id.charCodeAt(0) * 13;
    // The house and the byre beside it, on their terrace.
    lifted(b, terraceY(rel), () => {
      vaulted(b, P, 0, 0, HOUSE, id === 'gwil' || id === 'huw' ? -1.6 : 1.6, s);
      vaulted(b, P, HOUSE.L + BYRE.L + 1.1, -0.6, BYRE, 0, s + 40, { open: true });
    });
    // The tower-house behind (the bigger farms: grain and goods kept high and dry), three or four storeys over the yard.
    if (TOWERS[id]) {
      const [tu, tf, n] = TOWERS[id], [x, , z] = at(tu, tf);
      const y = Math.min(rel(tu - 3, tf - 3), rel(tu + 3, tf - 3), rel(tu - 3, tf + 3), rel(tu + 3, tf + 3));
      towerHouse(b, x, z, y, facing, { hw: 2.9, hd: 2.7, storeys: n, storey: 3.3, seed: s + 500 });
    }
    // The yard wall: a rectangle round them, the gap at the front for the cart.
    const yu0 = -HOUSE.L - 5, yu1 = HOUSE.L + 2 * BYRE.L + 4.5, yf0 = -HOUSE.D - 6, yf1 = HOUSE.D + 7;
    dryWall(b, P, rel, [yu0, yf0], [yu1, yf0], 1.1, s + 60);
    dryWall(b, P, rel, [yu0, yf0], [yu0, yf1], 1.1, s + 70);
    dryWall(b, P, rel, [yu1, yf0], [yu1, yf1], 1.1, s + 80);
    dryWall(b, P, rel, [yu0, yf1], [-3, yf1], 1.1, s + 90);
    dryWall(b, P, rel, [3, yf1], [yu1, yf1], 1.1, s + 95);
    // Water.
    const W = SOW_SIGNS;
    if (id === 'gwil') {
      // The well: a stone drum, a windlass on two posts, the bucket on its rope.
      const [x, , z] = at(W.gwil[0], W.gwil[1]), y = rel(W.gwil[0], W.gwil[1]);
      b.drum(x, z, y - 1, y + 0.75, 0.95, 0.9, 14, MAT.STONE, s + 100);
      b.drum(x, z, y + 0.55, y + 0.62, 0.62, 0.62, 12, MAT.EMBER, s + 101, { solid: false });
      const pa = at(W.gwil[0] - 1.0, W.gwil[1]), pb = at(W.gwil[0] + 1.0, W.gwil[1]);
      stick(b, [pa[0], y + 0.5, pa[2]], [pa[0], y + 1.8, pa[2]], 0.07, 0.06, 6, MAT.WOOD, s + 102);
      stick(b, [pb[0], y + 0.5, pb[2]], [pb[0], y + 1.8, pb[2]], 0.07, 0.06, 6, MAT.WOOD, s + 103);
      stick(b, [pa[0], y + 1.65, pa[2]], [pb[0], y + 1.65, pb[2]], 0.09, 0.09, 8, MAT.WOOD, s + 104);
      stick(b, [x, y + 1.6, z], [x, y + 1.0, z], 0.01, 0.01, 4, MAT.CANVAS, s + 105);
      b.drum(x, z, y + 0.72, y + 1.0, 0.16, 0.19, 8, MAT.WOOD, s + 106, { solid: false });
    } else {
      // The cistern: a plastered drum, its water dark under the lip.
      const [cu, cf] = id === 'bethan' ? W.bethan : [-HOUSE.L - 2.6, 2.2];
      const [x, , z] = at(cu, cf), y = rel(cu, cf);
      // A ring of plastered wall, open at the top: the water stands dark inside it.
      for (let k = 0; k < 16; k++) {
        const a = (k + 0.5) / 16 * Math.PI * 2;
        b.box(x + Math.cos(a) * 1.55, z + Math.sin(a) * 1.55, y - 1, y + 0.8, 0.17, 0.33, -a, MAT.PLASTER, s + 110, { solid: false, plain: true, ...NS });
      }
      b.blockers.push({ site: b.site, kind: 'circle', x, z, r: 1.75, y0: y - 1, y1: y + 0.8 });
      b.drum(x, z, y - 1, y - 0.1, 1.42, 1.42, 18, MAT.EMBER, s + 109, { solid: false });
      const wy = id === 'bethan' ? 0.1 : 0.58;
      b.drum(x, z, y + wy - 0.07, y + wy, 1.42, 1.42, 18, MAT.GLASS, s + 111, { solid: false });
      if (id === 'bethan') {   // sunk: a dark band of old waterline, cracked
        for (let k = 0; k < 16; k++) { const a = (k + 0.5) / 16 * Math.PI * 2; b.box(x + Math.cos(a) * 1.37, z + Math.sin(a) * 1.37, y + 0.1, y + 0.58, 0.02, 0.29, -a, MAT.EARTH, s + 112, { solid: false, plain: true, ...NS }); }
        for (let k = 0; k < 3; k++) { const a = 0.6 + k * 0.5; b.box(x + Math.cos(a) * 1.4, z + Math.sin(a) * 1.4, y + 0.2, y + 0.75, 0.015, 0.04, -a, MAT.EMBER, s + 113 + k, { solid: false, plain: true, ...NS, tilt: 0.2 }); }
      }
    }
    if (id === 'aled') {
      // The fold: a ring of dry stone above the house, the trough at its gate.
      const fu = 13, ff = -11;
      for (let k = 0; k < 10; k++) {
        const a0 = 0.35 + k / 10 * (Math.PI * 2 - 0.7), a1 = 0.35 + (k + 1) / 10 * (Math.PI * 2 - 0.7);
        dryWall(b, P, rel, [fu + Math.cos(a0) * 7, ff + Math.sin(a0) * 7], [fu + Math.cos(a1) * 7, ff + Math.sin(a1) * 7], 1.2, s + 120 + k * 3);
      }
      const [x, , z] = at(W.aled[0], W.aled[1]), y = rel(W.aled[0], W.aled[1]);
      b.box(x, z, y - 0.4, y + 0.55, 0.45, 1.3, facing + 0.5, MAT.STONE, s + 150, { course: 0.3 });
      b.box(x, z, y + 0.35, y + 0.42, 0.33, 1.15, facing + 0.5, MAT.GLASS, s + 151, { solid: false, plain: true, ...NS });
    }
    // The threshing floor: a round of flags on a low kerb (Huw's is cracked across).
    {
      const [tu, tf] = id === 'huw' ? W.huw : [9, 6.5];
      const [x, , z] = at(tu, tf), y = Math.max(rel(tu - 3, tf), rel(tu + 3, tf), rel(tu, tf - 3), rel(tu, tf + 3)) + 0.15;
      b.drum(x, z, y - 1.2, y, 3.6, 3.6, 22, MAT.FLAG, s + 160, { solid: true });
      if (id === 'huw') for (let k = 0; k < 7; k++) {
        const a = facing + 0.9 + Math.sin(k * 2.3) * 0.35, ox = -2.6 + k * 0.78;
        b.box(x + Math.cos(facing) * ox, z - Math.sin(facing) * ox, y - 0.02, y + 0.012, 0.035, 0.45, a, MAT.IRON, s + 161 + k, { solid: false, plain: true, ...NS });
      }
    }
    // The drying rack: three posts, two rails, a cloth of drying figs over them.
    {
      const r0 = at(-HOUSE.L - 1.5, -HOUSE.D - 2.8), r1 = at(HOUSE.L * 0.4, -HOUSE.D - 2.8);
      const y0 = rel(-HOUSE.L - 1.5, -HOUSE.D - 2.8), y1 = rel(HOUSE.L * 0.4, -HOUSE.D - 2.8);
      for (let k = 0; k <= 2; k++) { const t = k / 2, x = r0[0] + (r1[0] - r0[0]) * t, z = r0[2] + (r1[2] - r0[2]) * t, y = y0 + (y1 - y0) * t; stick(b, [x, y - 0.3, z], [x, y + 1.25, z], 0.05, 0.045, 6, MAT.WOOD, s + 170 + k); }
      stick(b, [r0[0], y0 + 1.2, r0[2]], [r1[0], y1 + 1.2, r1[2]], 0.035, 0.035, 5, MAT.WOOD, s + 174);
      cloth(b, (u, v) => { const x = r0[0] + (r1[0] - r0[0]) * u, z = r0[2] + (r1[2] - r0[2]) * u, y = y0 + (y1 - y0) * u + 1.22; const sag = 0.12 * Math.sin(Math.PI * u); return [x + Math.sin(facing) * (v - 0.5) * 1.2, y - sag - Math.abs(v - 0.5) * 0.9, z + Math.cos(facing) * (v - 0.5) * 1.2]; }, 6, 4, MAT.CANVAS, s + 175);
    }
    // The terraces: three retaining walls across the slope below the yard, each field staked in rows (the vines).
    for (let k = 0; k < 3; k++) {
      const f = yf1 + 6 + k * 8, w = 15 + k * 2;
      dryWall(b, P, rel, [-w, f], [w, f], 0.75, s + 200 + k * 20);
      for (let r = 0; r < 3; r++) for (let q = -w + 2; q <= w - 2; q += 2.2) {
        const ff = f - 1.8 - r * 2.0, uu = q + (r % 2) * 1.1, [x, , z] = at(uu, ff), y = rel(uu, ff);
        stick(b, [x, y - 0.3, z], [x + 0.04, y + 1.05, z], 0.03, 0.025, 4, MAT.WOOD, s + 260 + k * 50 + r);
        // A knot of vine at the stake: a few short dark crooked sticks.
        stick(b, [x, y + 0.1, z], [x + 0.25, y + 0.75, z + 0.12], 0.03, 0.015, 4, MAT.SHINGLE, s + 261 + k * 50 + r);
      }
    }
  };
}

function doorBuild(farm, rel) {
  return (b, facing) => {
    const P = rot(facing), du = farm.id === 'gwil' || farm.id === 'huw' ? -1.6 : 1.6, p = P(du, 0, HOUSE.D - HOUSE.T * 0.55), y = terraceY(rel);
    b.box(p[0], p[2], y + 0.14, y + 2.05, 0.52, 0.04, facing, MAT.WOOD, 9100 + farm.id.length, { solid: false, ...NS });
  };
}
function bundlesBuild(farm, rel) {
  return (b, facing) => {
    const P = rot(facing), du = farm.id === 'gwil' || farm.id === 'huw' ? -1.6 : 1.6;
    for (let k = 0; k < 5; k++) {
      const u = du + 0.9 + (k % 3) * 0.55, f = HOUSE.D + 0.55 + Math.floor(k / 3) * 0.6, p = P(u, 0, f), y = rel(u, f);
      b.drum(p[0], p[2], y, y + 0.45 + (k % 2) * 0.15, 0.27, 0.2, 9, MAT.CANVAS, 9200 + k, { solid: false });
    }
    const p = P(du - 1.0, 0, HOUSE.D + 0.6), y = rel(du - 1.0, HOUSE.D + 0.6);
    b.box(p[0], p[2], y, y + 0.55, 0.4, 0.3, facing + 0.2, MAT.WOOD, 9210, { solid: false });   // a chest
  };
}
const CART_AT = [0, HOUSE.D + 10];
function cartBuild(farm, rel) {
  return (b, facing) => {
    const P = rot(facing), [u, f] = CART_AT, p = P(u, 0, f), y = rel(u, f), yaw = facing + Math.PI / 2;
    b.box(p[0], p[2], y + 0.7, y + 0.82, 0.8, 1.35, yaw, MAT.PLANK, 9300, { solid: true });
    for (const s of [-1, 1]) {
      const q = P(u, 0, f), side = rot(yaw)(s * 0.9, 0, 0);
      b.drum(q[0] + side[0] - Math.cos(yaw) * 0.04 * s, q[2] + side[2] + Math.sin(yaw) * 0.04 * s, y + 0.62 - 0.06, y + 0.62 + 0.06, 0.62, 0.62, 14, MAT.WOOD, 9301 + s, { lie: 1, yaw: yaw + Math.PI / 2, solid: false });
      const r0 = rot(yaw)(s * 0.75, 0, 0);
      b.box(q[0] + r0[0], q[2] + r0[2], y + 0.82, y + 1.15, 0.04, 1.35, yaw, MAT.PLANK, 9303 + s, { solid: false, ...NS });
    }
    const sh = rot(yaw)(0, 0, 2.2);
    stick(b, [p[0] + rot(yaw)(-0.35, 0, 1.3)[0], y + 0.78, p[2] + rot(yaw)(-0.35, 0, 1.3)[2]], [p[0] + sh[0] - 0.2, y + 0.1, p[2] + sh[2]], 0.05, 0.04, 5, MAT.WOOD, 9306);
  };
}
function loadBuild(farm, rel) {
  return (b, facing) => {
    const P = rot(facing), [u, f] = CART_AT, y = rel(u, f) + 0.82, yaw = facing + Math.PI / 2;
    for (let k = 0; k < 7; k++) {
      const o = rot(yaw)(((k % 2) - 0.5) * 0.7, 0, (Math.floor(k / 2) - 1.5) * 0.65), p = P(u, 0, f);
      b.drum(p[0] + o[0], p[2] + o[2], y, y + 0.5 + (k % 3) * 0.1, 0.3, 0.22, 9, k % 3 === 0 ? MAT.WOOD : MAT.CANVAS, 9400 + k, { solid: false });
    }
  };
}

/** The fissures: a ragged split in the flank, its lips heaved up and crusted yellow-grey. */
function fissureBuild(k) {
  return (b, facing, R) => {
    const L = 6 + k * 1.5;
    for (let i = 0; i < 9; i++) {
      const t = (i / 8 - 0.5) * L, w = 0.25 + 0.2 * Math.sin(i * 1.7 + k);
      const P = rot(facing + Math.sin(i * 0.9 + k) * 0.25), m = P(0, 0, t);
      b.box(m[0], m[2], -1.5, 0.05, w, L / 16 + 0.15, facing, MAT.EMBER, 9500 + k * 20 + i, { solid: false, plain: true, ...NS });
      for (const s of [-1, 1]) { const q = P(s * (w + 0.35), 0, t); b.box(q[0], q[2], -0.6, 0.18 + R() * 0.25, 0.3, L / 16 + 0.3, facing + s * 0.15, MAT.STONE, 9600 + k * 20 + i * 2 + (s > 0 ? 1 : 0), { solid: false, tilt: s * 0.25, ...NS }); }
    }
  };
}

/** The camp: a fire ring, two lean-to shelters of cart cloth on poles, bundles, a cart drawn up. */
function campBuild(b, facing, R) {
  for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; b.box(Math.cos(a) * 0.85, Math.sin(a) * 0.85, -0.2, 0.18 + R() * 0.08, 0.16, 0.12, -a, MAT.STONE, 9700 + k, { solid: false, plain: true, ...NS }); }
  b.drum(0, 0, -0.1, 0.06, 0.65, 0.65, 10, MAT.EMBER, 9710, { solid: false });
  for (let k = 0; k < 4; k++) { const a = k * 1.7; stick(b, [Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5], [-Math.cos(a) * 0.15, 0.35, -Math.sin(a) * 0.15], 0.05, 0.04, 5, MAT.WOOD, 9711 + k); }
  for (const [cx, cz, yaw, s] of [[-7.5, 5, 2.4, 9720], [8, 4, -2.2, 9730], [1, -9.5, 0.1, 9740]]) {
    const P = rot(yaw), at = (u, y, f) => { const p = P(u, y, f); return [cx + p[0], p[1], cz + p[2]]; };
    stick(b, at(-1.6, -0.3, 0), at(-1.6, 1.6, 0), 0.05, 0.045, 6, MAT.WOOD, s);
    stick(b, at(1.6, -0.3, 0), at(1.6, 1.6, 0), 0.05, 0.045, 6, MAT.WOOD, s + 1);
    stick(b, at(-1.7, 1.55, 0), at(1.7, 1.55, 0), 0.04, 0.04, 5, MAT.WOOD, s + 2);
    cloth(b, (u, v) => at((u - 0.5) * 3.5, 1.55 - v * 1.5 - 0.1 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v), -v * 2.2), 6, 4, MAT.CANVAS, s + 3);
    for (let q = 0; q < 3; q++) b.drum(...[cx + P(-0.8 + q * 0.7, 0, -1.2)[0], cz + P(-0.8 + q * 0.7, 0, -1.2)[2]], 0, 0.4 + (q % 2) * 0.15, 0.25, 0.19, 9, MAT.CANVAS, s + 5 + q, { solid: false });
  }
  b.blockers.push({ site: b.site, kind: 'circle', x: 0, z: 0, r: 0.9, y0: -0.2, y1: 0.4 });
  b.light(0, 0.45, 0, 13, 1.0, 0.52, 0.22, 1.7, 'fire');
}

/** Every Sow and mountain-sign site. ov: the 8 m overview heights (g.streamer.overview); baked: data/world/sowHeights.json. */
export function sowSites(ov, SOW_HEIGHTS = {}) {
  if (!ov) return [];
  const hAt = ovHeight(ov), out = [];
  for (const farm of SOW_FARMS) {
    const P = rot(farm.facing);
    // Seated on the real ground at the house's centre (the 2 m ground, at runtime); every other height is the overview's
    // difference from there (the 8 m overview is smoothed — metres off the ground in places — but its slope is right).
    const h0 = hAt(farm.at[0], farm.at[1]), baked = SOW_HEIGHTS.farms?.[farm.id], G = SOW_HEIGHTS.grid;
    const rel = (u, f) => {
      // The exact ground where it was baked (bilinear on its 2 m grid), the overview's slope outside it.
      if (baked && G.u0 === SOW_GRID.u0 && G.nu === SOW_GRID.nu) {
        const x = (u - G.u0) / G.step, y = (f - G.f0) / G.step;
        if (x >= 0 && y >= 0 && x <= G.nu - 1.001 && y <= G.nf - 1.001) {
          const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, H = baked.h, k = j * G.nu + i;
          return (H[k] * (1 - fx) + H[k + 1] * fx) * (1 - fy) + (H[k + G.nu] * (1 - fx) + H[k + G.nu + 1] * fx) * fy;
        }
      }
      const p = P(u, 0, f); return hAt(farm.at[0] + p[0], farm.at[1] + p[2]) - h0;
    };
    const base = { at: farm.at, facing: farm.facing, seatAt: 'center' };
    out.push({ ...base, id: `sow-${farm.id}-farm`, build: farmBuild(farm, rel), footprint: 32 });
    out.push({ ...base, id: `sow-${farm.id}-door`, build: doorBuild(farm, rel), footprint: 1 });
    out.push({ ...base, id: `sow-${farm.id}-bundles`, build: bundlesBuild(farm, rel), footprint: 1, hidden: true });
    out.push({ ...base, id: `sow-${farm.id}-cart`, build: cartBuild(farm, rel), footprint: 1 });
    out.push({ ...base, id: `sow-${farm.id}-load`, build: loadBuild(farm, rel), footprint: 1, hidden: true });
  }
  out.push({ id: 'emb-camp', at: CAMP.at, facing: 0, build: campBuild, footprint: 10, seatAt: 'center', hidden: true, glow: 1 });
  FISSURES.forEach(([x, z], k) => out.push({ id: 'emb-fissure-' + k, at: [x, z], facing: 0.4 + k * 0.3, build: fissureBuild(k), footprint: 4, seatAt: 'center' }));
  return out;
}
