// The rock clearance map (docs/realism-plan.md A1): the sculpted boulders and outcrops are placed on the
// CPU (render/outcrops.js), but the grass and the ground cover are built on the GPU from world cells and
// knew nothing of them, so the meadow grew straight through every rock. Each time the camera moves a
// few metres, the rocks within reach are stamped into a toroidal R8 map round it (CLEAR_N² cells of
// CLEAR_CELL m, addressed by world position modulo the period: no box uniform to keep in step, which
// snapshot rendering would freeze): 1 on the rock's footprint, easing to 0 a little past its foot.
// shaders/atmoMaterial.wgsl.js clearAt() reads it in the grass and ground cover vertex stages.

import { CLEAR_N, CLEAR_CELL } from '../shaders/atmoMaterial.wgsl.js';

const MOVE = 6;                                   // re-stamp after this much travel (m)
const REACH = CLEAR_N * CLEAR_CELL * 0.46;        // the shader fades the map out by here
const FRINGE = 0.7;                               // the short grass ring round a rock's foot (m)

/** @param {any} atmo  holds clearTex @param {any[]} sources  each has near(x, z, r, cb(x, z, rx, rz, yaw)) */
export function createClearance(atmo, sources) {
  const data = new Uint8Array(CLEAR_N * CLEAR_N);
  const M = CLEAR_N - 1;                          // CLEAR_N is a power of two: & M wraps
  let lx = 1e9, lz = 1e9;
  function stamp(x, z, rx, rz, yaw) {
    // The collision ellipse is drawn a little inside the visible rock; the cleared core matches the
    // rock, the fringe runs FRINGE past it.
    const ax = rx * 1.15, az = rz * 1.15, r = Math.max(ax, az) + FRINGE;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const i0 = Math.floor((x - r) / CLEAR_CELL), i1 = Math.ceil((x + r) / CLEAR_CELL);
    const j0 = Math.floor((z - r) / CLEAR_CELL), j1 = Math.ceil((z + r) / CLEAR_CELL);
    for (let j = j0; j <= j1; j++) {
      const pz = (j + 0.5) * CLEAR_CELL - z, row = (j & M) * CLEAR_N;
      for (let i = i0; i <= i1; i++) {
        const px = (i + 0.5) * CLEAR_CELL - x;
        const u = (px * c + pz * s) / ax, v = (-px * s + pz * c) / az;
        const d = Math.sqrt(u * u + v * v);                       // 1 on the ellipse
        const out = (d - 1) * Math.min(ax, az);                   // metres past the edge (approx.)
        const val = out <= 0 ? 255 : out >= FRINGE ? 0 : Math.round(255 * (1 - out / FRINGE) * 0.55);
        const k = row + (i & M);
        if (val > data[k]) data[k] = val;
      }
    }
  }
  return {
    /** Another source (systems/releaseLines.js: a running stream's bed); invalidate() re-stamps on the next update. */
    addSource(src) { sources.push(src); lx = 1e9; },
    invalidate() { lx = 1e9; },
    update(cx, cz, force = false) {
      if (!force && (cx - lx) ** 2 + (cz - lz) ** 2 < MOVE * MOVE) return;
      lx = cx; lz = cz;
      data.fill(0);
      for (const src of sources) if (src) src.near(cx, cz, REACH, stamp);
      atmo.clearTex.update(data);
    },
  };
}
