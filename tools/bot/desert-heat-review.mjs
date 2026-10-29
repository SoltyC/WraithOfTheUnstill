import fs from 'node:fs';
const base='http://localhost:4181',mirage=process.env.MODE==='mirage',label=mirage?'mirage':'heat';
const pose=mirage?{x:1660,z:750,cx:1656,cz:750,yaw:Math.PI/2}:{x:1900,z:900,cx:1900,cz:896,yaw:0};
async function cmd(body){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=240000')).json();if(!r.ok)throw new Error(r.error);return r.result??r;}
await cmd({do:'eval',js:`
 const frame=()=>new Promise(r=>requestAnimationFrame(r));g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;
 g.ws.restoration.frost=g.ws.restoration.meadow=g.ws.restoration.dunes='restored';g.restoration.snap=true;g.ws.weatherOverride='clear';g.ws.wetForce=0;g.weather.snap=true;
 g.clock.frozen=true;g.clock.pinHour=13;w.params.v.timeOfDay=13;w.params.v.dynamicRes=0;w.params.v.renderScale=.7;w.params.version++;
 const canvas=g.engine.getRenderingCanvas();canvas.style.width='2560px';canvas.style.height='1440px';g.engine.resize();
 g.game.teleport(${pose.x},${pose.z});for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();for(let i=0;i<120;i++)await frame();
 g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();g.game.setPlayerVisible(true);g.arm.setFree(true);
 g.arm.freePos.x=${pose.cx};g.arm.freePos.y=g.controller.pos.y+2;g.arm.freePos.z=${pose.cz};g.arm.yaw=${pose.yaw};g.arm.pitch=.025;g.arm.fov=.9;g.post.heat.debug=false;g.post.heat.on=true;
 for(let i=0;i<240;i++)await frame();return true;
`});
const perf=await cmd({do:'eval',js:`
 const frame=()=>new Promise(r=>requestAnimationFrame(r)),timer=w.gpuTimer,oldEvery=timer.sampleEvery,reports=[];
 timer.sampleEvery=1;
 try{for(let repeat=0;repeat<3;repeat++)for(const on of [false,true]){
  if(${mirage})g.post.heat.mirage=on;else g.post.heat.on=on;g.post.post.resetHistory=true;for(let i=0;i<120;i++)await frame();
  const start=timer.count,raf=[];let last=performance.now();timer.setActive(true);
  for(let i=0;i<240;i++){await frame();const now=performance.now();raf.push(now-last);last=now;}timer.setActive(false);
  await w.gpuStats.device.queue.onSubmittedWorkDone();for(let i=0;i<8;i++)await frame();
  const gpu=[];for(let i=start;i<timer.count;i++)gpu.push(timer.ms[i%timer.ms.length]);
  const stats=a=>{a.sort((a,b)=>a-b);return {n:a.length,mean:a.reduce((x,y)=>x+y,0)/a.length,median:a[a.length>>1],p99:a[Math.floor(a.length*.99)],max:a.at(-1)};};
  reports.push({repeat,on,strength:g.post.heat.strength,gpuMs:stats(gpu),frameMs:stats(raf)});
 }}finally{timer.setActive(false);timer.sampleEvery=oldEvery;g.post.heat.on=true;g.post.heat.mirage=true;}
 return {reports,output:[g.engine.getRenderWidth(),g.engine.getRenderHeight()],internal:[g.post.post.width,g.post.post.height],gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};
`});
fs.writeFileSync('docs/phase-9/heat/perf'+(mirage?'-mirage':'')+'.json',JSON.stringify({date:new Date().toISOString(),mirage,...perf,note:'Three alternating off/on240-frame repeats in one fixed clear restored-noon scene with near Wraith, frozen simulation, verified1440p output/0.7 TAAU. Whole-frame GPU span and rAF, not an isolated heat-pass timer, whole-world traversal/storm/combat budget or human motion judgment.'},null,2)+'\n');console.log(perf);
await cmd({do:'eval',js:mirage?'g.clock.frozen=false;g.post.heat.on=true;g.post.heat.mirage=false;return true;':'g.clock.frozen=false;g.post.heat.on=false;return true;'});
const film=await cmd({do:'film',name:label+'-ab',dir:'d5-'+label+'-review',seconds:6,fps:60,size:[2560,1440],warm:120,js:`
 cam.off();if(i===180){if(${mirage})g.post.heat.mirage=true;else g.post.heat.on=true;g.post.post.resetHistory=true;}if(i===0){if(${mirage})g.post.heat.mirage=false;else g.post.heat.on=false;g.post.post.resetHistory=true;}
`});
const stats=await cmd({do:'eval',js:'g.post.heat.on=true;g.ws.wetForce=-1;return {gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};'});
fs.writeFileSync('docs/phase-9/heat/film'+(mirage?'-mirage':'')+'.json',JSON.stringify({date:new Date().toISOString(),mirage,film,...stats,note:'Fixed60Hz six-second native2560x1440 A/B film, first3s selected effect off, second3s on (mirage flag recorded); held free camera with near Wraith, actual procedural time advances. Silent capture, not real-time performance or human aesthetic acceptance.'},null,2)+'\n');console.log(film,stats);
if(perf.gpuErrors||perf.late.length||stats.gpuErrors||stats.late.length||film.frames!==360||film.failed)process.exitCode=1;
