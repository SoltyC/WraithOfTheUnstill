import {describe,it,expect} from 'vitest';
import {createHeatModel} from '../src/post/heat.js';
function model(){const h=createHeatModel();h.hour=13;h.weight=1;h.restored=1;return h;}
describe('desert heat controls',()=>{
 it('is strongest at restored dry noon and silent at night, off, wet or outside the erg',()=>{
  const h=model();h.update();expect(h.strength).toBe(1);
  for(const [key,value]of [['on',false],['wet',1],['weight',0],['restored',0],['hour',1]]){
   const v=model();v[key]=value;v.update();expect(v.strength).toBe(0);
  }
 });
 it('eases with restoration, biome weight, cloud and wetness without replacing its buffer',()=>{
  const h=model(),data=h.data;h.weight=.5;h.restored=.5;h.cover=.5;h.wet=.5;h.update();
  expect(h.strength).toBeCloseTo(.0375,12);expect(h.data).toBe(data);expect(h.data.byteLength).toBe(32);
  h.maxPixels=1e6;h.update();expect(h.data[2]).toBe(3);h.maxPixels=-1;h.update();expect(h.data[2]).toBe(0);
 });
 it('publishes continuous time and debug without introducing temporal random seeds',()=>{
  const h=model();h.time=123.5;h.debug=true;h.update();expect(h.data[1]).toBe(123.5);expect(h.data[3]).toBe(1);
  h.hour=7;h.update();expect(h.strength).toBeCloseTo(0,12);h.hour=13;h.update();expect(h.strength).toBe(1);
 });
});
