// The frame loop. Order per frame: clock → input → systems (in registration order) → render →
// end-of-frame bookkeeping. Nothing here allocates.
//
// Systems take no arguments and read `clock.dt`: passing a double to a call V8 does not inline
// boxes it (a 16-byte heap allocation per call), and the loop's calls are megamorphic.

import { advanceClock, clock } from './clock.js';
import { FrameStats } from './frameStats.js';
import { endGpuFrame } from './gpuInstrument.js';
import { scratchFrameReset } from './scratch.js';

/** @typedef {{ name: string, update: () => void, enabled?: boolean }} System */

export const frameStats = new FrameStats();

export class Loop {
  /**
   * @param {import('@babylonjs/core').AbstractEngine} engine
   * @param {import('@babylonjs/core').Scene} scene
   */
  constructor(engine, scene) {
    this.engine = engine;
    this.scene = scene;
    /** @type {System[]} */
    this.systems = [];
    /** Per-system profiler (enableProfiler), or null. */
    this.prof = null;
    /** @type {System[]} Run after render (overlay, input frame end). */
    this.late = [];
    this.last = 0;
    this.scratchLeaks = 0;
    /** CPU ms of this frame's systems and of scene.render + GPU bookkeeping (set before late systems). */
    this.sysMs = 0.5;
    this.renderMs = 0.5;
    /** > 0: every frame advances exactly this many seconds (the bot's film mode: deterministic footage). */
    this.fixedDt = 0;
    this._frame = this._frame.bind(this);
  }

  /** @param {System} s */
  add(s) { this.systems.push(s); return s; }
  /** ?sysprof=1: time every system each frame; on a slow CPU frame (systems + render > limit ms)
   *  note which system took the most. report() → per system: frames it was the worst, its max and
   *  mean ms on those frames, and the render submission's share. Diagnostic only. */
  enableProfiler(limit = 8) {
    const n = 128, cur = new Float64Array(n), all = new Float64Array(n), stats = new Map();
    let slow = 0, renderSlow = 0, frames = 0, renderAll = 0, names = [];
    this.prof = { cur, frame: (sys, sysMs, renderMs) => {
      frames++; renderAll += renderMs; names = sys;
      let w = -1, wm = 0;
      for (let i = 0; i < sys.length; i++) { all[i] += cur[i]; if (cur[i] > wm) { wm = cur[i]; w = i; } }
      if (sysMs + renderMs > limit) {
        slow++;
        if (renderMs > wm) renderSlow++;
        else { const k = sys[w].name, e = stats.get(k) || { frames: 0, max: 0, sum: 0 }; e.frames++; e.max = Math.max(e.max, wm); e.sum += wm; stats.set(k, e); }
      }
      cur.fill(0);
    },
    report: () => ({ frames, slowFrames: slow, renderWorst: renderSlow, renderMeanMs: +(renderAll / Math.max(frames, 1)).toFixed(2),
      meanMs: names.map((sy, i) => ({ system: sy.name, ms: +(all[i] / Math.max(frames, 1)).toFixed(2) })).filter((e) => e.ms >= 0.1).sort((x, y) => y.ms - x.ms),
      worstOnSlow: [...stats].map(([k, e]) => ({ system: k, frames: e.frames, maxMs: +e.max.toFixed(2), meanMs: +(e.sum / e.frames).toFixed(2) })).sort((x, y) => y.frames - x.frames) }) };
  }

  /** @param {System} s */
  addLate(s) { this.late.push(s); return s; }

  start() {
    this.last = performance.now();
    this.engine.runRenderLoop(this._frame);
  }

  _frame() {
    const now = performance.now();
    const fs = frameStats;
    // Inline FrameStats.push and clock input: no double crosses a call boundary.
    fs.ms[fs.head] = now - this.last;
    fs.head = (fs.head + 1) % fs.capacity;
    if (fs.count < fs.capacity) fs.count++;
    clock.realDt = this.fixedDt > 0 ? this.fixedDt : (now - this.last) * 0.001;
    this.last = now;
    advanceClock();
    const sys = this.systems, sp = this.prof;
    if (sp === null) { for (let i = 0; i < sys.length; i++) if (sys[i].enabled !== false) sys[i].update(); }
    else {
      for (let i = 0; i < sys.length; i++) {
        if (sys[i].enabled === false) continue;
        const t0 = performance.now(); sys[i].update(); sp.cur[i] = performance.now() - t0;
      }
    }
    const tSys = performance.now();
    this.scene.render();
    endGpuFrame();
    const tRender = performance.now();
    if (sp !== null) sp.frame(sys, tSys - now, tRender - tSys);
    this.sysMs = tSys - now;
    this.renderMs = tRender - tSys;
    const late = this.late;
    for (let i = 0; i < late.length; i++) if (late[i].enabled !== false) late[i].update();
    this.scratchLeaks += scratchFrameReset();
  }
}
