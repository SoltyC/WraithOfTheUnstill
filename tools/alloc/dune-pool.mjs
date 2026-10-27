// Eight-body pool allocation probe; run with node --expose-gc. Includes shared body/rig behavior.
import v8 from 'node:v8';
import { PerformanceObserver } from 'node:perf_hooks';
import { createShaped } from '../../src/game/shaped/shaped.js';
let gc = 0; new PerformanceObserver(l => { gc += l.getEntries().length; }).observe({ entryTypes: ['gc'] });
const ts = {bx:.5,bz:.5,bdx:.5,bdz:.5,bl:.5,bw:.5,bd:.5,bc:.5,bwet:.5,bbias:.5,bberm:.5,stamp(){}}, fx = {ex:.5,ey:.5,ez:.5,evx:.5,evy:.5,evz:.5,esize:.5,emit(){}}, ground = {qx:.5,qz:.5,h:.5,sample(){this.h=0;}}, frost = {iceAt(){return false;}};
const s = createShaped({ts,fx,ground,frost}); s.px=100; for(let i=0;i<8;i++) s.spawn(i%2?'plateback':'skitter',i*5,0); s.dt=1/60;
for(let i=0;i<10000;i++) s.update(); global.gc(); await new Promise(r=>setTimeout(r,20)); let base=v8.getHeapStatistics().used_heap_size, before=gc;
for(let i=0;i<100000;i++) s.update(); await new Promise(r=>setTimeout(r,20)); console.log(JSON.stringify({frames:100000, gc:gc-before, heapGrowth:v8.getHeapStatistics().used_heap_size-base}));
