// Save schema, defaults, validation, and version migrations (BRIEF §4.5).
// A save is plain JSON-compatible data plus binary terrain pages (Uint8Array).

export const SAVE_VERSION = 1;
export const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'];

/**
 * @typedef {{ key: string, savedAt: number, data: Uint8Array }} TerrainPage
 * @typedef {{
 *   version: number, slot: string, createdAt: number, updatedAt: number, playSeconds: number,
 *   player: { pos: number[], yaw: number, element: number, health: number, focus: number },
 *   progression: { elements: string[], echoes: string[], robes: string[], robe: string },
 *   quests: Record<string, { state: string, vars: Record<string, number|string|boolean> }>,
 *   world: { timeOfDay: number, weather: string, biome: string, restoration: Record<string, string> },
 *   terrainPages: TerrainPage[],
 * }} SaveData
 */

/** @returns {SaveData} */
export function createEmptySave(slot = 'auto', now = 0) {
  return {
    version: SAVE_VERSION,
    slot,
    createdAt: now,
    updatedAt: now,
    playSeconds: 0,
    player: { pos: [0, 0, 0], yaw: 0, element: 0, health: 1, focus: 1 },
    progression: { elements: [], echoes: [], robes: ['pilgrim'], robe: 'pilgrim' },
    quests: {},
    world: { timeOfDay: 16.5, weather: 'clear', biome: 'frost', restoration: { frost: 'stilled', meadow: 'stilled', mire: 'stilled', dunes: 'stilled', ember: 'stilled', coast: 'stilled' } },
    terrainPages: [],
  };
}

/**
 * Migrations: `migrations[v]` upgrades a version-v save to v+1. Never edit a shipped migration;
 * add a new one and bump SAVE_VERSION.
 * @type {Record<number, (s: any) => any>}
 */
export const migrations = {};

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
  if (typeof s.quests !== 'object' || s.quests === null) fail('quests');
  if (!Number.isFinite(s.world?.timeOfDay)) fail('world.timeOfDay');
  if (!Array.isArray(s.terrainPages)) fail('terrainPages');
  for (const p of s.terrainPages) if (typeof p.key !== 'string' || !(p.data instanceof Uint8Array)) fail('terrainPages[]');
  return s;
}
