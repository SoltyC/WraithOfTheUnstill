import fs from 'node:fs';
const base='http://localhost:4180';
async function cmd(js){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result;}
let result;
try{result=await cmd(`
 const frame=()=>new Promise(r=>requestAnimationFrame(r));
 g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;g.clock.frozen=false;
 g.ws.restoration.frost=g.ws.restoration.meadow=g.ws.restoration.dunes='restored';g.restoration.snap=true;
 g.game.teleport(1900,900);for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();
 g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();g.controller.hold=true;
 const ts=g.terrainState,r=ts.relaxation;r.enabled=false;ts.restore([]);g.stone.mass.clear();
 w.params.v.refillRate=0;w.params.version++;for(let i=0;i<90;i++)await frame();
 const points=[[1904,900],[1904.25,900],[1903.75,900],[1904,900.25],[1904,899.75]];
 const probe=async()=>{const a=[];for(const p of points)a.push(await ts.debugProbe(...p));return a;};
 // Freeze a wide clean area, then try the same plough on dry and frozen sand separately.
 ts.bx=1904;ts.bz=900;ts.bdx=1;ts.bdz=0;ts.bl=2;ts.bw=2;ts.bd=0;ts.bc=1;ts.bk=3;ts.bwet=1;ts.stamp();
 for(let i=0;i<30;i++)await frame();const before=await probe();
 const plough=()=>{ts.bx=1904;ts.bz=900;ts.bdx=0;ts.bdz=1;ts.bl=1;ts.bw=.8;ts.bd=.2;ts.bc=.8;ts.bk=1;ts.bberm=1.35;ts.stamp();};
 plough();for(let i=0;i<30;i++)await frame();const frozen=await probe();
 r.enabled=true;for(let i=0;i<90;i++)await frame();
 r.queue.reset();ts.collision.dirty=false;
 const update=ts.collision.update,reads0=ts.collision.reads;
 // Isolate the periodic refresh from unrelated world dirty markers.
 ts.collision.update=function(){this.dirty=false;return update.call(this);};
 try{for(let i=0;i<90;i++)await frame();}finally{ts.collision.update=update;}
 const stationaryRefreshes=ts.collision.reads-reads0;
 const v=ts.collision.view;v.qx=1904;v.qz=900;const covered=v.sample(),frozenFraction=v.frozen,age=g.clock.simTime-v.sampleTime;
 r.enabled=false;ts.restore([]);for(let i=0;i<90;i++)await frame();
 plough();for(let i=0;i<30;i++)await frame();const dry=await probe();
 return {before,frozen,dry,stationaryRefreshes,covered,frozenFraction,age,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late,collisionErrors:ts.collision.errors};
`);}finally{await cmd('g.terrainState.relaxation.enabled=false;g.controller.hold=false;return true;');}
result.frozenMaxChange=Math.max(...result.before.map((p,i)=>Math.abs(p.fineRelief-result.frozen[i].fineRelief)));
result.dryMaxChange=Math.max(...result.before.map((p,i)=>Math.abs(p.fineRelief-result.dry[i].fineRelief)));
fs.writeFileSync('docs/phase-9/sand-surf/surface-gpu.json',JSON.stringify({date:new Date().toISOString(),...result,note:'Actual five-point GPU fine-state probes before/after identical PLOUGH on clean frozen versus reset dry sand; local frozen metadata sampled through collision pipeline. Periodic-refresh probe temporarily clears unrelated dirty markers before update, then restores update. No new diagnostic shader. Global wet emission suppression is unit-tested separately; not full moving weather/frozen gameplay acceptance.'},null,2)+'\n');console.log(result);
if(result.gpuErrors||result.late.length||result.collisionErrors||!result.covered||result.stationaryRefreshes<1||result.frozenFraction<.9||result.frozenMaxChange>1e-6||result.dryMaxChange<.1)process.exitCode=1;
