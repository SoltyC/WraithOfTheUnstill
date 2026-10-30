import fs from 'node:fs';
import {createEmptySave} from '/home/sol/wraith-light/src/game/save/saveSchema.js';
const base='http://localhost:4181';
async function cmd(js){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(JSON.stringify(r));return r.result??r;}
const result=await cmd(`
 const frame=()=>new Promise(r=>requestAnimationFrame(r));g.game.saves.autosaveIntervalSec=Infinity;g.game.saves.requestAutosave=()=>{};g.game.saves.store={put:async()=>{throw new Error('No user save writes')}};
 g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;g.clock.frozen=false;g.clock.pinHour=13;w.params.v.timeOfDay=13;g.ws.weatherOverride='clear';g.ws.wetForce=0;g.ws.puddleForce=0;g.game.teleport(2405,900);
 for(let i=0;i<600&&(!g.game.worldSettled()||!g.game.stateSettled());i++)await frame();for(let i=0;i<90;i++)await frame();
 const f=g.sandstorm;f.enabled=true;f.target=1;f.active=false;f.strength=0;f.anchorX=2400;f.anchorZ=900;f.baseY=g.controller.pos.y;f.dirX=1;f.dirZ=0;f.dt=0;f.snap=true;f.update();f.age=95;f.update();
 const wind=g.wind,shelter=g.windShelter,query=(x,z)=>{wind.sx=x;wind.sz=z;wind.sample();return {x,z,raw:wind.rawSpeed,speed:wind.speed,exposure:wind.exposure,dx:wind.outX,dz:wind.outZ}};
 for(let i=0;i<60;i++)await frame();const baseline={lee:query(2403,900),windward:query(2397,900),reads:shelter.reads};
 const ts=g.terrainState,m=g.ground.mass;ts.bx=2400;ts.bz=900;ts.bdx=0;ts.bdz=1;ts.bl=6;ts.bw=1.8;ts.bd=4;ts.bc=.6;ts.bk=8;ts.stamp();
 m.arg.set([2400,900,0,1,6,1.8,4,Math.LN2/300]);m.addRidge();
 for(let i=0;i<90;i++)await frame();const crest=await ts.debugProbe(2400,900),after={lee:query(2403,900),windward:query(2397,900),end:query(2403,912),outside:query(2440,900),reads:shelter.reads,sampleTime:shelter.field.time,age:g.clock.simTime-shelter.field.time,embodiedAudioExposure:g.sfx.stormExposure};
 const field={data:Array.from(shelter.field.data),originX:shelter.field.originX,originZ:shelter.field.originZ,step:shelter.field.step,enabled:shelter.field.enabled};
 const s=${JSON.stringify(createEmptySave())};await g.game.saves.collect(s);const bytes=await g.game.saves.codec.encode(s),loaded=await g.game.saves.codec.decode(bytes);await g.game.saves.apply(loaded);const invalidatedOnRestore=!shelter.field.enabled;
 for(let i=0;i<600&&(!g.game.worldSettled()||!g.game.stateSettled());i++)await frame();for(let i=0;i<90;i++)await frame();
 const restored={lee:query(2403,900),windward:query(2397,900),reads:shelter.reads,crest:await ts.debugProbe(2400,900)};
 const report={baseline,after,crest,field,restored,invalidatedOnRestore,gpuErrors:w.gpuStats.gpuErrors,messages:w.gpuStats.gpuErrorMessages,late:w.gpuStats.late,readbackErrors:shelter.errors,normalStormReady:g.weather.duneStorms,note:'Actual RIDGE GPU brush plus matching existing Stone mass, actual live shared wind/audio owner, real page collection/codec/restore. This verifies local shelter, not storm erasure or saved CPU Stone collision parity. No IndexedDB writes.'};
 if(crest.fineDisplaced<3.8||after.lee.exposure>.5||after.windward.exposure<.9||after.outside.exposure!==1||after.lee.speed!==after.lee.raw*after.lee.exposure||after.reads<=baseline.reads||!invalidatedOnRestore||restored.lee.exposure>.5||restored.crest.fineDisplaced<3.7||report.gpuErrors||report.late.length||report.readbackErrors||report.normalStormReady)throw new Error(JSON.stringify(report));return report;
`);
fs.writeFileSync('docs/phase-9/storm-front/ridge-shelter-smoke.json',JSON.stringify({date:new Date().toISOString(),...result},null,2)+'\n');console.log(JSON.stringify({...result,field:{...result.field,data:'retained in report'}},null,2));
