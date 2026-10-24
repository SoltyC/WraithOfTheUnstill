// Bot: play "The Western Edge": Wyl in Hearn (the walk to the crest is a kilometre: the bot teleports there), then
// fly the six rings: run off the crest, jump, hold the glide (Traverse) and steer with A/D toward the next ring in an
// in-page loop (keys stay held across steps). Prints each run's time; tries until gold or `RUNS` attempts.
import { bot, js, say, logState, setupStory, quest, vars, talk, shot, faceNpc } from './side-lib.mjs';

await setupStory({ bellwether: true });
await bot('teleport', { x: 108, z: 915 }); await bot('walkTo', { x: 108, z: 905, roads: true, timeout: 40 });
await faceNpc('meadow-wyl'); await bot('wait', { ms: 600 });
say('shot', (await shot('glide-1-direction-wyl')).file);
await talk('meadow-wyl'); await talk('meadow-wyl'); say('after Wyl:', await quest('meadow-side-glide'));
const edge = await js(`return g.chapter.table['side-edge'].pos`);
await bot('teleport', { x: edge[0] + 6, z: edge[1] + 6 });
await bot('wait', { ms: 3000 });
await bot('face', { x: edge[0] - 40, z: edge[1] - 40, pitch: 0.1 });
say('quest at the crest', await quest('meadow-side-glide'));
say('shot', (await shot('glide-2-crest-first-ring')).file);

const fly = `
  const w = window.__wraith, inj = (k, d) => w.inject(k, d), c = g.controller, rings = ['1','2','3','4','5','6'].map(k => g.chapter.table['side-ring-' + k]);
  const t0 = performance.now(); let shots = 0, res = { rings: 0 };
  inj('MoveForward', true);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // run to the crest edge and jump
  inj('Traverse', true); await sleep(300);
  while (performance.now() - t0 < 60000) {
    await new Promise(r => requestAnimationFrame(r));
    const p = c.pos, gl = c.glide, course = g.chapter && g.sideCourse;
    const next = rings[Math.min(5, (g.__ringNext ?? 0))];
    const nx = g.navDynamic['next-ring'](); const tx = nx.x, tz = nx.z;
    const want = Math.atan2(tx - p.x, tz - p.z), have = gl.active ? gl.heading : c.yaw;
    let d = want - have; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
    inj('MoveLeft', d < -0.03); inj('MoveRight', d > 0.03);
    inj('MoveForward', !gl.active || p.y > nx.y + 6 + 1);   // dive only while above the ring's height
    g.arm.yaw = want;
    if (gl.active) res.flew = true;
    if (!res.flew && c.grounded && (Math.floor((performance.now() - t0) / 400) % 3 === 0)) inj('Jump', true); else inj('Jump', false);
    if ((res.flew && !gl.active && c.grounded) || performance.now() - t0 > 40000) break;
    const done = g.chapter.graph.vars['glide.time'];
    if (res.last !== done) { res.last = done; if (done !== undefined && performance.now() - t0 > 3000) break; }
  }
  for (const k of ['MoveForward','MoveLeft','MoveRight','Traverse','Jump']) inj(k, false);
  return { course: { next: g.sideCourse.next, running: g.sideCourse.running, t: g.sideCourse.t }, time: g.chapter.graph.vars['glide.time'], best: g.chapter.graph.vars['glide.best'], at: [Math.round(c.pos.x), Math.round(c.pos.z)], glide: c.glide.active };
`;
for (let run = 1; run <= (+process.env.RUNS || 4); run++) {
  const r = await js(fly);
  say('run', run, JSON.stringify(r), 'quest', await quest('meadow-side-glide'), JSON.stringify(await vars()));
  if (run === 1) say('shot', (await shot('glide-3-after-run')).file);
  if (r.best !== undefined && r.best <= 21) break;
  await bot('teleport', { x: edge[0] + 6, z: edge[1] + 6 }); await bot('wait', { ms: 2500 });
  await bot('face', { x: edge[0] - 40, z: edge[1] - 40, pitch: 0.1 });
}
