// GPU owner for the bounded D2 prototype. All pipelines warm with an inactive job at load.
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { ComputeShader } from '@babylonjs/core/Compute/computeShader.js';
import { createRelaxationQueue, RELAX_TILE, RELAX_ITERATIONS } from './relaxation.js';
import { FINE_N } from './layout.js';
import { sandRelaxLoadWGSL, sandRelaxABWGSL, sandRelaxBAWGSL, sandRelaxStoreWGSL } from '../../shaders/sandRelax.wgsl.js';
export function createSandRelax(engine, fine, surface, clipmap) {
  const queue = createRelaxationQueue();
  const data = new Int32Array(8), job = new StorageBuffer(engine, data.byteLength, undefined, 'sand-relax-job');
  job.update(data);
  const a = new StorageBuffer(engine, RELAX_TILE * RELAX_TILE * 16, undefined, 'sand-relax-a');
  const b = new StorageBuffer(engine, RELAX_TILE * RELAX_TILE * 16, undefined, 'sand-relax-b');
  const bindings = { fine0: fine[0], fine1: fine[1], surface, job, a, b, levels: clipmap.levelData, cp: clipmap.params, fine2: fine[2] };
  const names = Object.keys(bindings), mapping = {};
  names.forEach((n,i) => { mapping[n] = { group: 0, binding: i }; });
  const used = [['fine0','fine1','surface','job','a','levels','cp','fine2'], ['job','a','b'], ['job','a','b'], ['fine0','job','a','fine2']];
  const passes = [sandRelaxLoadWGSL, sandRelaxABWGSL, sandRelaxBAWGSL, sandRelaxStoreWGSL].map((code,i) => {
    const cs = new ComputeShader('sandRelax' + i, engine, { computeSource: code }, { bindingsMapping: mapping });
    for (const n of used[i]) cs.setStorageBuffer(n,bindings[n]);
    return cs;
  });
  const warmed = new Uint8Array(4);
  let ready = false;
  return { queue, enabled: false, jobs: 0, iterations: RELAX_ITERATIONS, originX: 0, originZ: 0, time: 0.5,
    get ready() { return ready; },
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
        data[4] = 0; job.update(data);
        ready = true;
        for (let i = 0; i < 4; i++) {
          if (!warmed[i] && passes[i].dispatch(1,1,1)) warmed[i] = 1;
          ready = ready && warmed[i] === 1;
        }
        return;
      }
      if (!allowWork || !this.enabled || !queue.take(x,z,x + FINE_N,z + FINE_N)) return;
      data[0] = queue.x; data[1] = queue.z; data[2] = x; data[3] = z; data[4] = 1;
      job.update(data);
      const groups = RELAX_TILE / 8;
      if (!passes[0].dispatch(groups,groups,1)) return;
      for (let i = 0; i < Math.max(0, Math.floor(this.iterations / 2)); i++) {
        if (!passes[1].dispatch(groups,groups,1)) return;
        if (!passes[2].dispatch(groups,groups,1)) return;
      }
      if (passes[3].dispatch(groups,groups,1)) this.jobs++;
    },
  };
}
