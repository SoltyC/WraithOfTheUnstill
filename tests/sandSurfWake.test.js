import {describe,it,expect} from 'vitest';
import {Surf} from '../src/character/surf.js';
import {createSurfWake} from '../src/character/surfWake.js';
import {FX_SPRAY,SPRAY_LIFE} from '../src/shaders/wraithFx.wgsl.js';
function make(material,speed,lat,flow=0){
 const surf=new Surf();surf.material=material;surf.sandUnlocked=true;surf.selectSurface();
 surf.active=true;surf.speed=speed;surf.blend=1;surf.latAccel=lat;
 const stamps=[],ts={stamp(){stamps.push({x:this.bx,z:this.bz,halfLength:this.bl,width:this.bw,depth:this.bd,berm:this.bberm,bias:this.bbias,kind:this.bk});}};
 const fx={count:0,emit(){this.count++;}},wake=createSurfWake(ts,fx);
 wake.surf=surf;wake.grounded=true;wake.enabled=true;wake.x=1900;wake.z=900;wake.y=150;wake.flow=flow;
 wake.update();wake.z+=.5;wake.update();return {stamps,fx,wake};
}
describe('material-specific shared surf wake',()=>{
 it('preserves the snow groove and gives sand a wider shallower cut with a heavier berm',()=>{
  const snow=make(0,20,15).stamps[0],sand=make(1,20,11).stamps[0];
  expect(snow.width).toBeCloseTo(.64,12);expect(snow.depth).toBeCloseTo(.29,12);expect(snow.berm).toBe(1.15);
  expect(sand.kind).toBe(1);expect(sand.width).toBeGreaterThan(snow.width);expect(sand.depth).toBeLessThan(snow.depth);
  expect(sand.berm).toBeGreaterThan(snow.berm);expect(sand.bias).toBeCloseTo(-.9,12);
 });
 it('keeps the sand front cap behind the foot normal stencil while snow stays centred',()=>{
  for (const speed of [2,14,32]) {
   const sand=make(1,speed,0).stamps[0],snow=make(0,speed,0).stamps[0];
   const front=sand.z+sand.halfLength+1.65*sand.width;
   expect(front).toBeCloseTo(900.5-.3,12);
   expect(snow.z).toBeCloseTo(900.25,12);
  }
 });
 it('keeps full-speed Flow3 sand spray within the existing fixed lifetime pool',()=>{
  const {fx}=make(1,32,11,3);
  expect(fx.count).toBeGreaterThan(20);expect(fx.count).toBeLessThanOrEqual(32);
  expect(fx.count*60*SPRAY_LIFE).toBeLessThan(FX_SPRAY);
 });
 it('does not connect teleports or inactive traversal with a long scar',()=>{
  const {wake,stamps}=make(1,20,0);const before=stamps.length;
  wake.z+=20;wake.update();expect(stamps.length).toBe(before);
  wake.surf.active=false;wake.z+=.5;wake.update();expect(stamps.length).toBe(before);
 });
});
