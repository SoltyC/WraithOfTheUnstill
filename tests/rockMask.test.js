import { it,expect } from 'vitest';
import { createRockMask } from '../src/world/rockMask.js';
it('classifies only the material channel, preserving map order and independent channels',()=>{
  const data=new Uint8Array([5,0,0,0,1,5,5,5,0,255,5,5,5,255,0,9]);
  expect(Array.from(createRockMask(data,5))).toEqual([255,0,0,255]);
  expect(data[1]).toBe(0);expect(data[13]).toBe(255);
});
it('rejects an incomplete baked texel instead of shifting the geology map',()=>{expect(()=>createRockMask(new Uint8Array(5),5)).toThrow(/complete RGBA/);});
