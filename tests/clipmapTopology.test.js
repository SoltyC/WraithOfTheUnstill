import { it,expect } from 'vitest';
import { createClipmapTopology } from '../src/render/clipmapGrid.js';
it('retains nondegenerate consistently wound triangles with valid indices',()=>{
  for(const ring of [false,true]){
    const {positions:p,indices}=createClipmapTopology(32,ring);
    for(let k=0;k<indices.length;k+=3){
      const a=indices[k]*3,b=indices[k+1]*3,c=indices[k+2]*3;
      expect(Math.max(a,b,c)+2).toBeLessThan(p.length);
      const area=(p[b]-p[a])*(p[c+2]-p[a+2])-(p[b+2]-p[a+2])*(p[c]-p[a]);
      expect(area).toBeGreaterThan(0);
    }
  }
});
it('removes only triangles buried beneath finer coverage for every legal snapped origin',()=>{
  const n=32,full=createClipmapTopology(n),ring=createClipmapTopology(n,true);
  const retained=new Set();for(let i=0;i<ring.indices.length;i+=3)retained.add(Array.from(ring.indices.slice(i,i+3)).join(','));
  let removed=0;
  for(let i=0;i<full.indices.length;i+=3){
    const triangle=full.indices.slice(i,i+3);if(retained.has(Array.from(triangle).join(',')))continue;removed++;
    for(const dx of [-1,0,1])for(const dz of [-1,0,1])for(const v of triangle){
      // Finer spacing is half a coarse cell; the existing buried mask subtracts half of that.
      expect(Math.abs(full.positions[v*3]-dx)).toBeLessThan(n/4-.25);
      expect(Math.abs(full.positions[v*3+2]-dz)).toBeLessThan(n/4-.25);
    }
  }
  expect(removed).toBeGreaterThan(0);
});
