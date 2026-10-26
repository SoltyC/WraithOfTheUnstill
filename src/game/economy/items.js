// Items as data (docs/gameplay-design.md §11.4-11.5): the materials the forge eats, the consumables
// in the pouch, and the prices. Nothing is rolled: every item is bought, given by a quest, or left by
// a placed elite. Prices are marks (the Veiled's old Shaper silver).

export const MATERIALS = {
  'rime-core': { id: 'rime-core', name: 'Rime core', biome: 'frost', value: 14, text: 'A knuckle of ice that never thaws, taken from something that was made of it.' },
  'hedge-heart': { id: 'hedge-heart', name: 'Hedge-heart', biome: 'meadow', value: 18, text: 'The knotted wood at the middle of a hedge the Shaped had walked. Dense as bone.' },
  'turf-amber': { id: 'turf-amber', name: 'Turf-amber', biome: 'meadow', value: 26, text: 'Resin from the old turf, clear and slow, with a seed still sleeping in it.' },
};
export const MATERIAL_IDS = Object.keys(MATERIALS);

/**
 * kind 'heal': restores `frac` of the maximum health over `over` s.
 * kind 'buff': sets the buff `buff` to `secs` seconds at strength `mul`.
 * `cap` is the stack the pouch holds; `sell` what a trader pays for one.
 */
export const CONSUMABLES = {
  salve: { id: 'salve', name: 'Warm salve', price: 12, sell: 5, cap: 5, kind: 'heal', frac: 0.4, over: 3, text: 'Heals over three breaths. A blow breaks it off.' },
  tea: { id: 'tea', name: 'Ember tea', price: 22, sell: 9, cap: 3, kind: 'buff', buff: 'strength', mul: 1.25, secs: 60, text: 'Weapon blows land 25% harder for a minute. The hands glow warm.' },
  tonic: { id: 'tonic', name: 'Rime tonic', price: 24, sell: 10, cap: 3, kind: 'buff', buff: 'guard', mul: 0.75, secs: 60, text: 'The Shaped\'s blows land 25% lighter for a minute. Frost beads on the robe.' },
  bread: { id: 'bread', name: 'Wind-bread', price: 14, sell: 6, cap: 3, kind: 'buff', buff: 'focus', mul: 1.5, secs: 90, text: 'Focus returns half again as fast for a minute and a half.' },
  draught: { id: 'draught', name: 'Stillwater draught', price: 30, sell: 12, cap: 2, kind: 'buff', buff: 'flow', mul: 0.5, secs: 60, text: 'Flow drains half as fast for a minute. Held momentum.' },
};
export const CONSUMABLE_IDS = Object.keys(CONSUMABLES);

/** The shrine-water flask: not a stack but charges, refilled whenever the Wraith rests at a shrine. */
export const FLASK = { name: 'Shrine water', frac: 0.55, over: 2.2, base: 3, max: 5, text: 'Water from the stones. It fills again wherever the Wraith rests.' };

/** Seconds a drink or a dab takes before it counts (a dodge breaks it off). */
export const USE_TIME = 0.6;

/** Maximum health: 5 segments of 20; every health thread weaves one more. */
export const HEALTH = { base: 100, segment: 20, maxThreads: 5 };
export const maxHealth = (threads) => HEALTH.base + HEALTH.segment * Math.min(HEALTH.maxThreads, Math.max(0, threads | 0));

/** What a trader pays for a material, as a share of its value; and for a consumable, its `sell`. */
export const SELL_RATE = 0.6;
