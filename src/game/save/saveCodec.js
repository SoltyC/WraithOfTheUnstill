// Binary save codec. Layout (before compression):
//   'WRTH' | u32 format | u32 jsonByteLength | json utf-8 | page blobs concatenated
// The JSON holds everything except page bytes; each page entry records its blob length.
// The whole buffer is deflate-compressed with CompressionStream (browser and Node ≥ 18).
// Runs on the save worker in the game; directly in tests.

import { migrate, validateSave } from './saveSchema.js';

const MAGIC = 0x48545257; // 'WRTH' little-endian
const FORMAT = 1;

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** @param {import('./saveSchema.js').SaveData} save @returns {Promise<Uint8Array>} */
export async function encodeSave(save) {
  validateSave(save);
  const pages = save.terrainPages;
  const meta = { ...save, terrainPages: pages.map((p) => ({ key: p.key, savedAt: p.savedAt, len: p.data.byteLength })) };
  const json = new TextEncoder().encode(JSON.stringify(meta));
  let blobLen = 0;
  for (const p of pages) blobLen += p.data.byteLength;
  const buf = new Uint8Array(12 + json.byteLength + blobLen);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, FORMAT, true);
  dv.setUint32(8, json.byteLength, true);
  buf.set(json, 12);
  let o = 12 + json.byteLength;
  for (const p of pages) { buf.set(p.data, o); o += p.data.byteLength; }
  return pipe(buf, new CompressionStream('deflate-raw'));
}

/** @param {Uint8Array} bytes @returns {Promise<import('./saveSchema.js').SaveData>} */
export async function decodeSave(bytes) {
  const buf = await pipe(bytes, new DecompressionStream('deflate-raw'));
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.byteLength < 12 || dv.getUint32(0, true) !== MAGIC) throw new Error('not a Wraith save');
  const format = dv.getUint32(4, true);
  if (format !== FORMAT) throw new Error('unknown save container format ' + format);
  const jsonLen = dv.getUint32(8, true);
  const meta = JSON.parse(new TextDecoder().decode(buf.subarray(12, 12 + jsonLen)));
  let o = 12 + jsonLen;
  const pages = [];
  for (const p of meta.terrainPages) {
    if (o + p.len > buf.byteLength) throw new Error('truncated save');
    pages.push({ key: p.key, savedAt: p.savedAt, data: buf.slice(o, o + p.len) });
    o += p.len;
  }
  meta.terrainPages = pages;
  return validateSave(migrate(meta));
}
