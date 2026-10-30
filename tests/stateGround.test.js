import { describe,it,expect } from 'vitest';
import { createStateGround } from '../src/world/stateGround.js';
import { PatchGround } from '../src/world/patchGround.js';
import { createStoneMass } from '../src/game/bending/stoneMass.js';
function patch() {
  const state=createStateGround(), data=new Float32Array(3*3*4);
  for(let i=0;i<9;i++){data[i*4]=0.1;data[i*4+1]=0.3;data[i*4+2]=1;}
  state.install(data,-1,-1,1,3,10);state.enabled=true;
  const ground=new PatchGround();ground.install({x0:-2,z0:-2,n:5,step:1,heights:new Float32Array(25).fill(10),version:1},false);ground.state=state;
  return {state,ground,data};
}
describe('sand collision snapshots',()=>{
  it('samples both height channels and rejects uncovered or non-sand corners',()=>{
    const {state,data}=patch();state.qx=-0.5;state.qz=-0.5;
    data[1]=0.7;expect(state.sample()).toBe(true);expect(state.disp).toBeCloseTo(0.4);
    data[2]=0;expect(state.sample()).toBe(false);data[2]=1;
    state.qx=2;expect(state.sample()).toBe(false);state.clear();expect(state.sample()).toBe(false);
  });
  it('interpolates frozen fraction independently of heights and clears it on reset',()=>{
    const {state,data}=patch();data[3]=1;data[7]=.5;data[15]=.25;data[19]=0;
    state.install(data,-1,-1,1,3,10);expect(state.maxFrozen).toBe(1);
    state.qx=-.5;state.qz=-.5;expect(state.sample()).toBe(true);
    expect(state.frozen).toBeCloseTo(1.75/4,12);expect(state.disp).toBeCloseTo(.3);
    state.clear();expect(state.frozen).toBe(0);expect(state.maxFrozen).toBe(0);
  });
  it('replaces an older solid Ridge with slumped state, without double-counting',()=>{
    const {ground}=patch(), mass=createStoneMass();ground.mass=mass;
    mass.time=5;mass.arg.set([0,0,1,0,1,1,2,0]);mass.addRidge();mass.update(10);
    ground.qx=0;ground.qz=0;ground.sample();expect(ground.h).toBeCloseTo(10.2);
    expect(mass.heightAt(0,0)).toBeCloseTo(2); // ordinary cover queries still see all shapes
  });
  it('makes a newly raised Ridge solid before the next snapshot arrives',()=>{
    const {ground,state}=patch(), mass=createStoneMass();ground.mass=mass;
    mass.time=11;mass.arg.set([0,0,1,0,1,1,2,0]);const i=mass.addRidge();mass.update(11);
    ground.qx=0;ground.qz=0;ground.sample();expect(ground.h).toBeCloseTo(11.9);
    state.sampleTime=12;ground.sample();expect(ground.h).toBeCloseTo(10.2);
    mass.time=13;mass.arg[0]=3;mass.raise(i);ground.sample();expect(ground.h).toBeCloseTo(12.9);
    expect(mass.afterTime).toBe(-Infinity);
  });
  it('falls back to analytic collision outside sand snapshot coverage',()=>{
    const {ground,state}=patch(), mass=createStoneMass();ground.mass=mass;
    mass.time=5;mass.arg.set([0,0,1,0,1,1,2,0]);mass.addRidge();mass.update(10);
    state.enabled=false;ground.qx=0;ground.qz=0;ground.sample();expect(ground.h).toBeCloseTo(12);
  });
});
