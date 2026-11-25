#!/usr/bin/env node
// The eruption from the SW plain, profiled: presented frames, the GPU timer, and the per-system CPU profiler (?sysprof=1).
//   node tools/bot/eruption-prof.mjs <erupt-t|calm> ["js to run before a second measure", ...]; tools/bot/play.sh stop
import { execSync } from 'node:child_process';
import { bot, js } from './client.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
execSync(`tools/bot/play.sh e1-chapel "^&gfx=high^&sysprof=1"`, { stdio: 'inherit' });
await sleep(8000);
await js(`g.params.v.timeOfDay=14;g.params.version++;g.params.v.dynamicRes=0;g.requestTeleport(1330,-2470);return 1`); await sleep(9000);
await bot('face', { x: 2330, z: -2170, pitch: 0.12 });
if (process.argv[2] !== 'calm') await js(`g.chapter.graph.flags.add('ember:warned');g.chapter.graph.vars['ember:erupt-t']=${process.argv[2]||100};g.chapter.graph.vars['ember:day']=4;g.chapter.graph.flags.add('ember:scene-played');return 1`);
await sleep(15000);
const gpu = `const frame=()=>new Promise(r=>requestAnimationFrame(r));const t=w.gpuTimer;if(!t.supported)return null;for(let i=0;i<30;i++)await frame();
  const old=t.sampleEvery;t.sampleEvery=1;const s=t.count;t.setActive(true);for(let i=0;i<240;i++)await frame();t.setActive(false);
  await w.gpuStats.device.queue.onSubmittedWorkDone();for(let i=0;i<4;i++)await frame();t.sampleEvery=old;
  const a=[];for(let i=s;i<t.count;i++)a.push(t.ms[i%t.ms.length]);a.sort((p,q)=>p-q);if(!a.length)return null;
  return {gpu:+a[a.length>>1].toFixed(2), gpu95:+a[Math.floor(a.length*0.95)].toFixed(2)};`;
for (const tag of ['all', ...(process.argv[3] || '').split(',').filter(Boolean)]) {
  if (tag !== 'all') { await js(tag + ';return 1'); await sleep(2500); }
  await js(`return 1`);
  const p = await bot('perf', { frames: 300 });
  const m = await js(gpu);
  const r = await js(`return {...g.loop.prof?.report?.(),resets:g.loop.prof?.resets}`);
  console.log(tag.slice(0,60).padEnd(60), 'p50', p.p50, 'p95', p.p95, JSON.stringify(m));
  if (tag === 'all') console.log(JSON.stringify(r).slice(0, 1500));
}
