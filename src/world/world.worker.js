// World worker (BRIEF §4.2 streaming): fetches and decodes baked data, holds the CPU world
// (WorldData) and computes collision patches, so height math and its garbage never touch the main
// thread. Protocol (all large arrays transferred, never copied twice):
//   → { type:'init', base }                          ← { type:'init', manifest, overview, biomeA, biomeB, wind, surface, hydro }
//   → { type:'tile', tx, tz }                        ← { type:'tile', tx, tz, data: Uint16Array }
//   → { type:'resident', tx, tz }                    (GPU upload done: tile now used for collision)
//   → { type:'patch', id, cx, cz, n, step }          ← { type:'patch', id, x0, z0, n, step, heights: Float32Array }

import { WorldData } from './worldData.js';

let world = null;
let base = '';
const pending = new Map(); // tile key → Uint16Array awaiting GPU-upload confirmation

async function fetchBytes(rel) {
  const r = await fetch(base + rel);
  if (!r.ok) throw new Error('world fetch failed: ' + rel + ' (' + r.status + ')');
  return new Uint8Array(await r.arrayBuffer());
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      base = m.base;
      const manifest = await (await fetch(base + 'manifest.json')).json();
      const [ov, ba, bb, wd, sf, hy] = await Promise.all([
        fetchBytes(manifest.height.overview.file), fetchBytes(manifest.biome.files[0]), fetchBytes(manifest.biome.files[1]),
        fetchBytes(manifest.wind.file), fetchBytes(manifest.surface.file), fetchBytes(manifest.hydro.file),
      ]);
      world = new WorldData(manifest);
      world.overview = new Uint16Array(ov.buffer);
      world.biomeA = ba; world.biomeB = bb; world.wind = wd;
      // Copies for the main thread (GPU upload); the worker keeps its own for collision.
      const out = { type: 'init', manifest, overview: world.overview.slice(), biomeA: ba.slice(), biomeB: bb.slice(), wind: wd.slice(), surface: sf, hydro: hy };
      self.postMessage(out, [out.overview.buffer, out.biomeA.buffer, out.biomeB.buffer, out.wind.buffer, sf.buffer, hy.buffer]);
    } else if (m.type === 'tile') {
      const bytes = await fetchBytes(`height/${m.tx}_${m.tz}.u16`);
      const data = new Uint16Array(bytes.buffer);
      pending.set(m.tz * world.tiles + m.tx, data);
      const copy = data.slice();
      self.postMessage({ type: 'tile', tx: m.tx, tz: m.tz, data: copy }, [copy.buffer]);
    } else if (m.type === 'resident') {
      const k = m.tz * world.tiles + m.tx;
      const data = pending.get(k);
      if (data) { world.setTile(m.tx, m.tz, data); pending.delete(k); }
    } else if (m.type === 'patch') {
      const { n, step } = m;
      const x0 = m.cx - (n - 1) * step * 0.5, z0 = m.cz - (n - 1) * step * 0.5;
      const heights = new Float32Array(n * n);
      for (let j = 0; j < n; j++) {
        world.qz = z0 + j * step;
        for (let i = 0; i < n; i++) {
          world.qx = x0 + i * step;
          world.sample();
          heights[j * n + i] = world.h;
        }
      }
      self.postMessage({ type: 'patch', id: m.id, version: m.version, x0, z0, n, step, heights }, [heights.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
