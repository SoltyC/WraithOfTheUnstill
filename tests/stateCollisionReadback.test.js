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
beforeEach(()=>{pending.length=0;});
describe('collision readback ownership',()=>{
  it('keeps the submitted centre/time while owner inputs move during a pending read',async()=>{
    const c=start(),read=pending[0];read.target[1]=.75;read.target[2]=1;
    c.px=40;c.pz=80;c.time=2;c.dirty=true;c.update();expect(pending).toHaveLength(1);
    read.resolve(read.target);await finish();
    expect(c.reads).toBe(1);expect(c.view.x0).toBe(-12);expect(c.view.z0).toBe(-8);expect(c.view.sampleTime).toBe(1);expect(c.view.maxRelief).toBe(.75);
    c.update();expect(pending).toHaveLength(2);expect(pending[1].target).not.toBe(read.target);
  });
  it('discards a pre-reset reply and installs only a fresh generation',async()=>{
    const c=start(),old=pending[0];c.reset();c.px=20;c.time=3;c.update();expect(pending).toHaveLength(1);
    old.resolve(old.target);await finish();expect(c.view.data).toBeNull();expect(c.reads).toBe(0);
    c.update();const fresh=pending[1];fresh.resolve(fresh.target);await finish();expect(c.reads).toBe(1);expect(c.view.x0).toBe(4);expect(c.view.sampleTime).toBe(3);
  });
  it('recovers from a failed read and reuses the first buffer after two successful reads',async()=>{
    const c=start(),first=pending[0].target;pending[0].reject(new Error('readback failed'));await finish();expect(c.errors).toBe(1);expect(c.dirty).toBe(true);expect(c.pending).toBe(false);
    c.time=2;c.update();pending[1].resolve(pending[1].target);await finish();
    c.dirty=true;c.time=3;c.update();expect(pending[2].target).toBe(first);pending[2].resolve(first);await finish();expect(c.reads).toBe(2);
  });
});
