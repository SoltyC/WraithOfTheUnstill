// Fixed-view whole-frame timestamps; this does not certify sustained gameplay performance.
import fs from 'node:fs';
const base='http://127.0.0.1:4178';
async function ev(js){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result;}
const spots=JSON.parse(fs.readFileSync('data/photo-spots.json')).spots;
const reports=[];
for(const id of ['p9s1-close-noon','p9s1-star-mid','p9d0-canyon-floor']){
 const spot={...spots.find(s=>s.id===id),biome:'dunes',restoration:'restored',time:12,weather:'clear',wet:0,puddle:0,rain:0,hidePlayer:true};
 const r=await ev(`const frame=()=>new Promise(r=>requestAnimationFrame(r));g.engine.snapshotRendering=false;g.toggles.on.snapshot=false;g.clock.frozen=true;g.game.killShaped();g.game.applySpot(${JSON.stringify(spot)});g.ws.restoration.frost='restored';g.ws.restoration.meadow='restored';g.restoration.snap=true;g.clock.pinHour=12;w.params.v.dynamicRes=0;w.params.v.renderScale=1;w.params.version++;const c=g.engine.getRenderingCanvas();c.style.width='2560px';c.style.height='1440px';g.engine.resize();for(let i=0;i<360;i++)await frame();const timer=w.gpuTimer;if(!timer.supported)throw new Error('No GPU timestamps');const oldEvery=timer.sampleEvery;timer.sampleEvery=1;const samples=[];try{for(let run=0;run<3;run++){const start=timer.count;timer.setActive(true);for(let i=0;i<240;i++)await frame();timer.setActive(false);await w.gpuStats.device.queue.onSubmittedWorkDone();for(let i=0;i<8;i++)await frame();const a=[];for(let i=start;i<timer.count;i++)a.push(timer.ms[i%timer.ms.length]);a.sort((a,b)=>a-b);samples.push({n:a.length,medianMs:a[a.length>>1],p95Ms:a[Math.floor(a.length*.95)],maxMs:a.at(-1)});}return {size:[c.width,c.height],renderScale:g.post.post.renderScale,samples,passes:timer.lastPasses,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};}finally{timer.setActive(false);timer.sampleEvery=oldEvery;}`);
 reports.push({id,...r});console.log(reports.at(-1));
 fs.writeFileSync('docs/phase-9/dune-grade/perf.json',JSON.stringify({date:new Date().toISOString(),reports,note:'Three 240-frame repeats per static scene on headless Windows RTX3060 at verified 2560x1440 and scale1. Whole-frame timestamp span, not a before/after attribution or sustained gameplay/1% low gate. Weather/combat/streaming and unlocked presentation remain unassessed.'},null,2)+'\n');
}
if(reports.some(r=>r.gpuErrors||r.late.length))process.exitCode=1;
