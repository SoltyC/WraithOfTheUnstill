// The Wraith's inventory, first pass (docs §11): which weapons it owns (id + upgrade tier), the two
// it carries and which of the two is in hand. The staff is owned from the waking. Marks, materials,
// consumables, trading and the save format (v3) extend this object; nothing here knows about
// rendering or input.
//
//   owned    [{ id, tier }]   every weapon found (tier 0 = as found; the forge raises it)
//   carried  [id | null, id | null]   the two slots; swapping (X / wheel) flips `held`
//   held     0 | 1            the slot in hand
//
// A weapon found while both slots are full replaces the one not in hand (it stays owned, to be
// carried again later). `version` bumps on every change so the UI and the save see it.

import { weaponDefs } from './weapons/defs.js';

export function createInventory() {
  /** @type {{ id: string, tier: number }[]} */
  const owned = [{ id: 'staff', tier: 0 }];
  /** @type {(string|null)[]} */
  const carried = ['staff', null];
  const self = {
    owned, carried, held: 0, version: 0,
    has(id) { return owned.some((w) => w.id === id); },
    tier(id) { const w = owned.find((q) => q.id === id); return w ? w.tier : -1; },
    /** The weapon id in hand, or null. */
    get equipped() { return carried[this.held]; },
    /** The def of the weapon in hand (data), or null. */
    get def() { const id = carried[this.held]; return id ? weaponDefs[id] : null; },
    /** Add a weapon (a find). Returns true if it was new. It goes into an empty slot, else replaces the one not in hand. */
    give(id) {
      if (!weaponDefs[id] || this.has(id)) return false;
      owned.push({ id, tier: 0 });
      const free = carried.indexOf(null);
      carried[free >= 0 ? free : 1 - this.held] = id;
      this.version++;
      return true;
    },
    /** Raise a weapon's tier (the forge, later). */
    upgrade(id) { const w = owned.find((q) => q.id === id); if (!w) return false; w.tier++; this.version++; return true; },
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
    serialize() { return { owned: owned.map((w) => ({ id: w.id, tier: w.tier })), carried: [...carried], held: this.held }; },
    restore(s) {
      if (!s || !Array.isArray(s.owned)) return;
      owned.length = 0;
      for (const w of s.owned) if (weaponDefs[w.id]) owned.push({ id: w.id, tier: w.tier | 0 });
      if (!owned.some((w) => w.id === 'staff')) owned.unshift({ id: 'staff', tier: 0 });
      carried[0] = s.carried && weaponDefs[s.carried[0]] ? s.carried[0] : 'staff';
      carried[1] = s.carried && weaponDefs[s.carried[1]] && owned.some((w) => w.id === s.carried[1]) ? s.carried[1] : null;
      this.held = s.held === 1 && carried[1] ? 1 : 0;
      this.version++;
    },
  };
  return self;
}
