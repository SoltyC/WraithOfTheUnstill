// Seats the nooks (data/nooks.json) on the baked world: `node tools/world/placeNooks.mjs [--check]`.
// Each nook's `want` is snapped to the best spot within `snap.r` m: dry, gentle, clear of the village
// and of every built place, 40 m from the next nook; a view prefers a crest that sees `snap.see`; the
// fallen log goes where a stream is narrowest. Writes pos, h (baked height) and facing back to the file.
// --check only reports (exit 1 if one has to move).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorldSampler } from './sample.mjs';
import { dryLevel, prominence, sees } from './nookfind.mjs';
import { villageKeepout } from '../../src/world/villageKeepout.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../');
const read = (f) => JSON.parse(fs.readFileSync(root + f, 'utf8'));
/** Metres a built place keeps clear round its anchor (a nook must not stand inside it). */
const CLEAR = { monastery: 45, camp: 32, spring: 22, shrine: 14, 'echo-stone': 12, den: 20, 'warden-arena': 70, manor: 90, settlement: 70, 'stair-foot': 25, place: 12 };

/** Every anchor a nook must keep off: baked POIs, quest places and the stair. */
export function anchors() {
  const out = [];
  for (const p of read('data/world/pois.json').pois) out.push({ id: p.id, x: p.pos[0], z: p.pos[1], r: CLEAR[p.kind] ?? 14 });
  for (const f of ['frost', 'meadow', 'meadow-side']) {
    const d = read(`data/quests/${f}.json`);
    for (const id in d.places || {}) out.push({ id, x: d.places[id].pos[0], z: d.places[id].pos[1], r: id === 'side-stone-ring' ? 18 : id.startsWith('side-ring') ? 12 : CLEAR.place });
  }
  return out;
}

export function place(nooks, { S = createWorldSampler() } = {}) {
  const keep = villageKeepout(read('data/world/village.json'), { margin: 4 }), anc = anchors(), done = [];
  const res = [];
  for (const n of nooks) {
    const [wx, wz] = n.want, r = n.snap?.r ?? 40, see = n.snap?.see;
    let best = null;
    const ok = (x, z) => {
      if (keep(x, z, 6)) return false;
      for (const a of anc) if (Math.hypot(a.x - x, a.z - z) < a.r + 3) return false;
      for (const o of done) if (Math.hypot(o[0] - x, o[1] - z) < 40) return false;
      return true;
    };
    if (n.snap?.river) {
      // The narrowest, gentlest crossing of the stream: the river weight across it (perpendicular to its run) is least.
      for (let dx = -r; dx <= r; dx += 3) for (let dz = -r; dz <= r; dz += 3) {
        const x = wx + dx, z = wz + dz, w = S.water(x, z);
        if (w.river < 100 || w.lake > 10 || !ok(x, z)) continue;
        const sc = Math.hypot(dx, dz) + S.slope(x, z) * 20;
        if (!best || sc < best.sc) best = { x, z, sc };
      }
    } else {
      for (let dx = -r; dx <= r; dx += 4) for (let dz = -r; dz <= r; dz += 4) {
        const x = wx + dx, z = wz + dz;
        if (Math.hypot(dx, dz) > r || !dryLevel(S, x, z, 0.22) || !ok(x, z)) continue;
        if (see && !sees(S, x, z, see[0], see[1])) continue;
        const sc = Math.hypot(dx, dz) * 0.25 + S.slope(x, z) * 30 - (n.snap?.crest ? prominence(S, x, z) * 1.5 : 0);
        if (!best || sc < best.sc) best = { x, z, sc };
      }
    }
    if (!best) { res.push({ id: n.id, failed: true }); continue; }
    const x = Math.round(best.x * 10) / 10, z = Math.round(best.z * 10) / 10;
    done.push([x, z]);
    // Facing: toward what it shows (a view's target, a marker's goal), else across the slope.
    let face;
    const target = n.kind === 'marker' && n.payoff.guide ? anchors().find((a) => a.id === n.payoff.guide[0]) : see ? { x: see[0], z: see[1] } : null;
    if (target) face = Math.atan2(target.x - x, target.z - z);
    else if (n.snap?.river) {
      // Along the bank: the log runs across the stream, so face along it (perpendicular to the stream's run).
      let sx = 0, sz = 0, c = 0;
      for (let a = 0; a < 16; a++) { const ax = Math.sin(a / 16 * Math.PI * 2), az = Math.cos(a / 16 * Math.PI * 2); for (let d = 6; d <= 18; d += 6) if (S.water(x + ax * d, z + az * d).river > 80) { sx += ax * ax; sz += az * az; c++; } }
      let ang = 0, bestDev = 1e9;
      for (let a = 0; a < 32; a++) { // the direction with the least river along it is across the stream
        const ax = Math.sin(a / 32 * Math.PI), az = Math.cos(a / 32 * Math.PI); let cnt = 0;
        for (let d = -16; d <= 16; d += 4) if (S.water(x + ax * d, z + az * d).river > 80) cnt++;
        if (cnt < bestDev) { bestDev = cnt; ang = a / 32 * Math.PI; }
      }
      face = ang;
    } else face = (Math.imul(n.id.length * 2654435761 + n.id.charCodeAt(n.id.length - 1), 40503) % 628) / 100;
    res.push({ id: n.id, pos: [x, z], h: Math.round(S.h(x, z) * 100) / 100, facing: Math.round(face * 100) / 100, moved: Math.round(Math.hypot(x - wx, z - wz)), meadow: +S.meadow(x, z).toFixed(2) });
  }
  return res;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = root + 'data/nooks.json', data = read('data/nooks.json'), res = place(data.nooks);
  let bad = 0;
  for (const r of res) {
    const n = data.nooks.find((x) => x.id === r.id);
    if (r.failed) { console.log('FAILED', r.id); bad++; continue; }
    n.pos = r.pos; n.h = r.h; n.facing = r.facing;
    n.biome = r.meadow > 0.5 ? 'meadow' : 'frost';
    console.log(r.id.padEnd(26), r.pos.join(', ').padEnd(16), 'h', r.h, 'moved', r.moved, 'm', n.biome);
  }
  if (!process.argv.includes('--check') && !bad) fs.writeFileSync(file, JSON.stringify(data, null, 2).replace(/\n\s+("snap"|"payoff"|"id"|"biome"|"kind"|"shape"|"name"|"verb"|"want"|"pos"|"h"|"facing")/g, ' $1').replace(/\{\s+"/g, '{ "').replace(/,\s+"(snap|payoff|id|biome|kind|shape|name|verb|want|pos|h|facing)"/g, ', "$1"') + '\n');
  process.exit(bad ? 1 : 0);
}
