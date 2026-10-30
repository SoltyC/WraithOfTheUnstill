import fs from 'node:fs';
import {createRelaxationQueue,RELAX_LIFETIME,RELAX_RATE} from '../../src/terrain/state/relaxation.js';
const expectedCapacity=createRelaxationQueue().capacity;
const base='http://localhost:4176';
const label=process.argv[2]||'adjacent-ridge-32';
const duration=Number(process.argv[3]||36);
const fixed=process.argv.includes('--fixed');
if(!/^[a-z0-9-]+$/.test(label)||!Number.isFinite(duration)||duration<35||duration>300)throw new Error('Use a simple label and duration35..300s');
async function ev(js){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=300000')).json();if(!r.ok)throw new Error(r.error);return r.result;}
await ev(`
if(g.terrainState.relaxation.rate!==${RELAX_RATE})throw new Error('Loaded relaxation rate differs from source');
if(g.terrainState.relaxation.queue.capacity!==${expectedCapacity}||g.terrainState.relaxation.queue.lifetime!==${RELAX_LIFETIME})throw new Error('Loaded scheduler differs from source; restart the bot after building');
const frame=()=>new Promise(r=>requestAnimationFrame(r));g.clock.frozen=false;g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();
g.game.teleport(1900,900);for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();
const ts=g.terrainState;ts.relaxation.enabled=false;ts.restore([]);g.stone.mass.clear();ts.healScale=0;
w.params.v.refillRate=0;w.params.v.dynamicRes=0;w.params.v.renderScale=.7;w.params.version++;
g.game.wraithHeld=true;g.controller.hold=true;g.arm.setFree(true);for(let i=0;i<90;i++)await frame();
for(const z of [900,904]){
 const mass=g.stone.mass;mass.time=g.clock.simTime;mass.arg.set([1904,z,1,0,7,2.95,1.1,0]);mass.addRidge();mass.update(g.clock.simTime);
 ts.bx=1904;ts.bz=z;ts.bdx=1;ts.bdz=0;ts.bl=7;ts.bw=2.95;ts.bd=1.1;ts.bc=.4;ts.bberm=.5;ts.bk=8;ts.stamp();
}
for(let i=0;i<30;i++)await frame();w.adjacent={runtime:{rate:ts.relaxation.rate,capacity:ts.relaxation.queue.capacity,lifetime:ts.relaxation.queue.lifetime,entry:document.querySelector('script[type=module]').src},time:g.clock.simTime,jobs:ts.relaxation.jobs,origin:await ts.params.read(0,16)};
ts.relaxation.iterations=32;ts.relaxation.enabled=true;return true;`);
const lifecycle=await ev(`const a=w.adjacent,ts=g.terrainState,r=ts.relaxation;let frames=0,atTTL=null;
const fixed=${fixed},loop=g.loop,engine=g.engine,canvas=engine.getRenderingCanvas();
const old={width:canvas.style.width,height:canvas.style.height,fixedDt:loop.fixedDt};
if(fixed){engine.stopRenderLoop();g.engine.snapshotRendering=false;canvas.style.width='1280px';canvas.style.height='720px';engine.resize();loop.fixedDt=1/60;}
try{while(g.clock.simTime-a.time<${duration}&&frames<24000){
 if(fixed){engine.beginFrame();loop._frame();engine.endFrame();await new Promise(r=>setTimeout(r,0));}
 else await new Promise(r=>requestAnimationFrame(r));
 frames++;if(!atTTL&&g.clock.simTime-a.time>=30)atTTL={jobs:r.jobs-a.jobs,pending:r.queue.pending};
}}finally{if(fixed){loop.fixedDt=old.fixedDt;loop.last=performance.now();canvas.style.width=old.width;canvas.style.height=old.height;engine.resize();engine.runRenderLoop(loop._frame);}}
r.enabled=false;return {fixed,runtime:a.runtime,seconds:g.clock.simTime-a.time,frames,jobs:r.jobs-a.jobs,pending:r.queue.pending,atTTL,activityErrors:r.activityErrors};`);
const tiles=await ev(`
const ts=g.terrainState,r=ts.relaxation,rawOrigin=w.adjacent.origin,origin=new Int32Array(rawOrigin.buffer,rawOrigin.byteOffset,4),tiles=[];
for(const z of [898.7,901.4,904.1])for(const x of [1898,1900.7,1903.4,1906.1,1908.8]){
 r.queue.reset();r.queue.now=ts.time;r.queue.mark(x*48,z*48,x*48,z*48);
 r.originX=origin[0];r.originZ=origin[1];r.time=ts.time;r.iterations=0;r.enabled=true;r.update();r.enabled=false;
 const raw=await r.debugRead(),d=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);let maxSlope=0,disturbed=0,sum=0;
 for(let zz=0;zz<127;zz++)for(let xx=0;xx<127;xx++){
  const i=(zz*128+xx)*4;if(d[i+3]<.5)continue;sum+=d[i];
  if(Math.abs(d[i])<.0001)continue;disturbed++;
  for(const [ox,oz] of [[1,0],[0,1],[1,1],[-1,1]]){
   if(xx+ox<0||xx+ox>=128)continue;const j=i+(oz*128+ox)*4;if(d[j+3]<.5)continue;
   maxSlope=Math.max(maxSlope,Math.abs(d[i]+d[i+1]-d[j]-d[j+1])*48/Math.hypot(ox,oz));
  }
 }
 tiles.push({requested:[x,z],origin:[r.queue.x/48,r.queue.z/48],disturbed,sum,maxSlopeDegrees:Math.atan(maxSlope)*180/Math.PI});
}
r.iterations=32;ts.healScale=1;g.game.wraithHeld=false;g.controller.hold=false;g.arm.setFree(false);
return {tiles,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late,collisionErrors:ts.collision.errors};`);
const report={date:new Date().toISOString(),lifecycle,...tiles,note:'Fixed mode drives normal loop at1/60 and1280x720/0.7, allowing GPU/event-loop work between frames; it is a deterministic60fps settling oracle, not real-time performance. Two actual full-size parallel Ridge writes (14m long,2.95m half-width,1.1m high) overlap, with normal32-step scheduler for measured duration, healing disabled, player held. Fifteen read-only scratch tiles sampled after expiry, all eight neighbour slopes on disturbed sand. Does not prove unsampled whole footprint mass or freeze/wet adjacency.'};
fs.writeFileSync('docs/phase-9/relaxation/'+label+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
if(report.gpuErrors||report.late.length||report.collisionErrors||lifecycle.activityErrors||lifecycle.seconds<duration-.1||report.tiles.some(t=>t.maxSlopeDegrees>34.1))process.exitCode=1;
