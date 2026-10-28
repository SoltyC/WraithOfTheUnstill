import fs from 'node:fs';
const base=process.env.WRAITH_URL||'http://127.0.0.1:4175';
async function ev(js){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result;}
const count=Number(process.argv[2]||1);if(![1,8].includes(count))throw new Error('Use one or eight casters');
const result=await ev(`
const frame=()=>new Promise(r=>requestAnimationFrame(r)),engine=g.engine,timer=w.gpuTimer,canvas=engine.getRenderingCanvas();
const old={snapshot:engine.snapshotRendering,width:canvas.style.width,height:canvas.style.height};
engine.snapshotRendering=false;canvas.style.width='2560px';canvas.style.height='1440px';engine.resize();
g.clock.frozen=true;g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();for(let j=0;j<${count};j++)g.shaped.spawn('whirler',1900+(j%4-1.5)*1.5,905+Math.floor(j/4)*2.5);for(let i=0;i<120;i++){g.shaped.dt=1/60;g.shaped.update();}g.duneCasterDust.update();g.ws.restoration.dunes='restored';g.ws.wetForce=0;g.ws.puddleForce=0;g.terrainState.restore([]);
for(let i=0;i<120;i++)await frame();
const samples=[];timer.sampleEvery=1;
try{for(const on of [false,true,false,true]){
g.duneCasterDust.mesh.setEnabled(on);for(let i=0;i<30;i++)await frame();
const start=timer.count;timer.setActive(true);for(let i=0;i<180;i++)await frame();timer.setActive(false);
await w.gpuStats.device.queue.onSubmittedWorkDone();for(let i=0;i<8;i++)await frame();
const values=[];for(let i=start;i<timer.count;i++)values.push(timer.ms[i%timer.ms.length]);values.sort((a,b)=>a-b);
samples.push({on,n:values.length,median:values[Math.floor(values.length/2)],p95:values[Math.floor(values.length*0.95)],max:values.at(-1)});
}return {active:g.shaped.alive,width:engine.getRenderWidth(),height:engine.getRenderHeight(),samples,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};}
finally{timer.setActive(false);g.duneCasterDust.mesh.setEnabled(true);canvas.style.width=old.width;canvas.style.height=old.height;engine.resize();engine.snapshotRendering=old.snapshot;}`);
console.log(result);fs.writeFileSync('docs/phase-9/dune-casters/timing-'+count+'.json',JSON.stringify({date:new Date().toISOString(),...result,note:'Fixed-view 1440p headless RTX 3060 alternating mesh off/on. Whole-frame timestamps include the world; differences are indicative and do not establish sustained gameplay performance or the independent D2 relaxation budget. One or eight Whirlers (active count recorded) in a frozen fixed camera; mesh toggle isolates only the new powder draw, not all D9b CPU/chunk costs.'},null,2)+'\n');
