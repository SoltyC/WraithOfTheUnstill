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
  const surface = ts.collision ? ts.collision.view : null;
  const last = new Float64Array(2).fill(NaN), seed = new Uint32Array([7]);
  const rnd = () => { seed[0] = (seed[0] * 1664525 + 1013904223) >>> 0; return seed[0] / 4294967296; };
  let wasGrounded = false, streamT = 0;
  return {
    /** Owner fields: the controller's surf model, foot position, grounded. */
    surf: null, x: 0.5, y: 0.5, z: 0.5, grounded: false, enabled: true,
    /** Flow 0..3 (game/flow.js, eased): the wake grows wider, deeper and throws more spray. */
    flow: 0.5 - 0.5, wet: 0, frozen: 0,
    /** Out: how hard the slip face is avalanching under the carve, 0..1 (eased; the sound's boom). */
    avalanche: 0,
    /** Owner field: s since the last update (the avalanche's easing and the crest stream's timing). */
    dt: 1 / 60,
    update() {
      const s = this.surf;
      // Leaving a crest at speed on sand: a stream of sand pours off it behind the Wraith for a moment.
      if (s && s.active && !this.grounded && wasGrounded && s.tuning === sandSurfTuning && s.speed > 7 && this.wet < 0.5) streamT = 0.45;
      wasGrounded = this.grounded;
      if (streamT > 0 && s) {
        streamT -= this.dt;
        const hx = Math.sin(s.heading), hz = Math.cos(s.heading);
        for (let k = 0; k < 7; k++) {
          const back = 0.3 + 1.2 * rnd(), side = (rnd() - 0.5) * 1.2;
          fx.ex = this.x - hx * back + hz * side; fx.ez = this.z - hz * back - hx * side; fx.ey = this.y - 0.1 - 0.3 * rnd();
          fx.evx = hx * s.speed * (0.25 + 0.2 * rnd()) + (rnd() - 0.5) * 0.8; fx.evz = hz * s.speed * (0.25 + 0.2 * rnd()) + (rnd() - 0.5) * 0.8;
          fx.evy = 0.6 + 1.4 * rnd(); fx.esize = 0.06 + 0.1 * rnd();
          fx.emit();
        }
      }
      // The avalanche level eases down whenever no slip face is being carved.
      this.avalanche = Math.max(0, this.avalanche - this.dt * 0.5);
      if (!this.enabled || !s || !s.active || !this.grounded || s.speed < 1) { this.frozen = 0; last[0] = NaN; return; }
      const sand = s.tuning === sandSurfTuning;
      if (!sand) this.frozen = 0;
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
      let frozen = 0;
      if (sand && surface !== null) {
        surface.qx = ts.bx; surface.qz = ts.bz;
        if (surface.sample()) frozen = surface.frozen;
      }
      this.frozen = frozen;
      const wet = sand ? Math.max(0, Math.min(1, this.wet)) : 0;
      const loose = sand ? (1 - wet) * (1 - wet) * Math.max(0, 1 - frozen * 2) : 1;
      // Wet sand cuts a compact, shallow lane; a frozen crust takes no cut or loose spray.
      ts.bd *= (1 - .45 * wet) * (frozen > .5 ? 0 : 1);
      if (ts.bd > 0) {
        ts.bc = T.compaction;
        ts.bk = BRUSH.PLOUGH; ts.bwet = 0; ts.bbias = -Math.sign(s.latAccel) * grip * T.bias; ts.bberm = T.berm;
        ts.stamp();
      }
      last[0] = this.x; last[1] = this.z;
      // Spray: thrown up and out of the outside berm behind the feet, carried a little forward
      // (air drag lays it back into a trailing plume).
      const hx = dx / len, hz = dz / len, rx = hz, rz = -hx;
      // The crest: compressed snow boiling up right under and around the feet.
      for (let k = 0; k < Math.round(6 * s.blend * loose); k++) {
        const side = rnd() * 2 - 1;
        fx.ex = this.x + hx * (0.1 + 0.3 * rnd()) + rx * side * 0.35; fx.ez = this.z + hz * (0.1 + 0.3 * rnd()) + rz * side * 0.35;
        fx.ey = this.y + 0.02;
        fx.evx = hx * sp * (0.6 + 0.3 * rnd()) + rx * side * 0.8; fx.evz = hz * sp * (0.6 + 0.3 * rnd()) + rz * side * 0.8;
        fx.evy = 0.4 + 0.8 * rnd();
        fx.esize = 0.07 + 0.08 * rnd();
        fx.emit();
      }
      // Sheets: carving a slip face, the berm on the downhill side cannot hold and pours away down the
      // face as a curtain of sand. Particles only — the terrain's own relaxation (D2) moves the mass —
      // so the sheet shows the slump the solver is making, never extra sand.
      const steep = Math.sqrt(s.nx * s.nx + s.nz * s.nz);
      let sheet = 0;
      if (sand && steep > 0.42 && sp > 4 && loose > 0.3) {
        const k = Math.min(1, (steep - 0.42) / 0.25) * Math.min(1, (sp - 4) / 10) * loose;
        this.avalanche = Math.min(1, this.avalanche + this.dt * 2.5 * k);
        const dhx = s.nx / steep, dhz = s.nz / steep;                    // downhill
        const sideDown = (rx * dhx + rz * dhz) >= 0 ? 1 : -1;           // the berm on the downhill side
        sheet = Math.round(14 * k);
        for (let q = 0; q < sheet; q++) {
          const back = 0.3 + 2.2 * rnd();
          fx.ex = this.x - hx * back + rx * sideDown * ts.bw * (1.0 + 0.6 * rnd());
          fx.ez = this.z - hz * back + rz * sideDown * ts.bw * (1.0 + 0.6 * rnd());
          fx.ey = this.y + 0.05 + 0.1 * rnd();
          const run = 1.5 + 3.5 * rnd() * k;                               // slides down the face, fanning
          fx.evx = dhx * run + (rnd() - 0.5) * 0.9 + hx * sp * 0.08;
          fx.evz = dhz * run + (rnd() - 0.5) * 0.9 + hz * sp * 0.08;
          fx.evy = 0.15 + 0.5 * rnd();
          fx.esize = 0.08 + 0.12 * rnd();
          fx.emit();
        }
      }
      const out = s.latAccel > 0.5 ? -1 : s.latAccel < -0.5 ? 1 : 0;
      const n = Math.min(T.maxSpray * (1 + 0.25 * fk), Math.round(sp * T.sprayPerSpeed + Math.abs(s.latAccel) * T.sprayPerLat) * (1 + 0.2 * fk)) * s.blend;
      // (The pouring downhill berm takes its particles from the spray: the frame's total stays in the pool.)
      for (let k = 0; k < n * loose - sheet; k++) {
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
