// The Singing Dunes (docs/phase-9/dunes-design.md §4.2 C; sound, G1 with G7 and G3). Three crests boom when
// their faces slide: low, middle and high. The ring of resonance stones where they meet hums a phrase, also
// cut into its stones. Teach: one dune, one note. Combine: play low, high, middle before each boom fades, by
// running or riding from one crest to the next. Twist: when the low dune booms the overloaded middle one slides in
// sympathy, out of order, unless its face is frozen first (a frozen face is silent); when its turn comes,
// strike the crust to release it.

import { GRAMMAR, phrase } from './grammar.js';

export const SING_SITE = [2650, 680];
export const SD = {
  fade: 14,               // s a boom hangs here: the crests can be run between (sand-surf comes later, at the waking)
  lipR: 5, reset: 8,      // m around a lip; s before a face that slid can slide again
  sympathy: 0.4,          // s after the low boom
  freezeR: 7,
};
export const NOTE = { LOW: 0, MIDDLE: 1, HIGH: 2 };
export const PHRASE = [NOTE.LOW, NOTE.HIGH, NOTE.MIDDLE];
/** Crests, site-local (u east, v south, m), by note; the ring. */
export const LAYOUT = { lips: [[-44, 4], [30, 35], [20, -50]], ring: [0, 0] };
export const STAGE = { TEACH: 0, COMBINE: 1, TWIST: 2, DONE: 3 };

export function createSinging() {
  const song = phrase(PHRASE, SD.fade);
  const wait = new Float64Array(3);
  return {
    song, wait, stage: STAGE.TEACH, frozen: 0, heard: -1, ev: 0, sympathyT: -1, lastNote: -1,
    /** A face slides (or is released): its boom, in order or not. Returns true if it sounded. */
    slide(n, t) {
      if (wait[n] > 0) return false;
      if (n === NOTE.MIDDLE && this.frozen > 0) return false; // a frozen face is silent
      wait[n] = SD.reset;
      this.lastNote = n;
      if (this.stage === STAGE.TEACH) { this.stage = STAGE.COMBINE; this.ev = 1; return true; }
      song.play(n, t);
      if (song.at >= 2 && this.stage === STAGE.COMBINE) { this.stage = STAGE.TWIST; this.ev = 1; }
      if (n === NOTE.LOW && this.stage >= STAGE.COMBINE) this.sympathyT = SD.sympathy;
      if (song.done) { this.stage = STAGE.DONE; this.ev = 1; }
      return true;
    },
    /** Mastery, once solved: the phrase in one unbroken ride. A boom on the run; `riding` false loses it. */
    run: phrase(PHRASE, SD.fade),
    ride(n, t, riding) {
      if (!riding) { this.run.at = 0; return false; }
      this.run.play(n, t);
      return this.run.done;
    },
    /** A Crystallize at (u, v). */
    freeze(u, v) {
      const m = LAYOUT.lips[NOTE.MIDDLE];
      if (Math.hypot(u - m[0], v - m[1]) < SD.freezeR) this.frozen = GRAMMAR.thawSun;
    },
    /** The frozen crust is struck: released, it slides now. */
    strike(t) { if (this.frozen <= 0) return false; this.frozen = 0; wait[NOTE.MIDDLE] = 0; return this.slide(NOTE.MIDDLE, t); },
    update(dt, t) {
      for (let i = 0; i < 3; i++) if (wait[i] > 0) wait[i] = Math.max(0, wait[i] - dt);
      if (this.frozen > 0) this.frozen = Math.max(0, this.frozen - dt);
      song.tick(t);
      let sound = -1;
      if (this.sympathyT >= 0 && (this.sympathyT -= dt) < 0 && this.slide(NOTE.MIDDLE, t)) sound = NOTE.MIDDLE;
      const ev = this.ev; this.ev = 0;
      return ev ? (sound >= 0 ? 3 : 1) : (sound >= 0 ? 2 : 0);
    },
    restore(stage) { this.stage = stage; if (stage === STAGE.DONE) song.done = true; },
  };
}
