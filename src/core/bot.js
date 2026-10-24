// The bot (?bot=1): lets a script play the live game through the preview server's bridge
// (vite.config.js botBridge; the CLI is tools/bot/bot.mjs). The page long-polls for one command at a
// time, runs it with the real input actions (no teleports unless asked), and replies with the result
// and a state snapshot, so a player at a terminal can look, move, cast, talk and screenshot, turn by
// turn. Dev only: nothing loads it without ?bot=1.

import { Action } from '../input/actions.js';
import { params, setParam } from './params.js';

const sleepFrames = (n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (v) => Math.round(v * 100) / 100;
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/** @param {any} w  window.__wraith (game, g, inject, frameStats, ...) */
export function startBot(w, qs) {
  const { g, game } = w;
  const inject = (name, down) => w.inject(name, down);
  const log = [];   // notices, barks, dialogue lines, events since the last command
  const push = (s) => { log.push(r2(g.clock.simTime) + ' ' + s); if (log.length > 200) log.shift(); };
  // Hear what the player would read.
  const hud = g.hud;
  if (hud) {
    const n0 = hud.notice.bind(hud), b0 = hud.bark.bind(hud), t0 = hud.line.bind(hud);
    hud.notice = (k, t, s, secs) => { push(`NOTICE [${k}] ${t}${s ? ' — ' + s : ''}`); return n0(k, t, s, secs); };
    hud.bark = (name, text, secs) => { push(`BARK ${name}: ${text}`); return b0(name, text, secs); };
    hud.line = (owner, text, alarm) => { if (text && text !== lastTask) push(`TASK ${text}${alarm ? ' (!)' : ''}`); lastTask = text || lastTask; return t0(owner, text, alarm); };
  }
  let lastTask = '', lastLine = '';
  const held = new Set();
  const frameMs = [];
  let lastT = performance.now();
  // Per frame: watch dialogue and frame times.
  const watch = () => {
    const now = performance.now(); frameMs.push(now - lastT); lastT = now; if (frameMs.length > 600) frameMs.shift();
    const c = g.chapter && g.chapter.current;
    const s = c ? (c.text ? `${c.name}: ${c.text}` : `${c.name} [choice] ${c.options.map((o, i) => i + ') ' + o).join(' | ')}`) : '';
    if (s && s !== lastLine) push('SAY ' + s);
    lastLine = s;
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);

  function perf(n = 120) {
    const a = frameMs.slice(-n).sort((x, y) => x - y), m = a.length;
    if (!m) return null;
    const mean = a.reduce((s, x) => s + x, 0) / m;
    return { frames: m, meanMs: r2(mean), fps: r2(1000 / mean), p50: r2(a[m >> 1]), p95: r2(a[Math.floor(m * 0.95)]), max: r2(a[m - 1]), renderScale: r2(g.post?.post?.renderScale ?? 1) };
  }

  function state(full = false) {
    const p = g.controller.pos, cb = g.combat;
    const st = {
      t: r2(g.clock.simTime), tod: r2(g.params.v.timeOfDay),
      pos: [r2(p.x), r2(p.y), r2(p.z)], camYaw: r2(g.arm.yaw), camPitch: r2(g.arm.pitch),
      health: cb ? r2(cb.health) : null, focus: cb ? r2(cb.focus) : null,
      flow: g.flow ? { v: r2(g.flow.value), tier: g.flow.tier, show: r2(g.flow.show), streak: g.flow.streak, secs: Array.from(g.flow.timeAt, r2), counts: Array.from(g.flow.counts) } : null,
      element: g.elements?.active, unlocked: g.elements ? [...g.elements.unlocked] : null,
      climbing: !!(g.activeClimb && g.activeClimb.mode), talking: !!g.chapter?.talking,
      line: lastLine || null, task: document.querySelector('.task-line.on')?.textContent || null,
      perf: perf(60), log: log.splice(0),
    };
    const gr = g.chapter?.graph;
    if (gr) {
      st.quests = {};
      for (const id in gr.quests) { const q = gr.quests[id]; if (q.state !== 'locked') st.quests[id] = q.state + (q.state === 'active' ? ':' + (gr.byId.get(id).steps[q.step]?.id ?? q.step) : ''); }
      if (full) st.flags = [...gr.flags].sort();
    }
    // People near: id, name, distance, bearing (world heading to them, as camYaw).
    if (g.npcs) {
      st.near = g.npcs.filter((n) => n.x != null && Math.hypot(n.x - p.x, n.z - p.z) < (full ? 60 : 25))
        .map((n) => ({ id: n.id, d: r2(Math.hypot(n.x - p.x, n.z - p.z)), at: [r2(n.x), r2(n.z)] }))
        .sort((a, b) => a.d - b.d).slice(0, 10);
    }
    const vf = g.villageFire;
    if (vf && vf.counts) st.fire = { ...vf.counts };
    const f = g.bellFight;
    if (f) st.bell = { phase: f.phase, vents: [...f.vents].map(r2), valves: f.valvesOpen, galeIn: r2(f.galeIn), hint: f.hint };
    return st;
  }

  /** Face a world point with the camera (the Wraith moves camera-relative). */
  function faceTo(x, z) {
    const p = g.controller.pos;
    g.arm.yaw = Math.atan2(x - p.x, z - p.z);
  }

  async function walkTo(x, z, { timeout = 40, arrive = 1.5, run = false } = {}) {
    const t0 = performance.now(); let best = 1e9, bestT = t0, stuck = 0;
    inject('MoveForward', true); held.add('MoveForward');
    try {
      while (true) {
        const p = g.controller.pos, d = Math.hypot(x - p.x, z - p.z);
        if (d < arrive) return { arrived: true, d: r2(d) };
        if (d < best - 0.5) { best = d; bestT = performance.now(); }
        if (performance.now() - bestT > 3000) {
          // Stuck: try stepping round once each way before giving up.
          stuck++;
          if (stuck > 3) return { arrived: false, stuck: true, d: r2(d), at: [r2(p.x), r2(p.z)] };
          const side = stuck % 2 ? 'MoveLeft' : 'MoveRight';
          inject(side, true); if (run) inject('Jump', true);
          await sleepMs(700); inject(side, false); if (run) inject('Jump', false);
          bestT = performance.now();
        }
        w.botWalk = { d, best, stuck, el: performance.now() - t0 };
        if (performance.now() - t0 > timeout * 1000) return { arrived: false, timeout: true, d: r2(d), at: [r2(p.x), r2(p.z)] };
        faceTo(x, z);
        await sleepFrames(1);
      }
    } finally { inject('MoveForward', false); held.delete('MoveForward'); }
  }

  // Streets as a graph (village.json roads: consecutive points joined, points within 3 m of another
  // street joined too), for walks that would otherwise run into houses: A* node to node.
  let roadG = null;
  function roads() {
    if (roadG) return roadG;
    const P = [], E = [];
    for (const r of (g.village?.roads || [])) {
      let prev = -1;
      for (const q of r.pts) { const k = P.length; P.push([q[0], q[1]]); E.push([]); if (prev >= 0) { const d = Math.hypot(P[k][0] - P[prev][0], P[k][1] - P[prev][1]); E[k].push([prev, d]); E[prev].push([k, d]); } prev = k; }
    }
    const cell = new Map(), key = (x, z) => Math.floor(x / 3) + ',' + Math.floor(z / 3);
    P.forEach((q, i) => { const k = key(q[0], q[1]); (cell.get(k) || cell.set(k, []).get(k)).push(i); });
    P.forEach((q, i) => { const cx = Math.floor(q[0] / 3), cz = Math.floor(q[1] / 3);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of cell.get((cx + a) + ',' + (cz + b)) || []) {
        if (j <= i) continue; const d = Math.hypot(P[j][0] - q[0], P[j][1] - q[1]); if (d < 3) { E[i].push([j, d]); E[j].push([i, d]); } } });
    return (roadG = { P, E });
  }
  function nearestNode(x, z) { const { P } = roads(); let b = -1, bd = 1e9; P.forEach((q, i) => { const d = Math.hypot(q[0] - x, q[1] - z); if (d < bd) { bd = d; b = i; } }); return b; }
  function route(x0, z0, x1, z1) {
    const { P, E } = roads(); if (!P.length) return [];
    const a = nearestNode(x0, z0), b = nearestNode(x1, z1);
    const gS = new Map([[a, 0]]), from = new Map(), open = [[Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1]), a]], done = new Set();
    while (open.length) {
      open.sort((u, v) => u[0] - v[0]); const [, i] = open.shift();
      if (i === b) break; if (done.has(i)) continue; done.add(i);
      for (const [j, d] of E[i]) { const ng = gS.get(i) + d; if (ng < (gS.get(j) ?? 1e9)) { gS.set(j, ng); from.set(j, i); open.push([ng + Math.hypot(P[j][0] - P[b][0], P[j][1] - P[b][1]), j]); } }
    }
    const path = []; for (let i = b; i !== undefined; i = from.get(i)) { path.push(P[i]); if (i === a) break; }
    path.reverse();
    // Thin to every ~4 m.
    const out = []; let last = null;
    for (const q of path) if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > 4) { out.push(q); last = q; }
    return out;
  }
  /** Walk by the streets: to the street nearest here, along them, then straight to the target. */
  async function walkRoads(x, z, c) {
    const p = g.controller.pos;
    if (Math.hypot(x - p.x, z - p.z) < 12) return walkTo(x, z, c);
    const pts = route(p.x, p.z, x, z);
    for (const q of pts) { const r = await walkTo(q[0], q[1], { ...c, arrive: 2.5, timeout: 15 }); if (!r.arrived && r.stuck) break; }
    return walkTo(x, z, c);
  }

  async function shot(name, dir = 'bot') {
    await sleepFrames(1);
    const canvas = g.engine?.getRenderingCanvas?.() || document.querySelector('canvas');
    // Half size (the terminal player reads it, not a gate shot): an offscreen copy, as PNG.
    const k = Math.min(1, (w.botShotWidth || 1280) / canvas.width), c2 = document.createElement('canvas');
    c2.width = Math.round(canvas.width * k); c2.height = Math.round(canvas.height * k);
    c2.getContext('2d').drawImage(canvas, 0, 0, c2.width, c2.height);
    const blob = await new Promise((r) => c2.toBlob(r, 'image/png'));
    const safe = String(name || 'shot').replace(/[^a-z0-9-]/gi, '');
    const res = await fetch(`/__wraith/shot?dir=${dir}&name=${safe}`, { method: 'POST', body: blob });
    return res.ok ? `screenshots/${dir}/${safe}.png` : 'HTTP ' + res.status;
  }

  /** Footage: the game canvas through MediaRecorder (the DOM HUD is not in it), uploaded to screenshots/<dir>/<name>.webm. */
  let rec = null;
  function recStart({ fps = 60, mbps = 24 } = {}) {
    if (rec) throw new Error('already recording');
    const canvas = g.engine?.getRenderingCanvas?.() || document.querySelector('canvas');
    const stream = canvas.captureStream(fps);
    const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
    const mr = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: mbps * 1e6 });
    const parts = [];
    mr.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    mr.start(1000);
    rec = { mr, parts, type, t0: performance.now(), w: canvas.width, h: canvas.height };
    return { recording: type, size: [canvas.width, canvas.height] };
  }
  async function recStop(name, dir = 'trailer') {
    if (!rec) throw new Error('not recording');
    const r = rec; rec = null;
    await new Promise((res) => { r.mr.onstop = res; r.mr.stop(); });
    r.mr.stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(r.parts, { type: r.type });
    const safe = String(name || 'clip').replace(/[^a-z0-9-]/gi, '');
    const res = await fetch(`/__wraith/clip?dir=${dir}&name=${safe}`, { method: 'POST', body: blob });
    return { file: res.ok ? `screenshots/${dir}/${safe}.webm` : 'HTTP ' + res.status, seconds: +((performance.now() - r.t0) / 1000).toFixed(1), mb: +(blob.size / 1e6).toFixed(1), size: [r.w, r.h] };
  }

  /**
   * Film mode: the render loop is driven here, each frame advancing exactly 1/fps of game time, and every
   * frame is saved (JPEG) to screenshots/<dir>/frames/<name>/ for ffmpeg — smooth footage whatever the
   * live frame rate. `js` runs before each frame as (t, i, g, w, cam, inject): script the camera with
   * cam.at(x, y, z, tx, ty, tz, fov) (null = the game's own camera) and inputs with inject(action, down).
   */
  const filmCam = { on: false, x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 1, fov: 0.8,
    at(x, y, z, tx, ty, tz, fov = 0.8) { this.on = true; this.x = x; this.y = y; this.z = z; this.tx = tx; this.ty = ty; this.tz = tz; this.fov = fov; },
    off() { this.on = false; },
    /** Time-lapse: set the hour (0..24) for this frame (the clock's pin is released so it does not pull back). */
    tod(h) { if (g.clock) g.clock.pinHour = null; setParam('timeOfDay', ((h % 24) + 24) % 24); } };
  // Runs just before the atmosphere: it (and the shadows, clipmap, …) read the camera when they update, so a pose set at
  // the end of the frame would leave the sky drawn from the game's camera (trailer v1: the sky stood still as the camera moved).
  const filmSys = { name: 'botFilmCam', update: () => {
    if (!filmCam.on) return;
    const c = g.camera, dx = filmCam.tx - filmCam.x, dy = filmCam.ty - filmCam.y, dz = filmCam.tz - filmCam.z;
    c.position.set(filmCam.x, filmCam.y, filmCam.z);
    c.rotation.set(-Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0);
    c.fov = filmCam.fov;
  } };
  { const sys = g.loop.systems, k = sys.findIndex((q) => q.name === 'atmosphere'); sys.splice(k < 0 ? sys.length : k, 0, filmSys); }
  async function filmRun({ name = 'clip', dir = 'trailer', seconds = 5, fps = 60, js = '', quality = 0.92, size = [1920, 1080], warm = 30 }) {
    const engine = g.engine, loop = g.loop, canvas = engine.getRenderingCanvas();
    const step = js ? new Function('t', 'i', 'g', 'w', 'cam', 'inject', js) : null;
    const prevScale = params.v.renderScale, prevDyn = params.v.dynamicRes;
    setParam('dynamicRes', 0); setParam('renderScale', 1);
    canvas.style.width = size[0] + 'px'; canvas.style.height = size[1] + 'px'; engine.resize();
    engine.stopRenderLoop();
    loop.fixedDt = 1 / fps;
    const off = new OffscreenCanvas(size[0], size[1]), ctx = off.getContext('2d');
    const n = Math.round(seconds * fps);
    let inflight = 0, failed = 0;
    const t0 = performance.now();
    try {
      for (let i = -warm; i < n; i++) {
        // Warm frames (not saved): the script's first pose settles TAA history and streaming first.
        const t = Math.max(0, i) / fps;
        if (step) step(t, i, g, w, filmCam, inject);
        engine.beginFrame(); loop._frame(); engine.endFrame();
        if (i < 0) { await sleepMs(0); continue; }
        // Trees keep the placement the warm frames settled on (a moving camera re-placed them every 20 m: trees fading in and
        // out at the edge and their shadows shifting — trailer review 2026-10-24).
        if (i === 0 && g.trees) g.trees.hold = true;
        ctx.drawImage(canvas, 0, 0, size[0], size[1]);
        const blob = await off.convertToBlob({ type: 'image/jpeg', quality });
        inflight++;
        fetch(`/__wraith/frame?dir=${dir}&name=${name}&i=${i}`, { method: 'POST', body: blob }).then((r) => { if (!r.ok) failed++; }, () => failed++).finally(() => inflight--);
        while (inflight > 6) await sleepMs(4);
        w.botFilm = { name, i, n };
      }
      while (inflight > 0) await sleepMs(20);
    } finally {
      filmCam.off();
      if (g.trees) g.trees.hold = false;
      loop.fixedDt = 0; loop.last = performance.now();
      setParam('dynamicRes', prevDyn); setParam('renderScale', prevScale);
      engine.runRenderLoop(loop._frame);
    }
    return { frames: n, failed, dir: `screenshots/${dir}/frames/${name}`, wallS: +((performance.now() - t0) / 1000).toFixed(1) };
  }

  const cmds = {
    film: (c) => filmRun(c),
    recStart: (c) => recStart(c),
    recStop: async (c) => recStop(c.name, c.dir),
    state: (c) => state(!!c.full),
    perf: async (c) => { if (c.frames) await sleepFrames(c.frames); return perf(c.frames || 120); },
    /** Hold actions for ms: { keys: ['MoveForward', 'Primary'], ms } (names from Action). */
    hold: async (c) => {
      for (const k of c.keys) { if (!(k in Action)) throw new Error('no action ' + k); inject(k, true); }
      await sleepMs(c.ms ?? 500);
      for (const k of c.keys) inject(k, false);
      await sleepFrames(2);
      return state();
    },
    /** Tap an action: { key }. */
    press: async (c) => { inject(c.key, true); await sleepFrames(2); inject(c.key, false); await sleepFrames(2); return state(); },
    /** Camera: { yaw, pitch } absolute (radians; yaw = world heading atan2(dx, dz)), or { dyaw } relative. */
    look: async (c) => { if (c.yaw != null) g.arm.yaw = c.yaw; if (c.dyaw != null) g.arm.yaw += c.dyaw; if (c.pitch != null) g.arm.pitch = c.pitch; await sleepFrames(3); return state(); },
    face: async (c) => { faceTo(c.x, c.z); if (c.pitch != null) g.arm.pitch = c.pitch; await sleepFrames(3); return state(); },
    /** Point the camera's view ray at a world point { x, y, z } (yaw/pitch refined against the real camera). */
    aim: async (c) => {
      for (let it = 0; it < 12; it++) {
        const cam = g.camera, o = cam.position, rp = cam.rotation.x, ry = cam.rotation.y, f = { x: Math.sin(ry) * Math.cos(rp), y: -Math.sin(rp), z: Math.cos(ry) * Math.cos(rp) };
        const dx = c.x - o.x, dy = c.y - o.y, dz = c.z - o.z, dh = Math.hypot(dx, dz);
        const wantYaw = Math.atan2(dx, dz), wantPitch = Math.atan2(dy, dh);
        const haveYaw = Math.atan2(f.x, f.z), havePitch = Math.atan2(f.y, Math.hypot(f.x, f.z));
        const ey = wrapPi(wantYaw - haveYaw), ep = wantPitch - havePitch;
        if (Math.abs(ey) < 0.004 && Math.abs(ep) < 0.004) break;
        g.arm.yaw += ey; g.arm.pitch -= ep;   // the arm's pitch is positive looking down
        await sleepFrames(2);
      }
      return state();
    },
    walkTo: async (c) => ({ walk: await (c.roads ? walkRoads(c.x, c.z, c) : walkTo(c.x, c.z, c)), ...state() }),
    /** Walk to an NPC by id and talk. */
    talkTo: async (c) => {
      const n = g.npcs.find((q) => q.id === c.id); if (!n) throw new Error('no npc ' + c.id);
      w.botStage = 'walk'; const wk = await walkTo(n.x, n.z, { arrive: 2.2, timeout: c.timeout ?? 40 }); w.botStage = 'talk';
      faceTo(n.x, n.z); inject('Interact', true); await sleepFrames(2); inject('Interact', false);
      w.botStage = 'wait'; await sleepMs(c.ms ?? 1500); w.botStage = 'done';
      return { walk: wk, ...state() };
    },
    /** Keep within `dist` m of an NPC (escorts) until a flag is set or `timeout` s pass: { id, flag, dist, timeout }. */
    follow: async (c) => {
      const n = g.npcs.find((q) => q.id === c.id); if (!n) throw new Error('no npc ' + c.id);
      const t0 = performance.now(), flags = g.chapter.graph.flags, dist = c.dist ?? 4;
      let moving = false;
      try {
        while ((performance.now() - t0) / 1000 < (c.timeout ?? 120)) {
          if (c.flag && flags.has(c.flag)) return { reached: c.flag, ...state() };
          const p = g.controller.pos, d = Math.hypot(n.x - p.x, n.z - p.z);
          faceTo(n.x, n.z);
          const want = d > dist; if (want !== moving) { inject('MoveForward', want); moving = want; }
          await sleepFrames(1);
        }
      } finally { inject('MoveForward', false); }
      return { reached: false, timeout: true, ...state() };
    },
    wait: async (c) => { await sleepMs(c.ms ?? 1000); return state(); },
    shot: async (c) => ({ file: await shot(c.name, c.dir), ...state() }),
    spot: async (c) => { await w.prepareSpot(c.id, 4); return state(); },
    teleport: async (c) => { g.controller.pos.x = c.x; g.controller.pos.z = c.z; if (c.y != null) g.controller.pos.y = c.y; await sleepFrames(10); return state(); },
    /** Escape hatch: run JS with (g, w, state) and return its JSON-able result. */
    eval: async (c) => { const f = new Function('g', 'w', 'state', 'return (async () => {' + c.js + '})()'); return { result: await f(g, w, state) }; },
    release: async () => { for (const k of held) inject(k, false); held.clear(); return state(); },
  };

  async function poll() {
    while (true) {
      let cmd = null;
      try {
        const r = await fetch('/__wraith/bot/next');
        if (r.status === 200) cmd = await r.json();
      } catch { await sleepMs(1000); continue; }
      if (!cmd) continue;
      run(cmd);   // not awaited: a `state` or `eval` can look in while a long command runs
    }
  }
  async function run(cmd) {
    {
      let out;
      try {
        const fn = cmds[cmd.do];
        if (!fn) throw new Error('unknown command ' + cmd.do + ' (have ' + Object.keys(cmds).join(', ') + ')');
        const t0 = performance.now();
        out = { ok: true, ...(await fn(cmd)) }; out.ms = Math.round(performance.now() - t0);
      } catch (e) { out = { ok: false, error: String(e && e.stack || e).slice(0, 1500), ...state() }; }
      let text;
      try { text = JSON.stringify(out); } catch (e) { text = JSON.stringify({ ok: false, error: 'reply not serialisable: ' + e.message }); }
      for (let k = 0; k < 3; k++) {
        try { const r = await fetch('/__wraith/bot/reply?id=' + cmd._id, { method: 'POST', body: text }); if (r.ok) break; push('reply HTTP ' + r.status); } catch (e) { push('reply failed: ' + e.message); }
        await sleepMs(500);
      }
    }
  }
  window.addEventListener('error', (e) => push('ERROR ' + (e.message || e)));
  window.addEventListener('unhandledrejection', (e) => push('ERROR (promise) ' + String(e.reason && e.reason.stack || e.reason).slice(0, 300)));
  push('bot ready' + (qs.get('spot') ? ' at ' + qs.get('spot') : ''));
  fetch('/__wraith/bot/hello', { method: 'POST' }).catch(() => {}).then(poll);
}
