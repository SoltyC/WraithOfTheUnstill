// The Sow's farms on the exact ground (world/sow.js): the CPU height field (src/world/worldData.js, the same the game's
// collision samples) over each farm's frame, every 2 m, relative to the height at the house's centre — so its walls and
// terraces lie on the hill however far the 8 m overview is off there. Writes data/world/sowHeights.json.
//   node tools/world/sowHeights.mjs
import fs from 'node:fs';
import { WorldData } from '../../src/world/worldData.js';
import { SOW_FARMS, SOW_GRID } from '../../src/world/sow.js';

const dir = 'data/world/', manifest = JSON.parse(fs.readFileSync(dir + 'manifest.json'));
const rd = (file, T) => { const b = fs.readFileSync(dir + file); return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT); };
const world = new WorldData(manifest);
world.overview = rd(manifest.height.overview.file, Uint16Array); world.biomeA = rd(manifest.biome.files[0], Uint8Array); world.biomeB = rd(manifest.biome.files[1], Uint8Array); world.wind = rd(manifest.wind.file, Uint8Array); world.dunes = rd(manifest.dunes.file, Uint8Array);
for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) world.setTile(x, z, rd(`height/${x}_${z}.u16`, Uint16Array));
const height = (x, z) => { world.qx = x; world.qz = z; world.sample(); return world.h; };
const { u0, f0, step, nu, nf } = SOW_GRID;
const out = { _comment: 'tools/world/sowHeights.mjs: per farm, heights (m) over its frame relative to the house centre; row-major, u fastest.', grid: SOW_GRID, farms: {} };
for (const farm of SOW_FARMS) {
  const c = Math.cos(farm.facing), s = Math.sin(farm.facing), h0 = height(farm.at[0], farm.at[1]), h = [];
  for (let j = 0; j < nf; j++) for (let i = 0; i < nu; i++) {
    const u = u0 + i * step, f = f0 + j * step;
    h.push(Math.round((height(farm.at[0] + u * c + f * s, farm.at[1] - u * s + f * c) - h0) * 100) / 100);
  }
  out.farms[farm.id] = { h0: Math.round(h0 * 100) / 100, h };
}
fs.writeFileSync(dir + 'sowHeights.json', JSON.stringify(out) + '\n');
console.log('sowHeights:', Object.keys(out.farms).length, 'farms,', nu * nf, 'samples each');

// Cinderhold (world/cinderhold.js): the same, over its grid in world axes round its anchor.
{
  const { CINDER, CINDER_GRID: G } = await import('../../src/world/cinderhold.js');
  const h0 = height(CINDER.at[0], CINDER.at[1]), h = [];
  for (let j = 0; j < G.nz; j++) for (let i = 0; i < G.nx; i++) h.push(Math.round((height(CINDER.at[0] + G.x0 + i * G.step, CINDER.at[1] + G.z0 + j * G.step) - h0) * 100) / 100);
  fs.writeFileSync(dir + 'cinderHeights.json', JSON.stringify({ _comment: 'tools/world/sowHeights.mjs: Cinderhold, heights (m) relative to its anchor; row-major, x fastest.', grid: G, h0: Math.round(h0 * 100) / 100, h }) + '\n');
  console.log('cinderHeights:', G.nx * G.nz, 'samples, anchor', h0.toFixed(1));
}

// The Ash Chapel (world/ashChapel.js): the same, over its grid round its anchor.
{
  const { CHAPEL, CHAPEL_GRID: G } = await import('../../src/world/ashChapel.js');
  const h0 = height(CHAPEL.at[0], CHAPEL.at[1]), h = [];
  for (let j = 0; j < G.nz; j++) for (let i = 0; i < G.nx; i++) h.push(Math.round((height(CHAPEL.at[0] + G.x0 + i * G.step, CHAPEL.at[1] + G.z0 + j * G.step) - h0) * 100) / 100);
  fs.writeFileSync(dir + 'chapelHeights.json', JSON.stringify({ _comment: 'tools/world/sowHeights.mjs: the Ash Chapel, heights (m) relative to its anchor; row-major, x fastest.', grid: G, h0: Math.round(h0 * 100) / 100, h }) + '\n');
  console.log('chapelHeights:', G.nx * G.nz, 'samples, anchor', h0.toFixed(1));
}
