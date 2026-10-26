// Bot: fly the Wind Road from a restored meadow: Wyl asks (the glide errand first, as the data wants), the hill foot, then the
// soaring pilot up the Hearn wind, across the lake and through the Western Edge's first ring; Wyl is told. Then the same flight
// with the meadow stilled, which gives no lift at all.   RUNS=6 attempts.
import { bot, js, jsLong, say, wait, shot, ok, quest, vars, flags, restoredWorld, at, pilot } from './restored-lib.mjs';
import { talk, faceNpc } from './side-lib.mjs';

await restoredWorld({ hour: 13 });
await bot('teleport', { x: 108, z: 915 }); await bot('walkTo', { x: 108, z: 905, roads: true, timeout: 40 });
await faceNpc('meadow-wyl'); await wait(500);
await talk('meadow-wyl', 2500); await wait(9000);
say('after Wyl:', await quest('meadow-wind-road'));
ok((await quest('meadow-wind-road')).includes('foot'), 'Wyl asked for the Wind Road');
const foot = await js(`return g.chapter.table['side-rw-road-start'].pos`);
await at(foot[0] + 2, foot[1] - 12, foot[0] + 80, foot[1] - 4, 5000);
say('quest at the foot:', await quest('meadow-wind-road'));
await shot('road-1-hill-foot');
const fly = pilot({
  streams: `g.streams.list.filter(s => s.biome === 'meadow')`,
  targets: `(() => { const D = g.restoredData.road, i = g.roadRun.running ? g.roadRun.stage : 0, c = D.checks[i]; const gy = groundAt(c.pos[0], c.pos[1]); return { x: c.pos[0], z: c.pos[1], y: c.y !== undefined ? c.y : gy + c.agl + 18, r: c.r, final: i === D.checks.length - 1 }; })()`,
  done: `g.chapter.graph.flags.has('meadow:road-flown')`, maxMs: 240000 });
let flown = false;
for (let run = 1; run <= (+process.env.RUNS || 6) && !flown; run++) {
  const r = await jsLong(fly + `; return { road: { running: g.roadRun.running, stage: g.roadRun.stage, t: Math.round(g.roadRun.t) }, flown: g.chapter.graph.flags.has('meadow:road-flown'), time: g.chapter.graph.vars['road.time'], at: [Math.round(g.controller.pos.x), Math.round(g.controller.pos.z)] };`);
  say('run', run, JSON.stringify(r));
  flown = r.flown;
  if (run === 1 || flown) await shot(flown ? 'road-3-first-ring' : 'road-2-first-flight');
  if (!flown) await at(foot[0] + 2, foot[1] - 12, foot[0] + 80, foot[1] - 4, 3000);
}
ok(flown, 'flew the Wind Road without touching the ground');
say('quest', await quest('meadow-wind-road'), JSON.stringify(await flags('road|rode')));
await js(`g.chapter.graph.flags.delete('meadow:road-flown'); g.ws.restoration.meadow='stilled'; g.restoration.snap = true; return 1`);
await wait(3000);
await at(foot[0] + 2, foot[1] - 12, foot[0] + 80, foot[1] - 4, 3000);
await jsLong(pilot({ streams: `[]`, targets: `({ x: 255, z: 1000, y: 440, r: 70 })`, done: 'false', maxMs: 20000 }));
const t = await js(`return { running: g.roadRun.running, stage: g.roadRun.stage, rise: g.streams.total };`);
say('stilled', JSON.stringify(t));
ok(!t.running && t.stage === 0, 'with the meadow stilled the Road never starts and the hill gives no lift');
await js(`g.ws.restoration.meadow='restored'; g.restoration.snap = true; return 1`);
