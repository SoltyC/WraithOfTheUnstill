// Payoff interval of the natural routes (docs/gameplay-design.md §6, §9): walks each route over the
// baked world at a travel pace and logs the seconds between payoffs (a POI, shrine, quest site, vista
// or nook the route comes within sight of). `node tools/world/payoff.mjs [--before] [--json]`.
// --before leaves the nooks out (the numbers from before the nook pass). Targets: a payoff every
// 60-90 s of travel in dense areas, never more than 180 s (the Empty stretch smell).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRouter } from './route.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../');
const read = (f) => JSON.parse(fs.readFileSync(root + f, 'utf8'));

/** Metres at which the route "gets" a payoff of this kind (what a player would turn toward). */
export const SIGHT = { monastery: 80, camp: 55, spring: 40, overlook: 40, 'warden-arena': 80, shrine: 30, 'echo-stone': 25, den: 35, place: 35, settlement: 80, 'stair-foot': 40, nook: 22 };

/** Natural routes: waypoints (x, z) joined by the least-effort path over the baked ground (route.mjs), and the pace (m/s) the
 *  route is travelled at (frost: surf and climbs; meadow: on foot). The far legs are the walks that unlock the outlying shrines. */
export const ROUTES = [
  { id: 'frost: monastery > shrine 2 > pilgrims\' fire', pace: 7, pts: [[1125, 2750], [990, 2510], [880, 2450]] },
  { id: 'frost: fire > spring > shrine 3 > echo stone 4', pace: 7, pts: [[880, 2450], [740, 2462], [600, 2470], [640, 2400], [400, 2300]] },
  { id: 'frost: fire > watching stone > Warden > shrine 5', pace: 7, pts: [[880, 2450], [960, 2350], [1092, 2276], [1480, 2260]] },
  { id: 'frost: shrine 5 > den > echo stone 3 > monastery', pace: 7, pts: [[1480, 2260], [1620, 2560], [1500, 2700], [1190, 2770]] },
  { id: 'frost: monastery > shrine 4 > echo stone 1 > spring', pace: 7, pts: [[1125, 2750], [760, 2800], [640, 2780], [600, 2470]] },
  { id: 'frost: monastery > echo stone 6', pace: 7, pts: [[1125, 2750], [1330, 2960]] },
  { id: 'frost: spring > echo stone 4 > the south shore', pace: 7, pts: [[600, 2470], [400, 2300], [450, 1750]] },
  { id: 'journey: fire > echo stone 5 > the snowline > Hearn', pace: 6.5, pts: [[880, 2450], [1000, 1980], [700, 1700], [450, 1480], [60, 990]] },
  { id: 'meadow: North Road > Hearn > green shrine > barley', pace: 5.2, pts: [[169, 1181], [60, 990], [22, 979], [22, 1108]] },
  { id: 'meadow: Hearn > stair foot > Ring of Nine', pace: 5.2, pts: [[60, 990], [142, 869], [233, 744]] },
  { id: 'meadow: Hearn > Fen Lamp > Listening Stones', pace: 5.2, pts: [[60, 990], [-294, 1144], [-180, 924], [60, 990]] },
  { id: 'meadow: Hearn > the east plain > Ring of Nine', pace: 5.2, pts: [[60, 990], [420, 1130], [233, 744]] },
  { id: 'meadow: Hearn > shrine 1 > Western Edge > glide course', pace: 5.2, pts: [[60, 990], [-540, 484], [-847, 546], [-1081, 313]] },
  { id: 'far: Hearn > shrine 3 (east)', pace: 5.2, pts: [[60, 990], [1348, -348]] },
  { id: 'far: Hearn > shrine 4 (south)', pace: 5.2, pts: [[60, 990], [132, -1404]] },
  { id: 'far: shrine 1 > shrine 5 (south-west)', pace: 5.2, pts: [[-540, 484], [-1884, -956]] },
];
const router = createRouter();
const expanded = new Map();
/** The route's dense polyline [[x, z], ...] (cached). */
export function line(route) {
  if (!expanded.has(route.id)) {
    const out = [];
    for (let i = 0; i + 1 < route.pts.length; i++) out.push(...router(route.pts[i], route.pts[i + 1], { pad: 700 }).slice(i ? 1 : 0));
    expanded.set(route.id, out);
  }
  return expanded.get(route.id);
}

/** Every payoff: { id, kind, x, z, r }. */
export function payoffs({ nooks = true } = {}) {
  const out = [];
  const add = (id, kind, pos) => out.push({ id, kind, x: pos[0], z: pos[1], r: SIGHT[kind] ?? 40 });
  for (const p of read('data/world/pois.json').pois) if (p.biome === 'frost' || p.biome === 'meadow') add(p.id, p.kind === 'manor' ? 'warden-arena' : p.kind, p.pos);
  for (const f of ['frost', 'meadow', 'meadow-side']) {
    const d = read(`data/quests/${f}.json`);
    for (const id in d.places || {}) {
      if (out.some((o) => o.id === id)) continue;
      if (/^side-ring-[2-6]$/.test(id) || id === 'meadow-hall' || id === 'meadow-ebb-house' || id === 'meadow-mother' || id === 'meadow-market' || id === 'side-echo-shore' || id === 'warden-brazier') continue;
      add(id, 'place', d.places[id].pos);
    }
  }
  if (nooks && fs.existsSync(root + 'data/nooks.json')) for (const n of read('data/nooks.json').nooks) add(n.id, 'nook', n.pos);
  return out;
}

/** Walk one route: the payoff events (time, id) along it and the gaps between them. */
export function walk(route, list) {
  const ev = [], seen = new Set(), pts = line(route);
  let t = 0;
  const hit = (x, z) => { for (const p of list) if (!seen.has(p.id) && Math.hypot(p.x - x, p.z - z) < p.r) { seen.add(p.id); ev.push({ t, id: p.id }); } };
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
    for (let d = 0; d < len; d += 4) { hit(ax + (bx - ax) * d / len, az + (bz - az) * d / len); t += 4 / route.pace; }
  }
  const total = t;
  ev.sort((a, b) => a.t - b.t);
  const gaps = [];
  let last = 0, lastId = 'start';
  for (const e of ev) { gaps.push({ from: lastId, to: e.id, s: e.t - last }); last = e.t; lastId = e.id; }
  gaps.push({ from: lastId, to: 'end', s: total - last });
  return { total, events: ev.length, gaps };
}

export function report(opts = {}) {
  const list = payoffs(opts), rows = [];
  for (const r of ROUTES) {
    const w = walk(r, list), s = w.gaps.map((g) => g.s);
    rows.push({ far: r.id.startsWith('far'), route: r.id, minutes: +(w.total / 60).toFixed(1), payoffs: w.events, meanGap: Math.round(w.total / (w.events + 1)), maxGap: Math.round(Math.max(...s)), over180: w.gaps.filter((g) => g.s > 180).map((g) => `${g.from} > ${g.to} ${Math.round(g.s)}s`) });
  }
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = report({ nooks: !process.argv.includes('--before') });
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
  else {
    for (const r of rows) console.log(`${r.route.padEnd(58)} ${String(r.minutes).padStart(4)} min  ${String(r.payoffs).padStart(2)} payoffs  mean ${String(r.meanGap).padStart(3)} s  max ${String(r.maxGap).padStart(4)} s${r.over180.length ? '  >180: ' + r.over180.join('; ') : ''}`);
    for (const far of [false, true]) {
      const set = rows.filter((r) => r.far === far);
      const all = set.reduce((a, r) => ({ t: a.t + r.minutes * 60, n: a.n + r.payoffs + 1, m: Math.max(a.m, r.maxGap) }), { t: 0, n: 0, m: 0 });
      console.log(`${far ? 'FAR LEGS' : 'NATURAL ROUTES'}: ${Math.round(all.t / 60)} min of route, mean gap ${Math.round(all.t / all.n)} s, max gap ${all.m} s`);
    }
  }
}
