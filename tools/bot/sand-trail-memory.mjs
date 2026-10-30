#!/usr/bin/env node
// Real-time, restored-sand trail retention and save/load in the isolated Chrome bot profile.
import fs from 'node:fs';
const base=process.env.WRAITH_URL||'http://127.0.0.1:4176';
async function bot(do_,args={}){const {id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:do_,...args})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r;}
const setup=await bot('eval',{js:`
 const frame=()=>new Promise(r=>requestAnimationFrame(r));g.arm.setFree(false);
 for(const s of g.shaped.slots)s.state=0;g.navSync();g.combat.dying=0;g.combat.health=100;
 g.game.teleport(1900,900);for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();
 const ts=g.terrainState;ts.relaxation.enabled=false;ts.restore([]);g.stone.mass.clear();
 for(let i=0;i<90;i++)await frame();
 g.ws.restoration.dunes='restored';g.weather.override='clear';g.clock.pinHour=15.5;
 w.params.v.refillRate=1;w.params.v.dynamicRes=0;w.params.v.renderScale=1;w.params.version++;g.game.setPlayerVisible(false);
 g.ground.qx=1903.8;g.ground.qz=900;g.ground.sample();w.trailY=g.ground.h;
 g.arm.setPose(1903.8,w.trailY+1.5,903,Math.PI,Math.atan2(1.5,3),0.75);
 for(let i=0;i<15;i++){
   ts.bx=1902+i*0.26;ts.bz=900+(i%2?0.12:-0.12);ts.bdx=1;ts.bdz=0;ts.bl=0.10;ts.bw=0.075;ts.bd=0.045;ts.bc=0.9;ts.bk=0;ts.stamp();
 }
 ts.relaxation.enabled=true;ts.relaxation.iterations=8;
 for(let i=0;i<30;i++)await frame();
 w.trailT=g.clock.simTime;
 w.trailProbe=async()=>{
   const x=1902+7*0.26,z=900.12,p=await ts.debugProbe(x,z),N=4092,i=Math.floor(x*48),j=Math.floor(z*48),k=((j%N+N)%N)*N+(i%N+N)%N;
   const raw=await ts.fine[1].read(k*4,4),state=new Uint32Array(raw.buffer,raw.byteOffset,1)[0];
   return {...p,compaction:(state&255)/255,wet:((state>>>8)&255)/255,frozen:((state>>>16)&255)/255,sandHealScale:ts.sandHealScale,time:g.clock.simTime};
 };return {before:await w.trailProbe(),cameraY:w.trailY};
`});
console.log(JSON.stringify({setup:setup.result}));await bot('shot',{name:'trail-0',dir:'d2-trail-raw',hud:false});
const stages=[];
for(const elapsed of [20,40,60]){
 const r=await bot('eval',{js:`while(g.clock.simTime-w.trailT<${elapsed})await new Promise(r=>requestAnimationFrame(r));return await w.trailProbe();`});stages.push({elapsed,...r.result});console.log(JSON.stringify(stages.at(-1)));
}
await bot('shot',{name:'trail-60',dir:'d2-trail-raw',hud:false});
const saved=await bot('eval',{js:`g.terrainState.relaxation.enabled=false;const ok=await g.game.saves.save('slot3');if(!ok)throw new Error(String(g.game.saves.lastError));return {ok,saves:g.game.saves.saveCount,error:null};`});
const loaded=await bot('eval',{js:`
 const save=await g.game.saves.load('slot3');if(!save)throw new Error('Saved slot3 was not found');for(let i=0;i<600&&!g.game.worldSettled();i++)await new Promise(r=>requestAnimationFrame(r));
 for(let i=0;i<60;i++)await new Promise(r=>requestAnimationFrame(r));
 g.game.setPlayerVisible(false);g.arm.setPose(1903.8,w.trailY+1.5,903,Math.PI,Math.atan2(1.5,3),0.75);
 return {probe:await w.trailProbe(),late:w.gpuStats.late,gpuErrors:w.gpuStats.gpuErrors};
`});
await bot('shot',{name:'trail-reload',dir:'d2-trail-raw',hud:false});
const report={date:new Date().toISOString(),...setup.result,stages,saved:saved.result,loaded:loaded.result,note:'Real simulation-time retention, then IndexedDB save/codec/load in the same page. A fresh-page reload is a separate gate.'};
fs.mkdirSync('docs/phase-9/relaxation',{recursive:true});fs.writeFileSync('docs/phase-9/relaxation/trail-memory.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
if(loaded.result.gpuErrors||loaded.result.late.length||saved.result.error||stages[2].compaction<0.5||!(loaded.result.probe.fine>0.001))process.exitCode=1;
