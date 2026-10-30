import fs from 'node:fs';
import { RELAX_ITERATIONS } from '../../src/terrain/state/relaxation.js';
const base='http://127.0.0.1:4176';
async function ev(js){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result;}
console.log(await ev(`
const frame=()=>new Promise(r=>requestAnimationFrame(r));g.game.teleport(1900,894);g.arm.setFree(false);
for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();
const ts=g.terrainState;ts.relaxation.enabled=false;ts.restore([]);g.stone.mass.clear();w.params.v.refillRate=0;w.params.version++;
for(let i=0;i<90;i++)await frame();ts.relaxation.enabled=true;
for(let i=0;i<30;i++)await frame();
ts.relaxation.iterations=${RELAX_ITERATIONS};w.collisionRun={iterations:ts.relaxation.iterations,samples:[],start:g.clock.simTime,reads:ts.collision.reads};
const mass=g.stone.mass;mass.time=g.clock.simTime;mass.arg.set([1900,904,1,0,7,2.95,1.1,0]);w.collisionRun.ridge=mass.addRidge();mass.update(g.clock.simTime);
ts.bx=1900;ts.bz=904;ts.bdx=1;ts.bdz=0;ts.bl=7;ts.bw=2.95;ts.bd=1.1;ts.bc=0.4;ts.bberm=0.5;ts.bk=8;ts.stamp();
g.arm.yaw=0;w.inject('MoveForward',true);return {ready:true};`));
const result=await ev(`
const ts=g.terrainState,c=ts.collision,v=c.view,run=w.collisionRun;let maxAge=0,maxFootGap=0,minFootGap=0,grounded=0,covered=0,moving=0,maxGpuHeightError=0;const gpuProbes=[];
try{for(let i=0;i<360;i++){
await new Promise(r=>requestAnimationFrame(r));const p=g.controller.pos;g.ground.qx=p.x;g.ground.qz=p.z;g.ground.sample();const gap=p.y-g.ground.h;
if(g.controller.grounded){grounded++;maxFootGap=Math.max(maxFootGap,gap);minFootGap=Math.min(minFootGap,gap);}
v.qx=p.x;v.qz=p.z;if(v.sample()){covered++;maxAge=Math.max(maxAge,g.clock.simTime-v.sampleTime);}if(Math.hypot(g.controller.vel.x,g.controller.vel.z)>1)moving++;
if(i%15===0)run.samples.push({i,time:g.clock.simTime,pos:[p.x,p.y,p.z],speed:Math.hypot(g.controller.vel.x,g.controller.vel.z),ground:g.ground.h,gap,grounded:g.controller.grounded,age:g.clock.simTime-v.sampleTime,reads:c.reads,relaxJobs:ts.relaxation.jobs});
if(i%30===0){
const x=p.x,z=p.z,collisionH=g.ground.h,when=g.clock.simTime;
const savedMass=g.ground.mass;g.ground.mass=null;v.enabled=false;g.ground.qx=x;g.ground.qz=z;g.ground.sample();const baseH=g.ground.h;
v.enabled=true;g.ground.mass=savedMass;const probe=await ts.debugProbe(x,z);const error=collisionH-baseH-probe.fineRelief;
maxGpuHeightError=Math.max(maxGpuHeightError,Math.abs(error));gpuProbes.push({x,z,error,span:g.clock.simTime-when,relief:probe.fineRelief});
}

}}finally{w.inject('MoveForward',false);}
return {iterations:run.iterations,maxGpuHeightError,gpuProbes,seconds:g.clock.simTime-run.start,reads:c.reads-run.reads,maxAge,maxFootGap,minFootGap,grounded,covered,moving,samples:run.samples,errors:c.errors,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};`);
console.log(JSON.stringify(result,null,2));fs.writeFileSync('docs/phase-9/relaxation/moving-collision.json',JSON.stringify({date:new Date().toISOString(),...result,note:'Walking a full-size 14 m by 2.95 m-half-width, 1.1 m Stone Ridge while relaxation runs. GPU probes complete asynchronously after the CPU sample; their span is reported. This is walking, not D3 sand-surf acceptance.'},null,2)+'\n');
if(result.errors||result.gpuErrors||result.late.length||result.moving<250||result.maxAge>0.2||result.minFootGap<-.05||result.maxFootGap>.05||result.maxGpuHeightError>.02)process.exitCode=1;
