#!/usr/bin/env node
// Target-GPU D2 oracle comparison and per-pass timing. One Windows bot on :4176.
import fs from 'node:fs';
import { createRelaxationGrid } from '../../src/terrain/state/relaxation.js';
const label = process.argv[2] || 'prototype-gpu';
if(!/^[a-z0-9-]+$/i.test(label))throw new Error('Use a simple report label');
const base = process.env.WRAITH_URL || 'http://127.0.0.1:4176';
async function ev(js) {
  const {id} = await (await fetch(base + '/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();
  const r = await (await fetch(base + '/__wraith/bot/reply?id=' + id + '&wait=180000')).json();
  if (!r.ok) throw new Error(r.error); return r.result;
}
const setup = await ev(`
  const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  g.game.killShaped();g.combat.dying=0;g.combat.health=100;g.game.teleport(1900,900);
  for(let i=0;i<600 && !g.game.worldSettled();i++)await frame();
  for(let i=0;i<60;i++)await frame();
  g.game.killShaped();w.params.v.refillRate=0;w.params.version++;g.terrainState.healScale=0;
  const r=g.terrainState.relaxation;r.enabled=false;
  const ts=g.terrainState;
  ts.bx=1904;ts.bz=900;ts.bdx=1;ts.bdz=0;ts.bl=0;ts.bw=0.5;ts.bd=2;ts.bc=0.2;ts.bk=5;ts.stamp();
  for(let i=0;i<30;i++)await frame();
  const raw=await ts.params.read(0,16);const origin=new Int32Array(raw.buffer,raw.byteOffset,4);
  w.relaxOrigin=[origin[0],origin[1]];
  w.relaxRun=async(iterations)=>{
    r.queue.reset();r.queue.now=ts.time;r.queue.mark(1904*48,900*48,1904*48,900*48);
    r.iterations=iterations;r.enabled=true;r.originX=w.relaxOrigin[0];r.originZ=w.relaxOrigin[1];r.time=ts.time;r.update();r.enabled=false;
    const raw=await r.debugRead();return Array.from(new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4));
  };
  return {ready:r.ready,before:await w.relaxRun(0)};
`);
const after = await ev('g.terrainState.relaxation.debugIterate(4); const raw=await g.terrainState.relaxation.debugRead();return Array.from(new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4));');
const g = createRelaxationGrid(128,1/48);
for (let i=0;i<g.height.length;i++) {
  g.height[i]=setup.before[4*i];g.base[i]=setup.before[4*i+1];g.wet[i]=setup.before[4*i+2];g.frozen[i]=setup.before[4*i+3]<0.5?1:0;
}
const beforeMass = g.height.reduce((a,b)=>a+b,0);
if(beforeMass < 1) throw new Error("No disturbed sand reached the GPU test tile");
g.run(4);
let maxError=0, squared=0, afterMass=0;
for(let i=0;i<g.height.length;i++) { const d=Math.abs(g.height[i]-after[4*i]);maxError=Math.max(maxError,d);squared+=d*d;afterMass+=after[4*i]; }
const packed = await ev(`
  let out;
  for(let i=0;i<100;i++)out=await w.relaxRun(4);
  let mass=0;for(let i=0;i<out.length;i+=4)mass+=out[i];
  return {cycles:100,mass};
`);
const timing = await ev(`
  const r=g.terrainState.relaxation, timer=w.gpuTimer;
  timer.active=true;timer.sampleEvery=1;timer.debugPasses=true;timer.byLabel={};
  const oldUpdate=r.update, proto=GPUCommandEncoder.prototype, oldPass=proto.beginComputePass;
  let measuring=false;
  r.update=function(allow=true){measuring=allow && this.enabled;try{return oldUpdate.call(this,allow)}finally{measuring=false}};
  proto.beginComputePass=function(desc){desc.label=measuring?'sandRelax':undefined;return oldPass.call(this,desc)};
  const start=timer.count, frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  r.queue.now=g.terrainState.time;r.queue.mark(1904*48,900*48,1904*48,900*48);r.iterations=4;r.enabled=true;
  const jobs0=r.jobs;let lastTotal=0,maxBatchMs=0;
  for(let i=0;i<120;i++){r.queue.now=g.terrainState.time;r.queue.mark(1904*48,900*48,1904*48,900*48);await frame();const total=timer.byLabel.sandRelax || 0;maxBatchMs=Math.max(maxBatchMs,total-lastTotal);lastTotal=total;}
  r.enabled=false;timer.active=false;timer.debugPasses=false;r.update=oldUpdate;proto.beginComputePass=oldPass;
  await new Promise(resolve=>setTimeout(resolve,200));
  return {jobs:r.jobs-jobs0,samples:timer.count-start,relaxGpuTotalMs:timer.byLabel.sandRelax || 0,maxBatchMs,errors:w.gpuStats.gpuErrors,late:w.gpuStats.late,adapter:w.gpuStats.adapterInfo};
`);
const report = {date:new Date().toISOString(),ready:setup.ready,maxError,rms:Math.sqrt(squared/g.height.length),beforeMass,afterMass,massError:afterMass-beforeMass,packedMassError:packed.mass-beforeMass,packedCycles:packed.cycles,relativePackedMassError:(packed.mass-beforeMass)/Math.max(1,Math.abs(beforeMass)),note:'Scratch float output before f16 store. Closed tile, four iterations. Headless indicative timing.',timing};
fs.mkdirSync('docs/phase-9/relaxation',{recursive:true});fs.writeFileSync('docs/phase-9/relaxation/'+label+'.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(maxError>0.0001 || Math.abs(packed.mass-beforeMass)>Math.max(0.01,Math.abs(beforeMass)*1e-5) || timing.jobs < 100 || timing.errors || timing.late.length) process.exitCode=1;
