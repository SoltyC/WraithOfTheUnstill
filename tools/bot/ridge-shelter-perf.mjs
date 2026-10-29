import fs from 'node:fs';
const base='http://localhost:4181';
async function cmd(body){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(JSON.stringify(r));return r.result??r;}
const report=await cmd({do:'eval',js:`
 const frame=()=>new Promise(r=>requestAnimationFrame(r));g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;g.clock.frozen=false;w.params.v.dynamicRes=0;w.params.v.renderScale=.7;w.params.version++;
 const c=g.engine.getRenderingCanvas();c.style.width='2560px';c.style.height='1440px';g.engine.resize();g.engine.setSize(2560,1440);g.game.killShaped();
 g.arm.setFree(true);g.arm.freePos.x=2408;g.arm.freePos.y=g.controller.pos.y+2;g.arm.freePos.z=891;g.arm.yaw=-.45;g.arm.pitch=.08;g.arm.fov=.9;
 for(let i=0;i<120;i++)await frame();
 const timer=w.gpuTimer,prior=timer.sampleEvery,rows=[],s=g.windShelter;if(!timer.supported)throw new Error('GPU timer required');timer.sampleEvery=1;
 const stats=a=>{a.sort((a,b)=>a-b);return {n:a.length,mean:a.reduce((a,b)=>a+b,0)/a.length,p99:a[Math.floor(a.length*.99)],max:a.at(-1)}};
 try{for(let pair=0;pair<3;pair++)for(const on of [false,true]){
  s.on=on;for(let i=0;i<90;i++)await frame();const start=timer.count,reads=s.reads,raf=[],builds=[];let last=performance.now(),lastReads=reads;s.maxBuildMs=0;timer.setActive(true);
  for(let i=0;i<240;i++){await frame();const now=performance.now();raf.push(now-last);last=now;if(s.reads!==lastReads){builds.push(s.lastBuildMs);lastReads=s.reads;}}
  timer.setActive(false);await w.gpuStats.device.queue.onSubmittedWorkDone();for(let i=0;i<8;i++)await frame();const gpu=[];for(let k=start;k<timer.count;k++)gpu.push(timer.ms[k%timer.ms.length]);
  if(gpu.length<210)throw new Error('Insufficient GPU samples');rows.push({pair,on,gpu:stats(gpu),raf:stats(raf),readbacks:s.reads-reads,fieldBuildMs:builds.length?stats(builds):null,readbackErrors:s.errors});
 }}finally{timer.setActive(false);timer.sampleEvery=prior;s.on=true;}
 return {rows,output:[c.width,c.height],internal:[g.post.post.width,g.post.post.height],gpuErrors:w.gpuStats.gpuErrors,messages:w.gpuStats.gpuErrorMessages,late:w.gpuStats.late,normalStormReady:g.weather.duneStorms};
`});
fs.writeFileSync('docs/phase-9/storm-front/ridge-shelter-perf.json',JSON.stringify({date:new Date().toISOString(),...report,note:'Three240-frame runtime shelter off/on pairs with the same actual Ridge and active storm, live simulation, actual1440p/.7. Includes5Hz terrain readback and shared published-field consumers. Both cases use expanded wind uniforms, so this does not isolate their disabled-path upload cost against the old bundle. CPU field-build timing includes base-height reconstruction and all rays, excludes mapAsync and renderer callbacks. Not D12 sustained/alloc acceptance.'},null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.gpuErrors||report.late.length||report.normalStormReady||report.rows.some(r=>r.readbackErrors||(!r.on&&r.readbacks)))throw new Error('Shelter performance smoke error');
