// The Sun Gate (docs/phase-9/dunes-design.md §4.2 A; light, G6 with G3 and G4). All positions are site-local
// (u east, v south, metres). The sun comes down the canyon through a notch: from the east in the morning,
// from the west in the afternoon; at night the gate sleeps. Teach: one mirror lights a glyph, which fills the
// basin and raises the second mirror. Combine: an ice lens in the basin bends the beam round the corner to
// the second mirror and its glyph, which wakes the spout. Twist: the spout's sandfall crosses the gate's
// eye: freeze it, shatter the column, and the eye stands clear long enough to send the light through.

import { GRAMMAR, traceBeam } from './grammar.js';

/** Where the site's origin lies in the world (x, z): the canyon floor below the west wall. */
export const SUN_SITE = [1484, 1056];

export const SG = {
  source: 62,            // m along the beam line, either side of the first mirror
  clearTime: 60,         // s the eye stands clear of a shattered column
  gustExtra: 30,         // s a Gust holds the fall open
  columnLife: 60,        // s a frozen column lasts before it runs again
  eyeHold: 2.5,          // s the eye must stay lit
  reach: 420,            // m the light runs on past the gate
  freezeR: 7,            // m: a Crystallize this near the basin or the fall takes it
};
export const STAGE = { TEACH: 0, COMBINE: 1, TWIST: 2, DONE: 3 };
export const LAYOUT = {
  m1: [0, 0], g1: [0, -16], basin: [0, 20], m2: [-16, 20], g2: [-16, 4], fall: [-16, 35], eye: [-16, 50],
};
export const EV = { STAGE: 1, LENS_MELT: 2, SHATTER: 4, EYE: 8 };
const TURN = Math.PI / 4;

export function createSunGate() {
  const L = LAYOUT;
  const part = (kind, p, r, o = {}) => ({ kind, x: p[0], z: p[1], r, lit: false, ...o });
  const m1 = part('mirror', L.m1, 2.2, { yaw: 0 }), m2 = part('mirror', L.m2, 2.2, { yaw: 0 });
  const g1 = part('glyph', L.g1, 2.4), g2 = part('glyph', L.g2, 2.4), eye = part('glyph', L.eye, 2.2);
  const lens = part('lens', L.basin, 2.4, { bend: -Math.PI / 2, on: false }), fall = part('block', L.fall, 2.4, { on: false });
  const parts = [m1, m2, g1, g2, eye, lens, fall];
  const site = { parts, hit: null };
  return {
    site, m1, m2, g1, g2, eye, lens, fall, path: new Float64Array(2 * (GRAMMAR.maxBounces + 3)), points: 0,
    stage: STAGE.TEACH, ev: 0, night: false,
    /** turns[k]: mirror k's turn, 0..7 */
    turns: [0, 0], lensLife: 0, frozen: 0, clear: 0, hold: 0,
    /** A mirror is struck: 45°. */
    turn(k) {
      if (k === 1 && this.stage < STAGE.COMBINE) return;
      this.turns[k] = (this.turns[k] + 1) % 8;
      (k ? m2 : m1).yaw = this.turns[k] * TURN;
    },
    /** A Crystallize at (u, v). */
    freeze(u, v) {
      const R = SG.freezeR;
      if (this.stage >= STAGE.COMBINE && Math.hypot(u - L.basin[0], v - L.basin[1]) < R) { lens.on = true; this.lensLife = GRAMMAR.lensMelt; }
      if (this.stage >= STAGE.TWIST && this.clear <= 0 && Math.hypot(u - L.fall[0], v - L.fall[1]) < R) this.frozen = SG.columnLife;
    },
    /** A strike on the frozen column. */
    strike() { if (this.frozen > 0) { this.frozen = 0; this.clear = SG.clearTime; this.ev |= EV.SHATTER; return true; } return false; },
    /** A Gust at the fall while it stands open. */
    gust() { if (this.clear > 0) this.clear = Math.min(SG.clearTime + SG.gustExtra, this.clear + SG.gustExtra); },
    /** Advance. sunX: the sun's east component; sunY: its height. Returns EV bits for this frame. */
    update(dt, sunX, sunY) {
      this.ev &= EV.SHATTER;
      if (this.frozen > 0) this.frozen = Math.max(0, this.frozen - dt);
      if (this.clear > 0) this.clear = Math.max(0, this.clear - dt);
      fall.on = this.stage === STAGE.TWIST && this.clear <= 0;
      this.night = sunY <= 0.02;
      if (this.night && this.stage !== STAGE.DONE) {
        this.points = 0;
        for (let i = 0; i < parts.length; i++) parts[i].lit = false;
      } else {
        const fromEast = sunX >= 0;
        if (this.stage === STAGE.DONE) { lens.on = true; this.lensLife = GRAMMAR.lensMelt; m1.yaw = (fromEast ? 1 : 7) * TURN; m2.yaw = TURN; }
        this.points = traceBeam(fromEast ? SG.source : -SG.source, 0, fromEast ? -1 : 1, 0, site, this.path);
      }
      // Solved, the light goes on through the gate, out of the canyon's mouth and across the erg.
      if (this.stage === STAGE.DONE && this.points >= 4) {
        const n = this.points, ex = this.path[n - 2], ez = this.path[n - 1];
        this.path[n] = ex; this.path[n + 1] = ez + SG.reach; this.points = n + 2;
      }
      if (lens.on && lens.lit) {
        this.lensLife -= dt;
        if (this.lensLife <= 0) { lens.on = false; this.ev |= EV.LENS_MELT; }
      }
      if (this.stage === STAGE.TEACH && g1.lit) { this.stage = STAGE.COMBINE; this.ev |= EV.STAGE; }
      else if (this.stage === STAGE.COMBINE && g2.lit) { this.stage = STAGE.TWIST; this.ev |= EV.STAGE; }
      else if (this.stage === STAGE.TWIST) {
        this.hold = eye.lit ? this.hold + dt : 0;
        if (this.hold >= SG.eyeHold) { this.stage = STAGE.DONE; this.ev |= EV.STAGE | EV.EYE; }
      }
      const ev = this.ev; this.ev = 0;
      return ev;
    },
    /** Back to a saved stage. A solved gate holds its mirrors on the sun, whichever side it stands. */
    restore(stage) {
      this.stage = stage;
          },
  };
}
