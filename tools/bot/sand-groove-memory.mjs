#!/usr/bin/env node
// Wider carved-run persistence, checked independently from sub-coarse-texel footprints.
import fs from 'node:fs';
const base=process.env.WRAITH_URL||'http://127.0.0.1:4176';
async function bot(do_,args={}){const {id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:do_,...args})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result;}
const before=await bot('eval',{js:`
 const frame=()=>new Promise(r=>requestAnimationFrame(r));g.arm.setFree(false);for(const s of g.shaped.slots)s.state=0;g.navSync();
 g.game.teleport(1900,900);for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();
 const ts=g.terrainState;ts.relaxation.enabled=false;ts.restore([]);g.stone.mass.clear();for(let i=0;i<90;i++)await frame();
 w.params.v.refillRate=0;w.params.version++;g.game.setPlayerVisible(false);g.weather.override='clear';g.clock.pinHour=15.5;
 g.ground.qx=1904;g.ground.qz=900;g.ground.sample();w.grooveY=g.ground.h;
 ts.bx=1904;ts.bz=900;ts.bdx=1;ts.bdz=0;ts.bl=5;ts.bw=0.8;ts.bd=0.22;ts.bc=0.8;ts.bk=1;ts.bberm=0.7;ts.stamp();
 ts.relaxation.enabled=true;ts.relaxation.iterations=8;for(let i=0;i<60;i++)await frame();ts.relaxation.enabled=false;
 g.arm.setPose(1904,w.grooveY+3,908,Math.PI,Math.atan2(3,8),0.75);
 w.grooveProbe=async()=>{const out=[];for(const x of [1901,1902.5,1904,1905.5,1907])out.push({x,...await ts.debugProbe(x,900)});return out;};return await w.grooveProbe();
`});
await bot('shot',{name:'groove-before',dir:'d2-groove-raw',hud:false});
const after=await bot('eval',{js:`
 if(!await g.game.saves.save('slot2'))throw new Error(String(g.game.saves.lastError));
 const save=await g.game.saves.load('slot2');if(!save)throw new Error('slot2 was not found');
 for(let i=0;i<600&&!g.game.worldSettled();i++)await new Promise(r=>requestAnimationFrame(r));for(let i=0;i<60;i++)await new Promise(r=>requestAnimationFrame(r));
 g.game.setPlayerVisible(false);g.arm.setPose(1904,w.grooveY+3,908,Math.PI,Math.atan2(3,8),0.75);
 return {probes:await w.grooveProbe(),pages:save.terrainPages.length,late:w.gpuStats.late,gpuErrors:w.gpuStats.gpuErrors};
`});
await bot('shot',{name:'groove-reload',dir:'d2-groove-raw',hud:false});
const ratios=before.map((p,i)=>after.probes[i].fine/p.fine);
const report={date:new Date().toISOString(),before,...after,depthRetained:ratios,note:'10 m by 1.6 m carved groove, real IndexedDB save/load; footprint fine-detail loss is reported separately.'};
fs.writeFileSync('docs/phase-9/relaxation/groove-memory.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
if(after.gpuErrors||after.late.length||ratios.some(x=>x<0.8))process.exitCode=1;
