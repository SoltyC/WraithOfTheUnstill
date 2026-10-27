#!/usr/bin/env node
import fs from 'node:fs';
const iterations = Number(process.argv[2] || 32);
if (!Number.isInteger(iterations) || iterations < 8 || iterations > 64 || iterations % 8) throw new Error('Use 8, 16, 24…64 steps');
const base = process.env.WRAITH_URL || 'http://127.0.0.1:4176';
async function ev(js) {
  new Function('g', 'w', 'return (async()=>{' + js + '})()');
  const { id } = await (await fetch(base + '/__wraith/bot/cmd', { method: 'POST', body: JSON.stringify({ do: 'eval', js }) })).json();
  const reply = await (await fetch(base + '/__wraith/bot/reply?id=' + id + '&wait=180000')).json();
  if (!reply.ok) throw new Error(reply.error);
  return reply.result;
}
const setup = await ev(`
 const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
 g.arm.setFree(false);g.game.teleport(1900,900);for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();
 g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();
 const ts=g.terrainState,r=ts.relaxation;r.enabled=false;ts.restore([]);g.stone.mass.clear();
 w.params.v.refillRate=0;w.params.version++;g.game.setPlayerVisible(false);
 for(let i=0;i<90;i++)await frame();
 ts.bx=1904;ts.bz=900;ts.bdx=1;ts.bdz=0;ts.bl=0;ts.bw=0.5;ts.bd=2;ts.bc=0.2;ts.bk=5;ts.stamp();
 for(let i=0;i<30;i++)await frame();
 const before=await ts.debugProbe(1904,900);
 w.settleCheck={before,start:ts.time,jobs:r.jobs,oldIterations:r.iterations};r.iterations=${iterations};r.enabled=true;
 return {before,start:ts.time};
`);
console.log(JSON.stringify({setup}));
let elapsed = 0;
for (let chunk = 0; chunk < 30 && elapsed < 35; chunk++) {
  const progress = await ev(`for(let i=0;i<120;i++)await new Promise(resolve=>requestAnimationFrame(resolve));return {elapsed:g.terrainState.time-w.settleCheck.start,jobs:g.terrainState.relaxation.jobs-w.settleCheck.jobs,pending:g.terrainState.relaxation.queue.pending};`);
  elapsed = progress.elapsed; console.log(JSON.stringify({chunk,...progress}));
}
if (elapsed < 35) throw new Error('Not enough simulation time for expiry check');
const result = await ev(`
 const ts=g.terrainState,r=ts.relaxation,check=w.settleCheck;r.enabled=false;
 const after=await ts.debugProbe(1904,900),jobs=r.jobs-check.jobs;
 r.queue.reset();r.queue.now=ts.time;r.queue.mark(1904*48,900*48,1904*48,900*48);r.iterations=0;r.enabled=true;r.update();r.enabled=false;
 const raw=await r.debugRead(),data=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);
 let maxSlope=0,activeMax=0;
 for(let z=0;z<128;z++)for(let x=0;x<128;x++){
   const i=(z*128+x)*4;if(data[i+3]<0.5)continue;
   for(const [dx,dz] of [[1,0],[0,1],[1,1],[-1,1]]){
     const xx=x+dx,zz=z+dz;if(xx<0||xx>=128||zz>=128)continue;
     const j=(zz*128+xx)*4;if(data[j+3]<0.5)continue;
     const slope=Math.abs((data[i]-data[j])+(data[i+1]-data[j+1]))*48/Math.hypot(dx,dz);
     maxSlope=Math.max(maxSlope,slope);
     if(Math.abs(data[i])+Math.abs(data[j])>=1e-6)activeMax=Math.max(activeMax,slope);
   }
 }
 r.iterations=check.oldIterations;g.game.setPlayerVisible(true);
 return {before:check.before,after,jobs,elapsed:ts.time-check.start,allMaxDegrees:Math.atan(maxSlope)*180/Math.PI,
   activeMaxDegrees:Math.atan(activeMax)*180/Math.PI,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};
`);
const report = { date: new Date().toISOString(), iterations, ...result, note: 'Real-time isolated mound; slope checked after the 30 s dirty lifetime, including diagonals. This is not an eight-enemy overlapping-write settling gate.' };
fs.writeFileSync('docs/phase-9/relaxation/settling-'+iterations+'.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (report.activeMaxDegrees > 34.1 || report.gpuErrors || report.late.length) process.exitCode = 1;
