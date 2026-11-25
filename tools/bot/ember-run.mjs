#!/usr/bin/env node
// The Ember chapter end to end, in one session (no staged flags past the start): the warning at the Cinder Shrine (its
// cutscene, Cole's dialogue), the Sow (sow-run.mjs: everyone persuaded, one lie), Cinderhold (cinder-run.mjs expose: the
// miners leave, the guild stays), the Ash Chapel (chapel-run.mjs <seer>), then the mountain's days until it erupts, the
// eruption in full at rate 1 with the Wraith on the south-west plain (its scenes play on their own), the aftermath, the camp
// and its count. Logs the flags, the deaths, the scenes, and the presented frame times as it goes.
//   npm run preview; node tools/bot/ember-run.mjs [force|promise|leave]; tools/bot/play.sh stop
import { execSync } from 'node:child_process';
import { bot, js } from './client.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seer = process.argv[2] || 'leave';
const skip = async () => { for (let i = 0; i < 60; i++) { const c = await js(`return g.chapter.current`); if (!c) return null; if (c.options) return c.options; await js(`g.chapter.updateDialogue(30,true,-1);return 1`); await sleep(60); } return null; };
const tp = async (x, z) => { await js(`g.requestTeleport(${x},${z});return 1`); for (let i = 0; i < 40; i++) { await sleep(500); if (await js(`return !g.pendingTp?.active && !g.controller.hold`)) break; } await sleep(1500); };
const state = () => js(`const F=[...g.chapter.graph.flags];return {quests:Object.fromEntries(Object.entries(g.chapter.graph.quests).filter(([k])=>k.startsWith('ember')).map(([k,v])=>[k,v.state])),scenes:F.filter(f=>f.startsWith('ember:scene:')),fled:F.filter(f=>/^ember:(fled|lost)[-:]/.test(f)),dead:F.filter(f=>f.startsWith('ember:dead:')).map(f=>f.slice(11)),go:F.filter(f=>/^ember:\\w+-(go|stays|lied)$/.test(f)),fate:g.eruption?.fate?Object.fromEntries(g.eruption.fate):null,err:w.gpuStats.gpuErrors}`);
const perfs = [];
const perf = async (where) => { const p = await bot('perf', { frames: 240 }); perfs.push({ where, p95: p.p95, p50: p.p50, max: p.max }); console.log(`  perf ${where.padEnd(26)} p50 ${p.p50} p95 ${p.p95} max ${p.max}`); };
const run = async (cmd) => { console.log('\n$ ' + cmd); execSync(cmd, { stdio: 'inherit', timeout: 900000 }); await skip(); };   // (a line left open would take the next place's first word)

execSync(`tools/bot/play.sh e1-chapel "^&gfx=high"`, { stdio: 'inherit' });
await sleep(8000);
await js(`g.params.v.timeOfDay=10;g.params.version++;g.params.v.dynamicRes=0;return 1`);

// 1. The warning: walk in toward the shrine; the scene plays when it is near; then Cole's words.
console.log('\n# the warning');
await tp(1010, -1180);
await perf('shrine approach');
await bot('walkTo', { x: 992, z: -1300, arrive: 3, timeout: 40 }).catch(() => {});
let sawScene = false;
for (let i = 0; i < 80; i++) { const s = await js(`return {busy:!!g.scenes?.busy,talk:!!g.chapter.current,w:g.chapter.graph.flags.has('ember:warned')}`); if (s.busy) sawScene = true; if (!s.busy && (s.talk || s.w)) break; await sleep(500); }
console.log('  scene played:', sawScene, 'talking:', !!(await js(`return g.chapter.current`)));
{ let o = await skip(); for (let i = 0; o && i < 6; i++) { await js(`g.chapter.updateDialogue(0,false,0);return 1`); await sleep(200); o = await skip(); } }
console.log('  warned:', await js(`return g.chapter.graph.flags.has('ember:warned')`));

// 2–4. The places (their own bots, same session).
await run('node tools/bot/sow-run.mjs');
await run('node tools/bot/cinder-run.mjs expose');
await run(`node tools/bot/chapel-run.mjs ${seer}`);
console.log('\n# before', JSON.stringify(await state()));

// 5. The mountain's days, then the eruption in full, watched from the south-west plain.
console.log('\n# the eruption');
await tp(1330, -2470);
await bot('face', { x: 2330, z: -2170, pitch: 0.12 });
await js(`g.params.v.timeOfDay=14;g.params.version++;g.chapter.graph.vars['ember:day']=4;return 1`);
for (let i = 0; i < 40 && !(await js(`return !!g.eruption?.on`)); i++) await sleep(500);
const t0 = Date.now(); let lastScene = null;
while (!(await js(`return g.chapter.graph.flags.has('ember:erupted')`)) && Date.now() - t0 < 720000) {
  const s = await js(`return {T:Math.round(g.eruption.T||g.chapter.graph.vars['ember:erupt-t']||0),busy:!!g.scenes?.busy,id:g.scenes?.current?.id||null}`);
  if (s.busy && s.id !== lastScene) { console.log(`  T ${s.T}: scene ${s.id}`); lastScene = s.id; }
  await perf(`eruption T${s.T}${s.busy ? ' (scene)' : ''}`);
  await sleep(6000);
}
console.log('# erupted', JSON.stringify(await state()));

// 6. After: the Sow under the ash; then the camp, where the count plays.
await sleep(4000);
await tp(1000, -1640); await bot('face', { x: 860, z: -1950, pitch: 0.1 }); await sleep(3000); await perf('after: sow valley');
await js(`g.params.v.timeOfDay=18;g.params.version++;return 1`);
await tp(640, -2560); await sleep(2000);
await bot('walkTo', { x: 690, z: -2610, arrive: 3, timeout: 30 }).catch(() => {});
let count = false;
for (let i = 0; i < 160; i++) { const s = await js(`return {busy:!!g.scenes?.busy,f:g.chapter.graph.flags.has('ember:scene:count')}`); if (s.busy) count = true; if (s.f && !s.busy) break; if (i === 20 && !count) await perf('camp (no scene yet)'); await sleep(500); }
console.log('  count scene played:', count);
await bot('face', { x: 760, z: -2632, pitch: 0.05 }); await sleep(1500); await perf('after: camp');
console.log('# final', JSON.stringify(await state()));
console.log('quests', JSON.stringify(await js(`const q=g.chapter.graph.quests;return Object.fromEntries(Object.entries(q).filter(([k])=>k.startsWith('ember')))`)));
const worst = perfs.slice().sort((a, b) => b.p95 - a.p95).slice(0, 5);
console.log('worst p95', JSON.stringify(worst));
