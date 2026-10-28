import fs from 'node:fs';
const base=process.env.WRAITH_URL||'http://127.0.0.1:4176';
const iterations=Number(process.argv[2]||8);
async function ev(js){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result;}
console.log(await ev(`
const frame=()=>new Promise(r=>requestAnimationFrame(r));g.game.teleport(1900,900);g.arm.setFree(false);g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();
for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();
const ts=g.terrainState,r=ts.relaxation;r.enabled=false;ts.restore([]);g.stone.mass.clear();w.params.v.refillRate=0;w.params.version++;for(let i=0;i<90;i++)await frame();
g.combat.health=10000;g.game.spawnShaped('skitter',8);
for(let i=0;i<480;i++){for(let k=0;k<g.shaped.slots.length;k++)if(g.shaped.slots[k].state!==0)g.shaped.freeze(k,1e6);if(g.shaped.slots.filter(s=>s.state===7).length===8)break;await frame();}
if(g.shaped.slots.filter(s=>s.state===7).length!==8)throw new Error('Not all eight actors reached the frozen hold');
ts.restore([]);for(let i=0;i<60;i++)await frame();
const points=[];for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){if(i===0&&j===0)continue;const x=1904+i*0.6,z=900+j*0.6;points.push([x,z]);ts.bx=x;ts.bz=z;ts.bdx=1;ts.bdz=0;ts.bl=0.4;ts.bw=0.65;ts.bd=0.36;ts.bc=0.2;ts.bk=5;ts.stamp();}
for(let i=0;i<30;i++)await frame();
w.overlap={points,start:ts.time,jobs:r.jobs,old:r.iterations,active:g.shaped.slots.filter(s=>s.state!==0).length};r.iterations=${iterations};r.enabled=true;
return {start:ts.time,points,active:w.overlap.active};`));
const progress=[];
for(let chunk=0;chunk<60;chunk++){
 const p=await ev(`for(let i=0;i<120;i++)await new Promise(r=>requestAnimationFrame(r));return {elapsed:g.terrainState.time-w.overlap.start,jobs:g.terrainState.relaxation.jobs-w.overlap.jobs,pending:g.terrainState.relaxation.queue.pending};`);
 progress.push(p);console.log(p);if(p.elapsed>=35)break;
}
const result=await ev(`
const ts=g.terrainState,r=ts.relaxation,run=w.overlap;r.enabled=false;
if(ts.time-run.start<35)throw new Error('Not enough elapsed time');
const tiles=[];let maxDegrees=0;
for(const [x,z]of run.points){
r.queue.reset();r.queue.now=ts.time;r.queue.mark(x*48,z*48,x*48,z*48);r.iterations=0;r.enabled=true;r.update();r.enabled=false;
const raw=await r.debugRead(),a=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);let slope=0;
for(let j=0;j<128;j++)for(let i=0;i<128;i++){
const k=(j*128+i)*4;if(a[k+3]<0.5)continue;
for(const [dx,dz]of [[1,0],[0,1],[1,1],[-1,1]]){const xx=i+dx,zz=j+dz;if(xx<0||zz>=128||xx>=128)continue;const l=(zz*128+xx)*4;if(a[l+3]<0.5||Math.abs(a[k])+Math.abs(a[l])<1e-6)continue;
slope=Math.max(slope,Math.abs((a[k]-a[l])+(a[k+1]-a[l+1]))*48/Math.hypot(dx,dz));}}
const degrees=Math.atan(slope)*180/Math.PI;maxDegrees=Math.max(maxDegrees,degrees);tiles.push({x,z,degrees});}
r.iterations=run.old;return {activeBefore:run.active,activeAfter:g.shaped.slots.filter(s=>s.state!==0).length,elapsed:ts.time-run.start,jobs:r.jobs-run.jobs,maxDegrees,tiles,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};`);
const report={date:new Date().toISOString(),iterations,...result,progress,note:'Eight live frozen Skitters remain present while eight overlapping full-size Skitter MOUND brush writes settle after writers stop. This does not represent continued impacts while a surface is being disturbed.'};
fs.writeFileSync('docs/phase-9/relaxation/overlap-'+iterations+'.json',JSON.stringify(report,null,2)+'\n');console.log(report);
if(result.activeBefore!==8||result.maxDegrees>34.1||result.gpuErrors||result.late.length)process.exitCode=1;
