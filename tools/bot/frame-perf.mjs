#!/usr/bin/env node
// Whole-frame GPU time from the current camera (median and p95 of 240 frames, w.gpuTimer), for A/B
// runs between builds.   node tools/bot/frame-perf.mjs [label]
import { js } from './client.mjs';
const sample = `const frame=()=>new Promise(r=>requestAnimationFrame(r));const t=w.gpuTimer;if(!t.supported)throw new Error('no GPU timestamps');
  for(let i=0;i<60;i++)await frame();const old=t.sampleEvery;t.sampleEvery=1;const s=t.count;t.setActive(true);for(let i=0;i<240;i++)await frame();
  t.setActive(false);await w.gpuStats.device.queue.onSubmittedWorkDone();for(let i=0;i<6;i++)await frame();t.sampleEvery=old;
  const a=[];for(let i=s;i<t.count;i++)a.push(t.ms[i%t.ms.length]);a.sort((p,q)=>p-q);
  return {median:+a[a.length>>1].toFixed(2), p95:+a[Math.floor(a.length*0.95)].toFixed(2), scale:g.post.post.renderScale, err:w.gpuStats.gpuErrors};`;
for (let r = 0; r < 2; r++) console.log(JSON.stringify({ label: process.argv[2] || '', ...(await js(sample)) }));
