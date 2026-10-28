import { describe, it, expect, vi, beforeEach } from 'vitest';
const pending=vi.hoisted(()=>[]);
vi.mock('@babylonjs/core/Buffers/storageBuffer.js',()=>({StorageBuffer:class{
  update(){}
  read(offset,bytes,target){return new Promise((resolve,reject)=>pending.push({target,resolve,reject}));}
}}));
vi.mock('@babylonjs/core/Compute/computeShader.js',()=>({ComputeShader:class{setStorageBuffer(){}dispatch(){return true;}}}));
import { createStateCollision } from '../src/terrain/state/stateCollision.js';
function start(){const c=createStateCollision({},[{},{},{}],{});c.update();c.enabled=true;c.dirty=true;c.px=4;c.pz=8;c.time=1;c.update();return c;}
const finish=async()=>{await Promise.resolve();await Promise.resolve();};
const submit=(c,time,x=4)=>{c.time=time;c.px=x;c.dirty=true;c.update();};
beforeEach(()=>{pending.length=0;});
describe('pipelined collision readback ownership',()=>{
  it('keeps each submitted centre/time while owner inputs move',async()=>{
    const c=start(),first=pending[0];first.target[1]=.75;first.target[2]=1;
    submit(c,1.05,40);expect(pending).toHaveLength(2);expect(c.pendingCount).toBe(2);
    first.resolve(first.target);await finish();
    expect(c.reads).toBe(1);expect(c.view.x0).toBe(-12);expect(c.view.z0).toBe(-8);expect(c.view.sampleTime).toBe(1);expect(c.view.maxRelief).toBe(.75);
    pending[1].resolve(pending[1].target);await finish();expect(c.view.x0).toBe(24);expect(c.view.sampleTime).toBe(1.05);expect(c.pending).toBe(false);
  });
  it('rejects old-generation replies while a post-reset read is in flight',async()=>{
    const c=start(),old=pending[0];c.reset();submit(c,3,20);expect(pending).toHaveLength(2);
    old.resolve(old.target);await finish();expect(c.view.data).toBeNull();expect(c.reads).toBe(0);
    pending[1].resolve(pending[1].target);await finish();expect(c.reads).toBe(1);expect(c.view.x0).toBe(4);expect(c.view.sampleTime).toBe(3);
  });
  it('never lets an older reply replace a newer snapshot',async()=>{
    const c=start();submit(c,1.05,20);const newer=pending[1];newer.resolve(newer.target);await finish();
    const installed=c.view.data;pending[0].resolve(pending[0].target);await finish();
    expect(c.view.data).toBe(installed);expect(c.view.sampleTime).toBe(1.05);expect(c.reads).toBe(1);expect(c.pendingCount).toBe(0);
  });
  it('bounds in-flight work and never writes into the displayed array',async()=>{
    const c=start();pending[0].resolve(pending[0].target);await finish();const displayed=c.view.data;
    for(let i=1;i<=8;i++)submit(c,1+i*.05,4+i);
    expect(c.pendingCount).toBe(3);expect(pending).toHaveLength(4);
    for(const read of pending.slice(1))expect(read.target).not.toBe(displayed);
    expect(new Set(pending.map(r=>r.target)).size).toBe(4);
  });
  it('releases failed slots for retry without discarding valid displayed data',async()=>{
    const c=start();pending[0].resolve(pending[0].target);await finish();const displayed=c.view.data;
    submit(c,2);const failed=pending[1];failed.reject(new Error('readback failed'));await finish();
    expect(c.errors).toBe(1);expect(c.dirty).toBe(true);expect(c.pending).toBe(false);expect(c.view.data).toBe(displayed);
    submit(c,3);expect(pending[2].target).toBe(failed.target);expect(pending[2].target).not.toBe(displayed);
    pending[2].resolve(pending[2].target);await finish();expect(c.reads).toBe(2);
  });
});
