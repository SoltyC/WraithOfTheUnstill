import fs from 'node:fs';
import { Session } from 'node:inspector';
import v8 from 'node:v8';
import { PerformanceObserver } from 'node:perf_hooks';
import { createShaped,S } from '../../src/game/shaped/shaped.js';
import { createDuneCaster,writeWhirler,DEVIL_COUNT,DEVIL_CHUNKS } from '../../src/game/shaped/duneCaster.js';
let gcs=0;new PerformanceObserver(list=>{gcs+=list.getEntries().length;}).observe({entryTypes:['gc']});
const ts={stamp(){}},ground={qx:.5,qz:.5,h:.5,sample(){this.h=0;}},fx={emit(){}};
const shaped=createShaped({ts,ground,fx});shaped.px=0;shaped.pz=9;shaped.pvx=0;shaped.pvz=0;
for(let i=0;i<8;i++)shaped.spawn(i%2?'glasssworn':'whirler',(i%4-1.5)*4,Math.floor(i/4)*-5);
const caster=createDuneCaster(ts,ground),out=new Float32Array((8*96+12+DEVIL_COUNT*DEVIL_CHUNKS)*16);
const slot=shaped.slots[0];slot.state=S.TELEGRAPH;
const frames=Number(process.env.ALLOC_FRAMES||100000);
const reports=[],profileOn=process.argv.includes('--profile');
const inspector=new Session();if(profileOn)inspector.connect();
const post=(method,params={})=>new Promise((resolve,reject)=>inspector.post(method,params,(err,r)=>err?reject(err):resolve(r)));
const cases={
  caster(i){slot.t=i%100/60;slot.state=i%100<65?S.TELEGRAPH:S.STALK;caster.dt=1/60;caster.think(slot,shaped);caster.step(shaped,out,8*96+12);slot.renderRise=1;writeWhirler(slot,out,0);},
  mixedPool(i){shaped.dt=1/60;shaped.time+=shaped.dt;shaped.update();},
};
for(const [name,run] of Object.entries(cases)){
 for(let i=0;i<25000;i++)run(i);global.gc();await new Promise(r=>setTimeout(r,30));const gc0=gcs,heap=v8.getHeapStatistics().used_heap_size;
 if(profileOn)await post('HeapProfiler.startSampling',{samplingInterval:64,includeObjectsCollectedByMinorGC:true,includeObjectsCollectedByMajorGC:true});
 for(let i=0;i<frames;i++)run(i);
 if(profileOn){const {profile}=await post('HeapProfiler.stopSampling');const nodes=new Map(),parents=new Map(),totals=new Map();const walk=(n,p)=>{nodes.set(n.id,n);if(p)parents.set(n.id,p);for(const c of n.children)walk(c,n);};walk(profile.head);for(const sm of profile.samples){let n=nodes.get(sm.nodeId),st=[];while(n&&st.length<6){st.push(n.callFrame.functionName+' '+n.callFrame.url+':'+(n.callFrame.lineNumber+1));n=parents.get(n.id);}const k=st.join(' <- ');totals.set(k,(totals.get(k)||0)+sm.size);}const top=[...totals].sort((a,b)=>b[1]-a[1]).slice(0,12);console.log(name,top);fs.writeFileSync('docs/phase-9/dune-casters/alloc-profile-'+name+'.json',JSON.stringify(top,null,2)+'\n');}await new Promise(r=>setTimeout(r,30));const report={name,frames,gcs:gcs-gc0,heapGrowth:v8.getHeapStatistics().used_heap_size-heap};reports.push(report);console.log(report);
}
if(profileOn)inspector.disconnect();
fs.mkdirSync('docs/phase-9/dune-casters',{recursive:true});fs.writeFileSync('docs/phase-9/dune-casters/allocations.json',JSON.stringify({date:new Date().toISOString(),reports,note:'Node V8 warm CPU diagnostic, excludes browser renderer/API allocation floor. Isolated caster and real eight-body mixed pool are reported separately.'},null,2)+'\n');
