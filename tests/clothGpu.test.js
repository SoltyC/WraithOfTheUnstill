import { describe, it, expect } from 'vitest';
import { Wraith } from '../src/character/wraith/wraith.js';
import { buildClothTopology, writeGpuJob, newGpuFigure, JOB_FLOATS, PART_FLOATS } from '../src/character/wraith/clothGpu.js';

const flat = () => ({ qx: 0, qz: 0, h: 0, sample() { this.h = 0; } });

describe('Veiled cloth on the GPU: topology', () => {
  const w = new Wraith(flat());
  const topo = buildClothTopology(w);
  it('colours constraints so no particle appears twice in a colour', () => {
    const cu = new Uint32Array(topo.cons.buffer);
    for (let c = 0; c < topo.colors; c++) {
      const seen = new Set();
      for (let k = topo.ranges[c]; k < topo.ranges[c + 1]; k++) {
        const a = cu[k * 4], b = cu[k * 4 + 1];
        expect(seen.has(a) || seen.has(b)).toBe(false);
        seen.add(a); seen.add(b);
      }
    }
    expect(topo.ranges[topo.colors]).toBe(w.cloth.c);
  });
  it('anchors every tether on a pinned particle and indexes every pin', () => {
    const p = new Int32Array(topo.part.buffer);
    for (let i = 0; i < topo.N; i++) {
      const o = i * PART_FLOATS, a = p[o + 7];
      if (a >= 0) expect(w.cloth.w[a]).toBe(0);
      if (w.cloth.w[i] === 0) expect(topo.pins[p[o + 13]]).toBe(i);
    }
  });
});

describe('Veiled cloth on the GPU: the job', () => {
  it('covers the frame with substeps, resets after a teleport, then shifts with the origin', () => {
    const tmpl = new Wraith(flat()), topo = buildClothTopology(tmpl);
    const w = new Wraith(flat()); w.gpu = true;
    const fig = newGpuFigure(), jobs = new Float32Array(JOB_FLOATS), pins = new Float32Array(topo.nPins * 4), reset = new Float32Array(topo.N * 8);
    w.bx = 1000; w.by = 0; w.bz = 2000; w.dt = 1 / 90; w.update();
    expect(writeGpuJob(w, fig, topo, 5, jobs, 0, pins, reset, null)).toBe(true);
    expect(jobs[0]).toBe(5);
    // Rest pose round the origin (the body), not at world scale.
    expect(Math.abs(reset[0])).toBeLessThan(3);
    // Next frame: no reset; substeps × substep = the frame (90 fps), the shift is the origin's move.
    w.bx = 1000.05; w.dt = 1 / 90; w.update();
    expect(writeGpuJob(w, fig, topo, 5, jobs, 0, pins, reset, null)).toBe(false);
    const steps = jobs[1], sub = jobs[3];
    // (The settling steps after the teleport use 1/120 s; skip until they are spent.)
    for (let f = 0; f < 10 && fig.settle > 0; f++) { w.dt = 1 / 90; w.update(); writeGpuJob(w, fig, topo, 5, jobs, 0, pins, reset, null); }
    w.dt = 1 / 90; w.update(); writeGpuJob(w, fig, topo, 5, jobs, 0, pins, reset, null);
    expect(jobs[1] * jobs[3]).toBeCloseTo(1 / 90, 6);
    expect(steps).toBeGreaterThan(0); expect(sub).toBeGreaterThan(0);
    // Pins are origin-relative.
    for (let e = 0; e < topo.nPins; e++) expect(Math.abs(pins[e * 4]) + Math.abs(pins[e * 4 + 2])).toBeLessThan(3);
  });
});
