import fs from 'node:fs';
const base='http://localhost:4181';
const js=`
 const frame=()=>new Promise(r=>requestAnimationFrame(r)),timer=w.gpuTimer,oldEvery=timer.sampleEvery;
 g.clock.frozen=true;g.atmosphere.desert.on=false;for(let i=0;i<120;i++)await frame();
 const builds=g.atmosphere.lutBuilds,start=timer.count;timer.sampleEvery=1;timer.setActive(true);g.atmosphere.desert.on=true;
 try{for(let i=0;i<120;i++)await frame();}finally{timer.setActive(false);timer.sampleEvery=oldEvery;}
 await w.gpuStats.device.queue.onSubmittedWorkDone();for(let i=0;i<8;i++)await frame();
 const gpu=[];for(let i=start;i<timer.count;i++)gpu.push(timer.ms[i%timer.ms.length]);gpu.sort((a,b)=>a-b);
 return {lutRebuilds:g.atmosphere.lutBuilds-builds,density:g.atmosphere.desert.quantized,samples:gpu.length,mean:gpu.reduce((a,b)=>a+b,0)/gpu.length,p99:gpu[Math.floor(gpu.length*.99)],max:gpu.at(-1),output:[g.engine.getRenderWidth(),g.engine.getRenderHeight()],internal:[g.post.post.width,g.post.post.height],gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};
`;
const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);
fs.writeFileSync('docs/phase-9/heat/aerosol-transition.json',JSON.stringify({date:new Date().toISOString(),...r.result,note:'120frame whole-GPU-frame span covering dust0→steady desert key, after120frames at0. Includes static LUT rebuild; no diagnostic shader. A single controlled activation, not broad biome/migration/weather or sustained acceptance.'},null,2)+'\n');console.log(r.result);
if(r.result.lutRebuilds!==1||r.result.density<=0||r.result.gpuErrors||r.result.late.length)process.exitCode=1;
