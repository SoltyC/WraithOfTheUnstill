// Bounded asynchronous collision streaming, active only with the D2 prototype. Two reusable
// CPU arrays prevent sampling a buffer while a readback fills it. No readback runs every frame;
// active state refreshes at most 12.5 Hz, and stale generation replies after load are discarded.
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
  const buffers=[new Float32Array(bytes/4),new Float32Array(bytes/4)];
  const mapping={fine0:{group:0,binding:0},fine2:{group:0,binding:1},surface:{group:0,binding:2},job:{group:0,binding:3},output:{group:0,binding:4}};
  const cs=new ComputeShader('stateCollision',engine,{computeSource:stateCollisionWGSL},{bindingsMapping:mapping});
  cs.setStorageBuffer('fine0',fine[0]);cs.setStorageBuffer('fine2',fine[2]);cs.setStorageBuffer('surface',surface);cs.setStorageBuffer('job',job);cs.setStorageBuffer('output',output);
  let gen=0, next=0, last=-Infinity;
  const self={view,enabled:false,ready:false,pending:false,reads:0,errors:0,
    originX:0,originZ:0,px:0.5,pz:0.5,time:0.5,dirty:false,
    reset(){gen++;view.clear();last=-Infinity;},
    update(){
      view.enabled=self.enabled;
      if(!self.ready){data[4]=0;job.update(data);self.ready=cs.dispatch(1,1,1);return;}
      if(!self.enabled||self.pending||self.time-last<0.08)return;
      const x0=Math.floor(self.px/STATE_GRID_STEP)*STATE_GRID_STEP-(STATE_GRID_N-1)*STATE_GRID_STEP/2;
      const z0=Math.floor(self.pz/STATE_GRID_STEP)*STATE_GRID_STEP-(STATE_GRID_N-1)*STATE_GRID_STEP/2;
      const healingRefresh=view.maxRelief>0.05 && self.time-view.sampleTime>=1;
      if(!self.dirty && !healingRefresh && view.data && x0===view.x0 && z0===view.z0)return;
      data[0]=self.originX;data[1]=self.originZ;data[2]=Math.round(x0*FINE_PER_M);data[3]=Math.round(z0*FINE_PER_M);data[4]=1;job.update(data);
      if(!cs.dispatch(Math.ceil(STATE_GRID_N/8),Math.ceil(STATE_GRID_N/8),1))return;
      last=self.time;self.pending=true;self.dirty=false;
      const time=self.time,generation=gen,target=buffers[next];next=1-next;
      output.read(0,bytes,target).then(()=>{
        if(generation===gen){view.install(target,x0,z0,STATE_GRID_STEP,STATE_GRID_N,time);self.reads++;}
        self.pending=false;
      },()=>{self.pending=false;self.errors++;self.dirty=true;});
    },
  };
  return self;
}
