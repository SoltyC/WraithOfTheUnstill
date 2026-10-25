// Procedural attack poses (BRIEF §8.1, docs §11.2): from the weapon machine's phase and the
// attack's keyframes (defs.js) to the torso's twist and lean, where the hands reach, and each
// weapon's direction and roll — with anticipation (a slow pull back that eases to a stop), a
// fast accelerating strike, a follow-through that overshoots, and a recovery that settles to the
// carry pose. Targets are eased (not snapped) so a cancel, a chain or a swap never pops.
//
// Frame: torso-local, x right, y up from the pelvis, z forward. No allocation.

import { PHASE } from './machine.js';

const TAU = Math.PI * 2;
const PHI = 0, ELEV = 1, ROLL = 2, GX = 3, GY = 4, GZ = 5, TWIST = 6, LEAN = 7;

// Easings are written out where used (a double passed to a function that is not inlined is boxed; DECISIONS.md):
//   out(p) = 1 - (1 - p)^3   smooth(p) = p²(3 - 2p)   strike(p) = p^1.6 — slow off the mark, fast through the middle, hard at the end.
const STRIKE_POW = 1.6;

/** Mirror a keyframe for a left-handed attack. */
function mirror(o, a, i) {
  o[i + PHI] = -a[PHI]; o[i + ELEV] = a[ELEV]; o[i + ROLL] = -a[ROLL];
  o[i + GX] = -a[GX]; o[i + GY] = a[GY]; o[i + GZ] = a[GZ]; o[i + TWIST] = -a[TWIST]; o[i + LEAN] = a[LEAN];
}

export class WeaponPose {
  constructor() {
    /** Inputs (fields): the machine, the weapon (def), dt, and a tremble phase (s). */
    this.m = null; this.def = null; this.dt = 0.5 - 0.5; this.time = 0.5 - 0.5; this.q = 0.5 - 0.5;
    /** Smoothed pose per weapon slot (left, right): phi, elev, roll, gx, gy, gz. */
    this.slot = new Float64Array(12);
    this.twist = 0.5 - 0.5; this.lean = 0.5 - 0.5;
    /** Hand reach weights (L, R) and, per slot, how far the weapon has left its carry pose. */
    this.ikW = new Float64Array(2);
    /** Outputs for the Wraith: grip targets (L then R, torso-local) and the cloth's push. */
    this.ikT = new Float64Array(6);
    /** Per slot: unit direction (torso-local xyz), roll. */
    this.dir = new Float64Array(6); this.roll = new Float64Array(2);
    /** How far the weapon is in the attack pose (0 = carried, 1 = swinging): picks the hand it sits in. */
    this.engage = 0.5 - 0.5;
    this._from = new Float64Array(14);      // slot L, slot R, twist, lean at the phase's start
    this._tgt = new Float64Array(14);
    this._k = new Float64Array(24);          // scratch keyframes (wind, strike, end) in the leading hand's space
    this._o = new Float64Array(8);           // the leading hand's interpolated pose
    this._lastPhase = -1;
    this._wasStart = false;
  }

  /** Set every smoothed value to the carry pose of the current weapon (swap, spawn). */
  snapRest() {
    const d = this.def; if (d === null) return;
    this._rest(this._tgt);
    for (let i = 0; i < 14; i++) { this._from[i] = this._tgt[i]; if (i < 12) this.slot[i] = this._tgt[i]; }
    this.twist = 0; this.lean = 0; this.ikW[0] = 0; this.ikW[1] = 0; this.engage = 0;
    this._emit();
  }

  /** Carry pose into t[0..13]: slot L, slot R, twist, lean. Two-handed weapons keep theirs in the slot of the main hand. */
  _rest(t) {
    const r = this.def.restPose;
    for (let i = 0; i < 6; i++) { t[i] = r[i]; t[6 + i] = r[i]; }
    if (this.def.guard) { t[0] = -r[0]; t[3] = -r[3]; }       // the pair: the left mirrors the right
    t[12] = 0; t[13] = 0;
  }

  /** The world sweep angle (phi + twist) of the primary hand's weapon at progress `q` (field) of the active frames. */
  angle() {
    const a = this.m.attack; if (!a) return 0;
    const s = a.hand === 0 ? -1 : 1, e = Math.pow(this.q, STRIKE_POW);
    return s * ((a.wind[PHI] + a.wind[TWIST]) * (1 - e) + (a.strike[PHI] + a.strike[TWIST]) * e);
  }
  /** The second blade of a spin: the left one, half a turn behind. */
  angle2() {
    const a = this.m.attack; if (!a) return 0;
    const e = Math.pow(this.q, STRIKE_POW);
    return (a.wind[TWIST] - a.wind[PHI]) * (1 - e) + (a.strike[TWIST] - a.strike[PHI]) * e;
  }

  update() {
    const m = this.m, def = this.def, dt = this.dt, ph = m.phase, a = m.attack;
    const tg = this._tgt, from = this._from, K = this._k;
    this._rest(tg);
    let rate = 9, ikT = 0;
    const left = a !== null && a.hand === 0, both = a !== null && a.hand === 2;
    const pri = def.twoHanded ? 1 : (left ? 0 : 1);       // the slot (hand) that carries the swing
    if (m.startEvent) { for (let i = 0; i < 12; i++) from[i] = this.slot[i]; from[12] = this.twist; from[13] = this.lean; }
    if (a !== null && ph !== PHASE.IDLE) {
      const s = left ? 1 : 0;       // mirror when the left hand leads
      for (let k = 0; k < 3; k++) {
        const src = k === 0 ? a.wind : k === 1 ? a.strike : a.end;
        if (s === 1) mirror(K, src, k * 8); else for (let i = 0; i < 8; i++) K[k * 8 + i] = src[i];
      }
      // Interpolate the leading hand's pose into out[0..7].
      const o = this._o;
      let phaseRate = 20;
      if (ph === PHASE.WINDUP) {
        const pq = 1 - m.prog, e = 1 - pq * pq * pq;
        for (let i = 0; i < 6; i++) o[i] = from[pri * 6 + i] + (K[i] - from[pri * 6 + i]) * e;
        o[TWIST] = from[12] + (K[TWIST] - from[12]) * e; o[LEAN] = from[13] + (K[LEAN] - from[13]) * e;
        ikT = 1; phaseRate = 20;
      } else if (ph === PHASE.LOADED || ph === PHASE.CHARGE) {
        // Held at the cocked pose; a charge draws further back and trembles with the effort.
        const c = ph === PHASE.CHARGE ? Math.min(1, m.chargeT / def.heavy.chargeMax) : 0;
        const rq = Math.min(1, m.chargeT / 0.3), rise = ph === PHASE.CHARGE ? rq * rq * (3 - 2 * rq) : 1;
        for (let i = 0; i < 8; i++) {
          const f = i < 6 ? from[pri * 6 + i] : from[12 + i - 6];
          o[i] = f + (K[i] - f) * rise;
        }
        const trem = Math.sin(this.time * 55) * 0.012 * c;
        o[ELEV] += 0.12 * c + trem; o[LEAN] -= 0.07 * c; o[GY] += 0.02 * c;
        ikT = 1; phaseRate = ph === PHASE.CHARGE ? 12 : 20;
      } else if (ph === PHASE.ACTIVE) {
        const e = Math.pow(m.prog, STRIKE_POW);
        for (let i = 0; i < 8; i++) o[i] = K[i] + (K[8 + i] - K[i]) * e;
        ikT = 1; phaseRate = 80;
      } else {   // RECOVER: through the follow-through, then settling back toward the carry pose
        const eq = Math.min(1, m.prog * 2.2), e = eq * eq * (3 - 2 * eq);
        for (let i = 0; i < 8; i++) o[i] = K[8 + i] + (K[16 + i] - K[8 + i]) * e;
        const sq = Math.max(0, (m.prog - 0.55) / 0.45), settle = sq * sq * (3 - 2 * sq);
        ikT = 1 - 0.55 * settle; phaseRate = 14;
        // Back to the carry pose only if nothing is chained: a kept press holds the pose for the next windup.
        if (m.bufT <= 0) {
          const t0 = this._tgt;
          for (let i = 0; i < 6; i++) o[i] += (t0[pri * 6 + i] - o[i]) * settle * 0.7;
          o[TWIST] -= o[TWIST] * settle * 0.8; o[LEAN] -= o[LEAN] * settle * 0.8;
        }
        const w = o[TWIST]; if (Math.abs(w) > Math.PI) o[TWIST] = w - Math.round(w / TAU) * TAU;
      }
      for (let i = 0; i < 6; i++) tg[pri * 6 + i] = o[i];
      tg[12] = o[TWIST]; tg[13] = o[LEAN];
      rate = phaseRate;
      // The other hand: a pair's guard (mirrored to the hand it is in), or both blades on a crossing finisher.
      if (!def.twoHanded) {
        const oth = 1 - pri;
        if (both) {
          // Mirror of the leading pose (the blades cross), with the torso twist left alone.
          tg[0] = -o[PHI]; tg[1] = o[ELEV]; tg[2] = -o[ROLL]; tg[3] = -o[GX]; tg[4] = o[GY]; tg[5] = o[GZ];
          // `pri` is 1 for both (a.hand = 2), so the slot 0 is the mirror.
        } else {
          const gd = def.guard, sg = oth === 0 ? -1 : 1;
          tg[oth * 6] = gd[PHI] * sg; tg[oth * 6 + 1] = gd[ELEV]; tg[oth * 6 + 2] = gd[ROLL] * sg;
          tg[oth * 6 + 3] = gd[GX] * sg; tg[oth * 6 + 4] = gd[GY]; tg[oth * 6 + 5] = gd[GZ];
        }
      }
    }
    // Ease the smoothed pose toward the target (a fast rate in the strike so the arc is the keyframes').
    const k = 1 - Math.exp(-rate * dt);
    for (let i = 0; i < 12; i++) this.slot[i] += (tg[i] - this.slot[i]) * k;
    if (ph === PHASE.IDLE || ph === PHASE.RECOVER) { if (Math.abs(this.twist) > Math.PI) this.twist -= Math.round(this.twist / TAU) * TAU; }
    this.twist += (tg[12] - this.twist) * k; this.lean += (tg[13] - this.lean) * k;
    // Hands: reaching for the weapon while a swing is on, easing off in the carry.
    const up = 1 - Math.exp(-16 * dt), down = 1 - Math.exp(-6 * dt);
    const wantR = ikT, wantL = ikT;
    this.ikW[1] += (wantR - this.ikW[1]) * (wantR > this.ikW[1] ? up : down);
    this.ikW[0] += (wantL - this.ikW[0]) * (wantL > this.ikW[0] ? up : down);
    this.engage = this.ikW[1];
    this._lastPhase = ph;
    this._emit();
  }

  /** Smoothed pose → hand targets and weapon directions. */
  _emit() {
    const def = this.def, S = this.slot, d = this.dir, T = this.ikT;
    for (let k = 0; k < 2; k++) {
      const phi = S[k * 6], e = S[k * 6 + 1], ce = Math.cos(e);
      d[k * 3] = Math.sin(phi) * ce; d[k * 3 + 1] = Math.sin(e); d[k * 3 + 2] = Math.cos(phi) * ce;
      this.roll[k] = S[k * 6 + 2];
    }
    if (def.twoHanded) {
      // Right hand at the grip, the left up the shaft.
      T[3] = S[9]; T[4] = S[10]; T[5] = S[11];
      T[0] = S[9] + d[3] * def.support - 0.04; T[1] = S[10] + d[4] * def.support; T[2] = S[11] + d[5] * def.support;
    } else {
      T[0] = S[3]; T[1] = S[4]; T[2] = S[5]; T[3] = S[9]; T[4] = S[10]; T[5] = S[11];
    }
  }
}
