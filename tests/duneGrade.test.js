import { describe,it,expect } from 'vitest';
import { GRADES,blendGrade } from '../src/post/grades.js';
const values=(g,strength=1)=>new Float32Array([...g.g0,strength,...g.g1,0,...g.g2,0,0,0,0,0]);
describe('dune grade boundaries and independent restoration',()=>{
  it('preserves frost and meadow endpoints with no dune weight',()=>{
    for(const [r,m,mr,name] of [[0,0,1,'frostStilled'],[1,0,0,'frostRestored'],[1,1,0,'meadowStilled'],[0,1,1,'meadowRestored']]){
      const out=new Float32Array(16);blendGrade(out,r,1,m,mr,0,1);expect(out).toEqual(values(GRADES[name]));
    }
  });
  it('uses only the dune Warden state at a dune endpoint',()=>{
    const out=new Float32Array(16);blendGrade(out,0,.8,0,0,1,1);expect(out).toEqual(values(GRADES.dunesRestored,.8));
    blendGrade(out,1,.8,1,1,1,0);expect(out).toEqual(values(GRADES.dunesStilled,.8));
  });
  it('blends a border continuously and stays within the three grade endpoints',()=>{
    const a=new Float32Array(16),b=new Float32Array(16),mid=new Float32Array(16);
    blendGrade(a,1,1,.5,0,0,1);blendGrade(b,1,1,.5,0,1,1);blendGrade(mid,1,1,.5,0,.5,1);
    for(const i of [0,1,2,4,5,6,8,9,10]){expect(mid[i]).toBeCloseTo((a[i]+b[i])*.5,6);expect(mid[i]).toBeGreaterThanOrEqual(Math.min(a[i],b[i])-1e-6);expect(mid[i]).toBeLessThanOrEqual(Math.max(a[i],b[i])+1e-6);}
  });
});
