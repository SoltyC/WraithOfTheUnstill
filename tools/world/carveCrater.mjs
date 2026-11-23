// Apply the crater's pit (src/world/crater.js) to the height tiles and the 8 m overview, without a full rebake, and refresh
// their hashes in the manifest. It starts from git HEAD's tiles each time (the tiles before the pit), so it can be re-run.
//   node tools/world/carveCrater.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

/** A world file as it is at BASE (the commit before the pit; default HEAD). */
const BASE = process.env.BASE || 'HEAD';
const original = (file) => execFileSync('git', ['show', `${BASE}:data/world/${file}`], { maxBuffer: 64 << 20 });
import { PIT, carveCrater } from '../../src/world/crater.js';

const dir = 'data/world/', manifest = JSON.parse(original('manifest.json'));
const H = manifest.height, T = H.tile, n2 = H.size, c2 = H.texel, half = n2 * c2 / 2, SCALE = 32, OFFSET = 128;
const tiles = new Map();
const tileOf = (i, j) => {
  const tx = i >> 8, tz = j >> 8, key = `${tx}_${tz}`;
  if (!tiles.has(key)) { const b = original(`height/${key}.u16`); tiles.set(key, { data: new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), dirty: false }); }
  return tiles.get(key);
};
const get = (i, j) => { const t = tileOf(i, j); return t.data[(j & 255) * T + (i & 255)] / SCALE - OFFSET; };
const set = (i, j, m) => { const t = tileOf(i, j); t.data[(j & 255) * T + (i & 255)] = Math.max(0, Math.min(65535, Math.round((m + OFFSET) * SCALE))); t.dirty = true; };
const R = PIT.reach + 4;
const n = carveCrater(get, set, PIT.x - R, PIT.x + R, PIT.z - R, PIT.z + R, c2, half);
// The overview (8 m): the mean of its 4×4 texels, over the touched area.
const ovFile = dir + H.overview.file, ob = original(H.overview.file), ov = new Uint16Array(ob.buffer.slice(ob.byteOffset, ob.byteOffset + ob.byteLength));
const n8 = H.overview.size, k = n2 / n8;
const oi0 = Math.floor((PIT.x - R + half) / (c2 * k)), oi1 = Math.ceil((PIT.x + R + half) / (c2 * k)), oj0 = Math.floor((half - PIT.z - R) / (c2 * k)), oj1 = Math.ceil((half - PIT.z + R) / (c2 * k));
for (let j = oj0; j <= oj1; j++) for (let i = oi0; i <= oi1; i++) {
  let s = 0;
  for (let b = 0; b < k; b++) for (let a = 0; a < k; a++) { const t = tileOf(i * k + a, j * k + b); s += t.data[((j * k + b) & 255) * T + ((i * k + a) & 255)]; }
  ov[j * n8 + i] = Math.round(s / (k * k));
}
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
for (const [key, t] of tiles) if (t.dirty) { const buf = Buffer.from(t.data.buffer); fs.writeFileSync(`${dir}height/${key}.u16`, buf); manifest.files[`height/${key}.u16`] = sha(buf); }
const obuf = Buffer.from(ov.buffer); fs.writeFileSync(ovFile, obuf); manifest.files[H.overview.file] = sha(obuf);
fs.writeFileSync(dir + 'manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('crater:', n, 'texels lowered in', [...tiles].filter(([, t]) => t.dirty).map(([k]) => k).join(' '));
