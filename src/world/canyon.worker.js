// Canyon wall kit worker (world/canyonKit.js): fetches the baked cliff lines once, builds every
// chunk's coarse levels at init, and its near level on request, off the main thread (a near chunk
// is up to ~70k vertices). Arrays are transferred.
//   → { type: 'init', url }   ← { type: 'init', chunks: [{ key, cx, cz, radius, y0, y1 }], lods: [[mid, far] per chunk] }
//   → { type: 'build', i, l } ← { type: 'build', i, l, geo }

import { buildCanyonKit, CANYON_LODS } from './canyonKit.js';

let chunks = null;
const pack = (g) => [g.positions.buffer, g.normals.buffer, g.uvs.buffer, g.cliff.buffer, g.indices.buffer];
const copy = (g) => ({ positions: g.positions.slice(), normals: g.normals.slice(), uvs: g.uvs.slice(), cliff: g.cliff.slice(), indices: g.indices.slice() });

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    const data = await (await fetch(m.url)).json();
    chunks = buildCanyonKit(data);
    const meta = chunks.map((c) => ({ key: c.key, cx: c.cx, cz: c.cz, radius: c.radius, y0: c.y0, y1: c.y1 }));
    // Every coarse level now (the far one is kept here as the bounds' source: send a copy).
    const lods = chunks.map((c) => { const out = []; for (let l = 1; l < CANYON_LODS.length; l++) out.push(l === CANYON_LODS.length - 1 ? copy(c.far) : c.build(l)); return out; });
    self.postMessage({ type: 'init', chunks: meta, lods }, lods.flat().flatMap(pack));
  } else if (m.type === 'build' && chunks) {
    const geo = chunks[m.i].build(m.l);
    self.postMessage({ type: 'build', i: m.i, l: m.l, geo }, pack(geo));
  }
};
