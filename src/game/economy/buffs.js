// Consumables in use (docs §11.5): a 0.6 s drink or dab that a dodge breaks off, then either a heal
// that trickles in (and stops at the next blow) or a timed buff. Pure logic over plain numbers, no
// allocation per frame: the owner (systems/economy.js) sets `dodge`/`blow`, calls update(dt), and
// reads the multipliers and `heal` (health to add this frame).
//
//   strength  weapon damage ×      (Ember tea)
//   guard     damage taken ×       (Rime tonic)
//   focus     focus regeneration × (Wind-bread)
//   flow      Flow drain ×         (Stillwater draught)

import { CONSUMABLES, FLASK, USE_TIME } from './items.js';

export const BUFF = { STRENGTH: 0, GUARD: 1, FOCUS: 2, FLOW: 3 };
const NAMES = ['strength', 'guard', 'focus', 'flow'];

export function createBuffs(inventory) {
  const left = new Float64Array(4), mul = new Float64Array([1, 1, 1, 1]);
  // d: [use time left, heal left, heal rate]
  const d = new Float64Array(3);
  const self = {
    left,
    /** The item being used (null when idle). */
    using: null,
    /** Inputs for the frame (fields): a dodge was pressed; a blow landed. */
    dodge: false, blow: false,
    /** Out: health to add this frame, the item that took effect this frame (null mostly), and a break-off flag. */
    heal: 0.5 - 0.5, applied: null, broken: false,
    get useLeft() { return d[0]; },
    get healing() { return d[1] > 0; },
    /** Current multipliers (1 when the buff is not running). */
    get damageMul() { return left[0] > 0 ? mul[0] : 1; },
    get takenMul() { return left[1] > 0 ? mul[1] : 1; },
    get focusMul() { return left[2] > 0 ? mul[2] : 1; },
    /** The robe's frost sheen while a tonic holds (0 .. 0.45, fading over its last seconds). */
    get sheen() { return left[1] > 0 ? 0.45 * Math.min(1, left[1] / 4) : 0; },
    get flowDecayMul() { return left[3] > 0 ? mul[3] : 1; },
    /** Why `id` cannot be used now, or null: 'none' (not carried), 'busy', 'whole' (a heal at full health). */
    blocked(id, health, max) {
      if (id === null || inventory.count(id) <= 0) return 'none';
      if (this.using !== null) return 'busy';
      const heals = id === 'flask' || CONSUMABLES[id].kind === 'heal';
      if (heals && health >= max - 0.5) return 'whole';
      return null;
    },
    /** Start using `id` (the caller checked blocked()). */
    begin(id) { this.using = id; d[0] = USE_TIME; },
    /** Advance: finish a use, trickle a heal, run down the buffs. `max` is the maximum health. */
    update(dt, max) {
      this.heal = 0; this.applied = null; this.broken = false;
      if (this.using !== null) {
        if (this.dodge) { this.using = null; d[0] = 0; this.broken = true; }
        else if ((d[0] -= dt) <= 0) {
          const id = this.using; this.using = null; d[0] = 0;
          if (inventory.consume(id)) { this.take(id, max); this.applied = id; }
        }
      }
      if (this.blow) d[1] = 0;
      if (d[1] > 0) { const h = Math.min(d[1], d[2] * dt); d[1] -= h; this.heal = h; }
      for (let i = 0; i < 4; i++) if (left[i] > 0) left[i] = Math.max(0, left[i] - dt);
      this.dodge = false; this.blow = false;
    },
    /** The effect of one consumed item. */
    take(id, max) {
      if (id === 'flask') { d[1] += FLASK.frac * max; d[2] = FLASK.frac * max / FLASK.over; return; }
      const c = CONSUMABLES[id];
      if (c.kind === 'heal') { d[1] += c.frac * max; d[2] = c.frac * max / c.over; return; }
      const k = NAMES.indexOf(c.buff);
      left[k] = c.secs; mul[k] = c.mul;
    },
    /** Death or a load: nothing carries over. */
    reset() { left.fill(0); d.fill(0); this.using = null; },
  };
  return self;
}
