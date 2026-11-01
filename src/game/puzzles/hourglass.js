// The Hourglass (docs/phase-9/dunes-design.md §4.2 B; sand flow, G1 with G2 and G3). A Shaper sand-clock of
// three tiers on the rim of the Needle: a dune spills into the top bowl without end. Teach: open the first
// sluice; a breach in the chute spills the sand: Crystallize it. Combine: the middle bowl splits left and
// right: Sweep a channel in its floor to send it all right. Twist: sand in the left cradle pulls the door
// shut, so freeze the left chute closed (it thaws in about 60 s of sun) and fill the right cradle in time.
// The right cradle full, with the left empty, opens the Needle's Eye. Leaving the site drains the cradles,
// so nothing is ever stuck.

import { GRAMMAR, sandClock } from './grammar.js';

/** The site's origin in the world (x, z): flat rim, just north of the Needle. */
export const HOUR_SITE = [1660, 462];
export const HG = {
  freezeR: 5, channelCuts: 3,    // m, ploughs needed in the middle bowl
  full: 0.92,                    // a cradle reads as full
  leakShare: 0.75,               // of the first chute's sand lost through an open breach
  bias: 12,                      // a cut channel's weight against the left chute's 1
  leaveR: 90,                    // m: beyond this the cradles drain
};
/** Site-local (u east, v south, m). */
export const LAYOUT = {
  top: [0, 0], sluice: [6, 2], breach: [0, 10], middle: [0, 18], left: [-11, 30], right: [11, 30], door: [0, 44],
};
export const STAGE = { TEACH: 0, COMBINE: 1, TWIST: 2, DONE: 3 };

const B = { TOP: 0, MIDDLE: 1, LEFT: 2, RIGHT: 3 };
export { B as BOWL };

export function createHourglass() {
  const bowls = [{ id: 'top', level: 1, source: true }, { id: 'middle', level: 0 }, { id: 'left', level: 0 }, { id: 'right', level: 0 }];
  const sluice = { from: B.TOP, to: B.MIDDLE, open: false, weight: 1 - HG.leakShare };
  const breach = { from: B.TOP, to: -1, open: false, frozen: false, weight: HG.leakShare };
  const left = { from: B.MIDDLE, to: B.LEFT, open: true, frozen: false, weight: 1 };
  const right = { from: B.MIDDLE, to: B.RIGHT, open: true, frozen: false, weight: 1 };
  const clock = sandClock(bowls, [sluice, breach, left, right]);
  return {
    bowls, sluice, breach, left, right, stage: STAGE.TEACH, cuts: 0, breachLife: 0, leftLife: 0, running: 0,
    /** The sluice is struck: it opens or shuts. */
    strike() { sluice.open = !sluice.open; breach.open = sluice.open; },
    /** A Crystallize at (u, v), with the shade flag for that spot. */
    freeze(u, v) {
      const L = LAYOUT;
      if (Math.hypot(u - L.breach[0], v - L.breach[1]) < HG.freezeR) { breach.frozen = true; this.breachLife = GRAMMAR.thawSun; }
      if (Math.hypot(u - (L.middle[0] + L.left[0]) / 2, v - (L.middle[1] + L.left[1]) / 2) < HG.freezeR) { left.frozen = true; this.leftLife = GRAMMAR.thawSun; }
    },
    /** A Sweep's plough at (u, v): in the middle bowl's floor it leans the flow right. */
    plough(u, v) {
      if (this.stage < STAGE.COMBINE) return;
      const L = LAYOUT;
      if (Math.hypot(u - L.middle[0], v - L.middle[1]) < 7 && u >= -1) this.cuts = Math.min(HG.channelCuts, this.cuts + 1);
    },
    update(dt, shade, leftShade) {
      if (breach.frozen && (this.breachLife -= dt / (shade ? 10 : 1)) <= 0) breach.frozen = false;
      if (left.frozen && (this.leftLife -= dt / (leftShade ? 10 : 1)) <= 0) left.frozen = false;
      right.weight = this.cuts >= HG.channelCuts ? HG.bias : 1;
      // With its chute frozen the left cradle lets its sand go: it hangs on a drain the flow otherwise outruns.
      bowls[B.LEFT].drain = left.frozen;
      clock.step(dt);
      // The door's two counterweights: sand in the left pulls it shut.
      let ev = 0;
      // The teach is done once sand runs whole past the frozen breach (the middle bowl passes it straight on).
      this.running = sluice.open && breach.frozen ? this.running + dt : 0;
      if (this.stage === STAGE.TEACH && this.running > 1.5) { this.stage = STAGE.COMBINE; ev = 1; }
      else if (this.stage === STAGE.COMBINE && this.cuts >= HG.channelCuts) { this.stage = STAGE.TWIST; ev = 1; }
      else if (this.stage === STAGE.TWIST && bowls[B.RIGHT].level >= HG.full && bowls[B.LEFT].level < 0.25) { this.stage = STAGE.DONE; ev = 1; }
      return ev;
    },
    /** Walking away: the cradles drain and a part-solved clock starts over from where it stood. */
    drain(dt) {
      if (this.stage === STAGE.DONE) return;
      for (const k of [B.LEFT, B.RIGHT, B.MIDDLE]) bowls[k].level = Math.max(0, bowls[k].level - GRAMMAR.flowRate * dt);
      if (sluice.open) { sluice.open = false; breach.open = false; }
    },
    restore(stage) {
      this.stage = stage; this.cuts = stage >= STAGE.TWIST ? HG.channelCuts : 0;
      const done = stage === STAGE.DONE;
      bowls[B.RIGHT].level = done ? 1 : 0; sluice.open = done; breach.open = done; breach.frozen = done;
    },
  };
}
