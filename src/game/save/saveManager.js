// Save manager: slots, autosave scheduling, and the worker round-trip.
// Gathering game state is delegated to `collect()` / `apply(save)` callbacks supplied by the
// game, so this module knows nothing about individual systems.
//
// collect() may be async: terrain pages are read back from the GPU across frames.

import { createEmptySave } from './saveSchema.js';

/** Codec facade backed by the save worker. */
export class WorkerCodec {
  constructor() {
    this.worker = new Worker(new URL('./save.worker.js', import.meta.url), { type: 'module' });
    this.nextId = 1;
    /** @type {Map<number, { resolve: Function, reject: Function }>} */
    this.pending = new Map();
    this.worker.onmessage = (e) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result); else p.reject(new Error(e.data.error));
    };
  }
  _call(op, payload, transfer) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, op, payload }, transfer || []);
    });
  }
  encode(save) { return this._call('encode', save); }
  decode(bytes) { return this._call('decode', bytes); }
}

export class SaveManager {
  /**
   * @param {{ store: import('./saveStore.js').SaveStore, codec: { encode: (s: any) => Promise<Uint8Array>, decode: (b: Uint8Array) => Promise<any> },
   *           collect: (save: import('./saveSchema.js').SaveData) => void|Promise<void>, apply: (save: import('./saveSchema.js').SaveData) => void,
   *           now?: () => number, autosaveIntervalSec?: number, clock?: { realDt: number } }} opts
   */
  constructor(opts) {
    this.store = opts.store;
    this.codec = opts.codec;
    this.collect = opts.collect;
    this.apply = opts.apply;
    this.now = opts.now || (() => Date.now());
    this.autosaveIntervalSec = opts.autosaveIntervalSec ?? 300;
    /** @type {{ realDt: number }} */
    this.clock = opts.clock || { realDt: 0 };
    this.sinceAutosave = 0;
    this.busy = false;
    /** The running save (a later save waits on it). */
    this._current = null;
    this.lastError = null;
    this.saveCount = 0;
  }

  /** Called every frame; triggers the periodic autosave. Allocation-free when idle.
   *  Reads real elapsed time from the injected clock (no double argument; see core/loop.js). */
  tick() {
    this.sinceAutosave += this.clock.realDt;
    if (this.sinceAutosave >= this.autosaveIntervalSec && !this.busy) {
      this.sinceAutosave = 0;
      this.save('auto');
    }
  }

  /** Shrines and quest beats call this. */
  requestAutosave() { this.sinceAutosave = this.autosaveIntervalSec; }

  /** Save to a slot. A save asked for while another runs (an autosave) waits for it, then runs. */
  async save(slot) {
    while (this.busy) {
      if (slot === 'auto') return false; // an autosave never queues behind another save
      await this._current;
    }
    this.busy = true;
    let done;
    this._current = new Promise((r) => { done = r; });
    try { return await this._save(slot); } finally { this.busy = false; done(); }
  }

  async _save(slot) {
    try {
      const t = this.now();
      const s = createEmptySave(slot, t);
      await this.collect(s);
      s.updatedAt = t;
      const bytes = await this.codec.encode(s);
      await this.store.put(slot, bytes, { updatedAt: t, playSeconds: s.playSeconds, biome: s.world.biome, timeOfDay: s.world.timeOfDay });
      this.saveCount++;
      return true;
    } catch (e) {
      this.lastError = e;
      console.error('[save] failed', e);
      return false;
    }
  }

  async load(slot) {
    const bytes = await this.store.get(slot);
    if (!bytes) return null;
    const s = await this.codec.decode(bytes);
    this.apply(s);
    return s;
  }

  list() { return this.store.list(); }
}
