import {describe,it,expect} from 'vitest';
import {createStoneMass} from '../src/game/bending/stoneMass.js';
import {DECAY} from '../src/terrain/state/healing.js';
const rate=DECAY[1*6+1];
function ridge(m,x=0){m.arg.set([x,0,1,0,1,1,1,rate]);return m.addRidge();}
describe('Stone collision healing history',()=>{
  it('holds the current height when healing is paused, without restoring earlier erosion',()=>{
    const m=createStoneMass();ridge(m);m.update(100);const h=m.heightAt(0,0);
    m.healScale=0;m.update(100);expect(m.heightAt(0,0)).toBe(h);
    m.update(200);expect(m.heightAt(0,0)).toBe(h);
    m.healScale=1;m.update(210);expect(m.heightAt(0,0)).toBeCloseTo(Math.exp(-rate*110),12);
  });
  it('applies changed rates only to new elapsed time, including a zero-dt change',()=>{
    const m=createStoneMass();ridge(m);m.update(100);const h=m.heightAt(0,0);
    m.healScale=3;m.update(100);expect(m.heightAt(0,0)).toBe(h);
    m.update(110);expect(m.heightAt(0,0)).toBeCloseTo(Math.exp(-rate*130),12);
    m.healScale=.5;m.update(130);expect(m.heightAt(0,0)).toBeCloseTo(Math.exp(-rate*140),12);
  });
  it('starts every shape with its own exposure and reuses the pool cleanly',()=>{
    const m=createStoneMass();const pool=m.k;ridge(m);m.healScale=2;m.update(100);ridge(m,10);
    m.healScale=.5;m.update(150);
    expect(m.heightAt(0,0)).toBeCloseTo(Math.exp(-rate*225),12);
    expect(m.heightAt(10,0)).toBeCloseTo(Math.exp(-rate*25),12);
    m.clear();ridge(m);m.update(170);expect(m.k).toBe(pool);expect(m.heightAt(0,0)).toBeCloseTo(Math.exp(-rate*10),12);
  });
  it('preserves the existing constant-rate exponential across frame partitions',()=>{
    const a=createStoneMass(),b=createStoneMass();ridge(a);ridge(b);a.healScale=b.healScale=1.7;
    a.update(300);for(let i=1;i<=18000;i++)b.update(i/60);
    const expected=Math.exp(-rate*300*1.7);
    expect(a.heightAt(0,0)).toBeCloseTo(expected,12);expect(b.heightAt(0,0)).toBeCloseTo(expected,10);
  });
});
