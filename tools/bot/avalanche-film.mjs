#!/usr/bin/env node
// D2 diagnostic: fixed camera, one mound, natural bounded relaxation; four supervised chunks.
import fs from 'node:fs';
const base=process.env.WRAITH_URL||'http://127.0.0.1:4176';
async function bot(do_,args={}){const {id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:do_,...args})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r;}
const setup=await bot('eval',{js:`
 const frame=()=>new Promise(r=>requestAnimationFrame(r));
 g.arm.setFree(false);g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();g.combat.dying=0;g.combat.health=100;
 g.game.teleport(1900,900);for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();
 g.terrainState.relaxation.enabled=false;g.terrainState.restore([]);g.stone.mass.clear();g.game.setPlayerVisible(false);
 for(let i=0;i<90;i++)await frame();
 g.weather.override='clear';g.clock.pinHour=16.2;w.params.v.refillRate=0;w.params.version++;
 const ts=g.terrainState;ts.bx=1904;ts.bz=900;ts.bdx=1;ts.bdz=0;ts.bl=0;ts.bw=0.5;ts.bd=2;ts.bc=0.2;ts.bk=5;ts.stamp();
 for(let i=0;i<30;i++)await frame();
 g.ground.qx=1904;g.ground.qz=900;g.ground.sample();
 w.avalanche={x:1904,z:900,y:g.ground.h,offset:0,jobs0:ts.relaxation.jobs};
 return {center:[1904,g.ground.h,900],before:await ts.debugProbe(1904,900),gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};
`});
console.log(JSON.stringify({setup:setup.result}));
for(let chunk=0;chunk<4;chunk++){
 const result=await bot('film',{name:'avalanche-c'+chunk,dir:'d2-avalanche',seconds:8,fps:60,size:[1280,720],warm:chunk?0:30,js:`const a=w.avalanche,T=a.offset+t;g.terrainState.relaxation.enabled=T>=1;g.terrainState.relaxation.iterations=8;cam.at(a.x+4,a.y+2.8,a.z+3,a.x,a.y+0.6,a.z,0.72);`});
 console.log(JSON.stringify({chunk,...result}));await bot('eval',{js:'w.avalanche.offset+=8;return 1;'});
}
const result=await bot('eval',{js:`
 const ts=g.terrainState,r=ts.relaxation;r.enabled=false;
 const after=await ts.debugProbe(1904,900);
 r.queue.reset();r.queue.now=ts.time;r.queue.mark(1904*48,900*48,1904*48,900*48);r.iterations=0;r.enabled=true;r.update();r.enabled=false;r.iterations=8;
 const raw=await r.debugRead(),data=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);let maxSlope=0;
 for(let z=0;z<127;z++)for(let x=0;x<127;x++){
   const i=(z*128+x)*4;if(data[i+3]<0.5)continue;
   const h=data[i]+data[i+1];
   for(const j of [i+4,i+128*4])if(data[j+3]>0.5)maxSlope=Math.max(maxSlope,Math.abs(h-data[j]-data[j+1])*48);
 }
 g.game.setPlayerVisible(true);
 return {after,jobs:r.jobs-w.avalanche.jobs0,tile:[r.queue.x/48,r.queue.z/48],maxTileSlopeDegrees:Math.atan(maxSlope)*180/Math.PI,late:w.gpuStats.late,gpuErrors:w.gpuStats.gpuErrors};
`});
const report={date:new Date().toISOString(),setup:setup.result,...result.result,note:'32 s fixed-60 diagnostic film; runtime performance is not inferred from fixed-step captures.'};
fs.mkdirSync('docs/phase-9/relaxation',{recursive:true});fs.writeFileSync('docs/phase-9/relaxation/avalanche-film.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

if(report.gpuErrors || report.late.length)process.exitCode=1;
