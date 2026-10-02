// Save worker: encodes/decodes off the main thread so saving never hitches (BRIEF §4.5).
import { encodeSave, decodeSave } from './saveCodec.js';

self.onmessage = async (e) => {
  const { id, op, payload } = e.data;
  try {
    if (op === 'encode') {
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
