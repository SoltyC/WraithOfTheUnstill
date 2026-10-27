#!/usr/bin/env node
// D2 sand collision readback check. Requires the one Windows bot on :4176.
import fs from 'node:fs';
const base=process.env.WRAITH_URL || 'http://127.0.0.1:4176';
async function ev(js){const {id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result;}
const result=await ev(`
 const frame=()=>new Promise(r=>requestAnimationFrame(r));
 g.game.killShaped();g.combat.dying=0;g.combat.health=100;g.game.teleport(1900,900);
 for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();for(let i=0;i<60;i++)await frame();
 g.game.killShaped();w.params.v.refillRate=0;w.params.version++;
 const ts=g.terrainState,r=ts.relaxation,c=ts.collision;r.enabled=true;r.iterations=4;
 ts.bx=1904;ts.bz=900;ts.bdx=1;ts.bdz=0;ts.bl=0;ts.bw=0.8;ts.bd=1;ts.bc=0.2;ts.bk=5;ts.stamp();
 for(let i=0;i<90;i++)await frame();r.iterations=0;
 const stopped=g.clock.simTime;
 for(let i=0;i<300&&c.view.sampleTime<stopped;i++)await frame();
 const v=c.view;v.qx=1904;v.qz=900;const covered=v.sample(), offset=v.disp-v.depr;
 const h=1/96,probes=[];
 for(const dx of [-h,h])for(const dz of [-h,h])probes.push(await ts.debugProbe(1904+dx,900+dz));
 const gpuOffset=probes.reduce((sum,p)=>sum+p.fineRelief,0)/4;
 g.ground.qx=1904;g.ground.qz=900;v.enabled=false;g.ground.sample();const baseHeight=g.ground.h;
 v.enabled=true;g.ground.sample();const collisionOffset=g.ground.h-baseHeight;
 g.controller.teleport(1904,900);for(let i=0;i<5;i++)await frame();
 const stood=g.controller.grounded && Math.abs(g.controller.pos.y-(baseHeight+offset))<0.01;
 const report={stood,covered,offset,gpuOffset,error:offset-gpuOffset,collisionOffset,age:g.clock.simTime-v.sampleTime,reads:c.reads,readErrors:c.errors,ready:c.ready,late:w.gpuStats.late,gpuErrors:w.gpuStats.gpuErrors,probes};
 r.enabled=false;r.iterations=4;
 for(let i=0;i<120&&c.pending;i++)await frame();
 c.enabled=true;c.dirty=true;c.time=g.clock.simTime+0.2;c.update();
 const pendingBeforeReset=c.pending;c.enabled=false;c.reset();
 for(let i=0;i<120&&c.pending;i++)await frame();
 report.resetDiscarded=pendingBeforeReset && c.view.data===null;
 return report;
`);
fs.mkdirSync('docs/phase-9/relaxation',{recursive:true});fs.writeFileSync('docs/phase-9/relaxation/collision-gpu.json',JSON.stringify({date:new Date().toISOString(),...result},null,2)+'\n');console.log(JSON.stringify(result,null,2));
if(!result.stood || !result.resetDiscarded || !result.covered || result.reads===0 || result.readErrors || result.gpuErrors || result.late.length || Math.abs(result.error)>0.005 || Math.abs(result.collisionOffset-result.offset)>1e-6)process.exitCode=1;
