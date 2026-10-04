// Allocation check for hot CPU paths, run in Node's V8 (same engine family as Chrome).
//   node --trace-gc tools/alloc/alloc-check.mjs
// Each case warms up (so V8 optimises), then runs N iterations between two forced GCs and
// reports heap growth via v8.getHeapStatistics().used_heap_size plus the young-gen scavenge
// count observed through PerformanceObserver. Zero scavenges and ~0 bytes = allocation-free.

import v8 from 'node:v8';
import { PerformanceObserver } from 'node:perf_hooks';
import { PatchGround } from '../../src/world/patchGround.js';
import { CapsuleController } from '../../src/character/capsuleController.js';
import { SpringArmCamera } from '../../src/camera/springArm.js';
import { FrameStats } from '../../src/core/frameStats.js';
import { Pool } from '../../src/core/pool.js';
import { updateEnvironment } from '../../src/render/environment.js';
import { params } from '../../src/core/params.js';
import { clock, advanceClock } from '../../src/core/clock.js';
import { createWeather } from '../../src/world/weather.js';

let gcs = 0;
new PerformanceObserver((list) => { gcs += list.getEntries().length; }).observe({ entryTypes: ['gc'] });

const vec = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } });
const camera = { position: vec(), rotation: vec(), fov: 1 };

// Synthetic rolling patches standing in for worker-computed collision patches.
const ground = new PatchGround();
const mk = (x0, z0, n, step) => {
  const h = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = x0 + i * step, z = z0 + j * step; h[j * n + i] = 3 * Math.sin(x * 0.05) + 2 * Math.cos(z * 0.07); }
  return { x0, z0, n, step, heights: h, version: 1 };
};
ground.install(mk(-128, -128, 129, 2), false);
ground.install(mk(-24, -24, 193, 0.25), true);
const ctl = new CapsuleController(ground);
ctl.teleport(0, 0);
const arm = new SpringArmCamera(camera, ground);
arm.snap(ctl.pos);
const stats = new FrameStats();
const pool = new Pool(() => ({ a: 0 }), 64);

// Results go into a typed array: returning a double from the case lambda would itself box.
const sink = new Float64Array(1);
const weather = createWeather(); weather.restored = 1; weather.dt = 0.0111;
const cases = {
  'ground.sample': (i) => { ground.qx = (i % 1000) * 0.2 - 100; ground.qz = (i % 777) * 0.2 - 70; ground.sample(); sink[0] = ground.h; },
  // dt comes from a mutable field, as in the game (a literal constant would hide boxing).
  // Walk in a wide loop that stays on the fine patch, as a real player does (leaving every
  // patch only happens in this synthetic test and would exercise fallback branches).
  'controller.update (walking)': (i) => { ctl.wishZ = 1; ctl.wishX = (i & 64) ? 0.5 : -0.5; ctl.cameraYaw = i * 0.004; ctl.dt = clock.dt; ctl.update(); if (ctl.pos.x * ctl.pos.x + ctl.pos.z * ctl.pos.z > 300) { ctl.pos.x = 0; ctl.pos.z = 0; } },
  'controller.update (idle)': () => { ctl.wishZ = 0; ctl.wishX = 0; ctl.dt = clock.dt; ctl.update(); },
  'springArm.update': (i) => { arm.look(1, 0.2, 0); arm.dt = clock.dt; arm.update(ctl.pos, ctl.vel, 0, 0, 0, false); },
  'updateEnvironment (time flowing)': (i) => { params.v.timeOfDay = (i % 2400) / 100; params.version++; updateEnvironment(); },
  'updateEnvironment (idle, clock running)': () => { clock.simTime += 0.011; updateEnvironment(); },
  'advanceClock': () => { clock.realDt = 0.0111; advanceClock(); },
  'weather.update (cycling)': () => { weather.dt = 0.9; weather.update(); },
  'frameStats.push': (i) => stats.push(8 + (i & 7)),
  'pool acquire/release': () => { const o = pool.acquire(); pool.release(o); },
};

clock.dt = 1 / 90 + Math.random() * 1e-9; // a heap double, like the real clock
const N = 2_000_000;
let failed = false;
for (const [name, fn] of Object.entries(cases)) {
  for (let i = 0; i < 200_000; i++) fn(i); // warm up and let V8 optimise
  globalThis.gc?.();
  await new Promise((r) => setTimeout(r, 20)); // flush the forced GC's observer entry
  const before = v8.getHeapStatistics().used_heap_size;
  const g0 = gcs;
  for (let i = 0; i < N; i++) fn(i);
  await new Promise((r) => setTimeout(r, 10)); // let gc entries flush
  const grew = v8.getHeapStatistics().used_heap_size - before;
  const scav = gcs - g0;
  const ok = scav === 0 && grew < 64 * 1024;
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(30)} gc events ${String(scav).padStart(4)}  heap delta ${(grew / 1024).toFixed(1)} KB over ${N} calls`);
}
process.exit(failed ? 1 : 0);
