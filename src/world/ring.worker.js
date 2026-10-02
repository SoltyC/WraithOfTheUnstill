// Builds the distant mountain ring off the main thread (≈0.25 s) and hands the arrays back.
import { buildRing } from '../terrain/mountainRing.js';

self.onmessage = (e) => {
  const ring = buildRing(e.data.seed);
  self.postMessage(ring, [ring.positions.buffer, ring.normals.buffer, ring.indices.buffer]);
};
