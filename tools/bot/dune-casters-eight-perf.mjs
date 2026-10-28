import fs from 'node:fs';
const base='http://localhost:4175';
async function ev(js){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result;}
const reports=[];
for(const hour of [9,23])for(let repeat=0;repeat<3;repeat++){
 const report=await ev(`
 const frame=()=>new Promise(r=>requestAnimationFrame(r)),timer=w.gpuTimer;
 g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;g.clock.frozen=false;g.clock.pinHour=${hour};
 const canvas=g.engine.getRenderingCanvas();canvas.style.width='2560px';canvas.style.height='1440px';g.engine.resize();
 w.params.v.dynamicRes=0;w.params.v.renderScale=.7;w.params.version++;
 g.ws.restoration.frost=g.ws.restoration.meadow=g.ws.restoration.dunes='restored';g.restoration.snap=true;g.ws.weatherOverride='clear';
 g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();g.game.teleport(1900,900);
 for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();for(let i=0;i<90;i++)await frame();
 g.combat.health=10000;g.combat.dying=0;g.game.setPlayerVisible(true);
 const types=['whirler','glasssworn','whirler','glasssworn','whirler','glasssworn','skitter','plateback'];
 for(let i=0;i<8;i++)g.shaped.spawn(types[i],1900+(i%4-1.5)*2.5,906+Math.floor(i/4)*4);
 g.ground.qx=1900;g.ground.qz=897;g.ground.sample();const y=g.ground.h+3.2;
 g.arm.setFree(true);g.arm.freePos.x=1900;g.arm.freePos.y=y;g.arm.freePos.z=897;g.arm.yaw=0;g.arm.pitch=.12;g.arm.fov=.9;
 for(let i=0;i<240;i++)await frame();
 const before=g.shaped.slots.filter(s=>s.state!==0).length,start=timer.count,raf=[],time=g.clock.simTime;
 timer.sampleEvery=1;timer.setActive(true);let last=performance.now();
 try{for(let i=0;i<600;i++){await frame();const now=performance.now();raf.push(now-last);last=now;}}
 finally{timer.setActive(false);g.combat.health=100;}
 await w.gpuStats.device.queue.onSubmittedWorkDone();for(let i=0;i<10;i++)await frame();
 const gpu=[];for(let i=start;i<timer.count;i++)gpu.push(timer.ms[i%timer.ms.length]);
 const stats=values=>{values.sort((a,b)=>a-b);return {samples:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length,median:values[values.length>>1],p95:values[Math.floor(values.length*.95)],p99:values[Math.floor(values.length*.99)],max:values.at(-1)};};
 return {hour:${hour},repeat:${repeat},before,after:g.shaped.slots.filter(s=>s.state!==0).length,seconds:g.clock.simTime-time,output:[g.engine.getRenderWidth(),g.engine.getRenderHeight()],internal:[g.post.post.width,g.post.post.height],renderScale:g.post.post.renderScale,gpuMs:stats(gpu),frameMs:stats(raf),gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};`);
 reports.push(report);console.log(report);
 fs.writeFileSync('docs/phase-9/dune-casters/latest-grade-eight-mix-perf.json',JSON.stringify({date:new Date().toISOString(),reports,note:'Live eight-body mix in a fixed free camera, clear day/night at2560x1440 output with agreed0.7 TAAU. Raised diagnostic health, no player attacks; real AI/volleys/devils/terrain writes. Three600-frame repeats each. Measures this loaded combat scene, not streaming/sandstorms/D3 traversal or the full D12 sustained gate. rAF includes diagnostic sampling; raw maxima retained.'},null,2)+'\n');
}
if(reports.some(r=>r.gpuErrors||r.late.length||r.before!==8||r.after!==8||r.gpuMs.samples<500||r.gpuMs.mean>1000/60||r.frameMs.mean>1000/60||r.frameMs.p99>1000/45))process.exitCode=1;
