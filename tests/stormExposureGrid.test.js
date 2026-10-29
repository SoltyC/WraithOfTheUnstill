import {describe,it,expect} from 'vitest';
import {StormExposure} from '../src/world/stormExposure.js';
import {StormExposureGrid} from '../src/world/stormExposureGrid.js';
import {createSandstormFront} from '../src/world/sandstormFront.js';
function rig(){const f=createSandstormFront(),h=new StormExposure();h.source=f.block;f.enabled=true;f.target=1;f.snap=true;f.anchorX=2400;f.anchorZ=900;f.update();for(let i=0;i<=120;i++){f.age=60+i/4;f.update();h.time=i/4;h.record();}return {f,h,g:new StormExposureGrid(h)};}
function sample(g,x,z,a=0,b=g.history.time){g.qx=x;g.qz=z;g.from=a;g.to=b;g.sample();return g.value;}
describe('canonical storm transport grid',()=>{
  it('matches float32 timeline integrals exactly at world nodes',()=>{const {h,g}=rig();for(const x of [2200,2400,2600]){h.qx=x;h.qz=896;h.from=0;h.to=h.time;h.integrate();expect(sample(g,x,896)).toBe(Math.fround(h.value));}});
  it('uses the same four float32 node values for CPU and GPU jobs',()=>{const {g}=rig();const v=[sample(g,2400,896),sample(g,2408,896),sample(g,2400,888),sample(g,2408,888)];expect(sample(g,2404,892)).toBe((v[0]+v[1]+v[2]+v[3])/4);g.originX=2400;g.originZ=896;g.columns=g.rows=2;g.output=new Float32Array(4);g.fill();expect(Array.from(g.output)).toEqual(v);});
  it('advances cached prefixes without losing partial intervals or capture boundaries',()=>{const {f,h,g}=rig();sample(g,2400,896);f.age=90.1;f.update();h.time=30.1;h.record();h.seal();const saved=sample(g,2400,896,0,30.1);f.age=91;f.update();h.time=31;h.record();expect(sample(g,2400,896,0,30.1)).toBe(saved);h.qx=2400;h.qz=896;h.from=0;h.to=31;h.integrate();expect(sample(g,2400,896)).toBe(Math.fround(h.value));});
  it('invalidates the cache on restore and leaves outside-world queries empty',()=>{const {h,g}=rig();expect(sample(g,2400,896)).toBeGreaterThan(0);h.restore({version:1,through:40,samples:[]});expect(sample(g,2400,896)).toBe(0);expect(sample(g,5000,896)).toBe(0);});
  it('masks transport by the existing raw Dunes biome bytes',()=>{const {h}=rig(),biome=new Uint8Array(1024*1024*4),g=new StormExposureGrid(h,biome);expect(sample(g,2400,896)).toBe(0);biome.fill(255);const full=sample(g,2400,896);expect(full).toBeGreaterThan(0);for(let i=3;i<biome.length;i+=4)biome[i]=128;expect(sample(g,2400,896)).toBeCloseTo(full*128/255,5);});
  it('clamps both biome taps independently at the north and west world boundaries',()=>{
    const {f,h}=rig();f.anchorX=-4096;f.anchorZ=4096;f.active=false;f.snap=true;f.update();f.age=95;f.update();
    h.restore({version:1,through:0,samples:[]});h.source=f.block;h.time=0;h.record();h.time=1;h.record();
    const b=new Uint8Array(1024*1024*4);b.fill(255);b[3]=0;
    const g=new StormExposureGrid(h,b);expect(sample(g,-4096,4096)).toBe(0);
  });

});
