import fs from 'node:fs';
import {createEmptySave} from '/home/sol/wraith-light/src/game/save/saveSchema.js';
const base='http://localhost:4181';
async function cmd(js){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=240000')).json();if(!r.ok)throw new Error(JSON.stringify(r));return r.result??r;}
const result=await cmd(`
 const frame=()=>new Promise(r=>requestAnimationFrame(r));
 g.game.saves.requestAutosave=()=>{};g.game.saves.autosaveIntervalSec=Infinity;g.game.saves.store={put:async()=>{throw new Error('Diagnostic must not write user saves')}};
 g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;g.clock.frozen=true;g.clock.pinHour=13;w.params.v.timeOfDay=13;w.params.v.dynamicRes=0;w.params.v.renderScale=.7;w.params.version++;
 g.ws.restoration.frost=g.ws.restoration.meadow=g.ws.restoration.dunes='restored';g.restoration.snap=true;g.ws.weatherOverride='clear';g.ws.wetForce=0;g.ws.puddleForce=0;g.game.teleport(2400,900);
 for(let i=0;i<600&&(!g.game.worldSettled()||!g.game.stateSettled());i++)await frame();for(let i=0;i<120;i++)await frame();g.game.killShaped();
 const f=g.sandstorm;f.enabled=true;f.target=1;f.active=false;f.strength=0;f.anchorX=2400;f.anchorZ=900;f.baseY=g.controller.pos.y;f.dirX=1;f.dirZ=0;f.dt=0;f.snap=true;f.update();f.age=95;f.update();
 const ts=g.terrainState;ts.bx=2403;ts.bz=900;ts.bdx=1;ts.bdz=0;ts.bl=.4;ts.bw=.6;ts.bd=.04;ts.bc=.6;ts.bk=0;ts.stamp();
 g.clock.frozen=false;for(let i=0;i<120;i++)await frame();
 const started=g.clock.simTime,s=${JSON.stringify(createEmptySave())};await g.game.saves.collect(s);g.clock.frozen=true;
 const captureEnded=g.clock.simTime,front=Array.from(f.block),history=g.stormExposure;
 history.qx=2400;history.qz=900;history.from=history.times[0];history.to=s.playSeconds;history.integrate();const expectedExposure=history.value,from=history.from;
 const hash=pages=>pages.map(p=>{let h=2166136261;for(const b of p.data)h=Math.imul(h^b,16777619)>>>0;return {key:p.key,savedAt:p.savedAt,bytes:p.data.length,hash:h}}).sort((a,b)=>a.key.localeCompare(b.key));
 const originalPages=hash(s.terrainPages),bytes=await g.game.saves.codec.encode(s),loaded=await g.game.saves.codec.decode(bytes),decodedPages=hash(loaded.terrainPages);
 if(JSON.stringify(originalPages)!==JSON.stringify(decodedPages))throw new Error('Terrain binary codec mismatch');
 if(!s.terrainPages.length||!s.world.sandstorm)throw new Error('Missing actual terrain/storm capture');
 const latestPage=Math.max(...s.terrainPages.map(p=>p.savedAt));if(latestPage>s.playSeconds||s.world.sandstorm.exposure.through!==s.playSeconds)throw new Error('Capture watermark invalid');
 const before=await ts.debugProbe(2403,900);await g.game.saves.apply(loaded);
 for(let i=0;i<600&&(!g.game.worldSettled()||!g.game.stateSettled());i++)await frame();for(let i=0;i<60;i++)await frame();
 history.qx=2400;history.qz=900;history.from=from;history.to=s.playSeconds;history.integrate();const exposureAfter=history.value,after=await ts.debugProbe(2403,900),frontAfter=Array.from(f.block);
 const shifted=new history.constructor();shifted.restore(s.world.sandstorm.exposure,1000);shifted.qx=2400;shifted.qz=900;shifted.from=from+1000;shifted.to=s.playSeconds+1000;shifted.integrate();
 const report={started,captureEnded,captureAdvanced:captureEnded-started,version:loaded.version,pageCount:s.terrainPages.length,latestPage,watermark:s.playSeconds,codecBytes:bytes.length,pages:originalPages,historyKeys:s.world.sandstorm.exposure.samples.length/13,expectedExposure,exposureAfter,shiftedExposure:shifted.value,front,frontAfter,before,after,settled:g.game.worldSettled()&&g.game.stateSettled(),gpuErrors:w.gpuStats.gpuErrors,gpuMessages:w.gpuStats.gpuErrorMessages,late:w.gpuStats.late,normalStormReady:g.weather.duneStorms,note:'Actual GPU page collection while simulation runs, real save-worker binary codec and in-memory apply. No IndexedDB writes. Verifies exposure persistence foundation, not terrain storm erosion or Ridge shelter.'};
 if(expectedExposure<=0||Math.abs(exposureAfter-expectedExposure)>1e-7||Math.abs(shifted.value-expectedExposure)>1e-6||JSON.stringify(front)!==JSON.stringify(frontAfter)||!report.settled||report.gpuErrors||report.late.length||report.normalStormReady)throw new Error(JSON.stringify(report));return report;
`);
fs.mkdirSync('docs/phase-9/storm-front',{recursive:true});fs.writeFileSync('docs/phase-9/storm-front/save-smoke.json',JSON.stringify({date:new Date().toISOString(),...result},null,2)+'\n');console.log(JSON.stringify(result,null,2));
