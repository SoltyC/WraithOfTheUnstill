import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createEmptySave, migrate, validateSave, SAVE_VERSION } from '../src/game/save/saveSchema.js';
import { encodeSave, decodeSave } from '../src/game/save/saveCodec.js';
import { openSaveDb, SaveStore } from '../src/game/save/saveStore.js';
import { SaveManager } from '../src/game/save/saveManager.js';

function sampleSave() {
  const s = createEmptySave('slot1', 1000);
  s.player.pos = [12.5, 3.25, -40.125];
  s.player.yaw = 1.2345;
  s.progression.elements = ['frost'];
  s.quests.quests.lostPilgrim = { state: 'active', step: 2 };
  s.quests.flags = ['woke'];
  s.progression.shrines = ['shrine-frost-1'];
  s.journal.lore = ['first-robe'];
  s.journal.map = 'AAEC';
  s.entities.crystals = [1, 2, 3.5];
  s.entities.warden = { state: 'rested', x: 10, z: -4, heading: 0.5 };
  s.world.restoration.frost = 'restored';
  const page = new Uint8Array(4096);
  for (let i = 0; i < page.length; i++) page[i] = (i * 31) & 255;
  s.terrainPages = [{ key: '12,-3', savedAt: 999, data: page }, { key: '13,-3', savedAt: 998, data: new Uint8Array([1, 2, 3]) }];
  return s;
}

describe('save codec', () => {
  it('round-trips every field, including binary terrain pages', async () => {
    const s = sampleSave();
    const bytes = await encodeSave(s);
    expect(bytes).toBeInstanceOf(Uint8Array);
    const back = await decodeSave(bytes);
    expect(back).toEqual(s);
    expect(back.terrainPages[0].data).toBeInstanceOf(Uint8Array);
  });

  it('compresses repetitive page data', async () => {
    const s = sampleSave();
    s.terrainPages = [{ key: 'flat', savedAt: 0, data: new Uint8Array(1 << 16) }];
    const bytes = await encodeSave(s);
    expect(bytes.byteLength).toBeLessThan(2000);
  });

  it('rejects foreign and truncated data', async () => {
    await expect(decodeSave(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow();
    const bytes = await encodeSave(sampleSave());
    await expect(decodeSave(bytes.subarray(0, bytes.length - 20))).rejects.toThrow();
  });

  it('refuses to encode an invalid save', async () => {
    const s = sampleSave();
    s.player.pos = [0, NaN, 0];
    await expect(encodeSave(s)).rejects.toThrow(/player.pos/);
  });
});

describe('save migrations', () => {
  const table = {
    1: (s) => ({ ...s, version: 2, added: 'x' }),
    2: (s) => ({ ...s, version: 3, added: s.added + 'y' }),
  };
  it('applies steps in order up to the target', () => {
    expect(migrate({ version: 1 }, table, 3)).toEqual({ version: 3, added: 'xy' });
  });
  it('is a no-op at the current version', () => {
    const s = createEmptySave();
    expect(migrate(s)).toBe(s);
    expect(s.version).toBe(SAVE_VERSION);
  });
  it('fails on missing steps, newer saves, and bad step output', () => {
    expect(() => migrate({ version: 0 }, table, 3)).toThrow(/no migration/);
    expect(() => migrate({ version: 9 }, table, 3)).toThrow(/newer/);
    expect(() => migrate({ version: 1 }, { 1: (s) => ({ ...s, version: 5 }) }, 3)).toThrow(/must produce/);
  });
  it('upgrades a v1 (Phase 0) save through v2 to the current version', () => {
    const v1 = {
      version: 1, slot: 'slot1', createdAt: 1, updatedAt: 2, playSeconds: 30,
      player: { pos: [1, 2, 3], yaw: 0.5, element: 0, health: 1, focus: 1 },
      progression: { elements: ['frost'], echoes: ['e1'], robes: ['pilgrim'], robe: 'pilgrim' },
      quests: { old: { state: 'active', vars: {} } },
      world: { timeOfDay: 8, weather: 'overcast', biome: 'frost', restoration: { frost: 'restored' } },
      terrainPages: [{ key: '5', savedAt: 20, data: new Uint8Array([7]) }],
    };
    const s = validateSave(migrate(v1));
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.quests).toEqual({ quests: {}, flags: [] });
    expect(s.progression.echoes).toEqual(['e1']);
    expect(s.progression.shrines).toEqual([]);
    expect(s.world.restoration.frost).toBe('restored');
    expect(s.world.weatherOverride).toBeNull();
    expect(s.entities).toEqual({ crystals: [], warden: null });
    expect(s.terrainPages[0].data[0]).toBe(7);
  });
  it('upgrades a v2 save to v3: weapons from the quest flags, the robe, an empty purse and a back-pay request', async () => {
    const v2 = {
      ...createEmptySave('slot1', 5), version: 2, quests: { quests: { 'meadow-the-missing': { state: 'active', step: 1, opt: [] } }, flags: ['woke', 'own:sickles', 'own:maul'], vars: { robe: 'rime-hide' } },
    };
    delete v2.inventory; delete v2.equipped; delete v2.economy;
    const s = validateSave(migrate(v2));
    expect(s.version).toBe(3);
    expect(s.inventory.owned.map((w) => w.id)).toEqual(['staff', 'sickles', 'maul']);
    expect(s.inventory.carried).toEqual(['staff', 'maul']);
    expect(s.inventory.marks).toBe(0);
    expect(s.inventory.flask).toEqual({ charges: 3, max: 3 });
    expect(s.equipped).toEqual({ weapon: 'staff', robe: 'rime-hide', mantle: null });
    expect(s.economy).toEqual({ stocks: null, drop: null, purse: 10, backPay: true });
    expect(s.quests.flags).toEqual(['woke', 'own:sickles', 'own:maul']);       // nothing else is touched
    // The migrated save encodes and decodes.
    expect((await decodeSave(await encodeSave(s))).inventory.owned.length).toBe(3);
  });
  it('a v3 save carries the whole economy through the codec', async () => {
    const s = createEmptySave('slot2', 9);
    s.inventory.marks = 321; s.inventory.materials['hedge-heart'] = 4; s.inventory.pouch.tea = 2; s.inventory.threads = 2;
    s.inventory.flask = { charges: 1, max: 4 }; s.inventory.owned[0].tier = 3; s.inventory.owned[0].infusion = 'frost';
    s.economy = { stocks: { corin: { salve: 1 } }, drop: { marks: 55, x: 10.5, z: -7 }, purse: 4.5, backPay: false };
    expect(await decodeSave(await encodeSave(s))).toEqual(s);
  });
  it('rejects a malformed economy block', () => {
    const s = createEmptySave('slot1');
    s.economy.drop = { marks: 5, x: NaN, z: 0 };
    expect(() => validateSave(s)).toThrow(/economy/);
    const t = createEmptySave('slot1'); t.inventory.marks = -1;
    expect(() => validateSave(t)).toThrow(/inventory/);
  });
  it('validates the current schema', () => {
    expect(() => validateSave(createEmptySave('slot2'))).not.toThrow();
    expect(() => validateSave({ ...createEmptySave(), slot: 'nope' })).toThrow(/slot/);
  });
});

describe('save store and manager', () => {
  it('persists through IndexedDB and lists slots newest first', async () => {
    const db = await openSaveDb(new IDBFactory());
    const store = new SaveStore(db);
    await store.put('slot1', new Uint8Array([1]), { updatedAt: 1 });
    await store.put('slot2', new Uint8Array([2, 2]), { updatedAt: 5 });
    expect(Array.from(await store.get('slot2'))).toEqual([2, 2]);
    expect((await store.list()).map((r) => r.slot)).toEqual(['slot2', 'slot1']);
    await store.delete('slot1');
    expect(await store.get('slot1')).toBeNull();
  });

  it('saves game state and restores it on load', async () => {
    const db = await openSaveDb(new IDBFactory());
    const game = { pos: [1, 2, 3], time: 6.5 };
    const mgr = new SaveManager({
      store: new SaveStore(db),
      codec: { encode: encodeSave, decode: decodeSave },
      collect: (s) => { s.player.pos = [...game.pos]; s.world.timeOfDay = game.time; },
      apply: (s) => { game.pos = s.player.pos; game.time = s.world.timeOfDay; },
      now: () => 42,
    });
    expect(await mgr.save('slot3')).toBe(true);
    game.pos = [0, 0, 0]; game.time = 0;
    const loaded = await mgr.load('slot3');
    expect(loaded.updatedAt).toBe(42);
    expect(game).toEqual({ pos: [1, 2, 3], time: 6.5 });
    expect(await mgr.load('slot1')).toBeNull();
  });

  it('awaits an asynchronous collect (terrain pages read back across frames)', async () => {
    const db = await openSaveDb(new IDBFactory());
    const mgr = new SaveManager({
      store: new SaveStore(db), codec: { encode: encodeSave, decode: decodeSave },
      collect: async (s) => { await new Promise((r) => setTimeout(r, 5)); s.terrainPages = [{ key: '9', savedAt: 1, data: new Uint8Array([4, 5]) }]; },
      apply: () => {}, now: () => 1,
    });
    expect(await mgr.save('slot1')).toBe(true);
    const back = await mgr.load('slot1');
    expect(Array.from(back.terrainPages[0].data)).toEqual([4, 5]);
  });

  it('a save asked for during an autosave waits for it instead of failing', async () => {
    const db = await openSaveDb(new IDBFactory());
    let release;
    const gate = new Promise((r) => { release = r; });
    let first = true;
    const mgr = new SaveManager({
      store: new SaveStore(db), codec: { encode: encodeSave, decode: decodeSave },
      collect: async () => { if (first) { first = false; await gate; } }, apply: () => {}, now: () => 1,
    });
    const auto = mgr.save('auto');
    const manual = mgr.save('slot2');
    expect(await mgr.save('auto')).toBe(false); // a second autosave does not queue
    release();
    expect(await auto).toBe(true);
    expect(await manual).toBe(true);
    expect((await mgr.list()).map((r) => r.slot).sort()).toEqual(['auto', 'slot2']);
  });

  it('autosaves on the interval and on request', async () => {
    let saved = 0;
    const clock = { realDt: 0 };
    const mgr = new SaveManager({ store: {}, codec: {}, collect() {}, apply() {}, clock, autosaveIntervalSec: 10 });
    mgr.save = async () => { saved++; return true; };
    clock.realDt = 4; mgr.tick(); mgr.tick();
    expect(saved).toBe(0);
    mgr.tick();
    expect(saved).toBe(1);
    mgr.requestAutosave(); clock.realDt = 0; mgr.tick();
    expect(saved).toBe(2);
  });
});
