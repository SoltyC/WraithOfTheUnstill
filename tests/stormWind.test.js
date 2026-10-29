import {describe,it,expect} from 'vitest';
import {createWind,sampleInto,WIND_VECTORS} from '../src/world/wind.js';
import {createSandstormFront,SANDSTORM_GUST} from '../src/world/sandstormFront.js';
const vector=(w,x,z)=>{w.sx=x;w.sz=z;w.sample();return {x:w.outX*w.speed,z:w.outZ*w.speed,speed:w.speed};};
const front=()=>{const f=createSandstormFront();f.enabled=true;f.target=1;f.snap=true;f.anchorX=2400;f.anchorZ=900;f.baseY=180;f.update();f.age=95;f.update();return f;};
const wind=f=>{const w=createWind(f);w.dirX=0;w.dirZ=1;w.strength=1;w.gustiness=.5;w.time=13.3;return w;};
describe('shared storm wind',()=>{
  it('preserves the original field exactly with an inactive biome gate',()=>{
    const a=wind(null),b=wind(front());b.stormWeight=0;a.update();b.update();
    for(let x=1800;x<3600;x+=73)expect(vector(b,x,900)).toEqual(vector(a,x,900));
    expect(b.block.length).toBe(WIND_VECTORS*4);expect(b.block[27]).toBe(0);
  });
  it('adds the world-front direction only behind the face, with a graded biome gate',()=>{
    const a=wind(null),b=wind(front());a.update();b.stormWeight=1;b.update();
    const av=vector(a,2400,900),bv=vector(b,2400,900);expect(bv.x-av.x).toBeCloseTo(SANDSTORM_GUST,12);expect(bv.z).toBeCloseTo(av.z,12);
    expect(vector(b,3400,900)).toEqual(vector(a,3400,900));
    b.stormWeight=.25;b.update();expect(vector(b,2400,900).x-av.x).toBeCloseTo(SANDSTORM_GUST*.25,12);
  });
  it('retains all four Gale burst slots and superposes the same storm contribution',()=>{
    const a=wind(null),b=wind(front());b.stormWeight=1;
    for(const w of [a,b]){w.time=10;w.update();w.burst(2400,900,3);w.time=10.5;w.update();}
    expect(b.block.slice(8,24)).toEqual(a.block.slice(8,24));
    const av=vector(a,2407,900),bv=vector(b,2407,900);expect(bv.x-av.x).toBeCloseTo(SANDSTORM_GUST,12);expect(bv.z).toBeCloseTo(av.z,12);
  });
  it('supports bare packed blocks and reuses the fixed storage while disabling cleanly',()=>{
    const f=front(),w=wind(f),block=w.block;w.stormWeight=1;w.update();const expected=vector(w,2400,900),out={outX:0,outZ:0,speed:0};sampleInto(block,2400,900,out);
    expect(out.speed).toBe(expected.speed);expect(out.outX*out.speed).toBeCloseTo(expected.x,12);
    w.stormFront=null;w.update();expect(w.block).toBe(block);expect(w.block[27]).toBe(0);
    const a=wind(null);a.update();expect(vector(w,2400,900)).toEqual(vector(a,2400,900));
  });
});
