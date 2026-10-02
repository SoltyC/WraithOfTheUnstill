// Terrain-state page store (BRIEF §4.3 off-screen healing). Holds evicted coarse pages, each
// serialised with the game time it left the GPU; a reload heals it in closed form for the
// elapsed time against the bake's surface materials. Protocol:
//   → { type:'init', base }                                  (fetches the surface map)
//   → { type:'store', key, time, words: Uint32Array }        (evicted page, transferred)
//   → { type:'drop', key }                                   (history overwritten by a fresh write)
//   → { type:'load', key, time }                             ← { type:'page', key, words } | { type:'page', key, words: null }

import { PAGE_N, COARSE_PER_M, WORLD_HALF, pageOriginCoarse } from './layout.js';
import { unpackPage, packPage, allocPlanes, healPlanes } from './healing.js';

let surface = null; // Uint8Array rgba8, 2048², 4 m texels, row 0 = north
let surfaceN = 0, surfaceTexel = 0;
const store = new Map(); // key → { time, words }
const planes = allocPlanes();
const tmp = new Float32Array(PAGE_N * PAGE_N);
const origin = [0, 0];
let initDone = null;

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    initDone = (async () => {
      const manifest = await (await fetch(m.base + 'manifest.json')).json();
      const r = await fetch(m.base + manifest.surface.file);
      surface = new Uint8Array(await r.arrayBuffer());
      surfaceN = manifest.surface.size; surfaceTexel = manifest.surface.texel;
    })();
  } else if (m.type === 'drop') {
    store.delete(m.key);
  } else if (m.type === 'store') {
    store.set(m.key, { time: m.time, words: m.words });
  } else if (m.type === 'load') {
    await initDone;
    const entry = store.get(m.key);
    if (!entry) { self.postMessage({ type: 'page', key: m.key, words: null }); return; }
    store.delete(m.key);
    pageOriginCoarse(m.key, origin);
    const ox = origin[0], oz = origin[1];
    const material = (i) => {
      const x = (ox + (i % PAGE_N) + 0.5) / COARSE_PER_M, z = (oz + Math.floor(i / PAGE_N) + 0.5) / COARSE_PER_M;
      const col = Math.min(surfaceN - 1, Math.max(0, Math.floor((x + WORLD_HALF) / surfaceTexel)));
      const row = Math.min(surfaceN - 1, Math.max(0, Math.floor((WORLD_HALF - z) / surfaceTexel)));
      return surface[(row * surfaceN + col) * 4];
    };
    unpackPage(entry.words, planes);
    healPlanes(planes, Math.max(0, m.time - entry.time), material, tmp);
    packPage(planes, entry.words);
    self.postMessage({ type: 'page', key: m.key, words: entry.words }, [entry.words.buffer]);
  }
};
