import v8 from 'node:v8';
import { PerformanceObserver } from 'node:perf_hooks';
import { duneStep, stepPlate, writeStream } from '../../src/game/shaped/dune.js';
let gcs=0; new PerformanceObserver(l=>{gcs+=l.getEntries().length}).observe({entryTypes:['gc']});
const ts={bx:.5,bz:.5,bdx:.5,bdz:.5,bl:.5,bw:.5,bd:.5,bc:.5,bwet:.5,bbias:.5,bberm:.5,stamp(){}},fx={ex:.5,ey:.5,ez:.5,evx:.5,evy:.5,evz:.5,esize:.5,emit(){}}, frost={iceAt(){return false}}, slot={arch:'skitter',state:2,t:.5,coverTime:.5,cover:false,body:{x:.5,z:.5,y:.5,heading:.5}}, plate={st:{plateOff:true,plateAge:.5},rig:{plate0:1,plate1:12}}, chunks=new Float32Array(96*16);let dt=1/60;
function step(i){slot.state=i%2?2:3;slot.body.x=(i%100)*.03;slot.coverTime=0;duneStep(slot,ts,fx,frost,dt);writeStream(slot,chunks,0);plate.st.plateAge=(i%100)/60;stepPlate(plate,chunks,0,dt)}
for(let i=0;i<200000;i++)step(i);global.gc();await new Promise(r=>setTimeout(r,20));let before=gcs,heap=v8.getHeapStatistics().used_heap_size;for(let i=0;i<1000000;i++)step(i);await new Promise(r=>setTimeout(r,20));console.log(JSON.stringify({steps:1000000,gcs:gcs-before,heapGrowth:v8.getHeapStatistics().used_heap_size-heap}));
