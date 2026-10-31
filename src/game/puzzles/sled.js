// The buried sled at the Wellhouse (docs/phase-9/dunes-design.md §4.1): G1 and G2, the camp's lesson.
// Sand heaped over the caravan's sand-sled stands at its lip. Start the lip and it pours over the sled,
// unless a channel has been swept beside it: sand goes where the channel is cut. A slide without one
// only fills what was cut, so the site can be tried again. Plain numbers: the system (systems/puzzleSled.js)
// feeds it, and the bot's solver and tests drive the same machine.

export const SLED = {
  bins: 6, need: 4,         // cells along the channel, how many must be cut
  length: 12, halfWidth: 3, // m: the channel's lane, beside the sled
  slideTime: 4,             // s the pour runs
  retry: 6,                 // s before a lip that slid can slide again
};

export const STATE = { BURIED: 0, SLIDING: 1, FREED: 2 };

export function createSled() {
  const cut = new Uint8Array(SLED.bins);
  return {
    cut, state: STATE.BURIED, t: 0, cooldown: 0, tries: 0, wins: false,
    /** A Sweep's plough at (u, v): along the channel from its head (m), across it (m). */
    plough(u, v) {
      if (this.state !== STATE.BURIED || u < 0 || u >= SLED.length || Math.abs(v) > SLED.halfWidth) return;
      cut[Math.floor(u / SLED.length * SLED.bins)] = 1;
    },
    channel() { let n = 0; for (let i = 0; i < SLED.bins; i++) n += cut[i]; return n; },
    /** The lip is disturbed. True when a slide starts. */
    trigger() {
      if (this.state !== STATE.BURIED || this.cooldown > 0) return false;
      this.state = STATE.SLIDING; this.t = 0; this.tries++;
      this.wins = this.channel() >= SLED.need;
      return true;
    },
    /** Returns 1 on the frame the sled comes free, -1 on the frame a slide ends over it, else 0. */
    update(dt) {
      if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
      if (this.state !== STATE.SLIDING) return 0;
      this.t += dt;
      if (this.t < SLED.slideTime) return 0;
      if (this.wins) { this.state = STATE.FREED; return 1; }
      this.state = STATE.BURIED; this.cooldown = SLED.retry; cut.fill(0);
      return -1;
    },
  };
}
