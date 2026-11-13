#!/usr/bin/env node
// The far forest's GPU cost (docs/meadow-overhaul.md M2): whole-frame timestamps with the impostors drawn
// against hidden, two alternating repeats of 240 frames, from the current camera (set it first, e.g.
// tools/bot/vista.mjs with one yaw).   node tools/bot/far-perf.mjs
import { js } from './client.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sample = `const frame=()=>new Promise(r=>requestAnimationFrame(r));const t=w.gpuTimer;if(!t.supported)throw new Error('no GPU timestamps');
  const old=t.sampleEvery;t.sampleEvery=1;const s=t.count;t.setActive(true);for(let i=0;i<240;i++)await frame();
  t.setActive(false);await w.gpuStats.device.queue.onSubmittedWorkDone();for(let i=0;i<6;i++)await frame();t.sampleEvery=old;
  const a=[];for(let i=s;i<t.count;i++)a.push(t.ms[i%t.ms.length]);a.sort((p,q)=>p-q);
  return {median:+a[a.length>>1].toFixed(2), p95:+a[Math.floor(a.length*0.95)].toFixed(2), scale:g.post.post.renderScale, drawn:g.trees.farDrawn, err:w.gpuStats.gpuErrors};`;
for (let r = 0; r < 2; r++) for (const on of [true, false]) {
  await js(`g.trees.impostors.setEnabled(${on});g.engine.snapshotRenderingReset();return 1;`); await sleep(1500);
  console.log(JSON.stringify({ far: on, ...(await js(sample)) }));
}
await js('g.trees.impostors.setEnabled(true);g.engine.snapshotRenderingReset();return 1;');
