// Marks from the Shaped (docs §11.4: "a mark or two when they collapse, more from elites"). Slow by
// design — there is no reason to grind (docs §1, pillar 4): the Shaped pay from a purse that holds a
// few marks and fills a mark at a time, so a long hunt pays no more than a walk past a few fights.
// Elites (placed, named) pay outright. Pure numbers; the purse is saved (a reload is no refill).

/** Marks a collapse leaves, by Shaped archetype. */
export const SHAPED_MARKS = { hound: 1, seer: 2, brute: 3, sedgerunner: 1, hedgewarden: 2, chanter: 2 };
/** Placed elites pay in full, once, outside the purse. */
export const ELITE_MARKS = { denmother: 12 };

export const PURSE = { cap: 10, secondsPerMark: 30 };

export function createPurse() {
  const self = {
    /** Marks now in the purse (a float: it fills by the second). */
    level: PURSE.cap,
    fill(dt) { self.level = Math.min(PURSE.cap, self.level + dt / PURSE.secondsPerMark); },
    /** A Shaped of `arch` collapsed: the marks it leaves (0 when the purse is dry). */
    award(arch) {
      if (ELITE_MARKS[arch]) return ELITE_MARKS[arch];
      const v = SHAPED_MARKS[arch] || 1, paid = Math.min(v, Math.floor(self.level));
      self.level -= paid;
      return paid;
    },
  };
  return self;
}
