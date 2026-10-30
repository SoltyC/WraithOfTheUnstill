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
import { createLightning } from '../../src/world/lightning.js';
import { createWind } from '../../src/world/wind.js';
import { createFlow, FLOW_IN } from '../../src/game/flow.js';
import { createShaped } from '../../src/game/shaped/shaped.js';
import { createFrostBending } from '../../src/game/bending/frost.js';
import { createStoneBending } from '../../src/game/bending/stone.js';
import { createCombat } from '../../src/game/combat/combat.js';
import { createInventory } from '../../src/game/inventory.js';
import { createWeapons } from '../../src/game/weapons/weapons.js';

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
const mWeather = createWeather(); mWeather.meadowRestored = 1; mWeather.meadow = 0.7; mWeather.dt = 0.9;
const lightning = createLightning(); lightning.storm = 1; lightning.dt = 0.0111;
const stoneRig = (() => {
  const ts = { bx: 0.5, bz: 0.5, bdx: 0.5, bdz: 0.5, bl: 0.5, bw: 0.5, bd: 0.5, bc: 0.5, bk: 0, bwet: 0.5, bbias: 0.5, bberm: 0.5, healScale: 1.5, stamp() {} };   // the real state's double fields
  const gr = { qx: 0.5, qz: 0.5, h: 0.5, sample() { this.h = 0.5 - 0.5; } };
  const st = createStoneBending({ ts, ground: gr, lights: new Float32Array(32), surfaceAt: () => 0 });
  st.aimX = 1; st.aimZ = 0; st.tx = 9; st.tz = 0; st.ty = 0; return st;
})();
const cases = {
  // Stone: Shard every 40 frames, a Ridge held in cycles, Bloom every 240 (casts, pools, mass field, fx block).
  'stone.update (shard, ridge, bloom)': (i) => {
    const st = stoneRig; st.dt = clock.dt; st.time += st.dt;
    st.castShard = (i % 40) === 0; st.ridgeHeld = ((i >> 6) & 7) < 3; st.castBloom = (i % 240) === 7;
    st.update();
    st.mass.qx = 5; st.mass.qz = 1; st.mass.heightQ(); sink[0] = st.mass.h;
  },
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
  'weather.update (meadow rain/storm cycle, wetness)': () => { mWeather.update(); },
  'lightning.update (a strike in progress: envelopes, thunder queue)': () => { if (lightning.age < 0) lightning.strike(0.5, 3000, 5, true); lightning.update(); },
  'wind update + samples (with a burst)': (i) => {
    wind.time += 0.011; wind.strength = 0.8; wind.gustiness = 0.6; wind.update();
    if ((i & 1023) === 0) wind.burst(i & 63, 5, 2);
    for (let k = 0; k < 4; k++) { wind.sx = (i & 255) + k * 3.1; wind.sz = k * 7.3; wind.sample(); }
  },
  // Flow: modes cycling (surf, glide, a crest jump, standing) with events and blows mixed in.
  'flow.update (modes, chains, events)': (i) => {
    const ph = (i >> 7) & 7;
    const n = flow.inp;
    n[FLOW_IN.DT] = clock.dt; flow.paused = false;
    flow.surfOn = ph < 5; flow.glideOn = ph === 2 || ph === 3; flow.grounded = ph !== 2 && ph !== 3 && ph !== 5;
    n[FLOW_IN.SPEED] = ph === 7 ? 0 : 15; n[FLOW_IN.SURF_SPEED] = 18; n[FLOW_IN.GLIDE_SPEED] = 14; n[FLOW_IN.GRIP] = (i & 255) / 255; n[FLOW_IN.VY] = ph === 5 ? -20 : -2; n[FLOW_IN.LIFT] = ph === 6 ? 1 : 0;
    flow.update();
    if ((i & 511) === 0) flow.hit(2 + (i >> 9) % 5); if ((i & 1023) === 7) flow.hurt(); if ((i & 2047) === 9) flow.nearMiss();
  },
  // Weapons: a combo, a held heavy and a swap in turn against hounds that keep respawning (hits, strikes, impacts, bleeding).
  'weapons.update (swings, hits, heavies)': (i) => {
    const k = i % 400;
    wp.weapons.able = true; wp.weapons.dt = 1 / 60; wp.weapons.aimYaw = 0; wp.weapons.swapPressed = false; wp.weapons.dodgePressed = false;
    wp.weapons.pressed = k === 0 || k === 14 || k === 28 || k === 200; wp.weapons.down = k >= 200 && k < 245;
    if (k === 399) { wp.weapons.swapPressed = true; }
    if (k === 1) for (let q = 0; q < 3; q++) if (!wp.shaped.isLive(q)) wp.shaped.spawn('hound', (q - 1) * 1.2, 1.8);
    wp.weapons.update(); wp.shaped.dt = 1 / 60; wp.shaped.px = 0; wp.shaped.pz = 0; wp.shaped.update(); wp.combat.dt = 1 / 60; wp.combat.update();
    wp.clock.hitStop = 0;
  },
  // The Bell-mace: a plunge from 9 m onto hounds (toll, rebound, a second plunge from the rebound, the dunk of one thrown up, the glow), flown by hand as the photo spots do.
  'weapons.update (mace plunge, toll, rebound, dunk)': (i) => {
    const k = i % 240, c = wpm.ctl, W = wpm.weapons;
    W.able = true; W.dt = 1 / 60; W.aimYaw = 0; W.swapPressed = false; W.dodgePressed = false; W.down = false;
    if (k === 1) for (let q = 0; q < 3; q++) if (!wpm.shaped.isLive(q)) wpm.shaped.spawn('hound', (q - 1) * 1.2, 1.8);
    if (k === 2 && !process.env.NOPLUNGE) { c.pos.x = 0; c.pos.z = 1.8; c.pos.y = 9; c.vel.x = 0; c.vel.y = 0; c.vel.z = 0; c.grounded = false; c.plungeV = 0; }
    if (k === 4 && wpm.shaped.air) wpm.shaped.air.launch(1);
    W.pressed = k === 6 || k === 90;
    W.update(); wpm.shaped.dt = 1 / 60; wpm.shaped.px = 0; wpm.shaped.pz = 0; wpm.shaped.update(); wpm.combat.dt = 1 / 60; wpm.combat.update(); wpm.clock.hitStop = 0;
    if (!c.grounded) {
      if (c.plungeV > 0) c.pos.y -= c.plungeV / 60; else if (k > 6) { c.vel.y -= 24 / 60; c.pos.y += c.vel.y / 60; }
      if (c.pos.y <= 0) { c.pos.y = 0; c.grounded = true; c.vel.y = 0; }
    }
  },
  // The same with no foes and no Shaped/combat stepping: only the weapon's own plunge path (commit, fall, the floor, a miss).
  'weapons.update (mace plunge only: commit, fall, land)': (i) => {
    const k = i % 120, c = wpm.ctl, W = wpm.weapons;
    W.able = true; W.dt = 1 / 60; W.aimYaw = 0; W.swapPressed = false; W.dodgePressed = false; W.down = false;
    if (k === 2 && !process.env.NOPLUNGE) { c.pos.x = 40; c.pos.z = 40; c.pos.y = 9; c.vel.x = 0; c.vel.y = 0; c.vel.z = 0; c.grounded = false; c.plungeV = 0; }
    W.pressed = k === 6; W.update();
    if (!c.grounded) { if (c.plungeV > 0) c.pos.y -= c.plungeV / 60; if (c.pos.y <= 0) { c.pos.y = 0; c.grounded = true; c.vel.y = 0; } }
  },
  'frameStats.push': (i) => stats.push(8 + (i & 7)),
  'pool acquire/release': () => { const o = pool.acquire(); pool.release(o); },
};

const wind = createWind();
const flow = createFlow();
const makeWp = (weapon) => (() => {
  const gr = { qx: 0, qz: 0, h: 0, nx: 0, ny: 1, nz: 0, sample() { this.h = 0; }, sampleNormal() { this.nx = 0; this.ny = 1; this.nz = 0; } };
  const ts = { stamp() {} }, fx = { emit() {} }, clk = { hitStop: 0, simTime: 0, dt: 1 / 60 };
  const ctl2 = new CapsuleController(gr); ctl2.teleport(0, 0);
  const shaped = createShaped({ ts, fx, ground: gr });
  const frost = createFrostBending({ ts, fx, ground: gr });
  const fl = createFlow();
  const combat = createCombat({ shaped, frost, controller: ctl2, ts, clock: clk, flow: fl, teleport: () => {} });
  const inventory = createInventory(); inventory.give('sickles'); inventory.give('maul'); inventory.give('mace'); inventory.carry(weapon, 1); inventory.equip(weapon);
  const weapons = createWeapons({ shaped, combat, controller: ctl2, clock: clk, ts, fx, flow: fl, inventory, ground: gr });
  return { shaped, combat, weapons, clock: clk, ctl: ctl2 };
})();
const wp = makeWp('sickles'), wpm = makeWp('mace');
clock.dt = 1 / 90 + Math.random() * 1e-9; // a heap double, like the real clock
const N = 2_000_000;
let failed = false;
for (const [name, fn] of Object.entries(cases)) {
  const heavyCase = name.startsWith('weapons');
  for (let i = 0; i < (name.startsWith("flow") ? 3_000_000 : 200_000); i++) fn(i); // warm up and let V8 optimise (flow: its rare branches take longer to settle)
  globalThis.gc?.();
  await new Promise((r) => setTimeout(r, 20)); // flush the forced GC's observer entry
  const before = v8.getHeapStatistics().used_heap_size;
  const g0 = gcs;
  for (let i = 0; i < (heavyCase ? 400_000 : N); i++) fn(i);
  await new Promise((r) => setTimeout(r, 10)); // let gc entries flush
  const grew = v8.getHeapStatistics().used_heap_size - before;
  const scav = gcs - g0;
  const ok = scav === 0 && grew < 64 * 1024;
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(30)} gc events ${String(scav).padStart(4)}  heap delta ${(grew / 1024).toFixed(1)} KB over ${N} calls`);
}
console.log('mace plunge stats', JSON.stringify(wpm.weapons.plunge.stats));
process.exit(failed ? 1 : 0);
