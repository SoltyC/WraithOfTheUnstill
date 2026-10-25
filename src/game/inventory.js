// The Wraith's inventory (docs §11): the weapons it owns (id + forge tier + infusion), the two it
// carries and which is in hand; marks (the currency), materials, the pouch of consumables, the
// shrine-water flask and the health threads. The staff is owned from the waking. Nothing here knows
// about rendering or input; economy/ holds the rules that act on it.
//
//   owned    [{ id, tier, infusion }]   every weapon found (tier 0 = as found; the forge raises it)
//   carried  [id | null, id | null]   the two slots; swapping (X / wheel) flips `held`
//   held     0 | 1            the slot in hand
//   marks    number           the currency
//   materials { [id]: n }     forge materials (economy/items.js)
//   pouch    { [id]: n }      consumable stacks; `sel` is the one R uses, C cycles
//   flask    { charges, max } shrine water: refilled at every rested shrine
//   threads  number           health threads woven into the robe (+1 segment each)
//
// A weapon found while both slots are full replaces the one not in hand (it stays owned, to be
// carried again later). `version` bumps on every change so the UI and the save see it.

import { weaponDefs } from './weapons/defs.js';
import { MATERIALS, CONSUMABLES, FLASK, HEALTH } from './economy/items.js';

/** The order C cycles through (the flask first: the guaranteed heal). */
const SLOTS = ['flask', 'salve', 'tea', 'tonic', 'bread', 'draught'];

export function createInventory() {
  /** @type {{ id: string, tier: number }[]} */
  const owned = [{ id: 'staff', tier: 0, infusion: null }];
  /** @type {(string|null)[]} */
  const carried = ['staff', null];
  const materials = {}, pouch = {}, flask = { charges: FLASK.base, max: FLASK.base };
  for (const id in MATERIALS) materials[id] = 0;
  for (const id in CONSUMABLES) pouch[id] = 0;
  const self = {
    owned, carried, held: 0, version: 0,
    marks: 0, materials, pouch, flask, threads: 0, sel: 'flask',
    has(id) { return owned.some((w) => w.id === id); },
    tier(id) { const w = owned.find((q) => q.id === id); return w ? w.tier : -1; },
    /** The weapon id in hand, or null. */
    get equipped() { return carried[this.held]; },
    /** The def of the weapon in hand (data), or null. */
    get def() { const id = carried[this.held]; return id ? weaponDefs[id] : null; },
    /** Add a weapon (a find). Returns true if it was new. It goes into an empty slot, else replaces the one not in hand. */
    give(id) {
      if (!weaponDefs[id] || this.has(id)) return false;
      owned.push({ id, tier: 0, infusion: null });
      const free = carried.indexOf(null);
      carried[free >= 0 ? free : 1 - this.held] = id;
      this.version++;
      return true;
    },
    /** Raise a weapon's tier (the forge pays first: economy/forge.js). */
    upgrade(id) { const w = owned.find((q) => q.id === id); if (!w) return false; w.tier++; this.version++; return true; },
    /** The element a weapon carries (tier 3+), or null. */
    infusion(id) { const w = owned.find((q) => q.id === id); return w ? w.infusion : null; },
    infuse(id, element) { const w = owned.find((q) => q.id === id); if (!w || w.tier < 3) return false; w.infusion = element; this.version++; return true; },

    // ── Marks and materials ─────────────────────────────────────────────────────────────────────
    addMarks(n) { n = Math.floor(n); if (!(n > 0)) return 0; this.marks += n; this.version++; return n; },
    /** Pay marks; false (and nothing spent) when there are not enough. */
    spendMarks(n) { n = Math.floor(n); if (n > this.marks || n < 0) return false; this.marks -= n; this.version++; return true; },
    addMaterial(id, n = 1) { if (!MATERIALS[id] || !(n > 0)) return false; materials[id] += Math.floor(n); this.version++; return true; },
    /** True when every material of `cost` ({ id: n }) is in hand. */
    hasMaterials(cost) { for (const id in cost) if ((materials[id] || 0) < cost[id]) return false; return true; },
    /** Take the materials of `cost`, all or nothing. */
    takeMaterials(cost) { if (!this.hasMaterials(cost)) return false; for (const id in cost) materials[id] -= cost[id]; this.version++; return true; },

    // ── The pouch ───────────────────────────────────────────────────────────────────────────────
    /** Put up to n of a consumable in the pouch (the stack's cap holds); returns how many fit. */
    addItem(id, n = 1) {
      const c = CONSUMABLES[id]; if (!c) return 0;
      const k = Math.max(0, Math.min(n, c.cap - pouch[id]));
      if (k > 0) { pouch[id] += k; this.version++; if (this.count(this.sel) === 0) this.sel = id; }
      return k;
    },
    /** How many of an item are carried (the flask counts its charges). */
    count(id) { return id === 'flask' ? flask.charges : (pouch[id] || 0); },
    /** Use one: the flask spends a charge, a stack loses one. False when there is none. */
    consume(id) {
      if (this.count(id) <= 0) return false;
      if (id === 'flask') flask.charges--; else pouch[id]--;
      this.version++;
      if (this.count(this.sel) <= 0) this.sel = this.next(this.sel) || 'flask';
      return true;
    },
    /** The item after `from` in the cycle that is carried (null if none is). */
    next(from) {
      const i = SLOTS.indexOf(from);
      for (let k = 1; k <= SLOTS.length; k++) { const id = SLOTS[(i + k) % SLOTS.length]; if (this.count(id) > 0) return id; }
      return null;
    },
    /** C: select the next carried item. Returns the new selection (null when the pouch is empty). */
    cycleItem() { const n = this.next(this.sel); if (n) { this.sel = n; this.version++; } return n; },
    /** The item R would use (null when nothing is carried). */
    get selected() { return this.count(this.sel) > 0 ? this.sel : this.next(this.sel); },
    /** Rest at a shrine: the flask is full again. True if it was not. */
    refillFlask() { if (flask.charges >= flask.max) return false; flask.charges = flask.max; this.version++; return true; },
    /** A quest deepens the flask (+1 charge, to the cap), filling it. */
    growFlask(n = 1) { flask.max = Math.min(FLASK.max, flask.max + n); flask.charges = flask.max; this.version++; },
    /** Weave a health thread into the robe. False at the cap. */
    addThread() { if (this.threads >= HEALTH.maxThreads) return false; this.threads++; this.version++; return true; },
    /** Put an owned weapon into a carry slot (not the one in hand unless it is the only way). */
    carry(id, slot) { if (!this.has(id) || (slot !== 0 && slot !== 1)) return false; if (carried[1 - slot] === id) carried[1 - slot] = null; carried[slot] = id; this.version++; return true; },
    /** Take an owned weapon in hand: where it is carried, else in place of the carried one not in hand. */
    equip(id) {
      if (!this.has(id)) return false;
      let slot = carried.indexOf(id);
      if (slot < 0) { slot = 1 - this.held; carried[slot] = id; }
      this.held = slot; this.version++;
      return true;
    },
    /** Swap to the other carried weapon. False when the other slot is empty. */
    cycle() { const o = 1 - this.held; if (carried[o] === null) return false; this.held = o; this.version++; return true; },
    serialize() {
      return {
        owned: owned.map((w) => ({ id: w.id, tier: w.tier, infusion: w.infusion })), carried: [...carried], held: this.held,
        marks: this.marks, materials: { ...materials }, pouch: { ...pouch }, flask: { charges: flask.charges, max: flask.max }, threads: this.threads, sel: this.sel,
      };
    },
    restore(s) {
      if (!s || !Array.isArray(s.owned)) return;
      owned.length = 0;
      for (const w of s.owned) if (weaponDefs[w.id]) owned.push({ id: w.id, tier: w.tier | 0, infusion: w.tier >= 3 && typeof w.infusion === 'string' ? w.infusion : null });
      if (!owned.some((w) => w.id === 'staff')) owned.unshift({ id: 'staff', tier: 0, infusion: null });
      this.marks = Math.max(0, Math.floor(s.marks) || 0);
      for (const id in MATERIALS) materials[id] = Math.max(0, (s.materials && s.materials[id]) | 0);
      for (const id in CONSUMABLES) pouch[id] = Math.max(0, Math.min(CONSUMABLES[id].cap, (s.pouch && s.pouch[id]) | 0));
      flask.max = Math.max(FLASK.base, Math.min(FLASK.max, (s.flask && s.flask.max) | 0 || FLASK.base));
      flask.charges = Math.max(0, Math.min(flask.max, s.flask ? s.flask.charges | 0 : flask.max));
      this.threads = Math.max(0, Math.min(HEALTH.maxThreads, s.threads | 0));
      this.sel = SLOTS.includes(s.sel) ? s.sel : 'flask';
      carried[0] = s.carried && weaponDefs[s.carried[0]] ? s.carried[0] : 'staff';
      carried[1] = s.carried && weaponDefs[s.carried[1]] && owned.some((w) => w.id === s.carried[1]) ? s.carried[1] : null;
      this.held = s.held === 1 && carried[1] ? 1 : 0;
      this.version++;
    },
  };
  return self;
}
