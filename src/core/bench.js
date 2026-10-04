// Benchmark mode (?bench=1). Runs on the player's own browser and GPU, so it works on the target
// machine without remote automation. Scripted phases (each preceded by an unmeasured settle):
//   idle — standing at the start spot
//   walk — walking forward while the camera orbits
//   fly  — fast free-camera flight toward the mountain ring
// ?bench=bend (Phase 4) instead, on the frost steppe:
//   surf — snow-surfing S-turns (traversal held, steering by synthetic mouse motion)
//   cast — standing: Sweep every 1.5 s, Crystallize every 3 s, Ribbon held in between
// ?bench=weather (Phase 6): the full post chain on the steppe in each frost weather (walking,
// camera orbiting), a live clear → blizzard transition, and the Shaped pack in a blizzard.
// Records presented frame time (rAF interval; capped by the display's refresh rate) and GPU
// main-pass time (timestamp queries; the real cost). Shows a results panel and POSTs the JSON to
// the dev/preview server (`/__wraith/perf`), which writes it to perf/runs/.
//
// Options: &benchSeconds=10 (per phase), &settle=3, &spot=<id> (default p0-start-golden),
//          &gpuTimer=0 (no GPU timing: isolates the measurement's own readback garbage).

import { frameStats } from './loop.js';
import { gpuStats } from './gpuInstrument.js';
import { gpuTimer } from './gpuTimer.js';
import { clock } from './clock.js';
import { input, injectAction, Action } from '../input/actions.js';
import { findSpot } from '../ui/photoSpots.js';

const MAX_FRAMES = 1 << 14;
const rec = new Float32Array(MAX_FRAMES);
let recCount = 0;
let recording = false;
let yawRate = 0;

let steerPx = 0;  // synthetic mouse pixels per frame for surf carving (sine amplitude)
let benchT = 0;
/** Late system: records the last frame time while a phase is measured; drives camera orbit. */
export const benchSystem = {
  name: 'bench',
  enabled: false,
  arm: null,
  update() {
    if (recording && recCount < MAX_FRAMES) rec[recCount++] = frameStats.ago(0);
    if (yawRate !== 0 && this.arm) this.arm.yaw += yawRate * clock.realDt;
    benchT += clock.realDt;
    input.autoDX = steerPx !== 0 ? steerPx * Math.sin(benchT * 1.6) : 0;
  },
};

function summarize(values, n) {
  if (n === 0) return null;
  const a = Array.from(values.subarray(0, n)).sort((x, y) => x - y);
  const pick = (q) => a[Math.min(n - 1, Math.floor(n * q))];
  let sum = 0;
  for (const v of a) sum += v;
  const median = pick(0.5);
  return {
    frames: n,
    meanMs: +(sum / n).toFixed(3),
    medianMs: +median.toFixed(3),
    p95Ms: +pick(0.95).toFixed(3),
    p99Ms: +pick(0.99).toFixed(3),
    maxMs: +a[n - 1].toFixed(3),
    minMs: +a[0].toFixed(3),
    fps: +(1000 / (sum / n)).toFixed(1),
    low1Fps: +(1000 / pick(0.99)).toFixed(1),
    hitchesOverMedianPlus4: a.filter((v) => v > median + 4).length,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const release = () => { for (let i = 0; i < input.down.length; i++) injectAction(i, false); };

/** Frames over median + 4 ms, in order, with their time offset into the phase. */
function hitchTimeline(values, n, medianMs) {
  const out = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    t += values[i];
    // Neighbours distinguish a real dropped frame (…5.9, 11.8, 5.9…) from a late callback that
    // the next frame catches up (…5.9, 11.8, 0.1…), which is presentation-neutral.
    if (values[i] > medianMs + 4 && out.length < 40) {
      out.push({ frame: i, atMs: Math.round(t), ms: +values[i].toFixed(1), prev: i > 0 ? +values[i - 1].toFixed(1) : null, next: i + 1 < n ? +values[i + 1].toFixed(1) : null });
    }
  }
  return out;
}

async function phase(name, seconds, settle, setup) {
  setup();
  await sleep(settle * 1000);
  recCount = 0;
  gpuTimer.reset();
  recording = true;
  const t0 = performance.now();
  await sleep(seconds * 1000);
  recording = false;
  const wall = (performance.now() - t0) / 1000;
  const presented = summarize(rec, recCount);
  return {
    name, seconds: +wall.toFixed(2), presented, gpu: gpuTimer.summaries(summarize), drawCalls: gpuStats.drawCallsLastFrame,
    hitches: presented ? hitchTimeline(rec, recCount, presented.medianMs) : [],
    jsHeapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
  };
}

/** @param {any} game  @param {URLSearchParams} qs */
export async function runBench(game, qs) {
  if (qs.get('bench') === 'flight') return runFlightBench(game, qs);
  const seconds = Number(qs.get('benchSeconds') || 10);
  const settle = Number(qs.get('settle') || 3);
  const spot = findSpot(qs.get('spot') || (qs.get('bench') === 'bend' ? 'p3-wraith-walk-noon' : 'p1-monastery-golden'));
  benchSystem.arm = game.arm;
  benchSystem.enabled = true;
  const timeGpu = qs.get('gpuTimer') !== '0';
  gpuTimer.setActive(timeGpu);
  const panel = showPanel('Benchmark running… keep this tab focused and visible.');
  const events = [];
  const t0 = performance.now();
  const note = (what) => events.push({ atMs: Math.round(performance.now() - t0), what });
  document.addEventListener('visibilitychange', () => note('visibility:' + document.visibilityState));
  window.addEventListener('blur', () => note('blur'));
  window.addEventListener('focus', () => note('focus'));
  window.addEventListener('resize', () => note('resize ' + innerWidth + 'x' + innerHeight));
  const phaseStarts = [];
  await sleep(2000); // loading fade

  const phases = [];
  if (qs.get('bench') === 'bend') {
    // Phase 4: surfing and casting on the snowfield.
    phaseStarts.push(Math.round(performance.now() - t0));
    phases.push(await phase('surf', seconds, settle, () => {
      release(); yawRate = 0; steerPx = 0; game.applySpot(spot);
      setTimeout(() => { injectAction(Action.Traverse, true); steerPx = 9; }, 1500);
    }));
    phaseStarts.push(Math.round(performance.now() - t0));
    let timers = [];
    phases.push(await phase('cast', seconds, settle, () => {
      release(); steerPx = 0; yawRate = 0.15; game.applySpot(spot);
      const tap = (a, ms) => { injectAction(a, true); timers.push(setTimeout(() => injectAction(a, false), ms)); };
      timers.push(setInterval(() => tap(Action.Primary, 60), 1500));       // Sweep
      timers.push(setInterval(() => tap(Action.Heavy, 60), 3000));         // Crystallize
      timers.push(setTimeout(() => timers.push(setInterval(() => tap(Action.Primary, 900), 2200)), 700)); // Ribbon
    }));
    for (const t of timers) { clearInterval(t); clearTimeout(t); }
  } else if (qs.get('bench') === 'weather') {
    const { worldState } = await import('../game/worldState.js');
    for (const w of ['clear', 'overcast', 'snowfall', 'blizzard']) {
      phaseStarts.push(Math.round(performance.now() - t0));
      phases.push(await phase(w, seconds, settle, () => {
        release(); yawRate = 0.2; game.applySpot(findSpot('p6-' + w + '-noon'));
        setTimeout(() => injectAction(Action.MoveForward, true), 1500);
      }));
    }
    // A live transition (not snapped): clear eases into a blizzard while measured.
    phaseStarts.push(Math.round(performance.now() - t0));
    phases.push(await phase('transition', seconds * 2, settle, () => {
      release(); yawRate = 0.2; game.applySpot(findSpot('p6-clear-noon'));
      setTimeout(() => { worldState.weatherOverride = 'blizzard'; }, settle * 1000);
    }));
    phaseStarts.push(Math.round(performance.now() - t0));
    phases.push(await phase('pack-blizzard', seconds, settle, () => {
      release(); yawRate = 0.15; game.applySpot(findSpot('p5-pack-afternoon'));
      worldState.weatherOverride = 'blizzard';
    }));
  } else if (qs.get('bench') === 'fight') {
    // Phase 5: the Warden in view (awake, advancing), climbing it, and a pack of Shaped.
    phaseStarts.push(Math.round(performance.now() - t0));
    phases.push(await phase('warden', seconds, settle, () => { release(); yawRate = 0.12; game.applySpot(findSpot('p5-warden-golden')); }));
    phaseStarts.push(Math.round(performance.now() - t0));
    phases.push(await phase('climb', seconds, settle, () => {
      release(); yawRate = 0.1; game.applySpot(findSpot('p5-climb-flank'));
      injectAction(Action.Traverse, true);
      setTimeout(() => injectAction(Action.MoveForward, true), 2500);
    }));
    phaseStarts.push(Math.round(performance.now() - t0));
    phases.push(await phase('pack', seconds, settle, () => { release(); yawRate = 0.15; game.applySpot(findSpot('p5-pack-afternoon')); }));
  } else {
  phaseStarts.push(Math.round(performance.now() - t0));
  phases.push(await phase('idle', seconds, settle, () => { release(); yawRate = 0; game.applySpot(spot); }));
  phaseStarts.push(Math.round(performance.now() - t0));
  phases.push(await phase('walk', seconds, settle, () => {
    release(); game.applySpot(spot); yawRate = 0.35;
    injectAction(Action.MoveForward, true);
  }));
  phaseStarts.push(Math.round(performance.now() - t0));
  phases.push(await phase('fly', seconds, settle, () => {
    release(); yawRate = 0.08;
    game.arm.setPose(game.controller.pos.x, game.controller.pos.y + 80, game.controller.pos.z, 0.6, 0.12, 0.96);
    game.arm.hold = false;
    injectAction(Action.MoveForward, true);
    injectAction(Action.FreeCamFast, true);
  }));
  }
  release(); yawRate = 0; steerPx = 0; input.autoDX = 0;
  gpuTimer.setActive(false);
  benchSystem.enabled = false;

  const eng = game.engine;
  const result = {
    date: new Date().toISOString(),
    build: import.meta.env.MODE,
    machine: {
      adapter: gpuStats.adapterInfo,
      userAgent: navigator.userAgent,
      devicePixelRatio: window.devicePixelRatio,
      screen: screen.width + 'x' + screen.height,
      window: innerWidth + 'x' + innerHeight,
      render: eng.getRenderWidth() + 'x' + eng.getRenderHeight(),
      timestampQuery: gpuTimer.supported,
    },
    settings: { secondsPerPhase: seconds, settle, spot: spot.id, url: location.search, gpuTimer: timeGpu, gpuSampleEvery: gpuTimer.sampleEvery },
    scene: { drawCalls: gpuStats.drawCallsLastFrame, pipelines: gpuStats.pipelinesTotal, latePipelines: gpuStats.late.length, gpuMB: Math.round((gpuStats.bufferBytes + gpuStats.textureBytes) / 1048576) },
    phases,
    // Page events during the run (ms since bench start) and when each phase's setup began
    // (measurement starts `settle` seconds later). Used to explain hitches.
    events, phaseSetupAtMs: phaseStarts,
  };
  window.__wraith.benchResult = result;
  let saved = '';
  try {
    const r = await fetch('/__wraith/perf', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(result) });
    saved = r.ok ? 'saved to ' + (await r.json()).file : 'server did not save (HTTP ' + r.status + ')';
  } catch (e) {
    saved = 'could not reach server: ' + e.message;
  }
  panel.innerHTML = renderPanel(result, saved);
  return result;
}

/** Phase 1 gate: flight across the continent at surf then glide speed. */
async function runFlightBench(game, qs) {
  const { runFlight, flight } = await import('./benchFlight.js');
  game.loop.addLate(flight);
  const timeGpu = qs.get('gpuTimer') !== '0';
  gpuTimer.setActive(timeGpu);
  const panel = showPanel('Flight benchmark running (~13 min at full length)… keep this tab focused and visible.');
  await sleep(2000);
  const phases = await runFlight(game, Number(qs.get('flightScale') || 1));
  gpuTimer.setActive(false);
  const eng = game.engine;
  const result = {
    date: new Date().toISOString(), kind: 'flight', build: import.meta.env.MODE,
    machine: { adapter: gpuStats.adapterInfo, userAgent: navigator.userAgent, devicePixelRatio: window.devicePixelRatio, screen: screen.width + 'x' + screen.height, window: innerWidth + 'x' + innerHeight, render: eng.getRenderWidth() + 'x' + eng.getRenderHeight(), timestampQuery: gpuTimer.supported },
    settings: { url: location.search, gpuTimer: timeGpu },
    scene: { drawCalls: gpuStats.drawCallsLastFrame, pipelines: gpuStats.pipelinesTotal, latePipelines: gpuStats.late.length, gpuMB: Math.round((gpuStats.bufferBytes + gpuStats.textureBytes) / 1048576) },
    phases,
  };
  window.__wraith.benchResult = result;
  let saved = '';
  try {
    const r = await fetch('/__wraith/perf', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(result) });
    saved = r.ok ? 'saved to ' + (await r.json()).file : 'server did not save (HTTP ' + r.status + ')';
  } catch (e) { saved = 'could not reach server: ' + e.message; }
  const row = (p) => `<tr><td>${p.name} ${p.speedMps} m/s</td><td>${p.presented?.fps ?? '–'}</td><td>${p.presented?.low1Fps ?? '–'}</td><td>${p.presented?.medianMs ?? '–'}</td><td>${p.presented?.maxMs ?? '–'}</td><td>${p.presented?.framesOverMedianPlus4 ?? '–'}</td><td>${p.gpu?.frame?.medianMs ?? 'n/a'}</td><td>${p.gpu?.frame?.p99Ms ?? 'n/a'}</td><td>${p.gpu?.shadow?.medianMs ?? 'n/a'}</td><td>${p.gpu?.compute?.medianMs ?? 'n/a'}</td><td>${p.tilesUploaded}</td></tr>`;
  panel.innerHTML = `<h3>Flight benchmark — ${result.machine.render} — ${result.machine.adapter || ''}</h3><table><thead><tr><th>phase</th><th>fps</th><th>1% low</th><th>median ms</th><th>max ms</th><th>&gt; median+4</th><th>GPU frame median</th><th>GPU frame p99</th><th>shadows</th><th>compute</th><th>tiles</th></tr></thead><tbody>${phases.map(row).join('')}</tbody></table><p>${saved}. Gate: no frame above median + 4 ms.</p>${phases.map(hitchLine).join('')}`;
  return result;
}

/** One line per phase: what the frames before each hitch were doing, vs the base rate. */
function hitchLine(p) {
  const h = p.hitches;
  if (!h) return '';
  const s = h.summary, b = h.baseRate, pct = (v) => (100 * v).toFixed(1) + '%';
  const share = (k) => (s.count ? pct(s[k] / s.count) : '–') + ' (base ' + pct(b[k]) + ')';
  return `<p>${p.name}: ${s.count} hitches &gt; ${h.limitMs} ms — ${s.absorbed} absorbed by the next frame, ${s.cpuOver8} with CPU &gt; 8 ms;
    tile upload ${share('tile')}, state scroll ${share('scroll')}, clipmap rebuild ${share('clip')}, patch ${share('patch')}, none ${s.none};
    GPU over one refresh (${h.refreshMs} ms) just before: ${s.gpuOverRefresh}/${s.gpuSampled} sampled hitches vs ${h.gpuOverRefreshAllFrames.over}/${h.gpuOverRefreshAllFrames.sampled} of all frames.</p>`;
}

function showPanel(text) {
  const el = document.createElement('div');
  el.className = 'bench-panel';
  el.textContent = text;
  document.body.append(el);
  return el;
}

function renderPanel(r, saved) {
  const row = (p) => {
    const pr = p.presented, g = p.gpu?.frame;
    return `<tr><td>${p.name}</td><td>${pr ? pr.fps : '–'}</td><td>${pr ? pr.low1Fps : '–'}</td><td>${pr ? pr.medianMs : '–'}</td><td>${pr ? pr.p99Ms : '–'}</td><td>${pr ? pr.hitchesOverMedianPlus4 : '–'}</td><td>${g ? g.medianMs : 'n/a'}</td><td>${g ? g.p99Ms : 'n/a'}</td></tr>`;
  };
  return `<h3>Benchmark — ${r.machine.render} — ${r.machine.adapter || 'adapter n/a'}</h3>
  <table><thead><tr><th>phase</th><th>fps</th><th>1% low</th><th>median ms</th><th>p99 ms</th><th>hitches</th><th>GPU frame median ms</th><th>GPU frame p99 ms</th></tr></thead>
  <tbody>${r.phases.map(row).join('')}</tbody></table>
  <p>${saved}. Presented fps is capped by the display refresh rate; GPU ms is the real cost (budget 16.7 ms at 60 fps).</p>`;
}
