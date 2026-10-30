import fs from 'node:fs';
import v8 from 'node:v8';
import { PerformanceObserver } from 'node:perf_hooks';
import { createRelaxationQueue } from '../../src/terrain/state/relaxation.js';
import { createStateGround } from '../../src/world/stateGround.js';
import { createSandDustEvents } from '../../src/world/sandDust.js';
import { PatchGround } from '../../src/world/patchGround.js';
let gcs=0;new PerformanceObserver(l=>{gcs+=l.getEntries().length;}).observe({entryTypes:['gc']});
const q=createRelaxationQueue(),v=createStateGround(),ground=new PatchGround(),dust=createSandDustEvents();
const a=new Float32Array(129*129*4);for(let i=0;i<a.length;i+=4){a[i]=.1;a[i+1]=.4;a[i+2]=1;}
v.install(a,-16,-16,.25,129,1);v.enabled=true;ground.state=v;
ground.install({x0:-32,z0:-32,n:65,step:1,heights:new Float32Array(65*65),version:1},false);
const sink=new Float64Array(1);
const cases={queue(i){q.now=i*.01;q.mark((i%8)*64,(i%5)*64,(i%8)*64,(i%5)*64);if(q.take(-1024,-1024,2048,2048))sink[0]=q.x;},collision(i){ground.qx=(i%100)*.1-5;ground.qz=(i%73)*.1-4;ground.sample();sink[0]=ground.h;},dust(i){dust.time=i*.01;dust.x=(i%100)*.1;dust.z=(i%73)*.1;dust.emit();sink[0]=dust.emitted;}};
const reports=[];
for(const [name,run]of Object.entries(cases)){
for(let i=0;i<250000;i++)run(i);global.gc();await new Promise(r=>setTimeout(r,30));const gc0=gcs,heap=v8.getHeapStatistics().used_heap_size;
for(let i=0;i<1000000;i++)run(i);await new Promise(r=>setTimeout(r,30));const report={name,calls:1000000,gcs:gcs-gc0,heapGrowth:v8.getHeapStatistics().used_heap_size-heap};reports.push(report);console.log(report);
}
fs.writeFileSync('docs/phase-9/relaxation/cpu-hot-allocations.json',JSON.stringify({date:new Date().toISOString(),reports,note:'Warm Node V8 hot queue, CPU collision sampling and bounded dust event paths. Excludes Babylon/WebGPU dispatch and asynchronous readback promises, which require a browser allocation profile.'},null,2)+'\n');
if(reports.some(r=>r.gcs>0))process.exitCode=1;
