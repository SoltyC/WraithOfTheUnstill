import fs from 'node:fs';
const base='http://localhost:4181';
async function cmd(body){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=240000')).json();if(!r.ok)throw new Error(JSON.stringify(r));return r.result??r;}
const initial=await cmd({do:'eval',js:`
 const frame=()=>new Promise(r=>requestAnimationFrame(r));if(w.gpuStats.gpuErrors)throw new Error(JSON.stringify(w.gpuStats.gpuErrorMessages));
 g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;g.clock.frozen=true;g.clock.pinHour=13;w.params.v.timeOfDay=13;w.params.v.dynamicRes=0;w.params.v.renderScale=.7;w.params.version++;
 const c=g.engine.getRenderingCanvas();c.style.width='2560px';c.style.height='1440px';g.engine.resize();g.engine.setSize(2560,1440);
 g.ws.restoration.frost=g.ws.restoration.meadow=g.ws.restoration.dunes='restored';g.restoration.snap=true;g.ws.weatherOverride='clear';g.ws.wetForce=0;g.ws.puddleForce=0;g.game.teleport(2400,900);
 for(let i=0;i<600&&(!g.game.worldSettled()||!g.game.stateSettled());i++)await frame();for(let i=0;i<180;i++)await frame();g.game.killShaped();g.game.setPlayerVisible(true);g.arm.setFree(true);g.arm.freePos.x=2406;g.arm.freePos.y=g.controller.pos.y+2.5;g.arm.freePos.z=900;g.arm.yaw=-Math.PI/2;g.arm.pitch=.035;g.arm.fov=.9;
 g.restoration.snap=true;for(let i=0;i<120;i++)await frame();g.weather.snap=true;g.atmosphere.alwaysSnap=true;g.post.heat.on=false;for(let i=0;i<90;i++)await frame();
 return {output:[c.width,c.height],internal:[g.post.post.width,g.post.post.height],adapter:w.gpuStats.adapterInfo,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late,normalStormReady:g.weather.duneStorms};
`});
if(initial.output[0]!==2560||initial.output[1]!==1440||initial.internal[0]!==1792||initial.internal[1]!==1008||initial.gpuErrors||initial.late.length||initial.normalStormReady)throw new Error(JSON.stringify(initial));
const perf=await cmd({do:'eval',js:`
 const frame=()=>new Promise(r=>requestAnimationFrame(r)),timer=w.gpuTimer,oldEvery=timer.sampleEvery,reports=[];
 if(!timer.supported)throw new Error('GPU timer unavailable');timer.sampleEvery=1;
 try{for(let repeat=0;repeat<3;repeat++)for(const age of [60,75,95])for(const on of [false,true]){
   const f=g.sandstorm;f.enabled=on;f.target=on?1:0;f.active=false;f.strength=0;f.anchorX=2400;f.anchorZ=900;f.baseY=g.controller.pos.y;f.dirX=1;f.dirZ=0;f.dt=0;f.snap=true;f.update();if(on){f.age=age;f.update();}
   g.post.post.resetHistory=true;for(let i=0;i<90;i++)await frame();const start=timer.count,raf=[];let last=performance.now();const rebuilds=g.atmosphere.lutBuilds;timer.setActive(true);
   for(let i=0;i<240;i++){await frame();const now=performance.now();raf.push(now-last);last=now;}timer.setActive(false);await w.gpuStats.device.queue.onSubmittedWorkDone();for(let i=0;i<8;i++)await frame();
   const gpu=[];for(let i=start;i<timer.count;i++)gpu.push(timer.ms[i%timer.ms.length]);if(gpu.length<210)throw new Error('Incomplete GPU samples '+gpu.length);
   const stats=a=>{a.sort((a,b)=>a-b);return {n:a.length,mean:a.reduce((a,b)=>a+b,0)/a.length,p99:a[Math.floor(a.length*.99)],max:a.at(-1)};};
   reports.push({repeat,age,on,localDensity:g.atmosphere.sandStorm,steadyLutRebuilds:g.atmosphere.lutBuilds-rebuilds,gpu:stats(gpu),raf:stats(raf)});
 }}finally{timer.setActive(false);timer.sampleEvery=oldEvery;}
 return {reports,gpuErrors:w.gpuStats.gpuErrors,gpuMessages:w.gpuStats.gpuErrorMessages,late:w.gpuStats.late};
`});
fs.writeFileSync('docs/phase-9/storm-front/wind-perf.json',JSON.stringify({date:new Date().toISOString(),initial,...perf,note:"Three matched off/on240-frame repeats for incoming/leading/inside ages60/75/95, actual2560x1440 output/1792x1008 internal, fixed near-Wraith scene and frozen simulation. Includes volume, corrected local lighting, shared storm wind and SSR code. Heat off in both. All pairs retained, including a negative noisy delta. No water art/cloth dynamics, streaks/erasure/shelter/allocation or sustained D12 acceptance."},null,2)+'\n');console.log(perf);
if(perf.gpuErrors||perf.late.length)throw new Error('Storm performance gate failed');

