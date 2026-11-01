#!/usr/bin/env node
// The Glass Dunes from end to end in the live game (plan.md D12): the camp, the sled, the three instruments,
// the side sites, the Walker brought home and released; then save, reload the page, load, and check that what
// was changed is where it was left. Each stage is its own solver. The Walker's journey starts from `?walker=home`
// (150 m east of the camp), so the pursuit is not re-walked here: tools/bot/walker-pursuit.mjs covers it.
//   tools/bot/play.sh "" "^&walker=home^&flood=1^&stone=1"   then   node tools/bot/dunes-playthrough.mjs
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { bot, js } from './client.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const fails = [];
const check = (name, ok, more = '') => { log(ok ? 'ok  ' : 'FAIL', name, more); if (!ok) fails.push(name); };
const has = (f) => js(`return g.chapter.graph.flags.has(${JSON.stringify(f)})`);
const run = promisify(execFile);
const solver = async (name) => { const { stdout } = await run('node', ['tools/bot/' + name], { encoding: 'utf8', timeout: 300000 }); return name + ': ' + stdout.trim().split('\n').slice(-1)[0]; };
const FLAGS = ['dunes:sled-freed', 'dunes:instrument-sun', 'dunes:instrument-clock', 'dunes:instrument-song', 'dunes:mirage-found', 'dunes:falls-reached', 'dunes:glass-done', 'dunes:door-open', 'dunes:garden-full'];

// Into the Erg: from the lip of the Dry Stair, to the camp.
await bot('teleport', { x: 1316, z: 407 }); await sleep(3000);
await bot('teleport', { x: 1817, z: 769 }); await sleep(4500);
check('quest starts at the camp', (await js(`return g.chapter.graph.goals().map(q=>q.quest).includes('dunes-into-the-erg')`)));
await js(`g.chapter.raise('talk:sarai');return 1`); await sleep(1200);
log(await solver('puzzle-sled.mjs'));
await js(`g.chapter.raise('talk:sarai');return 1`); await sleep(1200);
log(await solver('puzzle-sungate.mjs')); log(await solver('puzzle-hourglass.mjs')); log(await solver('puzzle-singing.mjs'));
log(await solver('puzzle-sides.mjs'));
for (const f of FLAGS) check(f, await has(f));
// The land, changed where it will be checked: a groove, a Ridge's ground, glass.
const MARK = { x: 1900, z: 900 };
await bot('teleport', MARK); await sleep(3500);
await js(`const ts=g.terrainState;const s=(k,x,z,d)=>{ts.bx=x;ts.bz=z;ts.bdx=1;ts.bdz=0;ts.bl=4;ts.bw=2.2;ts.bd=d;ts.bc=0.5;ts.bk=k;ts.bwet=0;ts.bbias=0;ts.bberm=0.3;ts.stamp();};for(let i=0;i<4;i++)s(1,1892+i*3,906,0.7);s(5,1908,906,1.6);return 1;`);
await sleep(2500);
/** The height the Wraith stands at, once it has landed there. */
const stand = async (x, z) => {
  await bot('teleport', { x, z });
  for (let i = 0; i < 40; i++) { await sleep(500); if (await js(`return g.game.worldSettled()&&g.controller.grounded`)) break; }
  await sleep(600); return js('return +g.controller.pos.y.toFixed(2)');
};
const heights = { flat: await stand(1880, 890), groove: await stand(1896, 906), heap: await stand(1908, 906) };
log('marks', JSON.stringify(heights));
// The Walker home and released.
log(await solver('walker-home.mjs'));
check('released', await has('dunes:walker-released'));
check('erg restored', (await js(`return g.ws?.restoration?.dunes ?? null`)) === 'restored');
await sleep(2000);
const walker = await js(`const w=g.walker;return {x:w.x|0,z:w.z|0,state:w.state}`);
const stages = () => js(`return {sun:g.sunGate.stage,clock:g.hourglass.stage,song:g.singing.stage,sled:g.sled.state,door:g.sideSites.door.open,flood:g.sideSites.flood.done,mirage:g.sideSites.mirage.found}`);
const before = await stages();
log('before', JSON.stringify(before), JSON.stringify(walker));
await bot('teleport', { x: 1880, z: 890 }); await sleep(2500);
const saved = await js(`return await g.game.saves.save('slot1')`);
check('saved', !!saved, String(saved).slice(0, 80));
await sleep(1000);
// A fresh page, then the load.
const hello = await fetch('http://localhost:4173/__wraith/bot/status').then((r) => r.json());
await js(`setTimeout(()=>{location.href='/?bot=1&title=0';},200);return 1`).catch(() => 0);
for (let i = 0; i < 80; i++) { await sleep(3000); const s = await fetch('http://localhost:4173/__wraith/bot/status').then((r) => r.json()); if (s.hello !== hello.hello && s.hello) break; }
await sleep(5000);
const loaded = await js(`const s=await g.game.saves.load('slot1');return !!s`);
check('loaded', loaded);
await sleep(9000);
for (const f of FLAGS) check('after load: ' + f, await has(f));
const after = await stages();
check('sites restored', JSON.stringify(after) === JSON.stringify(before), JSON.stringify(after));
check('erg still restored', (await js(`return g.ws?.restoration?.dunes ?? null`)) === 'restored');
const w2 = await js(`const w=g.walker;return {x:w.x|0,z:w.z|0,state:w.state,placed:!!g.walkerPlaced}`);
check('the Walker where it lay', Math.abs(w2.x - walker.x) < 3 && Math.abs(w2.z - walker.z) < 3 && w2.state === walker.state, JSON.stringify(w2));
await sleep(4000);
const h2 = { flat: await stand(1880, 890), groove: await stand(1896, 906), heap: await stand(1908, 906) };
log('marks after', JSON.stringify(h2));
check('the groove held', Math.abs((h2.groove - h2.flat) - (heights.groove - heights.flat)) < 0.3);
check('the heap held', Math.abs((h2.heap - h2.flat) - (heights.heap - heights.flat)) < 0.4);
await bot('teleport', { x: 2910, z: 1120 }).catch(() => 0);
const gpu = await js(`return {late:w.gpuStats.late.length,err:w.gpuStats.gpuErrors}`);
check('no late pipelines or GPU errors', gpu.late === 0 && gpu.err === 0, JSON.stringify(gpu));
log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL PASSED');
