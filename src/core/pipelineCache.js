// Pipelines made ahead (docs/perf/performance-plan.md §4): most of a load is Babylon creating pipelines
// one at a time at their first draw, on the GPU process's main thread. So the first load of a build
// records each pipeline's descriptor (shader code, layouts, states) into IndexedDB, and later loads
// replay them through the async calls while the world builds: Dawn compiles those on worker threads,
// then hands Babylon's own synchronous creations the same pipelines from its cache.

const DB = 'wraith-pipelines', STORE = 'sets';
/* global __BUILD_ID__ */
const BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

/** Resources by content: { t: 'm' code | 'b' bind group layout | 'l' pipeline layout, s: text }. */
const res = [], index = new Map(), ids = new WeakMap(), keys = new Set();
const pipes = [];
let recording = false, replaying = false, loaded = 0;
/** What the replay made: kept alive until settled (Dawn's cache holds pipelines weakly). */
let live = null;

const replacer = (k, v) => (v && typeof v === 'object' && ids.has(v) ? { $r: ids.get(v) } : v);
function note(obj, t, s) {
  const key = t + s;
  let id = index.get(key);
  if (id === undefined) { id = res.length; res.push({ t, s }); index.set(key, id); }
  ids.set(obj, id);
}
function notePipe(k, d) {
  if (!recording || replaying) return;
  const s = JSON.stringify(d, replacer), key = k + s;
  if (!keys.has(key)) { keys.add(key); pipes.push({ k, s }); }
}

/** Wrap the device's creators (before anything is made on it). */
export function recordPipelines(device) {
  recording = true;
  const wrap = (name, fn) => { const f = device[name].bind(device); device[name] = (d) => { const r = f(d); if (recording) fn(r, d); return r; }; };
  wrap('createShaderModule', (m, d) => note(m, 'm', d.code));
  wrap('createBindGroupLayout', (b, d) => note(b, 'b', JSON.stringify(d.entries)));
  wrap('createPipelineLayout', (l, d) => note(l, 'l', JSON.stringify(d.bindGroupLayouts, replacer)));
  wrap('createRenderPipeline', (p, d) => notePipe('r', d));
  wrap('createComputePipeline', (p, d) => notePipe('c', d));
}

function open() {
  return new Promise((ok, no) => {
    const q = indexedDB.open(DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(STORE);
    q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error);
  });
}
const tx = (db, mode, fn) => new Promise((ok, no) => {
  const t = db.transaction(STORE, mode), r = fn(t.objectStore(STORE));
  t.oncomplete = () => ok(r.result); t.onerror = t.onabort = () => no(t.error);
});

/** Compile what this build recorded for `name` (a preset): resolves when all are made, or at once with none. */
export async function replayPipelines(device, name) {
  let set = null;
  try { const db = await open(); set = await tx(db, 'readonly', (s) => s.get(BUILD + ':' + name)); db.close(); } catch { return 0; }
  if (!set) return 0;
  const made = new Array(set.res.length), reviver = (k, v) => (v && v.$r !== undefined ? made[v.$r] : v);
  replaying = true;
  for (let i = 0; i < set.res.length; i++) {
    const { t, s } = set.res[i];
    if (t === 'm') { made[i] = device.createShaderModule({ code: s }); note(made[i], t, s); }
    else if (t === 'b') { made[i] = device.createBindGroupLayout({ entries: JSON.parse(s) }); note(made[i], t, s); }
    else { made[i] = device.createPipelineLayout({ bindGroupLayouts: JSON.parse(s, reviver) }); note(made[i], t, s); }
  }
  const all = set.pipes.map((p) => {
    keys.add(p.k + p.s); pipes.push(p);
    const d = JSON.parse(p.s, reviver);
    return (p.k === 'r' ? device.createRenderPipelineAsync(d) : device.createComputePipelineAsync(d)).catch((e) => { console.warn('[pipelines] replay: ' + String(e.message).slice(0, 300)); return null; });
  });
  replaying = false;
  loaded = pipes.length;
  live = [made, await Promise.all(all)];
  return live[1].filter(Boolean).length;
}

/** Loading is over: store the set if it grew, and let go. */
export async function savePipelines(name) {
  recording = false;
  const grew = pipes.length > loaded;
  if (typeof window !== 'undefined' && window.__wraith) window.__wraith.pipelinesNew = pipes.length - loaded;
  try {
    if (grew) {
      const db = await open();
      await tx(db, 'readwrite', (s) => {
        s.getAllKeys().onsuccess = (e) => { for (const k of e.target.result) if (!String(k).startsWith(BUILD + ':')) s.delete(k); };
        return s.put({ res, pipes }, BUILD + ':' + name);
      });
      db.close();
    }
  } catch (e) { console.warn('[pipelines] not stored: ' + e); }
  live = null; res.length = 0; pipes.length = 0; index.clear(); keys.clear();
}
