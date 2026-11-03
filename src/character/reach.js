// A reach: one hand (or both) put out to a point by the body's own two-bone arm, on top of whatever the gait is doing — a held
// pose without a clip (release-cinematic.md shot 6: Sefa's hand raised to the wave). Plays where a Performance does
// (wraith.performance: step, apply, weight, tuck, done), so the cloth sees the arm the same way. Allocation-free.

import { Performance } from './performance.js';

export class Reach {
  constructor() {
    /** Targets in the body's simulation space (x, y, z per hand) and which hands reach (bit 0 left, bit 1 right). */
    this.handT = new Float64Array(6); this.hands = 2;
    /** Seconds to raise, and to lower on leave(). */
    this.fade = 0.6; this.weight = 0; this.tuck = 0; this.done = false;
    this._in = 0; this._out = -1; this._outOver = 0.6;
  }
  /** Raise again from the pose the body is in. */
  restart() { this._in = 0; this._out = -1; this.done = false; this.weight = 0; }
  leave(fade = this.fade) { if (this._out < 0) { this._out = 0; this._outOver = fade; } }
  step(dt) {
    this._in += dt;
    if (this._out >= 0) { this._out += dt; if (this._out >= this._outOver) this.done = true; }
    const a = Math.min(1, this.fade > 0 ? this._in / this.fade : 1), b = this._out < 0 ? 1 : Math.max(0, 1 - this._out / this._outOver);
    const w = Math.min(a, b);
    this.weight = w * w * (3 - 2 * w);
  }
  apply(body, gait) {
    const T = this.handT, w = this.weight;
    for (let s = 0; s < 2; s++) if (this.hands & (1 << s)) Performance.prototype._ik.call(this, body, s, T[s * 3], T[s * 3 + 1], T[s * 3 + 2], w);
  }
}
