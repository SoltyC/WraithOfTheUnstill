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
    /** @type {System[]} Run after render (overlay, input frame end). */
    this.late = [];
    this.last = 0;
    this.scratchLeaks = 0;
    this._frame = this._frame.bind(this);
  }

  /** @param {System} s */
  add(s) { this.systems.push(s); return s; }
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
    clock.realDt = (now - this.last) * 0.001;
    this.last = now;
    advanceClock();
    const sys = this.systems;
    for (let i = 0; i < sys.length; i++) if (sys[i].enabled !== false) sys[i].update();
    this.scene.render();
    endGpuFrame();
    const late = this.late;
    for (let i = 0; i < late.length; i++) if (late[i].enabled !== false) late[i].update();
    this.scratchLeaks += scratchFrameReset();
  }
}
