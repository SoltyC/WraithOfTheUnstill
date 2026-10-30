// A small GPU-state readback independently of D2 relaxation. It never enables the solver,
// replaces collision or writes terrain. Both wind twins consume only the published CPU field.
import {StorageBuffer} from '@babylonjs/core/Buffers/storageBuffer.js';
import {ComputeShader} from '@babylonjs/core/Compute/computeShader.js';
import {createGpuReadbackPool} from '../../core/gpuReadback.js';
import {createShelterField,shelterSnapshotCurrent} from '../../world/windShelter.js';
import {FINE_N,FINE_PER_M} from './layout.js';
const N=129,STEP=.5,BYTES=N*N*8;
const WGSL=`
@group(0) @binding(0) var<storage,read> fine0:array<u32>;
@group(0) @binding(1) var<storage,read> sp:array<i32>;
@group(0) @binding(2) var<storage,read> job:array<i32>;
@group(0) @binding(3) var<storage,read_write> result:array<vec2f>;
fn delta(p:vec2i)->f32{let q=((p%${FINE_N})+${FINE_N})%${FINE_N};let h=unpack2x16float(fine0[u32(q.y*${FINE_N}+q.x)]);return h.y-h.x;}
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) id:vec3u){
 if(job[2]==0||id.x>=129u||id.y>=129u){return;}
 let p=vec2i(job[0],job[1])+vec2i(id.xy)*24;let k=id.y*129u+id.x;let origin=vec2i(sp[0],sp[1]);
 if(any(p-vec2i(1)<origin)||any(p>=origin+vec2i(${FINE_N}))){result[k]=vec2f(0.0);return;}
 result[k]=vec2f((delta(p-vec2i(1,1))+delta(p-vec2i(1,0))+delta(p-vec2i(0,1))+delta(p))*.25,1.0);
}`;
export function createStormShelter(engine,terrain,ground){
 const field=createShelterField(),jobData=new Int32Array(4),job=new StorageBuffer(engine,16,undefined,'storm-shelter-job');job.update(jobData);
 const output=new StorageBuffer(engine,BYTES,undefined,'storm-shelter-heights');
 const cs=new ComputeShader('stormShelter',engine,{computeSource:WGSL},{bindingsMapping:{fine0:{group:0,binding:0},sp:{group:0,binding:1},job:{group:0,binding:2},result:{group:0,binding:3}}});
 cs.setStorageBuffer('fine0',terrain.fine[0]);cs.setStorageBuffer('sp',terrain.params);cs.setStorageBuffer('job',job);cs.setStorageBuffer('result',output);
 const pool=createGpuReadbackPool(engine,BYTES,4),heights=new Float32Array(N*N),valid=new Uint8Array(N*N);field.heights=heights;field.valid=valid;
 let generation=0,serial=0,published=0,last=-Infinity,wasOn=false,disposed=false;
 const slots=Array.from({length:4},(_,i)=>{
  const slot={target:new Float32Array(BYTES/4),pending:false,generation:0,serial:0,time:0,x:0,z:0,dx:1,dz:0,patchVersion:0,done:null,failed:null};
  slot.done=()=>{
   slot.pending=false;
   if(disposed||slot.generation!==generation||slot.serial<=published)return;
   if(!shelterSnapshotCurrent(self,slot)||slot.patchVersion!==ground.installs){self.droppedReads++;return;}
   const started=performance.now(),qx=ground.qx,qz=ground.qz,h=ground.h;
   for(let z=0;z<N;z++)for(let x=0;x<N;x++){
    const k=z*N+x;ground.qx=slot.x+x*STEP;ground.qz=slot.z+z*STEP;
    const covered=ground._from(ground.f)||ground._from(ground.c);
    valid[k]=covered&&slot.target[k*2+1]>.5?1:0;heights[k]=ground.h+slot.target[k*2];
   }
   ground.qx=qx;ground.qz=qz;ground.h=h;
   field.gridX=slot.x;field.gridZ=slot.z;field.dx=slot.dx;field.dz=slot.dz;field.time=slot.time;field.rebuild();published=slot.serial;self.reads++;self.lastBuildMs=performance.now()-started;self.maxBuildMs=Math.max(self.maxBuildMs,self.lastBuildMs);
  };
  slot.failed=()=>{slot.pending=false;self.errors++;};pool.slots[i].target=slot.target;pool.slots[i].done=slot.done;pool.slots[i].failed=slot.failed;return slot;
 });
 const self={field,on:true,enabled:false,ready:false,lastBuildMs:0,maxBuildMs:0,px:0,pz:0,time:0,dx:1,dz:0,reads:0,errors:0,droppedReads:0,
  reset(){generation++;field.enabled=false;field.time=-Infinity;last=-Infinity;},
  validate(){
   if(disposed)return;
   if(!this.enabled){if(wasOn||field.enabled)this.reset();wasOn=false;return;}wasOn=true;
   if(field.enabled&&(Math.abs(this.px-field.originX-16)>12||Math.abs(this.pz-field.originZ-16)>12||this.time<field.time||this.time-field.time>.75||field.dx*this.dx+field.dz*this.dz<.98))this.reset();
  },
  update(){
   if(disposed)return;
   this.validate();
   if(!this.ready){jobData[2]=0;job.update(jobData);this.ready=cs.dispatch(1,1,1);return;}
   if(!this.enabled)return;
   const wall=performance.now()*.001;if(wall-last<.2)return;
   let slot=null,index=-1;for(let i=0;i<slots.length;i++)if(!slots[i].pending){slot=slots[i];index=i;break;}if(!slot)return;
   const x=Math.floor(this.px/STEP)*STEP-32,z=Math.floor(this.pz/STEP)*STEP-32;
   jobData[0]=Math.round(x*FINE_PER_M);jobData[1]=Math.round(z*FINE_PER_M);jobData[2]=1;job.update(jobData);
   if(!cs.dispatch(17,17,1))return;
   slot.pending=true;slot.generation=generation;slot.serial=++serial;slot.time=this.time;slot.x=x;slot.z=z;slot.dx=this.dx;slot.dz=this.dz;slot.patchVersion=ground.installs;last=wall;
   if(!pool.copy(index,output.getBuffer().underlyingResource))slot.failed();
  },
  dispose(){if(disposed)return;disposed=true;this.enabled=false;this.reset();pool.dispose();job.dispose();output.dispose();engine.onDisposeObservable.remove(onDispose);},
 };
 const onDispose=engine.onDisposeObservable.add(()=>self.dispose());
 return self;
}
