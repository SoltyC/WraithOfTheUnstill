import {describe,it,expect} from 'vitest';
import {StormExposure,validateStormExposure} from '../src/world/stormExposure.js';
import {createSandstormFront} from '../src/world/sandstormFront.js';
const setup=()=>{const f=createSandstormFront();f.enabled=true;f.target=1;f.snap=true;f.anchorX=2400;f.anchorZ=900;f.baseY=180;f.update();f.age=60;f.update();const h=new StormExposure();h.source=f.block;return {f,h};};
function exposure(h,a,b,x=2400,z=900){h.qx=x;h.qz=z;h.from=a;h.to=b;h.integrate();return h.value;}
function record(f,h,t){f.age=60+t;f.update();h.time=t;h.record();}
describe('saved world-space storm exposure',()=>{
  it('does not record a frame history in inactive air',()=>{const f=createSandstormFront(),h=new StormExposure();h.source=f.block;for(let i=0;i<3600;i++){h.time=i/60;h.record();}expect(h.count).toBe(1);expect(exposure(h,-100,h.time)).toBe(0);expect(h.snapshot().samples.length).toBe(26);});
  it('matches dense front sampling without replaying missed game frames',()=>{
    const {f,h}=setup();for(let i=0;i<=1800;i++)record(f,h,i/60);
    for(const x of [2000,2200,2400,2600,2800]){const actual=exposure(h,0,30,x);let expected=0;for(let i=0;i<7200;i++){f.age=60+(i+.5)/240;f.update();f.qx=x;f.qy=180;f.qz=900;f.sample();expected+=f.density/240;}expect(Math.abs(actual-expected)).toBeLessThan(.02);}
    expect(h.count).toBeLessThan(125);
  });
  it('is additive for resident bands and evicted-page intervals',()=>{const {f,h}=setup();for(let i=0;i<=1800;i++)record(f,h,i/60);const whole=exposure(h,0,30);let parts=0;for(let t=0;t<30;t+=.3)parts+=exposure(h,t,Math.min(30,t+.3));expect(parts).toBeCloseTo(whole,10);});
  it('does not interpolate a debug teleport through untouched terrain',()=>{const {f,h}=setup();record(f,h,0);h.time=1;h.record();f.age=95;f.update();h.time=1;h.record();expect(exposure(h,0,1)).toBe(0);h.time=2;h.record();expect(exposure(h,1,2)).toBeCloseTo(1,8);});
  it('holds a paused timeline and resumes from the same position',()=>{const {f,h}=setup();record(f,h,0);record(f,h,10);const n=h.count,v=exposure(h,0,10);for(let i=0;i<100;i++)h.record();expect(h.count).toBe(n);expect(exposure(h,0,10)).toBe(v);record(f,h,11);expect(exposure(h,0,11)).toBeGreaterThanOrEqual(v);});
  it('round-trips independently of current weather and shifts with page clocks',()=>{const {f,h}=setup();for(let i=0;i<=1800;i++)record(f,h,i/60);const expected=exposure(h,2,29),s=JSON.parse(JSON.stringify(h.snapshot())),copy=new StormExposure();copy.restore(s,-25);expect(exposure(copy,-23,4)).toBe(expected);expect(s.through).toBe(30);expect(copy.time).toBe(5);});
  it('rejects incomplete or corrupt saved histories before replacing live data',()=>{const {f,h}=setup();record(f,h,0);record(f,h,1);const before=h.snapshot();for(const mutate of [s=>s.samples[4]=NaN,s=>s.samples[0]=100,s=>s.through=.5,s=>s.samples[7]=0]){const s=structuredClone(before);mutate(s);expect(()=>h.restore(s)).toThrow();expect(h.snapshot()).toEqual(before);}expect(()=>validateStormExposure({...before,through:2})).toThrow();expect(()=>exposure(h,0,2)).toThrow();});
  it('fails explicitly on capacity instead of discarding old exposure',()=>{const {f}=setup(),h=new StormExposure(3);h.source=f.block;h.time=0;h.record();h.time=.25;h.record();const before=h.snapshot();h.time=.5;expect(()=>h.record()).toThrow(/capacity/);h.time=.25;expect(h.snapshot()).toEqual(before);});
  it('keeps a sealed capture endpoint immutable after load and resumed sub-cadence samples',()=>{
    const {f,h}=setup();f.age=95;f.update();f.block[3]=.2;h.time=0;h.record();
    f.block[2]+=3.2;f.block[3]=.3;h.time=.1;h.record();h.seal();
    const expected=exposure(h,0,.1),copy=new StormExposure();copy.restore(h.snapshot());copy.source=f.block;
    f.block[2]+=3.2;f.block[3]=1;copy.time=.2;copy.record();
    expect(exposure(copy,0,.1)).toBe(expected);expect(exposure(copy,.1,.2)).toBeGreaterThan(expected);
  });

});
