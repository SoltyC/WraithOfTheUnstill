// The snow-surf wake (BRIEF §9.3): every frame the Wraith carves, a plough brush is swept along
// the path it just travelled — a deep groove with high berms, heavier on the outside of the turn
// — into the terrain state (persistent, healing slowly, visible from across the field once it
// has scrolled into the coarse pages), and a plume of spray is thrown from the outside berm.
// Fixed scratch; brush fields on the terrain state, particles through an emit() sink.
// Whole-path browser allocation measurement remains a separate gate.

import { sandSurfTuning } from './sandSurfTuning.js';
import { sandSurfWakeTuning } from './sandSurfWakeTuning.js';
import { BRUSH } from '../shaders/terrainState.wgsl.js';

export const wakeTuning = {
  halfWidth: 0.4,       // m at rest; widens with speed
  widthPerSpeed: 0.012, // m per m/s
  depth: 0.17,          // m; deepens with speed
  depthPerSpeed: 0.006,
  maxDepth: 0.32,
  berm: 1.15,           // berm height as a fraction of the depth (mass thrown up)
  bias: 0.9,            // outside-of-the-turn weighting at full grip
  compaction: 0.9,
  sprayPerSpeed: 0.55,  // particles per frame per m/s
  sprayPerLat: 0.7,     // particles per frame per m/s² of carve
  maxSpray: 26,
};

/**
 * @param {{ bx: number, bz: number, bdx: number, bdz: number, bl: number, bw: number, bd: number, bc: number,
 *           bk: number, bwet: number, bbias: number, bberm: number, stamp: () => void }} ts  terrain state
 * @param {{ ex: number, ey: number, ez: number, evx: number, evy: number, evz: number, esize: number, emit: () => void }} fx
 */
export function createSurfWake(ts, fx) {
  const last = new Float64Array(2).fill(NaN), seed = new Uint32Array([7]);
  const rnd = () => { seed[0] = (seed[0] * 1664525 + 1013904223) >>> 0; return seed[0] / 4294967296; };
  return {
    /** Owner fields: the controller's surf model, foot position, grounded. */
    surf: null, x: 0.5, y: 0.5, z: 0.5, grounded: false, enabled: true,
    /** Flow 0..3 (game/flow.js, eased): the wake grows wider, deeper and throws more spray. */
    flow: 0.5 - 0.5,
    update() {
      const s = this.surf;
      if (!this.enabled || !s || !s.active || !this.grounded || s.speed < 1) { last[0] = NaN; return; }
      const sand = s.tuning === sandSurfTuning;
      const T = sand ? sandSurfWakeTuning : wakeTuning;
      if (Number.isNaN(last[0])) { last[0] = this.x; last[1] = this.z; return; }
      const dx = this.x - last[0], dz = this.z - last[1], len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.02) return;
      if (len > 4) { last[0] = this.x; last[1] = this.z; return; }              // teleport, not a carve
      const sp = s.speed, grip = Math.min(1, Math.abs(s.latAccel) / (s.tuning ? s.tuning.latMax : 15));
      // Groove along the segment just travelled; berms heavier on the outside of the turn
      // (turning right → the outside is left → negative bias).
      ts.bx = (this.x + last[0]) * 0.5; ts.bz = (this.z + last[1]) * 0.5; ts.bdx = dx / len; ts.bdz = dz / len;
      ts.bl = len * 0.5;
      const fk = this.flow;
      ts.bw = (T.halfWidth + T.widthPerSpeed * sp) * (1 + 0.1 * fk);
      ts.bd = Math.min(T.maxDepth, T.depth + T.depthPerSpeed * sp) * s.blend * (1 + 0.08 * fk);
      // Keep the sand capsule's rounded front berm behind the feet's normal stencil.
      // Otherwise collision reads the fresh wake lip as an uphill slope every frame.
      // The full groove/berm still collides when crossed; snow placement is unchanged.
      if (sand) {
        const trail = ts.bw * 1.65 + 0.3;
        ts.bx -= ts.bdx * trail; ts.bz -= ts.bdz * trail;
      }
      ts.bc = T.compaction;
      ts.bk = BRUSH.PLOUGH; ts.bwet = 0; ts.bbias = -Math.sign(s.latAccel) * grip * T.bias; ts.bberm = T.berm;
      ts.stamp();
      last[0] = this.x; last[1] = this.z;
      // Spray: thrown up and out of the outside berm behind the feet, carried a little forward
      // (air drag lays it back into a trailing plume).
      const hx = dx / len, hz = dz / len, rx = hz, rz = -hx;
      // The crest: compressed snow boiling up right under and around the feet.
      for (let k = 0; k < Math.round(6 * s.blend); k++) {
        const side = rnd() * 2 - 1;
        fx.ex = this.x + hx * (0.1 + 0.3 * rnd()) + rx * side * 0.35; fx.ez = this.z + hz * (0.1 + 0.3 * rnd()) + rz * side * 0.35;
        fx.ey = this.y + 0.02;
        fx.evx = hx * sp * (0.6 + 0.3 * rnd()) + rx * side * 0.8; fx.evz = hz * sp * (0.6 + 0.3 * rnd()) + rz * side * 0.8;
        fx.evy = 0.4 + 0.8 * rnd();
        fx.esize = 0.07 + 0.08 * rnd();
        fx.emit();
      }
      const out = s.latAccel > 0.5 ? -1 : s.latAccel < -0.5 ? 1 : 0;
      const n = Math.min(T.maxSpray * (1 + 0.25 * fk), Math.round(sp * T.sprayPerSpeed + Math.abs(s.latAccel) * T.sprayPerLat) * (1 + 0.2 * fk)) * s.blend;
      for (let k = 0; k < n; k++) {
        const side = out !== 0 ? out * (0.7 + 0.3 * rnd()) : (rnd() < 0.5 ? -1 : 1);
        const back = 0.2 + 0.5 * rnd();
        fx.ex = this.x - hx * back + rx * side * ts.bw * (0.9 + 0.4 * rnd());
        fx.ez = this.z - hz * back + rz * side * ts.bw * (0.9 + 0.4 * rnd());
        fx.ey = this.y + 0.05;
        const throwOut = 1 + Math.abs(s.latAccel) * 0.22 + 1.2 * rnd();
        const fwd = sp * (0.2 + 0.2 * rnd());
        fx.evx = rx * side * throwOut + hx * fwd;
        fx.evz = rz * side * throwOut + hz * fwd;
        fx.evy = 1.2 + sp * 0.11 + 2.2 * rnd() * (0.4 + grip);
        fx.esize = 0.05 + 0.11 * rnd() * (0.5 + 0.5 * grip);
        fx.emit();
      }
    },
  };
}
