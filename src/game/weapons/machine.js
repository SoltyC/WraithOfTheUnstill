// The weapon state machine (docs §11.1): one button, light taps and held heavies.
//
//   IDLE → WINDUP → [LOADED] → ACTIVE → RECOVER → (next WINDUP | IDLE)
//                      └ held ≥ holdAt → CHARGE → (release) → WINDUP(heavy) → ACTIVE → RECOVER
//
// A press starts the first hit's windup at once (the pull-back is the response); if the button is
// still down when it ends the weapon waits LOADED until release, or turns into a charge once it has
// been held `holdAt`. A press while recovering is kept (`buffer` s) and chains into the next hit
// once the recovery passes its link point. A dodge cancels a recovery, a charge or a waiting
// swing at once; pressed during a windup or the active frames it is kept and fires as the recovery
// begins. Pure logic over fields, no allocation; hit windows and poses read phase / t / prog.

import { weaponFeel } from './defs.js';

export const PHASE = { IDLE: 0, WINDUP: 1, LOADED: 2, ACTIVE: 3, RECOVER: 4, CHARGE: 5 };

export class WeaponMachine {
  constructor() {
    /** Inputs (fields), set each frame by the owner. */
    this.def = null; this.down = false; this.pressed = false; this.dodgePressed = false; this.blocked = false; this.dt = 0.5 - 0.5;
    /** State. */
    this.phase = PHASE.IDLE; this.t = 0.5 - 0.5; this.combo = 0; this.heavy = false; this.chargeT = 0.5 - 0.5; this.holdT = 0.5 - 0.5;
    this.bufT = 0.5 - 0.5; this.dodgeBuf = 0.5 - 0.5;
    /** The attack now playing (a def entry) or null. */
    this.attack = null;
    /** Charge power 1..1+power of the heavy being released. */
    this.power = 1.5 - 0.5;
    /** Events (valid for the frame): the active frames began, the swing ended, a dodge may go now. */
    this.activeEvent = false; this.endEvent = false; this.dodgeNow = false; this.startEvent = false;
    /** Progress 0..1 through the current phase (windup / active / recover). */
    this.prog = 0.5 - 0.5;
    /** Hits chained since the combo began (the combo never loops). */
    this.chained = 0;
  }

  /** Drop everything (weapon swap, death, a scripted moment). */
  reset() {
    this.phase = PHASE.IDLE; this.t = 0; this.combo = 0; this.heavy = false; this.chargeT = 0; this.holdT = 0; this.bufT = 0; this.dodgeBuf = 0;
    this.attack = null; this.prog = 0; this.chained = 0;
  }

  _begin(hit, heavy) {
    this.attack = heavy ? this.def.heavy : this.def.combo[hit];
    this.combo = hit; this.heavy = heavy; this.phase = PHASE.WINDUP; this.t = 0; this.startEvent = true;
  }
  _active() { this.phase = PHASE.ACTIVE; this.t = 0; this.activeEvent = true; }

  update() {
    const dt = this.dt, F = weaponFeel, def = this.def;
    this.activeEvent = false; this.endEvent = false; this.dodgeNow = false; this.startEvent = false;
    this.bufT = Math.max(0, this.bufT - dt); this.dodgeBuf = Math.max(0, this.dodgeBuf - dt);
    // A press during the cut or the recovery is kept until the link point; elsewhere a short buffer.
    if (this.pressed) { this.bufT = this.phase === PHASE.ACTIVE || this.phase === PHASE.RECOVER ? F.chainKeep : F.buffer; this.holdT = 0; }
    if (this.down) this.holdT += dt; else this.holdT = 0;
    if (this.dodgePressed) this.dodgeBuf = F.dodgeBuffer;
    if (def === null || this.blocked) {
      if (this.phase !== PHASE.IDLE) { this.reset(); this.endEvent = true; }
      this.bufT = 0;
      this.dodgeNow = this.dodgeBuf > 0; this.dodgeBuf = 0;
      return;
    }
    // A dodge goes at once when idle or in a state that has nothing to lose; it is kept through the swing itself.
    const p = this.phase;
    if (this.dodgeBuf > 0 && (p === PHASE.IDLE || p === PHASE.RECOVER || p === PHASE.CHARGE || p === PHASE.LOADED)) {
      this.dodgeNow = true; this.dodgeBuf = 0;
      if (p !== PHASE.IDLE) { this.reset(); this.endEvent = true; this.bufT = 0; return; }
    }
    this.t += dt;
    const a = this.attack;
    switch (this.phase) {
      case PHASE.IDLE:
        this.t = 0;
        if (this.bufT > 0) { this.bufT = 0; this.chained = 0; this._begin(0, false); }
        break;
      case PHASE.WINDUP: {
        this.prog = this.t >= a.windup ? 1 : this.t / a.windup;
        if (!this.heavy && this.holdT >= F.holdAt && this.down && this.chained === 0) { this._charge(); break; }
        if (this.t >= a.windup) {
          if (this.heavy) this._active();
          else if (this.down && this.holdT < F.holdAt) { this.phase = PHASE.LOADED; this.t = 0; }
          else this._active();
        }
        break;
      }
      case PHASE.LOADED:
        // Waiting on the button: a release swings, holding on turns it into a charge.
        if (!this.down) this._active();
        else if (this.holdT >= F.holdAt && this.chained === 0) this._charge();
        break;
      case PHASE.CHARGE:
        this.chargeT += dt;
        if (!this.down) {
          const h = def.heavy;
          this.power = 1 + h.power * Math.min(1, this.chargeT / h.chargeMax);
          this._begin(0, true);
        }
        break;
      case PHASE.ACTIVE:
        this.prog = this.t >= a.active ? 1 : this.t / a.active;
        if (this.t >= a.active) { this.phase = PHASE.RECOVER; this.t = 0; }
        break;
      case PHASE.RECOVER: {
        this.prog = this.t >= a.recover ? 1 : this.t / a.recover;
        // A buffered press chains once past the link point (never after a heavy, never past the last hit).
        if (!this.heavy && this.bufT > 0 && this.t >= a.link * a.recover && this.combo + 1 < def.combo.length) {
          this.bufT = 0; this.chained++; this._begin(this.combo + 1, false); break;
        }
        if (this.t >= a.recover) { this.phase = PHASE.IDLE; this.t = 0; this.attack = null; this.combo = 0; this.heavy = false; this.endEvent = true; this.chained = 0; }
        break;
      }
    }
    // A dodge kept through the swing fires the moment the recovery starts.
    if (this.phase === PHASE.RECOVER && this.t === 0 && this.dodgeBuf > 0) { this.dodgeNow = true; this.dodgeBuf = 0; this.reset(); this.endEvent = true; }
  }

  _charge() { this.phase = PHASE.CHARGE; this.t = 0; this.chargeT = 0; this.heavy = true; this.attack = this.def.heavy; this.prog = 0; }

  /** True while the weapon commits the Wraith (anything but idle). */
  get busy() { return this.phase !== PHASE.IDLE; }
}
