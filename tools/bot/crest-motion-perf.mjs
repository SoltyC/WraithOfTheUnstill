// Geometry/streaming stress: camera-only, frame-stepped sweep; not a D3 traversal test.
import fs from 'node:fs';
const renderScale=Number(process.env.RENDER_SCALE||1);
const label=process.argv[2]||'trial',base='http://127.0.0.1:4176';
async function ev(js){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result;}
const field=JSON.parse(fs.readFileSync('docs/phase-9/relaxation/crest-cpu-candidates.json')).candidates;
const close=JSON.parse(fs.readFileSync('data/photo-spots.json')).spots.find(s=>s.id==='p9s1-close-noon');
const cases=[{...close,name:'close',followGround:true},{...field[0],name:'crest500'}, {...field.find(s=>s.distance===2000),name:'crest2000'}],reports=[];
for(const source of cases){
 const spot={...source,id:'p9d2-motion-'+source.name,biome:'dunes',restoration:'restored',hidePlayer:true,time:17.8,weather:'clear',wet:0,puddle:0,rain:0};
 const r=await ev(`const frame=()=>new Promise(r=>requestAnimationFrame(r));g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;g.game.killShaped();g.terrainState.relaxation.enabled=false;g.clock.frozen=true;g.ws.restoration.frost=g.ws.restoration.meadow=g.ws.restoration.dunes='restored';g.game.applySpot(${JSON.stringify(spot)});g.clock.pinHour=17.8;g.restoration.snap=true;w.params.v.dynamicRes=0;w.params.v.renderScale=${renderScale};w.params.version++;const canvas=g.engine.getRenderingCanvas();canvas.style.width='2560px';canvas.style.height='1440px';g.engine.resize();for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();for(let i=0;i<240;i++)await frame();
 const pos=g.camera.position.asArray(),timer=w.gpuTimer,oldEvery=timer.sampleEvery,oldYaw=g.arm.yaw,oldPitch=g.arm.pitch;
 g.ground.qx=pos[0];g.ground.qz=pos[2];g.ground.sample();const baseGround=g.ground.h;
 timer.sampleEvery=1;const start=timer.count,t0=performance.now();timer.setActive(true);
 try{for(let i=0;i<480;i++){
  const delta=(i/479-.5)*96,x=pos[0]+delta,z=pos[2];let y=pos[1];
  if(${!!source.followGround}){g.ground.qx=x;g.ground.qz=z;g.ground.sample();y+=g.ground.h-baseGround;}
  g.arm.freePos.x=x;g.arm.freePos.y=y;g.arm.freePos.z=z;
  ${source.target?`g.arm.yaw=Math.atan2(${source.target[0]}-x,${source.target[2]}-z);g.arm.pitch=Math.atan2(y-${source.target[1]},Math.hypot(${source.target[0]}-x,${source.target[2]}-z));`:''}
  await frame();
 }}finally{timer.setActive(false);timer.sampleEvery=oldEvery;g.arm.freePos.x=pos[0];g.arm.freePos.y=pos[1];g.arm.freePos.z=pos[2];g.arm.yaw=oldYaw;g.arm.pitch=oldPitch;}
 const elapsedMs=performance.now()-t0;await w.gpuStats.device.queue.onSubmittedWorkDone();for(let i=0;i<8;i++)await frame();
 const values=[],main=[],shadow=[],compute=[];for(let i=start;i<timer.count;i++){const k=i%timer.ms.length;values.push(timer.ms[k]);main.push(timer.msMain[k]);shadow.push(timer.msShadow[k]);compute.push(timer.msCompute[k]);}
 const stats=a=>{a.sort((a,b)=>a-b);return {n:a.length,median:a[a.length>>1],p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],max:a.at(-1)};};
 return {size:[canvas.width,canvas.height],internalSize:[g.post.post.width,g.post.post.height],renderScale:g.post.post.renderScale,distance:96,frames:480,elapsedMs,gpuMs:stats(values),mainMs:stats(main),renderTargetsMs:stats(shadow),computeMs:stats(compute),gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};`);
 reports.push({name:source.name,...r});console.log(reports.at(-1));fs.writeFileSync('docs/phase-9/relaxation/motion-'+label+'.json',JSON.stringify({date:new Date().toISOString(),reports,note:'Frame-stepped 96m free-camera sweeps at verified2560x1440, scale1. Close camera follows CPU ground; crest cameras keep the CPU target in view. Measures clipmap rebuild/morph/shadow cost with physics disabled and no enemies. Render-target timing includes HDR scene plus shadow cascades, not shadows alone. No D3 gameplay, sustained combat/weather or human feel acceptance.'},null,2)+'\n');
}
if(reports.some(r=>r.gpuErrors||r.late.length))process.exitCode=1;
