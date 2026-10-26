// Arena features round each armed encounter, from the baked world: the share of the fight disc (spawn ring
// radius + 8 m) that is water/ice (lake or river), surfable slope (0.12-0.6 rise/run), cliff (>0.6), and its relief.
//   node tools/world/arena.mjs [x z radius]     (no arguments: every encounter in src/systems/encounters.js)
import fs from 'node:fs';
import { createWorldSampler } from './sample.mjs';
const S = createWorldSampler();
export function arenaStats(x, z, R, step = 3) {
  let n = 0, water = 0, slope = 0, cliff = 0, lo = 1e9, hi = -1e9;
  for (let dz = -R; dz <= R; dz += step) for (let dx = -R; dx <= R; dx += step) {
    if (dx * dx + dz * dz > R * R) continue;
    const px = x + dx, pz = z + dz, w = S.water(px, pz), s = S.slope(px, pz), h = S.h(px, pz);
    n++; if (w.lake > 60 || w.river > 60) water++; if (s >= 0.12 && s <= 0.6) slope++; else if (s > 0.6) cliff++;
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  return { R, water: +(water / n).toFixed(2), slope: +(slope / n).toFixed(2), cliff: +(cliff / n).toFixed(2), relief: +(hi - lo).toFixed(1) };
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  if (process.argv[2]) console.log(JSON.stringify(arenaStats(+process.argv[2], +process.argv[3], +process.argv[4] || 30)));
  else {
    const pois = JSON.parse(fs.readFileSync(new URL('../../data/world/pois.json', import.meta.url)));
    const q = JSON.parse(fs.readFileSync(new URL('../../data/quests/frost.json', import.meta.url)));
    const pos = {}; for (const p of pois.pois || pois) pos[p.id] = p.pos; for (const k in q.places) pos[k] = q.places[k].pos;
    const src = fs.readFileSync(new URL('../../src/systems/encounters.js', import.meta.url), 'utf8');
    for (const m of src.matchAll(/'?([\w-]+)'?: \{ quest: '[\w-]+', step: '[\w-]+',(?: flag: '\w+',)? at: '([\w-]+)'/g)) {
      const p = pos[m[2]]; if (!p) continue;
      console.log(m[1].padEnd(14), m[2].padEnd(14), JSON.stringify(arenaStats(p[0], p[1], 35)));
    }
  }
}
