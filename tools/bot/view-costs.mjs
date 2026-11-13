#!/usr/bin/env node
// What each lever costs from the current camera (as tools/bot/graphics-costs.mjs, which goes to photo
// spots): the GPU frame at a fixed 0.8 scale with everything on, then with one lever off at a time.
// Set the camera first (e.g. tools/bot/vista.mjs with one yaw).   node tools/bot/view-costs.mjs [lever,lever,...]
import { js } from './client.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LEVERS = (process.argv[2] || 'shadows,postAo,postSsr,postBloom,postShafts,postClouds,rocks,grass,trees,far,groundCover,water').split(',');
const measure = `const frame=()=>new Promise(r=>requestAnimationFrame(r));const t=w.gpuTimer;
  for(let i=0;i<40;i++)await frame();
  const old=t.sampleEvery;t.sampleEvery=1;const s=t.count;t.setActive(true);for(let i=0;i<150;i++)await frame();t.setActive(false);
  await w.gpuStats.device.queue.onSubmittedWorkDone();for(let i=0;i<4;i++)await frame();t.sampleEvery=old;
  const a=[];for(let i=s;i<t.count;i++)a.push(t.ms[i%t.ms.length]);a.sort((p,q)=>p-q);return +a[a.length>>1].toFixed(2);`;
const set = (lever, on) => {
  if (lever === 'grass') return `g.grass.meshes.forEach(m=>m.setEnabled(${on})); g.engine.snapshotRenderingReset(); return 1;`;
  if (lever === 'trees') return `g.trees.meshes.forEach(m=>m.setEnabled(${on})); g.trees.casters.forEach(([m])=>{ if(!m.name.includes('mpostor')) m.setEnabled(${on}); }); g.engine.snapshotRenderingReset(); return 1;`;
  if (lever === 'far') return `g.trees.impostors.setEnabled(${on}); g.engine.snapshotRenderingReset(); return 1;`;
  if (lever === 'groundCover') return `g.groundCover.mesh.setEnabled(${on}); g.engine.snapshotRenderingReset(); return 1;`;
  if (lever === 'water') return `g.water && g.water.mesh && g.water.mesh.setEnabled(${on}); g.engine.snapshotRenderingReset(); return 1;`;
  return `g.setToggle(${JSON.stringify(lever)}, ${on}); return 1;`;
};
await js(`g.clock.frozen=true; g.params.v.dynamicRes=0; g.params.v.renderScale=0.8; g.params.version++; return 1;`);
await sleep(1500);
const base = await js(measure);
console.log('base', base, 'ms (0.8 scale)');
for (const lever of LEVERS) {
  try {
    await js(set(lever, false)); await sleep(700);
    const off = await js(measure);
    await js(set(lever, true)); await sleep(400);
    console.log(lever.padEnd(12), 'costs', (base - off).toFixed(2), 'ms');
  } catch (e) { console.log(lever, 'n/a', String(e).slice(0, 80)); }
}
await js(`g.clock.frozen=false; g.params.v.dynamicRes=1; g.params.version++; return 1;`);   // a frozen clock stalls streaming (teleports never land)
