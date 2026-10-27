import {it,expect} from 'vitest';
import {preserveSnapshotSetting} from '../src/render/snapshotSetting.js';
const engine=()=>({snapshotRendering:false,resets:0,snapshotRenderingReset(){this.resets++;this.snapshotRendering=true;}});
it('resize and culling resets preserve disabled snapshots',()=>{
  const e=engine();preserveSnapshotSetting(e);
  for(let i=0;i<10;i++)e.snapshotRenderingReset();
  expect(e.snapshotRendering).toBe(false);expect(e.resets).toBe(0);
});
it('enabled snapshots still invalidate, and a later disabled toggle stays disabled',()=>{
  const e=engine();preserveSnapshotSetting(e);e.snapshotRendering=true;e.snapshotRenderingReset();
  expect(e.resets).toBe(1);expect(e.snapshotRendering).toBe(true);
  e.snapshotRendering=false;e.snapshotRenderingReset();expect(e.resets).toBe(1);expect(e.snapshotRendering).toBe(false);
});
