import fs from 'node:fs';
const base='http://localhost:4181';
const pose={x:2514,z:816,cx:2514,cz:811,yaw:0};
async function cmd(body){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=240000')).json();if(!r.ok)throw new Error(JSON.stringify(r));return r.result??r;}
await cmd({do:'eval',js:`
 const frame=()=>new Promise(r=>requestAnimationFrame(r));g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;
 g.ws.restoration.frost=g.ws.restoration.meadow=g.ws.restoration.dunes='restored';g.restoration.snap=true;g.ws.weatherOverride='clear';g.ws.wetForce=0;g.weather.snap=true;
 g.clock.frozen=true;g.clock.pinHour=13;w.params.v.timeOfDay=13;w.params.v.dynamicRes=0;w.params.v.renderScale=.7;w.params.version++;
 const canvas=g.engine.getRenderingCanvas();canvas.style.width='2560px';canvas.style.height='1440px';g.engine.resize();g.engine.setSize(2560,1440);
 g.game.teleport(${pose.x},${pose.z});for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();for(let i=0;i<120;i++)await frame();
 g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();g.game.setPlayerVisible(true);g.arm.setFree(true);
 g.arm.freePos.x=${pose.cx};g.arm.freePos.y=g.controller.pos.y+2;g.arm.freePos.z=${pose.cz};g.arm.yaw=${pose.yaw};g.arm.pitch=.025;g.arm.fov=.9;g.post.heat.debug=false;g.post.heat.on=true;g.atmosphere.alwaysSnap=false;
 for(let i=0;i<240;i++)await frame();return true;
`});
const perf=await cmd({do:'eval',js:`
 const frame=()=>new Promise(r=>requestAnimationFrame(r)),timer=w.gpuTimer,oldEvery=timer.sampleEvery,reports=[];
 if(!timer.supported)throw new Error('GPU timestamps unavailable');timer.sampleEvery=1;
 try{for(let repeat=0;repeat<3;repeat++)for(const on of [false,true]){
  g.sandDust.mesh.subMeshes[0].setBoundingInfo(g.sandDust.mesh.getBoundingInfo());g.sandDust.crests=on;g.sandDust.mesh.subMeshes[0].indexCount=(on?3136:2112)*6;g.post.post.resetHistory=true;for(let i=0;i<120;i++)await frame();
  const start=timer.count,builds=g.atmosphere.lutBuilds,raf=[];let last=performance.now();timer.setActive(true);
  for(let i=0;i<240;i++){await frame();const now=performance.now();raf.push(now-last);last=now;}timer.setActive(false);
  await w.gpuStats.device.queue.onSubmittedWorkDone();for(let i=0;i<8;i++)await frame();
  const gpu=[];for(let i=start;i<timer.count;i++)gpu.push(timer.ms[i%timer.ms.length]);
  if(gpu.length<210)throw new Error('Incomplete GPU timing: '+gpu.length+' /240');
  const stats=a=>{a.sort((a,b)=>a-b);return {n:a.length,mean:a.reduce((x,y)=>x+y,0)/a.length,median:a[a.length>>1],p99:a[Math.floor(a.length*.99)],max:a.at(-1)};};
  reports.push({repeat,on,dust:g.atmosphere.desert.quantized,steadyRebuilds:g.atmosphere.lutBuilds-builds,indices:g.sandDust.mesh.subMeshes[0].indexCount,strength:g.post.heat.strength,gpuMs:stats(gpu),frameMs:stats(raf)});
 }}finally{timer.setActive(false);timer.sampleEvery=oldEvery;g.post.heat.on=true;g.post.heat.mirage=true;g.atmosphere.desert.on=true;g.sandDust.crests=true;g.sandDust.mesh.subMeshes[0].indexCount=3136*6;}
 return {reports,output:[g.engine.getRenderingCanvas().width,g.engine.getRenderingCanvas().height],internal:[g.post.post.width,g.post.post.height],gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};
`});
fs.writeFileSync('docs/phase-9/crest-air/perf.json',JSON.stringify({date:new Date().toISOString(),...perf,note:'Baseline report preserved separately; three alternating off/on240-frame repeats including the full1024-extra-quad draw cost (2112off/3136on quads) in one fixed clear restored-noon scene with near Wraith, frozen simulation, verified1440p output/0.7 TAAU. Whole-frame GPU span and rAF, not an isolated crest-draw timer, whole-world traversal/storm/combat budget or human motion judgment.'},null,2)+'\n');console.log(perf);
await cmd({do:'eval',js:'g.clock.frozen=false;g.sandDust.crests=false;return true;'});
const film=await cmd({do:'film',name:'crest-air-ab',dir:'d6-crest-review',seconds:6,fps:60,size:[2560,1440],warm:120,js:`
 cam.off();if(i===180){g.sandDust.crests=true;g.post.post.resetHistory=true;}if(i===0){g.sandDust.crests=false;g.post.post.resetHistory=true;}
`});
const stats=await cmd({do:'eval',js:'g.post.heat.on=true;g.atmosphere.desert.on=true;g.sandDust.crests=true;g.atmosphere.alwaysSnap=false;g.ws.wetForce=-1;return {gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};'});
fs.writeFileSync('docs/phase-9/crest-air/film.json',JSON.stringify({date:new Date().toISOString(),film,...stats,note:'Fixed60Hz six-second native2560x1440 A/B film, first3s crest grains off, second3s crest grains on; held free camera with near Wraith, actual procedural time advances. Silent capture, not real-time performance or human aesthetic acceptance.'},null,2)+'\n');console.log(film,stats);
if(perf.output[0]!==2560||perf.output[1]!==1440||perf.internal[0]!==1792||perf.internal[1]!==1008||perf.gpuErrors||perf.late.length||stats.gpuErrors||stats.late.length||film.frames!==360||film.failed)process.exitCode=1;
