#!/usr/bin/env node
// Real-time diagnostic: seeded maximum-speed surf, eight Shaped, normal terrain writers.
import fs from 'node:fs';
const iterations = Number(process.argv[2] || 8);
if (!Number.isInteger(iterations) || iterations < 2 || iterations > 64 || iterations % 2) throw new Error('Use an even iteration count from 2 to 64');
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
 const oldIterations=r.iterations,oldUpdate=r.update,oldStamp=ts.stamp,proto=GPUCommandEncoder.prototype,oldPass=proto.beginComputePass;
 const sampleMs=[],samplePasses=[],writes=new Uint32Array(16);
 let measuring=false,stampCount=0,speedMax=0,speedMin=Infinity,speedTotal=0,pendingMax=0;
 timer.active=true;timer.sampleEvery=1;timer.debugPasses=true;
 timer.byLabel=new Proxy(Object.create(null),{set(obj,key,value){
   if(key==='sandRelaxLoad'){const i=timer.count,delta=value-(obj[key]||0);sampleMs[i]=(sampleMs[i]||0)+delta;samplePasses[i]=(samplePasses[i]||0)+1;}
   obj[key]=value;return true;
 }});
 r.update=function(allow=true){measuring=allow&&this.enabled;try{return oldUpdate.call(this,allow);}finally{measuring=false;}};
 proto.beginComputePass=function(desc){desc.label=measuring?'sandRelaxLoad':undefined;return oldPass.call(this,desc);};
 ts.stamp=function(){stampCount++;if(this.bk>=0&&this.bk<writes.length)writes[this.bk]++;return oldStamp.call(this);};
 g.arm.yaw=0;g.arm.pitch=0.3;g.combat.dying=0;g.combat.health=10000;
 const sf=g.controller.surf;sf.active=true;sf.speed=26;sf.heading=0;
 w.inject('Traverse',true);w.inject('MoveForward',true);
 r.iterations=${iterations};r.enabled=true;const jobs0=r.jobs,reads0=ts.collision.reads,start=g.clock.simTime;
 try {
   for(let i=0;i<240;i++){
     await frame();const speed=Math.hypot(g.controller.vel.x,g.controller.vel.z);
     speedMax=Math.max(speedMax,speed);speedMin=Math.min(speedMin,speed);speedTotal+=speed;
     pendingMax=Math.max(pendingMax,r.queue.pending);
   }
 } finally {
   r.enabled=false;w.inject('Traverse',false);w.inject('MoveForward',false);
   r.iterations=oldIterations;r.update=oldUpdate;ts.stamp=oldStamp;proto.beginComputePass=oldPass;g.combat.health=100;
 }
 await w.gpuStats.device.queue.onSubmittedWorkDone();for(let i=0;i<10;i++)await frame();
 timer.active=false;timer.debugPasses=false;timer.byLabel={};
 const samples=sampleMs.filter((_,i)=>samplePasses[i]===${finePasses}).sort((a,b)=>a-b),incomplete=samplePasses.filter(n=>n!==${finePasses}).length;
 return {iterations:${iterations},finePasses:${finePasses},frames:240,seconds:g.clock.simTime-start,activeBefore,activeAfter:g.shaped.slots.filter(s=>s.state!==0).length,
   jobs:r.jobs-jobs0,writes:stampCount,writesByKind:Array.from(writes),pendingMax,collisionReads:ts.collision.reads-reads0,
   speed:{min:speedMin,max:speedMax,mean:speedTotal/240},samples:samples.length,incomplete,
   fineGpuMs:{mean:samples.reduce((a,b)=>a+b,0)/samples.length,p95:samples[Math.floor(samples.length*0.95)],max:samples.at(-1)},
   gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late,collisionErrors:ts.collision.errors,
   note:'Maximum speed is seeded once; subsequent movement/writers use the live game. Diagnostic player health is raised to keep the workload running. Per-frame fine compute sums require every expected timestamped pass. Collision/coarse costs are excluded from fineGpuMs. Human feel and sustained 1440p/60 are not assessed.'};
`);
fs.writeFileSync('docs/phase-9/relaxation/full-load-'+iterations+'.json', JSON.stringify({ date: new Date().toISOString(), ...result }, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (result.activeBefore !== 8 || result.jobs < 200 || result.samples < 200 || result.incomplete || result.writes === 0 || result.gpuErrors || result.late.length || result.collisionErrors || result.fineGpuMs.max >= 0.4) process.exitCode = 1;
