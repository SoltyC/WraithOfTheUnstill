// Save worker: encodes/decodes off the main thread so saving never hitches (BRIEF §4.5).
import { encodeSave, decodeSave } from './saveCodec.js';

self.onmessage = async (e) => {
  const { id, op, payload } = e.data;
  try {
    if (op === 'encode') {
      // Pages healed back to rest hold nothing: leave them out (the worker scans, not the game).
      payload.terrainPages = payload.terrainPages.filter((p) => !isEmpty(p.data));
      const bytes = await encodeSave(payload);
      self.postMessage({ id, ok: true, result: bytes }, [bytes.buffer]);
    } else if (op === 'decode') {
      const save = await decodeSave(payload);
      self.postMessage({ id, ok: true, result: save });
    } else throw new Error('unknown op ' + op);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};

function isEmpty(bytes) {
  const w = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 2);
  for (let i = 0; i < w.length; i++) if (w[i] !== 0) return false;
  for (let i = w.length << 2; i < bytes.byteLength; i++) if (bytes[i] !== 0) return false;
  return true;
}
