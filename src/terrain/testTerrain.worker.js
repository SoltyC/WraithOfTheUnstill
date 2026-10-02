import { buildTestTerrain } from './testTerrainBuild.js';

self.onmessage = (e) => {
  const r = buildTestTerrain(e.data && e.data.cells ? e.data.cells : undefined);
  self.postMessage(r, [r.positions.buffer, r.normals.buffer, r.cavity.buffer, r.indices.buffer]);
};
