import {describe,it,expect} from 'vitest';
import {createDesertAerosol} from '../src/world/desertAerosol.js';
function full(){const a=createDesertAerosol();a.weight=1;a.restored=1;return a;}
describe('low desert aerosol controls',()=>{
 it('leaves other biomes and disabled dust untouched and keeps nights much clearer than noon',()=>{
  const a=createDesertAerosol();a.update();expect(a.quantized).toBe(0);
  const b=full();b.update();const noon=b.quantized;b.sunY=-1;b.update();expect(b.quantized).toBeGreaterThan(0);expect(b.quantized).toBeLessThan(noon*.1);
  b.on=false;b.update();expect(b.quantized).toBe(0);
 });
 it('blends with restoration/wetness and bounds invalid owner values',()=>{
  const a=full();a.update();const dry=a.density;a.wet=1;a.update();expect(a.density).toBeCloseTo(dry*.2,12);
  a.wet=0;a.restored=0;a.update();expect(a.density).toBeLessThan(dry);
  a.weight=100;a.restored=100;a.wet=-1;a.update();expect(a.density).toBeCloseTo(.8,12);
 });
 it('keeps a steady noon LUT key stable and bounds rebuild keys during a smooth border crossing',()=>{
  const a=full();a.update();const key=a.quantized;for(let i=0;i<600;i++){a.sunY=1-i*.0001;a.update();expect(a.quantized).toBe(key);}
  const keys=new Set();for(let i=0;i<=600;i++){a.weight=i/600;a.update();keys.add(a.quantized);}
  expect(keys.size).toBeLessThanOrEqual(53);expect(keys.size).toBeGreaterThan(20);
 });
});
