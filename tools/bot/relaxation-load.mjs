#!/usr/bin/env node
// Real-time diagnostic: seeded maximum-speed surf, eight Shaped, normal terrain writers.
import fs from 'node:fs';
import { RELAX_ITERATIONS } from '../../src/terrain/state/relaxation.js';
const iterations = Number(process.argv[2] || RELAX_ITERATIONS);
if (!Number.isInteger(iterations) || iterations < 2 || iterations > 64 || iterations % 2) throw new Error('Use an even iteration count from 2 to 64');
const mode=process.argv[3]||'live';
if(!['live','synthetic26'].includes(mode))throw new Error('Use live or synthetic26');
const frames=mode==='synthetic26'?480:240;
const finePasses = 2 + 2 * Math.floor(iterations / 8) + iterations % 8;
const base = process.env.WRAITH_URL || 'http://127.0.0.1:4176';
async function ev(js) {
  new Function('g', 'w', 'return (async()=>{' + js + '})()');
  const { id } = await (await fetch(base + '/__wraith/bot/cmd', { method: 'POST', body: JSON.stringify({ do: 'eval', js }) })).json();
  const reply = await (await fetch(base + '/__wraith/bot/reply?id=' + id + '&wait=180000')).json();
  if (!reply.ok) throw new Error(reply.error);
  return reply.result;
}
const result = await ev(`
 const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
 g.arm.setFree(false);g.game.teleport(1900,900);
 for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();
 g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();
 const ts=g.terrainState,r=ts.relaxation,timer=w.gpuTimer;
 r.enabled=false;ts.restore([]);g.stone.mass.clear();
 w.params.v.refillRate=0;w.params.v.dynamicRes=0;w.params.v.renderScale=1;w.params.version++;
 for(let i=0;i<90;i++)await frame();
 g.game.spawnShaped('skitter',4);g.game.spawnShaped('plateback',4);
 const activeBefore=g.shaped.slots.filter(s=>s.state!==0).length;
 const oldIterations=r.iterations,oldUpdate=r.update,oldCoarse=ts.coarseRelaxation.update,oldCollision=ts.collision.update,oldStamp=ts.stamp,proto=GPUCommandEncoder.prototype,oldPass=proto.beginComputePass;
 const sampleMs=[],samplePasses=[],sampleStages=[],sampleCombined=[],sampleParts=[],writes=new Uint32Array(16),sampleStart=timer.count;
 let measuredPass=0,measureKind='sandRelaxLoad',measuring=false,stampCount=0,speedMax=0,speedMin=Infinity,speedTotal=0,pendingMax=0;
 timer.active=true;timer.sampleEvery=1;timer.debugPasses=true;
 timer.byLabel=new Proxy(Object.create(null),{set(obj,key,value){
   if(key.startsWith('sandRelaxLoad')||key.startsWith('sandCoarseLoad')||key.startsWith('sandCollisionLoad')){const i=timer.count,delta=value-(obj[key]||0);sampleCombined[i]=(sampleCombined[i]||0)+delta;const kind=key.split(/[0-9]/)[0];const parts=sampleParts[i]||=( {} );parts[kind]=(parts[kind]||0)+delta;}
   if(key.startsWith('sandRelaxLoad')){const i=timer.count,delta=value-(obj[key]||0);sampleMs[i]=(sampleMs[i]||0)+delta;samplePasses[i]=(samplePasses[i]||0)+1;(sampleStages[i]||=([])).push({pass:Number(key.slice(13)),ms:delta});}
   obj[key]=value;return true;
 }});
 r.update=function(allow=true){measureKind='sandRelaxLoad';measuredPass=0;measuring=allow&&this.enabled;try{return oldUpdate.call(this,allow);}finally{measuring=false;}};
 ts.coarseRelaxation.update=function(){measureKind='sandCoarseLoad';measuredPass=0;measuring=this.enabled;try{return oldCoarse.call(this);}finally{measuring=false;}};
 ts.collision.update=function(){measureKind='sandCollisionLoad';measuredPass=0;measuring=this.enabled;try{return oldCollision.call(this);}finally{measuring=false;}};
 proto.beginComputePass=function(desc){desc.label=measuring?measureKind+measuredPass++:undefined;return oldPass.call(this,desc);};
 ts.stamp=function(){stampCount++;if(this.bk>=0&&this.bk<writes.length)writes[this.bk]++;return oldStamp.call(this);};
 g.arm.yaw=0;g.arm.pitch=0.3;g.combat.dying=0;g.combat.health=10000;
 const sf=g.controller.surf;sf.active=true;sf.speed=26;sf.heading=0;
 w.inject('Traverse',true);w.inject('MoveForward',true);
 r.iterations=${iterations};r.enabled=true;const jobs0=r.jobs,reads0=ts.collision.reads,start=g.clock.simTime;
 let syntheticDistance=0,syntheticCovered=0,syntheticAge=0,lastSyntheticX=NaN;
 const synthetic={name:'D2 synthetic max-speed writer',update(){
   const distance=(g.clock.simTime-start)*26,phase=distance%80;
   const x=1900+(phase<40?phase-20:60-phase);
   if(Number.isFinite(lastSyntheticX))syntheticDistance+=Math.abs(x-lastSyntheticX);lastSyntheticX=x;
   ts.followOverride=true;ts.followX=x;ts.followZ=900;
   ts.bx=x;ts.bz=900;ts.bdx=1;ts.bdz=0;ts.bl=Math.max(0.1,26*g.clock.dt*0.5);ts.bw=0.9;ts.bd=0.13;ts.bc=0.8;ts.bk=1;ts.stamp();
   const v=ts.collision.view;v.qx=x;v.qz=900;if(v.sample()){syntheticCovered++;syntheticAge=Math.max(syntheticAge,g.clock.simTime-v.sampleTime);}
 }};
 if('${mode}'==='synthetic26'){const at=g.loop.systems.findIndex(s=>s.name==='terrainState');g.loop.systems.splice(at,0,synthetic);}

 try {
   for(let i=0;i<${frames};i++){
     await frame();const speed=Math.hypot(g.controller.vel.x,g.controller.vel.z);
     speedMax=Math.max(speedMax,speed);speedMin=Math.min(speedMin,speed);speedTotal+=speed;
     pendingMax=Math.max(pendingMax,r.queue.pending);
   }
 } finally {
   const at=g.loop.systems.indexOf(synthetic);if(at>=0)g.loop.systems.splice(at,1);ts.followOverride=false;
   r.enabled=false;w.inject('Traverse',false);w.inject('MoveForward',false);
   r.iterations=oldIterations;r.update=oldUpdate;ts.coarseRelaxation.update=oldCoarse;ts.collision.update=oldCollision;ts.stamp=oldStamp;proto.beginComputePass=oldPass;g.combat.health=100;
 }
 await w.gpuStats.device.queue.onSubmittedWorkDone();for(let i=0;i<10;i++)await frame();
 timer.active=false;timer.debugPasses=false;timer.byLabel={};
 const spikes=sampleMs.map((ms,i)=>({sample:i-sampleStart,frame:timer.frameOf[i%timer.frameOf.length],ms,passes:samplePasses[i],stages:sampleStages[i]})).filter(v=>v.ms>=0.4);
 const samples=sampleMs.filter((_,i)=>samplePasses[i]===${finePasses}).sort((a,b)=>a-b),incomplete=samplePasses.filter(n=>n!==${finePasses}).length;
 const combined=sampleCombined.filter(Number.isFinite).sort((a,b)=>a-b);
 const combinedPeak=sampleCombined.indexOf(combined.at(-1));
 return {combinedGpuMs:{mean:combined.reduce((a,b)=>a+b,0)/combined.length,p95:combined[Math.floor(combined.length*.95)],max:combined.at(-1),peakParts:sampleParts[combinedPeak]},iterations:${iterations},finePasses:${finePasses},frames:${frames},mode:'${mode}',synthetic:{distance:syntheticDistance,covered:syntheticCovered,maxAge:syntheticAge,nominalSpeed:26},seconds:g.clock.simTime-start,activeBefore,activeAfter:g.shaped.slots.filter(s=>s.state!==0).length,
   jobs:r.jobs-jobs0,writes:stampCount,writesByKind:Array.from(writes),pendingMax,collisionReads:ts.collision.reads-reads0,
   speed:{min:speedMin,max:speedMax,mean:speedTotal/${frames}},samples:samples.length,incomplete,spikes,maxSampleStages:sampleStages[sampleMs.indexOf(Math.max(...sampleMs.filter(Number.isFinite)))],
   fineGpuMs:{mean:samples.reduce((a,b)=>a+b,0)/samples.length,p95:samples[Math.floor(samples.length*0.95)],max:samples.at(-1)},
   gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late,collisionErrors:ts.collision.errors,retirementErrors:r.activityErrors,
   note:'Synthetic26 mode adds an actual PLOUGH writer and moving collision readback centre at a nominal 26 m/s along a bounded back-and-forth path. It is a D2 data-path stress test, not D3 gameplay. Maximum speed is seeded once; subsequent movement/writers use the live game. Diagnostic player health is raised to keep the workload running. Per-frame fine compute sums require every expected timestamped pass. Collision/coarse costs are excluded from fineGpuMs but included in combinedGpuMs. Human feel and sustained 1440p/60 are not assessed.'};
`);
fs.writeFileSync('docs/phase-9/relaxation/full-load-'+iterations+(mode==='live'?'':'-'+mode)+'.json', JSON.stringify({ date: new Date().toISOString(), ...result }, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (result.activeBefore !== 8 || result.jobs < 200 || result.samples < 200 || result.incomplete || result.writes === 0 || result.gpuErrors || result.late.length || result.collisionErrors || result.retirementErrors || result.fineGpuMs.max >= 0.4 || result.combinedGpuMs.max >= 0.4 || (mode==='synthetic26' && (result.synthetic.covered<frames*.95 || result.synthetic.distance/result.seconds<24 || result.synthetic.maxAge>.2))) process.exitCode = 1;
