// Collision for the rocks (user request 2026-10-09): the boulders and outcrops are drawn on the GPU
// from a deterministic placement (render/rocks.js); the same placement, run on the CPU round the
// Wraith whenever it crosses a few metres, gives each nearby rock an ellipse and a height in the
// controller's solids (world/solids.js). Tall rocks block; low ones are stepped onto. The seat
// follows the vertex shader's (the lowest of the centre and four samples, eased), and rocks the
// shader drops (off the frost steppe, on steep ground) are dropped here too. Tree trunks join them
// (render/trees.js trunksNear): tall circles round the root.

import { rocksNear } from '../render/rocks.js';

const RADIUS = 26, CELL = 4;

/** @param {any} g  shared boot context */
export function addRockSolidSystem(g) {
  const { loop, controller, ground, solids, streamer, rocks } = g;
  if (!solids) return;
  const rk = solids.rocks, MAX = rk.x.length;
  let cx = NaN, cz = NaN, pending = false;

  function frostWeight(x, z) {
    const A = streamer.biomeA; if (!A) return 1;
    const i = Math.min(1023, Math.max(0, Math.floor((x + 4096) / 8))), j = Math.min(1023, Math.max(0, Math.floor((4096 - z) / 8))), o = (j * 1024 + i) * 4;
    return A[o] / Math.max(A[o] + A[o + 1] + A[o + 2] + A[o + 3], 0.05 * 255);
  }
  function add(x, z, yaw, rx, rz, up, size) {
    if (rk.n >= MAX) return;
    ground.qx = x; ground.qz = z;
    if (!ground.covers()) { pending = true; return; }
    ground.sample(); const g0 = ground.h, r = size * 0.9;
    let gmin = g0;
    for (let k = 0; k < 4; k++) { ground.qx = x + (k === 0 ? r : k === 1 ? -r : 0); ground.qz = z + (k === 2 ? r : k === 3 ? -r : 0); ground.sample(); gmin = Math.min(gmin, ground.h); }
    if ((g0 - gmin) / r >= 0.9 || frostWeight(x, z) <= 0.55) return;
    const seat = Math.min(g0, gmin + (g0 - gmin) * 0.3);
    if (up < 0.2) return;                 // barely proud of the snow: nothing to stand on or bump
    const n = rk.n++;
    rk.x[n] = x; rk.z[n] = z; rk.c[n] = Math.cos(yaw); rk.s[n] = Math.sin(yaw);
    rk.rx[n] = rx; rk.rz[n] = rz; rk.y0[n] = seat - 0.3; rk.y1[n] = seat + up;
  }
  // Tree trunks (Phase 8): tall circles the Wraith walks round, seated at the root.
  function addTrunk(x, z, r) {
    if (rk.n >= MAX) return;
    ground.qx = x; ground.qz = z;
    if (!ground.covers()) { pending = true; return; }
    ground.sample();
    const n = rk.n++;
    rk.x[n] = x; rk.z[n] = z; rk.c[n] = 1; rk.s[n] = 0;
    rk.rx[n] = r; rk.rz[n] = r; rk.y0[n] = ground.h - 0.5; rk.y1[n] = ground.h + 12;
  }
  function rebuild(px, pz) {
    rk.n = 0; pending = false;
    rocksNear(px, pz, RADIUS, rocks.exclusions, add);
    if (g.trees) g.trees.trunksNear(px, pz, RADIUS, addTrunk);
  }

  loop.add({ name: 'rockSolids', update: () => {
    const p = controller.pos, nx = Math.floor(p.x / CELL), nz = Math.floor(p.z / CELL);
    if (nx === cx && nz === cz && !pending) return;
    cx = nx; cz = nz;
    rebuild(p.x, p.z);
  } });
}
