#!/usr/bin/env node
// Reload an unsettled saved mound without issuing another brush. One Windows GPU bot only.
import fs from 'node:fs';
const base = process.env.WRAITH_URL || 'http://127.0.0.1:4176';
async function ev(js) {
  const { id } = await (await fetch(base + '/__wraith/bot/cmd', {
    method: 'POST', body: JSON.stringify({ do: 'eval', js }),
  })).json();
  const reply = await (await fetch(base + '/__wraith/bot/reply?id=' + id + '&wait=180000')).json();
  if (!reply.ok) throw new Error(reply.error);
  return reply.result;
}
const setup = await ev(`
 const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
 g.arm.setFree(false);g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();
 g.combat.dying=0;g.combat.health=100;g.game.teleport(1900,900);
 for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();
 console.log('[reload-wake] world settled');
 const ts=g.terrainState,r=ts.relaxation;
 r.enabled=false;ts.restore([]);g.stone.mass.clear();
 w.params.v.refillRate=0;w.params.version++;
 for(let i=0;i<90;i++)await frame();
 ts.bx=1901;ts.bz=900;ts.bdx=1;ts.bdz=0;ts.bl=0;ts.bw=0.7;ts.bd=2;ts.bc=0.2;ts.bk=5;ts.stamp();
 for(let i=0;i<30;i++)await frame();
 const pages=await ts.snapshot();
 console.log('[reload-wake] snapshot pages '+pages.length);
 if(!pages.length)throw new Error('Snapshot contains no terrain pages');
 ts.restore(pages);
 for(let i=0;i<600;i++){await frame();if(i>90&&g.game.worldSettled())break;}
 const before=await ts.debugProbe(1901,900),jobs0=r.jobs;
 r.queue.reset();r.enabled=true;
 w.reloadWake={before,jobs0,pages:pages.length};
 return {before,pages:pages.length};
`);
console.log(JSON.stringify({setup}));
for (let chunk = 0; chunk < 4; chunk++) {
  const progress = await ev(`for(let i=0;i<120;i++)await new Promise(resolve=>requestAnimationFrame(resolve));return {jobs:g.terrainState.relaxation.jobs-w.reloadWake.jobs0};`);
  console.log(JSON.stringify({chunk,...progress}));
}
const result = await ev(`
 const ts=g.terrainState,r=ts.relaxation,{before,jobs0,pages}=w.reloadWake;r.enabled=false;
 const after=await ts.debugProbe(1901,900);
 return {pages,before,after,jobs:r.jobs-jobs0,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late,
   note:'In-memory snapshot/restore of actual packed GPU pages; no post-restore brush. This checks solver wake, not IndexedDB.'};
`);
fs.mkdirSync('docs/phase-9/relaxation', { recursive: true });
fs.writeFileSync('docs/phase-9/relaxation/reload-wake.json', JSON.stringify({ date: new Date().toISOString(), ...result }, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (result.jobs === 0 || result.after.fineRelief >= result.before.fineRelief - 0.05 || result.gpuErrors || result.late.length) process.exitCode = 1;
