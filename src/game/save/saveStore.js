// IndexedDB persistence for encoded saves. One record per slot: { slot, bytes, updatedAt, summary }.
// `summary` is a small plain object for the load menu, so listing never decodes saves.

const DB_NAME = 'wraith-of-the-unstill';
const DB_VERSION = 1;
const STORE = 'saves';

/** @param {IDBFactory} [idb] injectable for tests */
export function openSaveDb(idb = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'slot' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    const req = fn(store);
    if (req) req.onsuccess = () => { result = req.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export class SaveStore {
  /** @param {IDBDatabase} db */
  constructor(db) { this.db = db; }

  /** @param {string} slot @param {Uint8Array} bytes @param {object} summary */
  put(slot, bytes, summary) {
    return tx(this.db, 'readwrite', (s) => s.put({ slot, bytes, updatedAt: summary.updatedAt ?? 0, summary }));
  }

  /** @returns {Promise<Uint8Array|null>} */
  async get(slot) {
    const rec = await tx(this.db, 'readonly', (s) => s.get(slot));
    return rec ? rec.bytes : null;
  }

  /** @returns {Promise<{ slot: string, updatedAt: number, summary: object }[]>} */
  async list() {
    const all = await tx(this.db, 'readonly', (s) => s.getAll());
    return (all || []).map((r) => ({ slot: r.slot, updatedAt: r.updatedAt, summary: r.summary })).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  delete(slot) { return tx(this.db, 'readwrite', (s) => s.delete(slot)); }
}
