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
const rec = new Float32Array(MAX);

export const flight = {
  name: 'benchFlight',
  enabled: false,
  arm: null, ground: null,
  // Current phase state (fields: no allocation on the frame path).
  active: false, speed: 20, height: 12, s: 0, total: 0, alt: 0, scale: 1,
  count: 0, maxQueue: 0, startResident: 0,
  segLen: new Float64Array(PATH.length),
  update() {
    if (!this.active) return;
    if (this.count < MAX) rec[this.count++] = frameStats.ago(0);
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

/** Run both phases; resolves with per-phase results. */
export async function runFlight(game, scale = 1) {
  flight.arm = game.arm; flight.ground = game.ground; flight.scale = scale; flight.enabled = true;
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
    const lateBefore = gpuStats.late.length;
    flight.active = true;
    const t0 = performance.now();
    await new Promise((r) => { const iv = setInterval(() => { if (!flight.active) { clearInterval(iv); r(); } }, 100); });
    results.push({
      name: ph.name, speedMps: ph.speed, heightM: ph.height, distanceM: Math.round(total * scale), seconds: +((performance.now() - t0) / 1000).toFixed(1),
      presented: summarize(rec, flight.count), gpu: gpuTimer.summaries(summarize),
      maxStreamQueue: flight.maxQueue, tilesUploaded: game.streamer.residentCount - flight.startResident,
      latePipelines: gpuStats.late.length - lateBefore,
    });
  }
  flight.enabled = false;
  return results;
}
