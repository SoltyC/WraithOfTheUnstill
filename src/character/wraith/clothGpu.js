// The Veiled's cloth on the GPU (docs/direction.md M0): the CPU still runs each figure's gait,
// body, colliders and pinned particles (cheap); the free cloth (integrate, constraints, tethers,
// colliders, ground) and the packing for the renderer run in one compute dispatch for every
// figure (shaders/clothSolve.wgsl.js). On the CPU each background figure cost ~0.5 ms a step, so
// only three could step a frame and their robes crawled (a 1/40 s step after up to 0.35 s
// unseen). Here every shown figure steps every frame at full quality.
//
// This file is pure (no engine): the shared topology every Veiled has (they are all built by the
// same garments), and the per-frame job a figure writes. Positions go to the GPU relative to a
// per-figure origin (f32 has ~0.5 mm at 4 km; a step moves a particle a few mm).

import { GARMENT } from './garments.js';

/** Floats in one job (48 vec4). Layout matches shaders/clothSolve.wgsl.js. */
export const JOB_FLOATS = 48 * 4;
/** Ground heights per job: a GN × GN grid round the body, GSTEP apart (simulation metres). */
export const GN = 5, GSTEP = 0.6;
export const MAX_COLLIDERS = 15;
/** Most substeps a frame (the player's maxSteps), and settling steps after a teleport per frame. */
export const MAX_STEPS = 4, SETTLE_PER_FRAME = 24;
const SUB = 1 / 120;
/** Floats per particle in the static table (16: see the shader's struct Part). */
export const PART_FLOATS = 16;
const MANTLE_HEM = 0.16;

/**
 * Static topology from one built Wraith (all Veiled share it).
 * @param {import('./wraith.js').Wraith} w
 */
export function buildClothTopology(w) {
  const c = w.cloth, N = c.n;
  // Constraints grouped by a greedy colouring: no particle twice in a colour, so a colour solves in parallel.
  const colorOf = new Int32Array(c.c);
  const seen = Array.from({ length: N }, () => 0n);
  let colors = 0;
  for (let k = 0; k < c.c; k++) {
    const a = c.ci[2 * k], b = c.ci[2 * k + 1], m = seen[a] | seen[b];
    let col = 0; while ((m >> BigInt(col)) & 1n) col++;
    colorOf[k] = col; seen[a] |= 1n << BigInt(col); seen[b] |= 1n << BigInt(col);
    if (col + 1 > colors) colors = col + 1;
  }
  const ranges = new Uint32Array(colors + 1);
  for (let k = 0; k < c.c; k++) ranges[colorOf[k] + 1]++;
  for (let i = 0; i < colors; i++) ranges[i + 1] += ranges[i];
  // Keep the original order inside each colour (closest to the CPU's sweep).
  const fill = ranges.slice(0, colors);
  const cons = new Float32Array(c.c * 4), consU = new Uint32Array(cons.buffer);
  for (let k = 0; k < c.c; k++) {
    const o = fill[colorOf[k]]++ * 4;
    consU[o] = c.ci[2 * k]; consU[o + 1] = c.ci[2 * k + 1]; cons[o + 2] = c.cr[k]; cons[o + 3] = c.ck[k];
  }
  // Pinned particles (inverse mass 0): their positions come from the CPU every frame.
  const pinIndex = new Int32Array(N).fill(-1), pins = [];
  for (let i = 0; i < N; i++) if (c.w[i] === 0) { pinIndex[i] = pins.length; pins.push(i); }
  // Tethers: at most one per particle, anchored on pinned particles (checked: the solver relies on it).
  const tetherA = new Int32Array(N).fill(-1), tetherL = new Float32Array(N);
  for (let k = 0; k < c.t; k++) {
    const i = c.ti[2 * k], a = c.ti[2 * k + 1];
    if (tetherA[i] !== -1 || c.w[a] !== 0) throw new Error('clothGpu: a tether the parallel solver cannot keep');
    tetherA[i] = a; tetherL[i] = c.tl[k];
  }
  // Per particle: the static table (see the shader).
  const part = new Float32Array(N * PART_FLOATS), partU = new Uint32Array(part.buffer), partI = new Int32Array(part.buffer);
  for (const g of w.garments) {
    const { rows, cols, wrap, start, flip } = g;
    for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
      const i = start + r * cols + col, o = i * PART_FLOATS;
      const cl = wrap ? (col - 1 + cols) % cols : Math.max(col - 1, 0), cr = wrap ? (col + 1) % cols : Math.min(col + 1, cols - 1);
      const ru = Math.max(r - 1, 0), rd = Math.min(r + 1, rows - 1);
      part[o] = c.w[i];
      partU[o + 1] = c.ground[i];
      partU[o + 2] = c.mask[i];
      partU[o + 3] = g.id;
      part[o + 4] = flip;
      part[o + 5] = g.id === GARMENT.COWL ? 0.15 : g.id >= GARMENT.HAND_L && g.id <= GARMENT.BELT ? 0 : r / (rows - 1);
      part[o + 6] = g.id === GARMENT.ROBE ? MANTLE_HEM : g.id === GARMENT.MANTLE ? 0.44 : -1e9;  // layer top (none: -1e9)
      partI[o + 7] = tetherA[i];
      part[o + 8] = tetherL[i];
      partU[o + 9] = start + r * cols + cr; partU[o + 10] = start + r * cols + cl;
      partU[o + 11] = start + rd * cols + col; partU[o + 12] = start + ru * cols + col;
      partI[o + 13] = pinIndex[i];
    }
  }
  return { N, colors, ranges, cons, nCons: c.c, part, pins: new Int32Array(pins), nPins: pins.length };
}

/**
 * A figure's GPU cloth state on the CPU side: its origin and the last substep (for time-corrected Verlet).
 */
export function newGpuFigure() {
  return { ox: 0, oy: 0, oz: 0, has: false, lastSub: SUB, reset: true, settle: 0 };
}

/**
 * After `w.update()` in GPU mode: write this figure's job (index k) and pinned positions, and, after a
 * teleport, its whole rest pose into `reset` (returns true when the reset array was written).
 * @param {any} w  the Wraith (gpu mode: its cloth arrays hold the pins and, after a teleport, the rest pose)
 * @param {any} fig  newGpuFigure()
 * @param {any} topo  buildClothTopology()
 * @param {number} slot  the figure's slot in the state and output buffers
 * @param {Float32Array} jobs  all jobs
 * @param {number} k  this job's index
 * @param {Float32Array} pinsOut  all jobs' pins (topo.nPins vec4 per job)
 * @param {Float32Array} reset  one figure's state (N × 2 vec4), written on a teleport
 * @param {{ ox: number, oy: number, oz: number, s: number } | null} xf  simulation → world similarity
 */
export function writeGpuJob(w, fig, topo, slot, jobs, k, pinsOut, reset, xf) {
  const c = w.cloth, p = c.p, b = w.body;
  // Origin: the body, whole centimetres (a stable frame; the shift is exact enough in f32).
  const nx = Math.round(b.px * 100) / 100, ny = Math.round(b.py * 100) / 100, nz = Math.round(b.pz * 100) / 100;
  const sx = fig.has ? fig.ox - nx : 0, sy = fig.has ? fig.oy - ny : 0, sz = fig.has ? fig.oz - nz : 0;
  fig.ox = nx; fig.oy = ny; fig.oz = nz; fig.has = true;
  let didReset = false;
  // A reset asked by the owner (a dispatch that did not run): re-drape from rest where the body is now.
  if (fig.reset && !w.gpuTeleported) w.teleport();
  if (w.gpuTeleported || fig.reset) {
    // The whole cloth from its rest pose (teleport placed every particle at rest on the CPU arrays).
    for (let i = 0; i < topo.N; i++) {
      const o = i * 8, pi = i * 3;
      reset[o] = p[pi] - nx; reset[o + 1] = p[pi + 1] - ny; reset[o + 2] = p[pi + 2] - nz; reset[o + 3] = 0;
      reset[o + 4] = reset[o]; reset[o + 5] = reset[o + 1]; reset[o + 6] = reset[o + 2]; reset[o + 7] = 0;
    }
    w.gpuTeleported = false; fig.reset = false; fig.settle = w.settleLeft; w.settleLeft = 0; fig.lastSub = SUB;
    didReset = true;
  }
  // Substeps: cover the frame's time (not a fixed 1/120 s: at 90 fps that ran the cloth at 3/4 speed).
  const dt = Math.max(1e-4, w.dt);
  let steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(dt / SUB - 0.01)));
  let sub = Math.min(dt / steps, 1 / 40);
  if (fig.settle > 0) { const s = Math.min(SETTLE_PER_FRAME, fig.settle); fig.settle -= s; steps += s; sub = SUB; }
  const ratio = sub / fig.lastSub; fig.lastSub = sub;
  const J = k * JOB_FLOATS;
  jobs[J] = slot; jobs[J + 1] = steps; jobs[J + 2] = c.iterations; jobs[J + 3] = sub;
  jobs[J + 4] = didReset ? 0 : sx; jobs[J + 5] = didReset ? 0 : sy; jobs[J + 6] = didReset ? 0 : sz; jobs[J + 7] = didReset ? 1 : Math.min(2, Math.max(0.5, ratio));
  jobs[J + 8] = c.frameVX; jobs[J + 9] = c.frameVY; jobs[J + 10] = c.frameVZ; jobs[J + 11] = c.damping;
  const ci = 1 - c.inertia;
  jobs[J + 12] = (c.frameVX - w.gpuPrevVX) * ci; jobs[J + 13] = (c.frameVY - w.gpuPrevVY) * ci; jobs[J + 14] = (c.frameVZ - w.gpuPrevVZ) * ci; jobs[J + 15] = c.airDrag;
  jobs[J + 16] = c.windX; jobs[J + 17] = c.windY - c.gravity; jobs[J + 18] = c.windZ; jobs[J + 19] = c.maxSpeed;
  jobs[J + 20] = c.colN; jobs[J + 21] = c.flatMask; jobs[J + 22] = 0; jobs[J + 23] = 0;
  for (let q = 0; q < MAX_COLLIDERS; q++) {
    const o = J + 24 + q * 8, s = q * 7, col = c.col;
    if (q < c.colN) {
      jobs[o] = col[s] - nx; jobs[o + 1] = col[s + 1] - ny; jobs[o + 2] = col[s + 2] - nz; jobs[o + 3] = col[s + 6];
      jobs[o + 4] = col[s + 3] - nx; jobs[o + 5] = col[s + 4] - ny; jobs[o + 6] = col[s + 5] - nz; jobs[o + 7] = c.colK[q];
    } else { for (let e = 0; e < 8; e++) jobs[o + e] = 0; }
  }
  // Ground: a small grid of heights round the body (the hem's ground query, sampled once a frame).
  const G = J + 24 + MAX_COLLIDERS * 8, gq = c.groundQuery, half = (GN - 1) * 0.5 * GSTEP;
  jobs[G] = -half; jobs[G + 1] = -half; jobs[G + 2] = GSTEP; jobs[G + 3] = gq ? 1 : 0;
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
    let h = -1e6;
    if (gq) { gq.qx = nx - half + i * GSTEP; gq.qz = nz - half + j * GSTEP; gq.sample(); h = gq.h - ny; }
    jobs[G + 4 + j * GN + i] = h;
  }
  const B = G + 4 + 28;   // 25 heights in 7 vec4
  jobs[B] = b.px - nx; jobs[B + 1] = b.py - ny; jobs[B + 2] = b.pz - nz; jobs[B + 3] = 0;
  jobs[B + 4] = b.u[0]; jobs[B + 5] = b.u[1]; jobs[B + 6] = b.u[2]; jobs[B + 7] = 0;
  // Output: world = xf.o + (origin + local − xf.o)·s.
  const s = xf ? xf.s : 1;
  jobs[B + 8] = xf ? xf.ox + (nx - xf.ox) * s : nx; jobs[B + 9] = xf ? xf.oy + (ny - xf.oy) * s : ny; jobs[B + 10] = xf ? xf.oz + (nz - xf.oz) * s : nz; jobs[B + 11] = s;
  // Pinned positions, relative to the origin.
  const pins = topo.pins, P = k * topo.nPins * 4;
  for (let e = 0; e < pins.length; e++) {
    const pi = pins[e] * 3, o = P + e * 4;
    pinsOut[o] = p[pi] - nx; pinsOut[o + 1] = p[pi + 1] - ny; pinsOut[o + 2] = p[pi + 2] - nz; pinsOut[o + 3] = 0;
  }
  w.gpuPrevVX = c.frameVX; w.gpuPrevVY = c.frameVY; w.gpuPrevVZ = c.frameVZ;
  return didReset;
}
