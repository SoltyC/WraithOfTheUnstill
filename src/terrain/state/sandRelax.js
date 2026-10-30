// GPU owner for the bounded D2 prototype. Warm real scratch work, with terrain stores disabled.
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { ComputeShader } from '@babylonjs/core/Compute/computeShader.js';
import { createRelaxationQueue, RELAX_TILE, RELAX_ITERATIONS, RELAX_RATE } from './relaxation.js';
import { FINE_N } from './layout.js';
import { sandRelaxLoadWGSL, sandRelaxABWGSL, sandRelaxBAWGSL, sandRelaxStoreWGSL, sandRelax4ABWGSL, sandRelax4BAWGSL } from '../../shaders/sandRelax.wgsl.js';
export function createSandRelax(engine, fine, surface, clipmap) {
  const queue = createRelaxationQueue();
  const data = new Int32Array(8), job = new StorageBuffer(engine, data.byteLength, undefined, 'sand-relax-job');
  job.update(data);
  const a = new StorageBuffer(engine, RELAX_TILE * RELAX_TILE * 16, undefined, 'sand-relax-a');
  const b = new StorageBuffer(engine, RELAX_TILE * RELAX_TILE * 16, undefined, 'sand-relax-b');
  const activityData = new Uint32Array(queue.capacity);
  const activity = new StorageBuffer(engine, activityData.byteLength, undefined, 'sand-relax-activity');
  activity.update(activityData);
  const bindings = { fine0: fine[0], fine1: fine[1], surface, job, a, b, levels: clipmap.levelData, cp: clipmap.params, fine2: fine[2], activity };
  const names = Object.keys(bindings), mapping = {};
  names.forEach((n,i) => { mapping[n] = { group: 0, binding: i }; });
  const used = [['fine0','fine1','surface','job','a','levels','cp','fine2'], ['job','a','b'], ['job','a','b'], ['fine0','job','a','fine2','activity'], ['job','a','b'], ['job','a','b']];
  const passes = [sandRelaxLoadWGSL, sandRelaxABWGSL, sandRelaxBAWGSL, sandRelaxStoreWGSL, sandRelax4ABWGSL, sandRelax4BAWGSL].map((code,i) => {
    const cs = new ComputeShader('sandRelax' + i, engine, { computeSource: code }, { bindingsMapping: mapping });
    for (const n of used[i]) cs.setStorageBuffer(n,bindings[n]);
    return cs;
  });
  const warmed = new Uint8Array(passes.length);
  let ready = false;
  let activityPending = false, lastActivity = -Infinity, activityErrors = 0;
  function retireEmpty() {
    for (let i = 0; i < activityData.length; i++) {
      const tag = activityData[i];
      if ((tag & 3) === 1) queue.retire(i,tag >>> 2);
    }
    activityPending = false;
  }
  function retryActivity() { activityErrors++; activityPending = false; lastActivity = -Infinity; }
  return { queue, rate: RELAX_RATE, enabled: false, jobs: 0, iterations: RELAX_ITERATIONS, originX: 0, originZ: 0, time: 0.5,
    get ready() { return ready; },
    get activityErrors() { return activityErrors; },
    // Diagnostics allocate/read back only when explicitly requested by the bot.
    async debugRead() { return a.read(); },
    debugIterate(iterations = 4) {
      const groups = RELAX_TILE / 8;
      for (let i = 0; i < iterations / 2; i++) { passes[1].dispatch(groups,groups,1); passes[2].dispatch(groups,groups,1); }
    },
    update(allowWork = true) {
      const x = this.originX, z = this.originZ;
      queue.now = this.time;
      if (!ready) {
        data[0] = x; data[1] = z; data[2] = x; data[3] = z;
        data[4] = 1; data[5] = 0; data[6] = 0; data[7] = 1; job.update(data);
        ready = true;
        for (let i = 0; i < passes.length; i++) {
          const groups = RELAX_TILE / (i >= 4 ? 16 : 8);
          if (!warmed[i] && passes[i].dispatch(groups,groups,1)) warmed[i] = 1;
          ready = ready && warmed[i] === 1;
        }
        return;
      }
      if (!allowWork || !this.enabled) return;
      queue.wake(x + FINE_N / 2, z + FINE_N / 2);
      if (!queue.take(x,z,x + FINE_N,z + FINE_N)) return;
      data[0] = queue.x; data[1] = queue.z; data[2] = x; data[3] = z; data[4] = 1;
      data[5] = queue.slot; data[6] = queue.generation; data[7] = 0;
      job.update(data);
      const groups = RELAX_TILE / 8;
      if (!passes[0].dispatch(groups,groups,1)) return;
      let remaining = Math.max(0, Math.floor(this.iterations / 2) * 2);
      for (; remaining >= 8; remaining -= 8) {
        if (!passes[4].dispatch(RELAX_TILE / 16,RELAX_TILE / 16,1)) return;
        if (!passes[5].dispatch(RELAX_TILE / 16,RELAX_TILE / 16,1)) return;
      }
      for (let i = 0; i < remaining / 2; i++) {
        if (!passes[1].dispatch(groups,groups,1)) return;
        if (!passes[2].dispatch(groups,groups,1)) return;
      }
      if (passes[3].dispatch(groups,groups,1)) {
        this.jobs++;
        if (!activityPending && this.time - lastActivity >= 0.25) {
          activityPending = true; lastActivity = this.time;
          activity.read(0,activityData.byteLength,activityData).then(retireEmpty,retryActivity);
        }
      }
    },
  };
}
