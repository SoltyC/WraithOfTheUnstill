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
  it('upgrades a v1 (Phase 0) save to v2', () => {
    const v1 = {
      version: 1, slot: 'slot1', createdAt: 1, updatedAt: 2, playSeconds: 30,
      player: { pos: [1, 2, 3], yaw: 0.5, element: 0, health: 1, focus: 1 },
      progression: { elements: ['frost'], echoes: ['e1'], robes: ['pilgrim'], robe: 'pilgrim' },
      quests: { old: { state: 'active', vars: {} } },
      world: { timeOfDay: 8, weather: 'overcast', biome: 'frost', restoration: { frost: 'restored' } },
      terrainPages: [{ key: '5', savedAt: 20, data: new Uint8Array([7]) }],
    };
    const s = validateSave(migrate(v1));
    expect(s.version).toBe(2);
    expect(s.quests).toEqual({ quests: {}, flags: [] });
    expect(s.progression.echoes).toEqual(['e1']);
    expect(s.progression.shrines).toEqual([]);
    expect(s.world.restoration.frost).toBe('restored');
    expect(s.world.weatherOverride).toBeNull();
    expect(s.entities).toEqual({ crystals: [], warden: null });
    expect(s.terrainPages[0].data[0]).toBe(7);
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
