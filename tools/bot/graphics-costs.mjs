#!/usr/bin/env node
// What each graphics lever costs (for the presets, src/core/graphics.js): at fixed views, the GPU frame
// (whole-frame timestamps, render scale fixed, dynamic resolution off) with everything on, then with
// one lever off at a time. Writes docs/perf/graphics-costs.json.
//   tools/bot/play.sh "" ""   then   node tools/bot/graphics-costs.mjs [spot,spot,...]
import fs from 'node:fs';
import { bot, js } from './client.mjs';

const spots = (process.argv[2] || 'p8-meadow-golden,p9r-galleries-dawn,p9s1-star-mid,p2-frost-dawn').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LEVERS = ['shadows', 'postAo', 'postSsr', 'postBloom', 'postShafts', 'postClouds', 'postHeat', 'postMirage', 'postSharpen', 'postMeter',
  'sandDust', 'crestDust', 'desertAir', 'spindrift', 'rocks', 'canyon', 'grass', 'trees', 'groundCover', 'scale0.5', 'scale1'];
const measure = `const frame=()=>new Promise(r=>requestAnimationFrame(r));const t=w.gpuTimer;
  for(let i=0;i<40;i++)await frame();
  const old=t.sampleEvery;t.sampleEvery=1;const s=t.count;t.setActive(true);for(let i=0;i<150;i++)await frame();t.setActive(false);
  await w.gpuStats.device.queue.onSubmittedWorkDone();for(let i=0;i<4;i++)await frame();t.sampleEvery=old;
  const a=[];for(let i=s;i<t.count;i++)a.push(t.ms[i%t.ms.length]);a.sort((p,q)=>p-q);return +a[a.length>>1].toFixed(2);`;
// Levers that are not plain toggles.
const set = (lever, on) => {
  if (lever === 'grass') return `g.grass.meshes.forEach(m=>m.setEnabled(${on})); g.engine.snapshotRenderingReset(); return 1;`;
  if (lever === 'trees') return `g.trees.meshes.forEach(m=>m.setEnabled(${on})); g.trees.casters.forEach(([m])=>m.setEnabled(${on})); g.engine.snapshotRenderingReset(); return 1;`;
  if (lever === 'groundCover') return `g.groundCover.mesh.setEnabled(${on}); g.engine.snapshotRenderingReset(); return 1;`;
  if (lever === 'scale0.5' || lever === 'scale1') return `g.params.v.renderScale=${on ? 0.7 : lever === 'scale1' ? 1 : 0.5}; g.params.version++; return 1;`;
  return `g.setToggle(${JSON.stringify(lever)}, ${on}); return 1;`;
};
const out = { date: new Date().toISOString(), note: '3060, headless Windows Chrome, 2560x1440, render scale 0.7 fixed, median GPU frame (ms) over 150 frames', spots: {} };
for (const id of spots) {
  await bot('spot', { id }); await sleep(6000);
  await js(`g.clock.frozen=true; g.params.v.dynamicRes=0; g.params.v.renderScale=0.7; g.params.version++; g.game.killShaped?.(); return 1;`);
  await sleep(1500);
  const base = await js(measure);
  const row = { base };
  for (const lever of LEVERS) {
    await js(set(lever, false)); await sleep(700);
    const off = await js(measure);
    await js(set(lever, true)); await sleep(400);
    row[lever] = +(base - off).toFixed(2);
    console.log(id, lever, 'saves', row[lever], 'ms (base', base + ')');
  }
  out.spots[id] = row;
}
fs.mkdirSync('docs/perf', { recursive: true });
fs.writeFileSync('docs/perf/graphics-costs.json', JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out, null, 1));
