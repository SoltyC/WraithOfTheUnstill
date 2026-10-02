// Phase 1 gate run (BRIEF §17): a scripted flight across the continent at surf speed, then at
// glide speed, measuring every frame. Opened with ?bench=flight (see bench.js for the shared
// panel/POST). The free camera follows a polyline through every biome at a fixed height above
// the ground (from the collision patches), so streaming, clipmap updates and biome borders are
// all exercised. &flightScale=0.1 shortens the path for smoke tests.

import { frameStats } from './loop.js';
import { gpuStats } from './gpuInstrument.js';
import { gpuTimer } from './gpuTimer.js';
import { clock } from './clock.js';
import { streaming } from './streaming.js';

/** Waypoints (x, z): south coast → mire → hub → dune basin → frost plateau → monastery. */
const PATH = [[-956, -2908], [-1212, -668], [-220, 580], [2436, 1124], [1092, 2276], [-508, 3204]];
export const FLIGHT_PHASES = [
  { name: 'surf', speed: 20, height: 12 },
  { name: 'glide', speed: 40, height: 45 },
];

const MAX = 1 << 17;
const rec = new Float32Array(MAX);       // presented interval ending at this frame (ms)
const cpuSys = new Float32Array(MAX);    // this frame's systems CPU ms
const cpuRender = new Float32Array(MAX); // this frame's scene.render CPU ms
const flags = new Uint8Array(MAX);       // this frame's work: 1 tile upload, 2 state scroll, 4 clipmap rebuild, 8 patch
const dirty = new Uint8Array(MAX);       // clipmap levels rebuilt this frame
const gpuFrame = new Uint32Array(MAX);  // gpuTimer frame number of this frame
const F_TILE = 1, F_SCROLL = 2, F_CLIP = 4, F_PATCH = 8;

export const flight = {
  name: 'benchFlight',
  enabled: false,
  arm: null, ground: null, loop: null, streamer: null, clipmap: null, terrainState: null,
  lastRes: 0, lastScroll: 0, lastPatch: 0,
  // Current phase state (fields: no allocation on the frame path).
  active: false, speed: 20, height: 12, s: 0, total: 0, alt: 0, scale: 1,
  count: 0, maxQueue: 0, startResident: 0,
  segLen: new Float64Array(PATH.length),
  update() {
    if (!this.active) return;
    if (this.count < MAX) {
      const i = this.count++;
      rec[i] = frameStats.ago(0);
      cpuSys[i] = this.loop.sysMs; cpuRender[i] = this.loop.renderMs;
      let f = 0;
      const rv = this.streamer.residencyVersion, sc = this.terrainState.stats.scrolled, pv = this.ground.installs;
      if (rv !== this.lastRes) f |= F_TILE;
      if (sc !== this.lastScroll) f |= F_SCROLL;
      if (pv !== this.lastPatch) f |= F_PATCH;
      const dl = this.clipmap.dirtyLevels;
      if (dl > 0) f |= F_CLIP;
      flags[i] = f; dirty[i] = dl; gpuFrame[i] = gpuTimer.frameNo;
      this.lastRes = rv; this.lastScroll = sc; this.lastPatch = pv;
    }
    if (streaming.queueDepth > this.maxQueue) this.maxQueue = streaming.queueDepth;
    this.s += this.speed * clock.realDt;
    if (this.s >= this.total) { this.active = false; return; }
    // Position along the polyline.
    let d = this.s * (1 / this.scale), k = 1;
    while (k < PATH.length - 1 && d > this.segLen[k]) { d -= this.segLen[k]; k++; }
    const a = PATH[k - 1], b = PATH[k];
    const t = d / this.segLen[k];
    const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    const g = this.ground;
    g.qx = x; g.qz = z; g.sample();
    const target = g.h !== 0 ? (g.h > 0 ? g.h : 0) + this.height : this.alt;
    this.alt += (target - this.alt) * (1 - Math.pow(0.5, clock.realDt / 0.4));
    const arm = this.arm;
    arm.freePos.x = x; arm.freePos.y = this.alt; arm.freePos.z = z;
    // The terrain-state window follows the flight as it would follow a surfing player.
    const ts = this.terrainState;
    ts.followOverride = true; ts.followX = x; ts.followZ = z;
    arm.yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
    arm.pitch = 0.12;
    arm.hold = true;
  },
};

function summarize(values, n) {
  if (n === 0) return null;
  const a = Array.from(values.subarray(0, n)).sort((x, y) => x - y);
  const pick = (q) => a[Math.min(n - 1, Math.floor(n * q))];
  let sum = 0;
  for (const v of a) sum += v;
  const median = pick(0.5);
  return { frames: n, meanMs: +(sum / n).toFixed(3), medianMs: +median.toFixed(3), p99Ms: +pick(0.99).toFixed(3), maxMs: +a[n - 1].toFixed(3),
    fps: +(1000 / (sum / n)).toFixed(1), low1Fps: +(1000 / pick(0.99)).toFixed(1), framesOverMedianPlus4: a.filter((v) => v > median + 4).length };
}

/**
 * Each presented interval above median + 4 ms, with the work of the frame before it (the frame
 * whose CPU work or submission the interval waited on) and whether the next interval was short
 * (a late callback the next frame absorbed) or normal (a real dropped refresh).
 */
function analyseHitches(n) {
  if (n < 3) return null;
  const sorted = Array.from(rec.subarray(0, n)).sort((a, b) => a - b);
  const median = sorted[n >> 1], limit = median + 4;
  const list = [];
  const by = { count: 0, absorbed: 0, cpuOver8: 0, tile: 0, scroll: 0, clip: 0, patch: 0, none: 0, gpuSampled: 0, gpuOverRefresh: 0 };
  // GPU span per frame (sampled every frame during the flight): frame number → ms.
  const gpuMs = new Map();
  const gn = Math.min(gpuTimer.count, gpuTimer.ms.length);
  for (let k = 0; k < gn; k++) gpuMs.set(gpuTimer.frameOf[k], gpuTimer.ms[k]);
  const g = (i) => { const v = gpuMs.get(gpuFrame[i]); return v === undefined ? null : +v.toFixed(2); };
  // How often any frame's GPU span exceeds one presented interval (the refresh), hitch or not.
  let over = 0, sampled = 0;
  for (let i = 0; i < n; i++) { const v = gpuMs.get(gpuFrame[i]); if (v !== undefined) { sampled++; if (v > median) over++; } }
  // Base rate of each flag over all frames, to tell correlation from coincidence.
  const base = { tile: 0, scroll: 0, clip: 0, patch: 0 };
  for (let i = 0; i < n; i++) {
    const f = flags[i];
    if (f & F_TILE) base.tile++; if (f & F_SCROLL) base.scroll++; if (f & F_CLIP) base.clip++; if (f & F_PATCH) base.patch++;
  }
  for (const k in base) base[k] = +(base[k] / n).toFixed(4);
  for (let i = 1; i < n - 1; i++) {
    if (rec[i] <= limit) continue;
    const p = i - 1, f = flags[p];
    const absorbed = rec[i] + rec[i + 1] < 2 * median + 2;
    const cpu = cpuSys[p] + cpuRender[p];
    by.count++;
    if (absorbed) by.absorbed++;
    if (cpu > 8) by.cpuOver8++;
    if (f & F_TILE) by.tile++; if (f & F_SCROLL) by.scroll++; if (f & F_CLIP) by.clip++; if (f & F_PATCH) by.patch++;
    if (f === 0) by.none++;
    const gp = g(p), gp2 = p > 0 ? g(p - 1) : null;
    if (gp !== null) { by.gpuSampled++; if (gp > median || (gp2 !== null && gp2 > median)) by.gpuOverRefresh++; }
    if (list.length < 400) list.push({
      frame: i, ms: +rec[i].toFixed(2), prevMs: +rec[i - 1].toFixed(2), nextMs: +rec[i + 1].toFixed(2), absorbed,
      cpuSysMs: +cpuSys[p].toFixed(2), cpuRenderMs: +cpuRender[p].toFixed(2), cpuSysSelfMs: +cpuSys[i].toFixed(2),
      tile: !!(f & F_TILE), scroll: !!(f & F_SCROLL), clipLevels: dirty[p], patch: !!(f & F_PATCH),
      gpuPrevMs: gp, gpuPrev2Ms: gp2, gpuSelfMs: g(i),
    });
  }
  return { limitMs: +limit.toFixed(2), refreshMs: median, summary: by, baseRate: base,
    gpuOverRefreshAllFrames: { sampled, over, rate: sampled ? +(over / sampled).toFixed(5) : null }, list };
}

/** Run both phases; resolves with per-phase results. */
export async function runFlight(game, scale = 1) {
  flight.arm = game.arm; flight.ground = game.ground; flight.scale = scale; flight.enabled = true;
  flight.loop = game.loop; flight.streamer = game.streamer; flight.clipmap = game.clipmap; flight.terrainState = game.terrainState;
  let total = 0;
  flight.segLen[0] = 0;
  for (let k = 1; k < PATH.length; k++) {
    const dx = PATH[k][0] - PATH[k - 1][0], dz = PATH[k][1] - PATH[k - 1][1];
    flight.segLen[k] = Math.sqrt(dx * dx + dz * dz);
    total += flight.segLen[k];
  }
  const results = [];
  for (const ph of FLIGHT_PHASES) {
    // Start at the first waypoint, let streaming settle there, then fly.
    game.arm.setPose(PATH[0][0], 60, PATH[0][1], 0, 0.12, 0.96);
    await new Promise((r) => setTimeout(r, 4000));
    flight.speed = ph.speed; flight.height = ph.height; flight.s = 0; flight.total = total * scale;
    flight.alt = game.camera.position.y; flight.count = 0; flight.maxQueue = 0;
    flight.startResident = game.streamer.residentCount;
    gpuTimer.reset();
    gpuTimer.sampleEvery = 1; // per-frame GPU time, matched to hitches (a readback promise per frame: bench only)
    const lateBefore = gpuStats.late.length;
    flight.active = true;
    const t0 = performance.now();
    await new Promise((r) => { const iv = setInterval(() => { if (!flight.active) { clearInterval(iv); r(); } }, 100); });
    results.push({
      name: ph.name, speedMps: ph.speed, heightM: ph.height, distanceM: Math.round(total * scale), seconds: +((performance.now() - t0) / 1000).toFixed(1),
      presented: summarize(rec, flight.count), gpu: gpuTimer.summaries(summarize),
      maxStreamQueue: flight.maxQueue, tilesUploaded: game.streamer.residentCount - flight.startResident,
      latePipelines: gpuStats.late.length - lateBefore,
      cpu: { systems: summarize(cpuSys, flight.count), render: summarize(cpuRender, flight.count) },
      hitches: analyseHitches(flight.count),
    });
  }
  flight.enabled = false;
  flight.terrainState.followOverride = false;
  gpuTimer.sampleEvery = 4;
  return results;
}
