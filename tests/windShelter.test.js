import {describe,it,expect} from 'vitest';
import {createShelterField,shelterSnapshotCurrent,sampleShelterHeight,shelterExposure,SHELTER_DATA,SHELTER_FLOATS} from '../src/world/windShelter.js';
import {createWind} from '../src/world/wind.js';
function field(fn){const f=createShelterField();f.gridX=f.gridZ=-32;f.heights=new Float32Array(129*129);f.valid=new Uint8Array(129*129).fill(1);for(let j=0;j<129;j++)for(let i=0;i<129;i++)f.heights[j*129+i]=fn(i*.5-32,j*.5-32);f.rebuild();return f;}
function block(f){const b=new Float32Array(SHELTER_DATA+SHELTER_FLOATS);b[36]=f.originX;b[37]=f.originZ;b[38]=f.step;b[39]=1;b.set(f.data,40);return b;}
describe('terrain-derived shared wind shelter',()=>{
 it('keeps flat terrain exposed',()=>{const f=field(()=>100),b=block(f);for(const x of [-15,0,15])expect(shelterExposure(sampleShelterHeight(b,x,0))).toBe(1);});
 it('shields the lee of an actual height crest while leaving its windward side open',()=>{const f=field((x,z)=>100+(Math.abs(x)<1&&Math.abs(z)<6?4:0)),b=block(f);expect(shelterExposure(sampleShelterHeight(b,3,0))).toBeLessThan(.2);expect(shelterExposure(sampleShelterHeight(b,-3,0))).toBe(1);expect(shelterExposure(sampleShelterHeight(b,3,12))).toBe(1);});
 it('reverses the lee when wind reverses',()=>{const f=field(x=>100+(Math.abs(x)<1?4:0));f.dx=-1;f.rebuild();const b=block(f);expect(shelterExposure(sampleShelterHeight(b,-3,0))).toBeLessThan(.2);expect(shelterExposure(sampleShelterHeight(b,3,0))).toBe(1);});
 it('leaves air above the obstacle and missing/outside coverage exposed',()=>{const f=field(x=>100+(Math.abs(x)<1?4:0)),b=block(f),h=sampleShelterHeight(b,3,0);expect(shelterExposure(h,5)).toBe(1);expect(sampleShelterHeight(b,17,0)).toBe(0);expect(sampleShelterHeight(b,16,0)).toBe(0);f.valid.fill(0);f.rebuild();expect(sampleShelterHeight(block(f),3,0)).toBe(0);});
 it('removes shelter when the real terrain heals back to rest',()=>{const f=field(x=>Math.abs(x)<1?4:0);expect(sampleShelterHeight(block(f),3,0)).toBeGreaterThan(1);f.heights.fill(0);f.rebuild();expect(sampleShelterHeight(block(f),3,0)).toBe(0);});
 it('attenuates actual shared wind once and preserves its raw speed for sound',()=>{const f=field(x=>Math.abs(x)<1?4:0),w=createWind();w.strength=1;w.sx=3;w.sz=0;w.update();w.sample();const raw=w.speed;w.shelter=f;w.update();w.sample();expect(w.rawSpeed).toBe(raw);expect(w.exposure).toBeLessThan(.2);expect(w.speed).toBe(raw*w.exposure);w.shelter.enabled=false;w.update();w.sample();expect(w.speed).toBe(raw);expect(w.exposure).toBe(1);});
 it('rejects stale pending reads even when there is no published field',()=>{
  const owner={enabled:true,time:5,px:0,pz:0,dx:1,dz:0},slot={time:4.9,x:-32,z:-32,dx:1,dz:0};
  expect(shelterSnapshotCurrent(owner,slot)).toBe(true);
  owner.px=40;expect(shelterSnapshotCurrent(owner,slot)).toBe(false);owner.px=0;
  owner.dx=-1;expect(shelterSnapshotCurrent(owner,slot)).toBe(false);owner.dx=1;
  owner.time=6;expect(shelterSnapshotCurrent(owner,slot)).toBe(false);
  owner.time=4;expect(shelterSnapshotCurrent(owner,slot)).toBe(false);
  owner.time=5;owner.enabled=false;expect(shelterSnapshotCurrent(owner,slot)).toBe(false);
 });

});
