// Owner of the Veiled's GPU cloth (character/wraith/clothGpu.js, shaders/clothSolve.wgsl.js): the
// shared topology, the per-slot state and the shared output every Veiled's cloth, fur and shadow
// materials read (their particle ids are offset by slot × N, baked into their meshes). Each frame
// the figures that ran write a job; one dispatch steps them all.

import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { ComputeShader } from '@babylonjs/core/Compute/computeShader.js';
import { buildClothTopology, writeGpuJob, newGpuFigure, JOB_FLOATS } from '../character/wraith/clothGpu.js';
import { clothSolveWGSL } from '../shaders/clothSolve.wgsl.js';

/**
 * @param {any} engine
 * @param {import('../character/wraith/wraith.js').Wraith} template  a built Wraith (the topology)
 * @param {number} capacity  most Veiled at once
 */
export function createClothGpu(engine, template, capacity = 64) {
  const topo = buildClothTopology(template);
  const N = topo.N, NP = topo.nPins;
  const part = new StorageBuffer(engine, topo.part.byteLength, undefined, 'veiled-cloth-part'); part.update(topo.part);
  const cons = new StorageBuffer(engine, topo.cons.byteLength, undefined, 'veiled-cloth-cons'); cons.update(topo.cons);
  const rangesData = new Uint32Array(Math.ceil(topo.ranges.length / 4) * 4); rangesData.set(topo.ranges);
  const ranges = new StorageBuffer(engine, rangesData.byteLength, undefined, 'veiled-cloth-ranges'); ranges.update(rangesData);
  const jobsData = new Float32Array(capacity * JOB_FLOATS);
  const jobs = new StorageBuffer(engine, jobsData.byteLength, undefined, 'veiled-cloth-jobs');
  const pinsData = new Float32Array(capacity * NP * 4);
  const pins = new StorageBuffer(engine, pinsData.byteLength, undefined, 'veiled-cloth-pins');
  const stateBytes = N * 8 * 4;
  const state = new StorageBuffer(engine, capacity * stateBytes, undefined, 'veiled-cloth-state');
  const out = new StorageBuffer(engine, capacity * stateBytes, undefined, 'veiled-cloth-out');
  const reset = new Float32Array(N * 8);
  const names = ['part', 'cons', 'ranges', 'jobs', 'pins', 'state', 'outv'], mapping = {};
  names.forEach((n, i) => { mapping[n] = { group: 0, binding: i }; });
  const cs = new ComputeShader('clothSolve', engine, { computeSource: clothSolveWGSL(topo) }, { bindingsMapping: mapping });
  cs.setStorageBuffer('part', part); cs.setStorageBuffer('cons', cons); cs.setStorageBuffer('ranges', ranges);
  cs.setStorageBuffer('jobs', jobs); cs.setStorageBuffer('pins', pins); cs.setStorageBuffer('state', state); cs.setStorageBuffer('outv', out);
  const free = []; for (let i = capacity - 1; i >= 0; i--) free.push(i);
  let k = 0;
  const queued = [];
  const self = {
    topo, N, out, capacity,
    /** Jobs dispatched last frame, and dispatches that failed (the shader not ready yet). */
    lastJobs: 0, misses: 0,
    /** A slot for a new figure (its particle ids in the meshes are offset by slot × N). */
    alloc() {
      if (free.length === 0) { console.warn('clothGpu: no free slot; this figure falls back to the CPU cloth'); return null; }
      return { slot: free.pop(), fig: newGpuFigure() };
    },
    release(h) { free.push(h.slot); },
    /** After the figure's `wraith.update()` (gpu mode): queue its step this frame. */
    add(w, h, xf) {
      if (k >= capacity) return;
      if (writeGpuJob(w, h.fig, topo, h.slot, jobsData, k, pinsData, reset, xf)) state.update(reset, h.slot * stateBytes, stateBytes);
      queued[k++] = h;
    },
    /** One dispatch for every queued figure. */
    dispatch() {
      self.lastJobs = k;
      if (k === 0) return;
      jobs.update(jobsData, 0, k * JOB_FLOATS * 4);
      pins.update(pinsData, 0, k * NP * 16);
      // Not run (the pipeline is still compiling): the origins moved without the state, so start those figures again from rest.
      if (!cs.dispatch(k, 1, 1)) { self.misses++; for (let i = 0; i < k; i++) queued[i].fig.reset = true; }
      k = 0;
    },
  };
  return self;
}
