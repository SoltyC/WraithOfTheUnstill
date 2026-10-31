#!/usr/bin/env node
// Each graphics preset's GPU frame (core/graphics.js) at fixed views: one page load per preset (?gfx=…:
// the boot settings differ), dynamic resolution off so the preset's render scale holds, the median
// whole-frame GPU time over 240 frames. Writes docs/perf/preset-perf.json.
//   node tools/bot/preset-perf.mjs [spots]
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { bot, js } from './client.mjs';

const spots = (process.argv[2] || 'p9r-galleries-dawn,p8-meadow-golden,p9s1-star-mid').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const measure = `const frame=()=>new Promise(r=>requestAnimationFrame(r));const t=w.gpuTimer;for(let i=0;i<60;i++)await frame();
  const old=t.sampleEvery;t.sampleEvery=1;const s=t.count;t.setActive(true);for(let i=0;i<240;i++)await frame();t.setActive(false);
  await w.gpuStats.device.queue.onSubmittedWorkDone();for(let i=0;i<4;i++)await frame();t.sampleEvery=old;
  const a=[];for(let i=s;i<t.count;i++)a.push(t.ms[i%t.ms.length]);a.sort((p,q)=>p-q);
  return {median:+a[a.length>>1].toFixed(2), p95:+a[Math.floor(a.length*0.95)].toFixed(2), scale:g.post.post.renderScale, late:w.gpuStats.late.length};`;
const out = { date: new Date().toISOString(), note: '3060, headless Windows Chrome 2560x1440, dynamic resolution off (each preset at its own render scale), median GPU frame over 240 frames', presets: {} };
for (const preset of ['low', 'medium', 'high', 'ultra']) {
  execSync(`PORT=4173 tools/bot/play.sh "${spots[0]}" "^&gfx=${preset}"`, { stdio: 'inherit' });
  await sleep(4000);
  out.presets[preset] = {};
  for (const id of spots) {
    await bot('spot', { id }); await sleep(6000);
    await js(`g.clock.frozen=true; g.params.v.dynamicRes=0; g.params.version++; g.game.killShaped?.(); return 1;`);
    await sleep(2000);
    const m = await js(measure);
    out.presets[preset][id] = m; console.log(preset, id, JSON.stringify(m));
  }
}
fs.mkdirSync('docs/perf', { recursive: true });
fs.writeFileSync('docs/perf/preset-perf.json', JSON.stringify(out, null, 2) + '\n');
