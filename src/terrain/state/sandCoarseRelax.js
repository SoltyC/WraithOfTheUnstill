// One bounded coarse band per visit. Four disjoint-pair phases project offending slopes
// directly to repose, conserving signed volume. Errors remain in the spare high half.
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { ComputeShader } from '@babylonjs/core/Compute/computeShader.js';
import { sandCoarseRelaxWGSL } from '../../shaders/sandCoarseRelax.wgsl.js';
import { PAGE_N, SLOTS } from './layout.js';
export function createSandCoarseRelax(engine,atlas,surface,clipmap){
  const data=new Int32Array(8),job=new StorageBuffer(engine,data.byteLength,undefined,'sand-coarse-job');job.update(data);
  const bindings={h:atlas[0],state:atlas[1],extra:atlas[2],surface,job,levels:clipmap.levelData,cp:clipmap.params},mapping={};
  Object.keys(bindings).forEach((n,i)=>{mapping[n]={group:0,binding:i};});
  const passes=[];
  for(let axis=0;axis<2;axis++)for(let phase=0;phase<2;phase++){
    const cs=new ComputeShader('sandCoarseRelax'+axis+phase,engine,{computeSource:sandCoarseRelaxWGSL(axis===1,phase)},{bindingsMapping:mapping});
    for(const n of Object.keys(bindings))cs.setStorageBuffer(n,bindings[n]);passes.push(cs);
  }
  const warmed=new Uint8Array(4),row=new Uint8Array(SLOTS);
  return {enabled:false,ready:false,slot:-1,pageX:0,pageZ:0,jobs:0,
    reset(){row.fill(0);},
    resetSlot(slot){row[slot]=0;},
    update(){
      if(!this.ready){
        data[4]=0;job.update(data);this.ready=true;
        for(let i=0;i<4;i++){if(!warmed[i]&&passes[i].dispatch(1,1,1))warmed[i]=1;this.ready=this.ready&&warmed[i]===1;}return;
      }
      if(!this.enabled||this.slot<0)return;
      data[0]=this.pageX;data[1]=this.pageZ;data[2]=this.slot;data[3]=row[this.slot]*32;data[4]=1;job.update(data);
      for(let i=0;i<4;i++)if(!passes[i].dispatch(i<2?PAGE_N/16:PAGE_N/8,i<2?4:2,1))return;
      row[this.slot]=(row[this.slot]+1)%(PAGE_N/32);this.jobs++;
    },
  };
}
