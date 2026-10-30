#!/usr/bin/env node
// The Long Walker's GPU cost (Phase 9 D10): whole-frame timestamps (w.gpuTimer) with it in view, near
// and walking, against the same view with it culled — two alternating repeats of 240 frames each.
//   tools/bot/play.sh "" "^&walker=walk"   then   node tools/bot/walker-perf.mjs [dist=60]
import { bot, js } from './client.mjs';

const dist = Number(process.argv[2] || 60);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [x, z] = await js(`const w=g.walker, s=Math.sin(w.yaw), c=Math.cos(w.yaw); return [w.x + c*${dist} + s*30, w.z - s*${dist} + c*30];`);
await bot('teleport', { x, z }); await sleep(5000);
if (process.argv[3] === 'kneel') { await js('g.walker._immune = 0; g.walker.stumble(4); g.walker.t = 0; return 1;'); await sleep(2500); await js('walkerKeep = setInterval(() => { if (g.walker.state === 4) g.walker.t = 1; }, 200); return 1;'); }
await js('const w=g.walker, p=g.controller.pos; g.arm.yaw=Math.atan2(w.x-p.x, w.z-p.z); g.arm.pitch=-0.18; return 1;');
const sample = `const frame=()=>new Promise(r=>requestAnimationFrame(r));const t=w.gpuTimer;if(!t.supported)throw new Error('no GPU timestamps');
  const old=t.sampleEvery;t.sampleEvery=1;const s=t.count;t.setActive(true);for(let i=0;i<240;i++){const k=g.walker,p=g.controller.pos;g.arm.yaw=Math.atan2(k.x-p.x,k.z-p.z);await frame();}
  t.setActive(false);await w.gpuStats.device.queue.onSubmittedWorkDone();for(let i=0;i<6;i++)await frame();t.sampleEvery=old;
  const a=[];for(let i=s;i<t.count;i++)a.push(t.ms[i%t.ms.length]);a.sort((p,q)=>p-q);
  return {n:a.length, mean:+(a.reduce((p,q)=>p+q,0)/a.length).toFixed(2), median:+a[a.length>>1].toFixed(2), p95:+a[Math.floor(a.length*0.95)].toFixed(2), late:w.gpuStats.late.length, scale:g.post.post.renderScale};`;
const out = [];
for (let r = 0; r < 2; r++) for (const on of [true, false]) {
  await js(`g.walkerSys.far = ${on ? 3200 : 0}; return 1;`); await sleep(1500);
  const m = await js(sample);
  out.push({ walker: on, ...m }); console.log(JSON.stringify(out.at(-1)));
}
console.log('walker state', await js('const w=g.walker; return {st:w.state, v:+w.speed.toFixed(1), d:+Math.hypot(w.x-g.controller.pos.x, w.z-g.controller.pos.z).toFixed(0)}'));
await js('g.walkerSys.far = 3200; return 1;');
