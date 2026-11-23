// Tall buildings (the destruction system's tall variants, user 2026-11-23: "tall building variants with huge amounts of
// rubble"): built so that they come down the way tall masonry does (world/fracture.js groups by call): each storey's walls
// laid in their own bands — a storey can lean and go over as a slab while the one under it still stands — the floors and
// the roof timbers their own pieces, so a tower topples whole, folds at a storey, or drops in on itself.
//   towerHouse   the Sow's tower-houses: a square stone tower of three or four storeys over the farmhouse, slit windows
//                each floor, a timber gallery under a pyramid roof of stone slates — grain and the family's goods kept dry
//   windingTower Cinderhold's engine tower over the shaft: a tall square stone tower, round-arched openings, a chimney stack
// All in world metres (x, z) at a base height y (site-local), turned by yaw.

import { MAT, NS } from './architecture.js';
import { layWall } from './masonry.js';

/** A wall band from u0 to u1 along a side (side 0..3 round the tower), y0 to y1, with a window gap (u, half-width) or none. */
function band(b, T, side, y0, y1, gap, seed) {
  const { x, z, yaw, hw, hd, th, mat } = T;
  const ya = yaw + side * Math.PI / 2, half = side % 2 ? hd : hw, out = side % 2 ? hw : hd;
  const cy = Math.cos(ya), sy = Math.sin(ya);
  // (The wall's centre line, out from the tower's centre along the side's normal.)
  const cx = x + sy * (out - th / 2), cz = z + cy * (out - th / 2);
  const run = (u0, u1, ya0, ya1, s) => {
    if (u1 - u0 < 0.25) return;
    const um = (u0 + u1) / 2, wx = cx + cy * um, wz = cz - sy * um;
    layWall(b, wx, wz, ya0, ya1, (u1 - u0) / 2, th / 2, ya, mat, s, { course: 0.42, blockLen: 0.85 });
  };
  // (Corners: the long sides run the full width, the short sides between them.)
  const L = side % 2 ? half - th : half;
  if (!gap) { run(-L, L, y0, y1, seed); return; }
  const [gu, gw, gy0, gy1] = gap;
  run(-L, gu - gw, y0, y1, seed);
  run(gu + gw, L, y0, y1, seed + 1);
  run(gu - gw, gu + gw, y0, gy0, seed + 2);
  run(gu - gw, gu + gw, gy1, y1, seed + 3);
}

/** A square stone tower-house: floors (storeys of `storey` m), slit windows, a timber gallery, a stone-slate pyramid roof. */
export function towerHouse(b, x, z, y, yaw, opt = {}) { return b.struct(() => towerHouseIn(b, x, z, y, yaw, opt)); }
function towerHouseIn(b, x, z, y, yaw, { hw = 3.2, hd = 3.2, storeys = 3, storey = 3.4, seed = 1, mat = MAT.STONE } = {}) {
  const T = { x, z, yaw, hw, hd, th: 0.7, mat };
  const top = y + storeys * storey;
  // A battered plinth it stands on.
  b.frustum(x, z, y - 2.5, y + 0.6, hw + 0.7, hd + 0.7, hw + 0.15, hd + 0.15, yaw, mat, seed);
  for (let k = 0; k < storeys; k++) {
    const y0 = y + 0.6 + k * storey - (k ? 0 : 0), y1 = y + 0.6 + (k + 1) * storey;
    for (let side = 0; side < 4; side++) {
      // The door on the ground floor's front; a slit window on each other face of each storey, staggered.
      const gu = ((seed * 7 + k * 3 + side) % 3 - 1) * 0.9;
      const gap = k === 0 && side === 0 ? [0, 0.6, y0, y0 + 2.1] : side === 2 && k === 0 ? null : [gu, k === storeys - 1 ? 0.45 : 0.18, y0 + 1.0, y0 + (k === storeys - 1 ? 2.3 : 2.0)];
      band(b, T, side, y0, y1, gap, seed * 31 + k * 8 + side);
    }
    // The floor over it: joists through the walls (their ends show), boards.
    if (k < storeys - 1) {
      b.box(x, z, y1 - 0.22, y1, hw - 0.7, hd - 0.7, yaw, MAT.PLANK, seed + 200 + k, { solid: false, ...NS });
      for (let j = -2; j <= 2; j++) {
        const u = j * (hw - 0.9) / 2.2, wx = x + Math.cos(yaw) * u, wz = z - Math.sin(yaw) * u;
        b.box(wx, wz, y1 - 0.42, y1 - 0.2, 0.11, hd + 0.18, yaw, MAT.WOOD, seed + 210 + k * 7 + j, { solid: false, ...NS });
      }
    }
  }
  // The gallery: a timber hoarding round the top on brackets, then the roof.
  const gy = top + 0.6;
  b.box(x, z, gy - 0.18, gy, hw + 0.6, hd + 0.6, yaw, MAT.PLANK, seed + 300, { solid: false, ...NS });
  for (let side = 0; side < 4; side++) {
    const ya = yaw + side * Math.PI / 2, out = (side % 2 ? hw : hd) + 0.5, len = (side % 2 ? hd : hw) + 0.6;
    const cx = x + Math.sin(ya) * out, cz = z + Math.cos(ya) * out;
    b.box(cx, cz, gy, gy + 1.05, len, 0.05, ya, MAT.PLANK, seed + 310 + side, { solid: false, ...NS });
    for (let j = -2; j <= 2; j++) { const u = j * len / 2.2; b.box(cx + Math.cos(ya) * u, cz - Math.sin(ya) * u, gy - 0.7, gy - 0.18, 0.08, 0.4, ya, MAT.WOOD, seed + 320 + side * 5 + j, { solid: false, ...NS }); }
  }
  // The roof: four slopes of stone slate to a point, a finial.
  const ry = gy + 1.05, peak = ry + Math.max(hw, hd) * 1.15, R = Math.hypot(hw, hd) + 0.9;
  b.cone(x, z, ry, peak, R, 4, MAT.SLATE, seed + 400, { solid: false });
  b.drum(x, z, peak - 0.3, peak + 0.5, 0.12, 0.04, 6, MAT.METAL, seed + 401, { solid: false });
  b.blockers.push({ site: b.site, kind: 'box', x, z, hx: hw, hz: hd, cos: Math.cos(yaw), sin: Math.sin(yaw), y0: y, y1: top });
  return top;
}

/** Cinderhold's engine tower: tall, square, round-headed openings high up, a chimney stack beside. */
export function windingTower(b, x, z, y, yaw, opt = {}) { return b.struct(() => windingTowerIn(b, x, z, y, yaw, opt)); }
function windingTowerIn(b, x, z, y, yaw, { hw = 2.8, hd = 2.8, h = 16, seed = 1 } = {}) {
  const T = { x, z, yaw, hw, hd, th: 0.75, mat: MAT.BASALT };
  b.frustum(x, z, y - 3, y + 0.5, hw + 0.8, hd + 0.8, hw + 0.2, hd + 0.2, yaw, MAT.BASALT, seed);
  const bands = 5, bh = (h - 0.5) / bands;
  for (let k = 0; k < bands; k++) {
    const y0 = y + 0.5 + k * bh, y1 = y0 + bh;
    for (let side = 0; side < 4; side++) {
      const gap = k === 0 && side === 1 ? [0, 0.8, y0, y0 + 2.6] : k === bands - 1 ? [0, 0.75, y0 + 0.6, y1 - 0.3] : k === 2 && side % 2 === 0 ? [0, 0.3, y0 + 0.8, y0 + 2.2] : null;
      band(b, T, side, y0, y1, gap, seed * 17 + k * 6 + side);
    }
  }
  // The flat top: a lead-covered deck on beams, a parapet course.
  const top = y + h;
  b.box(x, z, top - 0.3, top, hw - 0.4, hd - 0.4, yaw, MAT.IRON, seed + 90, { solid: false, ...NS });
  // The chimney stack at one corner, taller still.
  const cx = x + Math.cos(yaw) * (hw + 1.2) + Math.sin(yaw) * (hd - 0.8), cz = z - Math.sin(yaw) * (hw + 1.2) + Math.cos(yaw) * (hd - 0.8);
  for (let k = 0; k < 4; k++) b.drum(cx, cz, y + k * (h + 5) / 4, y + (k + 1) * (h + 5) / 4, 1.05 - k * 0.12, 0.93 - k * 0.12, 14, MAT.BASALT, seed + 100 + k);
  b.blockers.push({ site: b.site, kind: 'box', x, z, hx: hw, hz: hd, cos: Math.cos(yaw), sin: Math.sin(yaw), y0: y, y1: top });
  b.blockers.push({ site: b.site, kind: 'circle', x: cx, z: cz, r: 1.1, y0: y, y1: y + h + 5 });
  return top;
}
