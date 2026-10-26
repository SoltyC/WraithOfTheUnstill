// Bot: fly the Shelf Stream (frost summit course) from a restored save: Varo's ask, the cairn, then the soaring pilot through the
// six rings (climbing the Shelf stream between them). Then the same flight with the frost stilled, which cannot be flown.
//   RUNS=3 (attempts for the best time).  Reports times, medals and the quest.
import { bot, js, say, wait, shot, ok, quest, vars, restoredWorld, at, pilot } from './restored-lib.mjs';

await restoredWorld({ hour: 12 });
const varo = await js(`const n=g.npcs.find(q=>q.id==='varo'); return [n.x,n.z]`);
await at(varo[0] + 3, varo[1] + 3, varo[0], varo[1]);
await bot('talkTo', { id: 'varo', ms: 1500 }).catch((e) => say('talkTo: ' + e.message));
await wait(9000);
say('after Varo:', await quest('shelf-stream'));
ok((await quest('shelf-stream')).includes('shelf'), 'Varo sent the Wraith to the Shelf');
const pl = await js(`return g.chapter.table['rw-shelf'].pos`);
await at(pl[0] + 6, pl[1] + 2, pl[0] - 60, pl[1] + 10, 5000);
await shot('shelf-1-cairn');
await at(pl[0] + 6, pl[1] + 2, 1440, 2915, 1500);
const fly = pilot({ targets: `(() => { const r = g.shelfCourse.rings[Math.min(g.shelfCourse.next, g.shelfCourse.rings.length - 1)]; return { x: r.x, y: r.y, z: r.z, r: r.r }; })()`, done: `g.chapter.graph.vars['shelf.time'] !== undefined`, maxMs: 200000 });
let best;
for (let run = 1; run <= (+process.env.RUNS || 6); run++) {
  await js(`g.chapter.graph.vars['shelf.time'] = undefined; delete g.chapter.graph.vars['shelf.time']; return 1`);
  const r = await js(fly + `; return { course: { next: g.shelfCourse.next, running: g.shelfCourse.running, t: Math.round(g.shelfCourse.t * 10) / 10 }, time: g.chapter.graph.vars['shelf.time'], best: g.chapter.graph.vars['shelf.best'] };`);
  say('run', run, JSON.stringify(r));
  best = r.best;
  if (run === 1) await shot('shelf-2-after-run');
  if (r.time !== undefined) break;
  await at(pl[0] + 6, pl[1] + 2, 1440, 2915, 2500);
}
ok(best !== undefined, 'flew all six rings (best ' + best + ' s)');
say('vars', JSON.stringify(await vars()), 'quest', await quest('shelf-stream'));
// Stilled: the same flight cannot be made.
await js(`g.ws.restoration.frost='stilled'; g.restoration.snap = true; delete g.chapter.graph.vars['shelf.time']; return 1`);
await wait(3000);
await at(pl[0] + 6, pl[1] + 2, pl[0] - 60, pl[1] + 10, 3000);
const t = await js(pilot({ targets: `(() => { const r = g.shelfCourse.rings[0]; return { x: r.x, y: r.y, z: r.z, r: r.r }; })()`, done: 'false', maxMs: 25000 }) + `; return { next: g.shelfCourse.next, running: g.shelfCourse.running };`);
say('stilled', JSON.stringify(t));
ok(t.next === 0 && !t.running, 'with the frost stilled the course does not even start (no rings, no stream)');
await js(`g.ws.restoration.frost='restored'; g.restoration.snap = true; return 1`);
