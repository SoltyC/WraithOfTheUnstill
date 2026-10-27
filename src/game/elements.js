// The elements (BRIEF §2.4): a Warden's release grants its element; the one in hand is chosen
// with keys 1–5 (BRIEF §7). Frost is the Wraith's from the start. Gale is unlocked by the meadow
// Warden's release (PLAN.md M9) — until then by `?gale=1` or the dev overlay, for testing.
// Stone is granted for real by the dune Warden's release (Phase 9, later); until then by `?stone=1` or the
// dev overlay's Elements section. Not yet saved (save v3, PLAN.md M0).

export const ELEMENTS = ['frost', 'gale', 'stone', 'tide', 'ember'];
export const ELEMENT_NAMES = { frost: 'Frost', gale: 'Gale', stone: 'Stone', tide: 'Tide', ember: 'Ember' };
/** Elements whose verbs exist (the others can be unlocked but not yet bent). */
export const BUILT = new Set(['frost', 'gale', 'stone']);

export function createElements(unlocked = ['frost']) {
  return {
    active: 'frost',
    unlocked: new Set(unlocked),
    /** Take element `id` in hand; false if it is not unlocked or not built, or already in hand. */
    select(id) {
      if (!this.unlocked.has(id) || !BUILT.has(id) || this.active === id) return false;
      this.active = id;
      return true;
    },
    unlock(id) { if (ELEMENTS.includes(id)) this.unlocked.add(id); },
  };
}
