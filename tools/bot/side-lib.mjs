// Shared by the side-quest bots (tools/bot/side-*.mjs): set the meadow's story state, plan a walk over
// the baked world (dry ground, no steep faces), and walk it with the bot. Run the game first:
//   PORT=4175 tools/bot/play.sh p8-village-street "^&gale=1"     then   WRAITH_URL=http://localhost:4175 node tools/bot/side-<quest>.mjs
import { bot, js } from './client.mjs';
import fs from 'node:fs';
import { createWorldSampler } from '../world/sample.mjs';

const village = JSON.parse(fs.readFileSync(new URL('../../data/world/village.json', import.meta.url)));
/** Inside a building's plot (padded)? The planner walks round them. */
const inPlot = (x, z, pad = 3) => village.plots.some((p) => { if (p.kind === 'stall') return false; const f = p.facing, dx = x - p.at[0], dz = z - p.at[1]; if (Math.abs(dx) > 40 || Math.abs(dz) > 40) return false; return Math.abs(dx * Math.cos(f) - dz * Math.sin(f)) < p.w + pad && Math.abs(dx * Math.sin(f) + dz * Math.cos(f)) < p.d + pad; });

export { bot, js };
export const S = createWorldSampler();
export const T0 = Date.now();
export const say = (...a) => console.log(((Date.now() - T0) / 1000).toFixed(0).padStart(4) + 's', ...a);
export const logState = (s) => { for (const l of s.log || []) if (!/BARK/.test(l)) say('  |', l); };

/** The story as the side quests need it: the fire night over (stair open), optionally the Bellwether woken and the meadow restored. */
export async function setupStory({ bellwether = false, night = false } = {}) {
  await js(`const f=g.chapter.graph.flags; for (const x of ['meadow:guide-lead','meadow:arrived','meadow:raid','meadow:raid-lit','meadow:fires-out','meadow:ebb-saved','meadow:stair-open']) f.add(x);
    ${bellwether ? "f.add('meadow:bellwether-woke'); f.add('meadow:bellwether-released'); g.ws.restoration.meadow='restored'; g.elements.unlock('gale');" : ''}
    g.compass.mode='always'; g.params.v.timeOfDay=${night ? 22 : 13}; g.params.version++; g.clock.pinHour=null; return 1`);
  await bot('wait', { ms: 2500 });
}
export const flags = () => js(`return [...g.chapter.graph.flags].filter(f=>/side|lit:|echo|attuned|flame/.test(f))`);
export const quest = (id) => js(`const q=g.chapter.graph.quests['${id}']; return q.state+(q.state==='active'?':'+g.chapter.graph.byId.get('${id}').steps[q.step].id:'')`);
export const vars = () => js(`return g.chapter.graph.vars`);

/** A* over the baked ground (8 m cells): water and steep faces are walls. Returns points every ~14 m. */
export function plan(x0, z0, x1, z1, { avoidWater = true, maxSlope = 1.1 } = {}) {
  const C = 8, key = (i, j) => i + ',' + j, ok = (x, z) => { const w = S.water(x, z); return !(avoidWater && (w.lake > 20 || w.river > 20)) && S.slope(x, z) < maxSlope && !inPlot(x, z); };
  const gi = (x) => Math.round(x / C), g0 = [gi(x0), gi(z0)], g1 = [gi(x1), gi(z1)];
  const open = [[0, ...g0]], came = new Map(), cost = new Map([[key(...g0), 0]]);
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [, i, j] = open.shift();
    if (i === g1[0] && j === g1[1]) break;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = i + di, nj = j + dj, x = ni * C, z = nj * C;
      if (!(ni === g1[0] && nj === g1[1]) && !ok(x, z)) continue;
      const c = cost.get(key(i, j)) + (di && dj ? 1.41 : 1) * (1 + S.slope(x, z) * 1.5);
      if (c < (cost.get(key(ni, nj)) ?? 1e9)) { cost.set(key(ni, nj), c); came.set(key(ni, nj), [i, j]); open.push([c + Math.hypot(ni - g1[0], nj - g1[1]), ni, nj]); }
    }
  }
  const path = []; let cur = key(...g1);
  if (!came.has(cur)) return null;
  while (cur) { const [i, j] = cur.split(',').map(Number); path.push([i * C, j * C]); const p = came.get(cur); cur = p ? key(...p) : null; }
  path.reverse();
  const out = []; let last = null;
  for (const p of path) if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 14) { out.push(p); last = p; }
  out.push([x1, z1]);
  return out;
}
/** Walk a planned path (waypoint by waypoint; a stuck step is reported, not hidden). */
export async function walkPath(path, { arrive = 2.5, timeout = 40 } = {}) {
  let r;
  for (const [x, z] of path) {
    r = await bot('walkTo', { x, z, arrive: path[path.length - 1] === undefined ? arrive : 4, timeout });
    if (!r.walk.arrived) { say('  stuck at', JSON.stringify(r.walk)); return r; }
  }
  return r;
}
/** Leave the village by its streets (the bot's road walk), so a planned walk starts on open ground. */
export async function leaveVillage(x = -25, z = 1040) { return bot('walkTo', { x, z, roads: true, arrive: 4, timeout: 60 }); }
export async function goTo(x, z, opt = {}) {
  const p = js('const q=g.controller.pos;return [q.x,q.z]');
  const [px, pz] = await p;
  const path = plan(px, pz, x, z, opt);
  if (!path) { say('no path to', x, z); return null; }
  return walkPath(path, opt);
}
export async function shot(name, extra = {}) { const r = await bot('shot', { name, dir: 'p8-side', ...extra }); return r; }
export const faceNpc = async (id) => { const n = await js(`const n=g.npcs.find(q=>q.id==='${id}');return [n.x,n.z]`); await bot('face', { x: n[0], z: n[1], pitch: 0.05 }); return n; };
/** Walk to an NPC through the streets and talk: the dialogue plays out by itself (lines time out). */
export async function talk(id, ms = 1500) {
  const n = await js(`const n=g.npcs.find(q=>q.id==='${id}');return [n.x,n.z]`);
  await bot('walkTo', { x: n[0], z: n[1], roads: true, arrive: 3.5, timeout: 40 });
  const r = await bot('talkTo', { id, ms });
  logState(r);
  // Let the whole dialogue run (Interact advances; just wait it out).
  for (let k = 0; k < 40; k++) { const t = await js('return g.chapter.talking'); if (!t) break; await bot('press', { key: 'Interact' }); }
  return r;
}
