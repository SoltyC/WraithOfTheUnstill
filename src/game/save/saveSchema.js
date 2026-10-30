// Save schema, defaults, validation, and version migrations (BRIEF §4.5).
// A save is plain JSON-compatible data plus binary terrain pages (Uint8Array).

import { MATERIALS, CONSUMABLES, FLASK } from '../economy/items.js';
import {validateStormState} from '../../world/stormPersistence.js';

export const SAVE_VERSION = 4;
export const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'];

/**
 * @typedef {{ key: string, savedAt: number, data: Uint8Array }} TerrainPage
 * @typedef {{
 *   version: number, slot: string, createdAt: number, updatedAt: number, playSeconds: number,
 *   player: { pos: number[], yaw: number, element: number, health: number, focus: number },
 *   progression: { elements: string[], echoes: string[], robes: string[], robe: string, shrines: string[] },
 *   quests: { quests: Record<string, { state: string, step: number }>, flags: string[] },
 *   journal: { lore: string[], map: string },
 *   world: { timeOfDay: number, weather: string, weatherOverride: string|null, biome: string, sandstorm: null|object, restoration: Record<string, string> },
 *   entities: { crystals: number[], warden: null | { state: string, x: number, z: number, heading: number } },
 *   terrainPages: TerrainPage[],
 *   inventory: { owned: { id: string, tier: number, infusion: string|null }[], carried: (string|null)[], held: number, marks: number,
 *     materials: Record<string, number>, pouch: Record<string, number>, flask: { charges: number, max: number }, threads: number, sel: string },
 *   equipped: { weapon: string, robe: string, mantle: string|null },
 *   economy: { stocks: Record<string, Record<string, number>>|null, drop: null | { marks: number, x: number, z: number }, purse: number, backPay: boolean },
 * }} SaveData
 *
 * Times: playSeconds is the game clock (clock.simTime) at the save; terrain pages' savedAt and
 * crystal birth times are on that same clock, and a load shifts them to the new session's clock.
 * journal.map is the explored-cells bitmask (map/fog of war), base64.
 */

/** A new game's inventory (v3): the staff, nothing else. */
export function emptyInventory() {
  return {
    owned: [{ id: 'staff', tier: 0, infusion: null }], carried: ['staff', null], held: 0, marks: 0,
    materials: Object.fromEntries(Object.keys(MATERIALS).map((k) => [k, 0])),
    pouch: Object.fromEntries(Object.keys(CONSUMABLES).map((k) => [k, 0])),
    flask: { charges: FLASK.base, max: FLASK.base }, threads: 0, sel: 'flask',
  };
}

/** @returns {SaveData} */
export function createEmptySave(slot = 'auto', now = 0) {
  return {
    version: SAVE_VERSION,
    slot,
    createdAt: now,
    updatedAt: now,
    playSeconds: 0,
    player: { pos: [0, 0, 0], yaw: 0, element: 0, health: 1, focus: 1 },
    progression: { elements: [], echoes: [], robes: ['pilgrim'], robe: 'pilgrim', shrines: [] },
    quests: { quests: {}, flags: [] },
    journal: { lore: [], map: '' },
    world: { timeOfDay: 16.5, weather: 'clear', weatherOverride: null, biome: 'frost', sandstorm:null, restoration: { frost: 'stilled', meadow: 'stilled', mire: 'stilled', dunes: 'stilled', ember: 'stilled', coast: 'stilled' } },
    entities: { crystals: [], warden: null },
    terrainPages: [],
    inventory: emptyInventory(),
    equipped: { weapon: 'staff', robe: 'wanderer', mantle: null },
    economy: { stocks: null, drop: null, purse: 10, backPay: false },
  };
}

/**
 * Migrations: `migrations[v]` upgrades a version-v save to v+1. Never edit a shipped migration;
 * add a new one and bump SAVE_VERSION.
 * @type {Record<number, (s: any) => any>}
 */
export const migrations = {
  // v3 → v4: no past storms are invented for legacy terrain pages.
  3:(s)=>({...s,version:4,world:{...s.world,sandstorm:null}}),
  // v1 (Phase 0 skeleton) → v2 (Phase 7): the quest graph's state replaces the per-quest vars
  // (no v1 build had quests, so they start fresh); shrines, journal and the world's entities
  // (crystal formations, the Warden) are added empty; the weather is no longer forced.
  1: (s) => ({
    ...s,
    version: 2,
    progression: { ...s.progression, shrines: [] },
    quests: { quests: {}, flags: [] },
    journal: { lore: [], map: '' },
    world: { ...s.world, weatherOverride: null },
    entities: { crystals: [], warden: null },
  }),
  // v2 (Phase 7) → v3 (the economy): the inventory, the equipped items and the economy's state are added.
  // The weapons v2 knew only as quest flags (`own:<id>`) become owned weapons; the robe worn was a quest
  // variable. A v2 save earned its quests with no pay, so `backPay` asks the game to pay what the steps
  // it finished would have paid (systems/economy.js) on its first load.
  2: (s) => {
    const flags = s.quests?.flags || [], vars = s.quests?.vars || {};
    const own = flags.filter((f) => typeof f === 'string' && f.startsWith('own:')).map((f) => f.slice(4)).filter((id) => id !== 'staff');
    const inv = emptyInventory();
    for (const id of own) inv.owned.push({ id, tier: 0, infusion: null });
    if (own.length) inv.carried[1] = own[own.length - 1];
    return {
      ...s,
      version: 3,
      inventory: inv,
      equipped: { weapon: 'staff', robe: typeof vars.robe === 'string' ? vars.robe : 'wanderer', mantle: null },
      economy: { stocks: null, drop: null, purse: 10, backPay: true },
    };
  },
};

/**
 * Upgrade a save to `target`, applying each step in order.
 * @param {any} save
 * @param {Record<number, (s: any) => any>} [table]
 * @param {number} [target]
 */
export function migrate(save, table = migrations, target = SAVE_VERSION) {
  if (typeof save?.version !== 'number') throw new Error('save has no version');
  if (save.version > target) throw new Error(`save version ${save.version} is newer than this build (${target})`);
  let s = save;
  while (s.version < target) {
    const step = table[s.version];
    if (!step) throw new Error(`no migration from save version ${s.version}`);
    const from = s.version;
    s = step(s);
    if (s.version !== from + 1) throw new Error(`migration ${from} must produce version ${from + 1}`);
  }
  return s;
}

/** Structural validation; throws with a path on the first problem. */
export function validateSave(s) {
  const fail = (m) => { throw new Error('invalid save: ' + m); };
  if (s.version !== SAVE_VERSION) fail('version');
  if (!SLOTS.includes(s.slot)) fail('slot');
  if (!Array.isArray(s.player?.pos) || s.player.pos.length !== 3 || s.player.pos.some((n) => !Number.isFinite(n))) fail('player.pos');
  for (const k of ['yaw', 'element', 'health', 'focus']) if (!Number.isFinite(s.player[k])) fail('player.' + k);
  if (!Array.isArray(s.progression?.elements)) fail('progression.elements');
  if (typeof s.quests?.quests !== 'object' || s.quests.quests === null || !Array.isArray(s.quests.flags)) fail('quests');
  if (!Array.isArray(s.progression.shrines)) fail('progression.shrines');
  if (!Array.isArray(s.journal?.lore) || typeof s.journal.map !== 'string') fail('journal');
  if (!Array.isArray(s.entities?.crystals) || s.entities.crystals.some((n) => !Number.isFinite(n))) fail('entities.crystals');
  const w = s.entities.warden;
  if (w !== null && (typeof w?.state !== 'string' || !Number.isFinite(w.x) || !Number.isFinite(w.z) || !Number.isFinite(w.heading))) fail('entities.warden');
  if (!Number.isFinite(s.world?.timeOfDay)) fail('world.timeOfDay');
  if (!Array.isArray(s.terrainPages)) fail('terrainPages');
  if(s.world.sandstorm!==null){
    try{validateStormState(s.world.sandstorm);}catch{fail('world.sandstorm');}
    if(s.world.sandstorm.exposure.through!==s.playSeconds||s.terrainPages.some(p=>!Number.isFinite(p.savedAt)||p.savedAt>s.playSeconds))fail('world.sandstorm.captureClock');
  }
  const inv = s.inventory;
  if (!Array.isArray(inv?.owned) || !Array.isArray(inv.carried) || !Number.isFinite(inv.marks) || inv.marks < 0) fail('inventory');
  for (const w of inv.owned) if (typeof w?.id !== 'string' || !Number.isFinite(w.tier)) fail('inventory.owned[]');
  if (typeof inv.materials !== 'object' || inv.materials === null || typeof inv.pouch !== 'object' || inv.pouch === null) fail('inventory.items');
  if (!Number.isFinite(inv.flask?.charges) || !Number.isFinite(inv.flask?.max) || !Number.isFinite(inv.threads)) fail('inventory.flask');
  if (typeof s.equipped?.weapon !== 'string' || typeof s.equipped.robe !== 'string') fail('equipped');
  const d = s.economy?.drop;
  if (s.economy === undefined || (d !== null && (!Number.isFinite(d?.marks) || !Number.isFinite(d.x) || !Number.isFinite(d.z)))) fail('economy.drop');
  for (const p of s.terrainPages) if (typeof p.key !== 'string' || !(p.data instanceof Uint8Array)) fail('terrainPages[]');
  return s;
}
