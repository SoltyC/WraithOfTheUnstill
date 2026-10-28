// Bounded asynchronous collision streaming, active only with the D2 prototype. Four reusable
// CPU arrays prevent sampling a buffer while a readback fills it. Three bounded in-flight
// reads overlap GPU latency at at most 25 Hz; only the newest completed generation is published.
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { ComputeShader } from '@babylonjs/core/Compute/computeShader.js';
import { createStateGround, STATE_GRID_N, STATE_GRID_STEP } from '../../world/stateGround.js';
import { stateCollisionWGSL } from '../../shaders/stateCollision.wgsl.js';
import { FINE_PER_M } from './layout.js';
export function createStateCollision(engine,fine,surface) {
  const view=createStateGround(), data=new Int32Array(8);
  const job=new StorageBuffer(engine,data.byteLength,undefined,'state-collision-job');job.update(data);
  const bytes=STATE_GRID_N*STATE_GRID_N*16;
  const output=new StorageBuffer(engine,bytes,undefined,'state-collision-output');

  const mapping={fine0:{group:0,binding:0},fine2:{group:0,binding:1},surface:{group:0,binding:2},job:{group:0,binding:3},output:{group:0,binding:4}};
  const cs=new ComputeShader('stateCollision',engine,{computeSource:stateCollisionWGSL},{bindingsMapping:mapping});
  cs.setStorageBuffer('fine0',fine[0]);cs.setStorageBuffer('fine2',fine[2]);cs.setStorageBuffer('surface',surface);cs.setStorageBuffer('job',job);cs.setStorageBuffer('output',output);
  let gen=0, serial=0, published=0, last=-Infinity, inFlight=0;
  // Slots and callbacks are allocated once. A displayed buffer cannot be reused for a read,
  // and replies may complete out of order without replacing a newer collision snapshot.
  const slots=Array.from({length:4},()=>{
    const slot={target:new Float32Array(bytes/4),pending:false,generation:0,serial:0,time:0.5,x:0.5,z:0.5,done:null,failed:null};
    const retire=()=>{slot.pending=false;inFlight--;self.pending=inFlight>0;self.pendingCount=inFlight;};
    slot.done=()=>{
      if(slot.generation===gen && slot.serial>published){
        view.install(slot.target,slot.x,slot.z,STATE_GRID_STEP,STATE_GRID_N,slot.time);
        published=slot.serial;self.reads++;
      }
      retire();
    };
    slot.failed=()=>{retire();self.errors++;self.dirty=true;};
    return slot;
  });
  const self={view,enabled:false,ready:false,pending:false,pendingCount:0,reads:0,errors:0,
    originX:0,originZ:0,px:0.5,pz:0.5,time:0.5,dirty:false,
    reset(){gen++;view.clear();last=-Infinity;},
    update(){
      view.enabled=self.enabled;
      if(!self.ready){data[4]=0;job.update(data);self.ready=cs.dispatch(1,1,1);return;}
      if(!self.enabled||self.time-last<0.04)return;
      let slot=null;
      for(let i=0;i<slots.length;i++)if(!slots[i].pending && slots[i].target!==view.data){slot=slots[i];break;}
      if(!slot || inFlight>=3)return;
      const x0=Math.floor(self.px/STATE_GRID_STEP)*STATE_GRID_STEP-(STATE_GRID_N-1)*STATE_GRID_STEP/2;
      const z0=Math.floor(self.pz/STATE_GRID_STEP)*STATE_GRID_STEP-(STATE_GRID_N-1)*STATE_GRID_STEP/2;
      const healingRefresh=view.maxRelief>0.05 && self.time-view.sampleTime>=1;
      if(!self.dirty && !healingRefresh && view.data && x0===view.x0 && z0===view.z0)return;
      data[0]=self.originX;data[1]=self.originZ;data[2]=Math.round(x0*FINE_PER_M);data[3]=Math.round(z0*FINE_PER_M);data[4]=1;job.update(data);
      if(!cs.dispatch(Math.ceil(STATE_GRID_N/8),Math.ceil(STATE_GRID_N/8),1))return;
      last=self.time;self.pending=true;self.dirty=false;self.pendingCount=++inFlight;
      slot.pending=true;slot.generation=gen;slot.serial=++serial;slot.time=self.time;slot.x=x0;slot.z=z0;
      output.read(0,bytes,slot.target).then(slot.done,slot.failed);
    },
  };
  return self;
}
