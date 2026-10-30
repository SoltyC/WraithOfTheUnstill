// Allocation check for the Long Walker (Phase 9 D10): its body, gait and chunk writes while it walks
// and turns, the stumble → kneel → rise cycle with its ramp boxes, and a capsule riding its deck
// (carry, floors, walls). Node's V8, warm; zero young-gen GCs and ~0 heap growth = allocation-free.
//   node --expose-gc tools/alloc/walker.mjs
import v8 from 'node:v8';
import { PerformanceObserver } from 'node:perf_hooks';
import { createWalker, WK, MODE } from '../../src/game/walker/walker.js';
import { createDeck } from '../../src/game/walker/deck.js';
import { CapsuleController } from '../../src/character/capsuleController.js';

let gcs = 0;
new PerformanceObserver((list) => { gcs += list.getEntries().length; }).observe({ entryTypes: ['gc'] });
const ground = { qx: 0.5, qz: 0.5, h: 0.5, nx: 0.5, ny: 0.5, nz: 0.5,
  sample() { this.h = 2 * Math.sin(this.qx * 0.01) + 1.5 * Math.cos(this.qz * 0.013); },
  sampleNormal() { this.sample(); this.nx = 0.5 - 0.5; this.ny = 1.5 - 0.5; this.nz = 0.5 - 0.5; },
  covers() { return true; } };
const clockDt = { dt: 1 / 60 };
const w = createWalker({ ground }), deck = createDeck(w); deck.on = true;
w.setWell(4000, 0, 4000, 0.5);
w.placeWalking(0, 0, 0); w.circuitX = 0; w.circuitZ = 1e6;
const ctl = new CapsuleController(ground); ctl.deck = deck;
const out = [0, 0, 0];
w.toWorld(3, 0, 1, out); ctl.teleport(out[0], out[2], out[1]); deck.riding = true;
const sink = new Float64Array(1);
const cases = {
  'walker.update (walking, turning)': (i) => {
    if ((i % 600) === 0) { w.mode = MODE.STEER; w.targetYaw = ((i / 600) % 2) ? 0.8 : -0.8; }
    w.dt = clockDt.dt; w.update(); sink[0] = w.chunks[i % w.chunks.length];
  },
  'walker.update (stumble, kneel, rise)': (i) => {
    if (w.state === WK.WALK && (i % 1500) === 0) { w._immune = 0; w.stumble(i % 6); }
    w.dt = clockDt.dt; w.update(); sink[0] = w.y;
  },
  'controller riding the deck': (i) => {
    w.dt = clockDt.dt; w.update();
    ctl.wishX = (i & 128) ? 0.4 : -0.4; ctl.wishZ = (i & 256) ? 0.3 : -0.3; ctl.cameraYaw = w.yaw; ctl.dt = clockDt.dt; ctl.update();
    sink[0] = ctl.pos.y;
  },
};
const reports = [];
for (const [name, run] of Object.entries(cases)) {
  for (let i = 0; i < 20000; i++) run(i);
  global.gc(); await new Promise((r) => setTimeout(r, 30));
  const gc0 = gcs, heap = v8.getHeapStatistics().used_heap_size;
  for (let i = 0; i < 60000; i++) run(i);
  await new Promise((r) => setTimeout(r, 30));
  const report = { name, frames: 60000, gcs: gcs - gc0, heapGrowth: v8.getHeapStatistics().used_heap_size - heap };
  reports.push(report); console.log(report);
}
console.log('riding at the end:', deck.riding, 'state', w.state);
if (reports.some((r) => r.gcs > 0)) process.exitCode = 1;
