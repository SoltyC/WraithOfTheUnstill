// The destruction system: buildings that come down (the eruption first: systems/eruption.js; any system may call it).
//   g.destruction.collapse(siteId, { force: [x, z], strength, release(x, z, y) → s, char, cause, delay })
// The site is built again broken (world/fracture.js: its walls, roofs, rings and towers as groups of fragments), the
// standing building hidden and its collision gone, and the pieces drawn with the building's own materials
// (render/debris.js) while the physics (game/collapse.js, in a worker) brings them down: a wave across it from the force's
// side, each group toppling whole and shattering where it strikes, the heap building up. Dust (render/dust.js) bursts where
// groups let go and shatter and where heavy pieces land, in the colour of what broke, and hangs over the ruin. The char
// (the architecture's per-site soot) goes on with the cause. A collapse no one is near is run to rest at once when the
// ground under it is known; a ruin is remembered (vars `ruin:<site>`) and lies the same on loading.

import { buildDebris } from '../world/fracture.js';
import { createDebrisView, rubbleMound } from '../render/debris.js';
import { createDust, DUST_OF } from '../render/dust.js';

const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

/** The inputs needed to replay a saved collapse on the same ground (cause and per-group release times included). */
function ruinRecord(opt, done = false) {
  const { force, seed, strength, char = 0, cause, releaseOf } = opt;
  return { force, seed, strength, char, cause, releaseOf, ...(done ? { done: 1 } : {}) };
}

/** @param {any} g  shared boot context */
export function addDestructionSystem(g) {
  const { scene, atmosphere, loop, clock, controller, chapter } = g;
  if (!g.archSites || !g.architecture) return;
  const sites = g.archSites, view = g.architecture, vars = chapter?.graph?.vars || {};
  const dust = g.ruinDust = g.qs?.get('nodust') ? { burst() {}, update() {}, spawn() {} } : createDust(scene, atmosphere);
  dust.freeze?.();
  const worker = new Worker(new URL('../game/collapse.worker.js', import.meta.url), { type: 'module' });
  // The fracture (a building made again, broken) in a worker of its own for the sites it knows (world/debris.worker.js).
  const breaker = new Worker(new URL('../world/debris.worker.js', import.meta.url), { type: 'module' });
  const WORKER_SITES = /^(sow|cin|ash)-/;
  let breakerReady = false;
  const waiting = new Map();
  breaker.onmessage = (e) => { const m = e.data, cb = waiting.get(m.id); waiting.delete(m.id); if (cb) cb(m.debris || null); };
  const ruins = new Map();   // site id → { i, debris, view, state: 'pending'|'running'|'rest', opt, col, t0 }
  const ctx = { clipmap: g.content.clipmap, shadows: g.shadows, bindShadows: g.bindShadows, matLib: g.matLib };

  worker.onmessage = (e) => {
    const m = e.data, r = ruins.get(m.id);
    if (!r) return;
    r.view.upload(m.xf);
    if (m.done) { r.state = 'rest'; vars['ruin:' + m.id] = ruinRecord(r.opt, true); }
    for (const ev of m.events) {
      const sz = Math.min(6, ev.size);
      if (ev.kind === 'release') { if (sz > 0.7) dust.burst(ev.x, ev.y + 0.3, ev.z, 2 + Math.round(sz * 2), 1 + sz * 0.7, 1 + sz * 0.6, r.col, 16, 0.15); }
      else if (ev.kind === 'break') dust.burst(ev.x, ev.y, ev.z, 3 + Math.round(sz * 3), 1.2 + sz * 0.9, 2 + sz, r.col, 20, 0.45);
      else dust.burst(ev.x, ev.y, ev.z, 1, 0.5 + sz * 0.5, 1.2, r.col, 8, 0.3);
    }
    // The heap's body under the blocks (a mound of small stone and grit), once it has come to rest.
    if (m.done && m.heap && m.grid && !r.mound) {
      const mat = r.mainMat === 20 || r.mainMat === 5 ? 20 : r.mainMat === 8 ? 8 : 0;
      const geo = rubbleMound(m.heap, m.grid, r.origin, r.i, mat, r.i);
      if (geo.indices.length) { r.mound = createDebrisView(scene, atmosphere, geo, view, ctx, 'mound-' + m.id); r.mound.xf.set([r.origin[0], r.origin[1], r.origin[2], 0, 0, 0, 0, 1]); r.mound.upload(); g.engine?.snapshotRenderingReset?.(); }
    }
    if (m.done) {
      // What hangs over a ruin after: a slow pall, drifting off.
      const [x, y, z] = r.origin;
      // (Not in the cloud: what took it is the pall, and a ruin's own lies flat on the ground under it, lit by the lava.)
      if (r.opt.cause !== 'surge') for (let k = 0; k < 5; k++) dust.burst(x, y + 1 + k * 0.6, z, 2, 3 + r.ext * 0.06, 0.5, r.col, 40, 0.5);
    }
  };

  /** The ground under a site as a height grid (for the worker): the 2 m ground where it has come in, the 8 m overview
   *  elsewhere (a big site's far edge); null until the ground at its centre has come in. */
  const ov = (x, z) => {
    const O = g.streamer?.overview; if (!O) return NaN;
    const u = (x + 4096) / 8 - 0.5, v = (4096 - z) / 8 - 0.5, i = Math.max(0, Math.min(1022, Math.floor(u))), j = Math.max(0, Math.min(1022, Math.floor(v))), fu = u - i, fv = v - j;
    const H = (a, b) => O[b * 1024 + a] / 32 - 128;
    return (H(i, j) * (1 - fu) + H(i + 1, j) * fu) * (1 - fv) + (H(i, j + 1) * (1 - fu) + H(i + 1, j + 1) * fu) * fv;
  };
  function groundGrid(x, z, ext) {
    const cell = ext > 60 ? 2 : 1, n = Math.ceil(ext * 2 / cell) + 1, h = new Float32Array(n * n), G = g.ground;
    G.qx = x; G.qz = z; if (!G.covers()) return null;
    const x0 = x - ext, z0 = z - ext;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      G.qx = x0 + i * cell; G.qz = z0 + j * cell;
      if (G.covers()) { G.sample(); h[j * n + i] = G.h; } else h[j * n + i] = ov(G.qx, G.qz);
    }
    return { x0, z0, cell, n, h };
  }

  function start(id, r) {
    const s = sites[r.i];
    const seat = view.sites[r.i * 4 + 1];
    if (!(view.sites[r.i * 4 + 3] > 0.5) && !(s.seatY > -1e8)) return false;
    const oy = s.seatY ?? seat;
    const grid = groundGrid(s.at[0], s.at[1], r.ext);
    if (!grid) return false;
    r.origin = [s.at[0], oy, s.at[1]];
    // When each group lets go: the cause's own timing (the lava's arrival), or a wave from the force's side.
    if (r.opt.release && !r.opt.releaseOf) {
      const releaseOf = {};
      const acc = new Map();
      r.debris.frags.forEach((f) => { if (f.fixed) return; const a = acc.get(f.group) || [0, 0, 0, 0]; a[0] += f.pivot[0]; a[1] += f.pivot[1]; a[2] += f.pivot[2]; a[3]++; acc.set(f.group, a); });
      for (const [gid, a] of acc) releaseOf[gid] = Math.max(0, r.opt.release(s.at[0] + a[0] / a[3], s.at[1] + a[2] / a[3], oy + a[1] / a[3]) - r.elapsed);
      r.opt.releaseOf = releaseOf;
      if (!r.opt.done) vars['ruin:' + id] = ruinRecord(r.opt);
    }
    // The pieces at rest where they stood, until the worker moves them.
    const xf = r.view.xf;
    r.debris.frags.forEach((f, k) => { xf[k * 8] = r.origin[0] + f.pivot[0]; xf[k * 8 + 1] = oy + f.pivot[1]; xf[k * 8 + 2] = r.origin[2] + f.pivot[2]; xf[k * 8 + 4] = 0; xf[k * 8 + 5] = 0; xf[k * 8 + 6] = 0; xf[k * 8 + 7] = 1; });
    r.view.upload();
    // Out of sight long enough, or a ruin on loading: straight to rest.
    // (Seen: near the Wraith, the camera, or a scene's place — a cutscene filming it from a kilometre off the Wraith.)
    const cam = g.camera?.position, sf = g.streamFocus, dAt = (x, z) => Math.hypot(x - s.at[0], z - s.at[1]);
    const far = Math.min(dAt(controller.pos.x, controller.pos.z), cam ? dAt(cam.x, cam.z) : Infinity, sf ? dAt(sf.x, sf.z) : Infinity) > 450;
    // (A collapse a scene is going to show — opt.watched — is played out live wherever the camera is when it starts.)
    const finish = r.opt.done || (far && !r.opt.watched);
    const frags = r.debris.frags.map((f) => ({ pivot: f.pivot, half: f.half, vol: f.vol, group: f.group, top: f.top, fixed: f.fixed, mat: f.mat, rot: f.rot }));
    worker.postMessage({ cmd: 'start', id, frags, grid, finish, opt: { origin: r.origin, force: r.opt.force, strength: r.opt.strength ?? 1, seed: r.opt.seed, cause: r.opt.cause, releaseOf: r.opt.releaseOf } });
    r.state = finish ? 'finishing' : 'running';
    // The standing building goes; the pieces take its place.
    s.hidden = true; view.sites[r.i * 4 + 3] = 0;
    if (g.solids?.sites?.[r.i]) g.solids.sites[r.i].seat = NaN;
    r.view.mesh.setEnabled(true);
    g.engine?.snapshotRenderingReset?.();
    return true;
  }

  // Broken ahead of time (a building something is coming for): its pieces and their mesh made and waiting, so its
  // collapse starts without the cost of making them (a town's mesh is a frame's worth of work on its own).
  const prepared = new Map();   // id → { debris, dv } once made, or 'making'
  function breakSite(id, i, then) {
    if (WORKER_SITES.test(id)) {
      if (!breakerReady && g.streamer?.overview) { breaker.postMessage({ cmd: 'init', overview: g.streamer.overview }); breakerReady = true; }
      waiting.set(id, then);
      breaker.postMessage({ cmd: 'build', id, index: i });
    } else then(buildDebris(sites[i], i, rng(0x5a17 + i * 977)));
  }
  function prepare(id) {
    if (prepared.has(id) || ruins.has(id)) return;
    const i = sites.findIndex((s) => s.id === id);
    if (i < 0) return;
    prepared.set(id, 'making');
    breakSite(id, i, (debris) => {
      if (!debris) { prepared.delete(id); return; }
      const dv = createDebrisView(scene, atmosphere, debris, view, ctx, 'ruin-' + id);
      prepared.set(id, { debris, dv });
      warm(dv);
      if (pendingAsk.has(id)) { const opt = pendingAsk.get(id); pendingAsk.delete(id); ruins.delete(id); made(id, i, debris, opt, dv); }
    });
  }
  /** Its pipelines made now, not at its first draw (the colour pass and the shadow pass: half a second of the GPU process's
   *  time on the frame the building goes): drawn a few frames with every piece parked far under the world, then put away. */
  function warm(dv) {
    const xf = dv.xf;
    for (let k = 0; k < xf.length; k += 8) { xf[k] = 0; xf[k + 1] = -1e4; xf[k + 2] = 0; xf[k + 4] = 0; xf[k + 5] = 0; xf[k + 6] = 0; xf[k + 7] = 1; }
    dv.upload(); dv.mesh.setEnabled(true); g.engine?.snapshotRenderingReset?.();
    let n = 0;
    const o = scene.onAfterRenderObservable.add(() => {
      if (++n < 4) return;
      scene.onAfterRenderObservable.remove(o);
      // (Unless its collapse began meanwhile: then it is the ruin's, and stays.)
      if (![...ruins.values()].some((r) => r.view === dv)) { dv.mesh.setEnabled(false); g.engine?.snapshotRenderingReset?.(); }
    });
  }
  const pendingAsk = new Map();
  /** Bring a building down (its pieces are made first: in the breaker for the sites it knows, here otherwise). */
  function collapse(id, opt = {}) {
    if (ruins.has(id)) return ruins.get(id);
    const i = sites.findIndex((s) => s.id === id);
    if (i < 0) return null;
    opt = { ...opt, t0: clock.simTime };
    const r0 = { state: 'breaking', opt };
    ruins.set(id, r0);
    const p = prepared.get(id);
    if (p && p !== 'making') { ruins.delete(id); made(id, i, p.debris, opt, p.dv); }
    else if (p === 'making') pendingAsk.set(id, opt);
    else { prepared.set(id, 'making'); pendingAsk.set(id, opt); prepare0(id, i); }
    return r0;
  }
  function prepare0(id, i) {
    breakSite(id, i, (debris) => {
      if (!debris) { prepared.delete(id); ruins.delete(id); return; }
      const dv = createDebrisView(scene, atmosphere, debris, view, ctx, 'ruin-' + id);
      dv.mesh.setEnabled(false);
      prepared.set(id, { debris, dv });
      const opt = pendingAsk.get(id); pendingAsk.delete(id); ruins.delete(id);
      if (opt) made(id, i, debris, opt, dv);
    });
  }
  function made(id, i, debris, opt, dv) {
    // The colour of its dust: the stuff most of it is (in the cloud: its ash — what it raises is what buried it).
    const count = new Map(); for (const f of debris.frags) if (!f.fixed) count.set(f.mat, (count.get(f.mat) || 0) + f.vol);
    const main = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
    const ext = Math.max(...debris.frags.map((f) => Math.hypot(f.pivot[0], f.pivot[2]) + Math.max(...f.half)), 8) + 25;
    const r = { i, debris, view: dv, mainMat: main, state: 'pending', opt: { force: [1, 0], seed: 1 + i, ...opt }, col: opt.cause === 'surge' ? DUST_OF[5] : DUST_OF[main] || DUST_OF[0], ext, elapsed: 0, origin: null };
    if (opt.char !== undefined) view.char[i] = Math.max(view.char[i], opt.char);
    // (A ruin of the eruption's, loaded: burnt by the lava, or burnt and buried by the cloud — as systems/eruption.js burn()
    // left it; the char lives on the site, not in the record.)
    if (opt.done && !opt.char) { if (opt.cause === 'surge') view.char[i] = Math.max(view.char[i], 1.95); else if (opt.cause === 'lava') view.char[i] = Math.max(view.char[i], 0.95); }
    ruins.set(id, r);
    if (!opt.done) vars['ruin:' + id] = ruinRecord(r.opt);
    r.elapsed = clock.simTime - r.opt.t0;
    start(id, r);
    return r;
  }


  // Ruins from before (a loaded game): down at once, where they lay.
  let restored = false;
  loop.add({ name: 'destruction', update: () => {
    if (!restored && chapter?.graph) {
      restored = true;
      for (const k of Object.keys(vars)) if (k.startsWith('ruin:')) collapse(k.slice(5), { ...vars[k], done: 1 });
    }
    // (Its time runs from when it was asked for: the pieces being made, the ground coming in.)
    for (const [id, r] of ruins) { if (r.state === 'pending') { r.elapsed = clock.simTime - r.opt.t0; start(id, r); } }
    if ([...ruins.values()].some((r) => r.state === 'running')) worker.postMessage({ cmd: 'tick', dt: clock.dt });
    dust.time = clock.simTime; dust.update();
  } });

  // ---- Hinges: a door (any small site) swung about its edge, its prepared pieces posed each frame ----
  // hinge(id, angle, inward): angle() → radians open (0 shut); inward [x, z]: the side it opens to. The standing door is
  // hidden while hinged (site.hinged); a collapse of it takes over (its pieces fall from wherever they are made).
  const hinges = new Map();
  function hinge(id, angle, inward) {
    if (hinges.has(id) || ruins.has(id)) return true;
    const i = sites.findIndex((s) => s.id === id);
    if (i < 0) return false;
    const p = prepared.get(id);
    if (!p) { prepare(id); return false; }
    if (p === 'making') return false;
    const s = sites[i], oy = s.seatY ?? view.sites[i * 4 + 1];
    if (!(oy > -1e8)) return false;
    // The plank's long horizontal axis (its vertices' spread), the hinge at one end of it, mid-thickness.
    const P = p.debris.positions, F = p.debris.frag, fr = p.debris.frags;
    let mx = 0, mz = 0, n = 0;
    for (let v = 0; v < P.length / 3; v++) { const f = fr[F[v * 4]]; mx += f.pivot[0] + P[v * 3]; mz += f.pivot[2] + P[v * 3 + 2]; n++; }
    mx /= n; mz /= n;
    let cxx = 0, cxz = 0, czz = 0;
    for (let v = 0; v < P.length / 3; v++) { const f = fr[F[v * 4]], x = f.pivot[0] + P[v * 3] - mx, z = f.pivot[2] + P[v * 3 + 2] - mz; cxx += x * x; cxz += x * z; czz += z * z; }
    const th = 0.5 * Math.atan2(2 * cxz, cxx - czz), ux = Math.cos(th), uz = Math.sin(th);
    let lo = Infinity;
    for (let v = 0; v < P.length / 3; v++) { const f = fr[F[v * 4]]; lo = Math.min(lo, (f.pivot[0] + P[v * 3] - mx) * ux + (f.pivot[2] + P[v * 3 + 2] - mz) * uz); }
    const hx = mx + ux * lo, hz = mz + uz * lo;
    // Which way round opens inward: the free end, turned a little, toward `inward`.
    const a0 = 0.3, fx = -lo * ux, fz = -lo * uz, rx = fx * Math.cos(a0) + fz * Math.sin(a0), rz = -fx * Math.sin(a0) + fz * Math.cos(a0);
    const sign = ((rx - fx) * inward[0] + (rz - fz) * inward[1]) >= 0 ? 1 : -1;
    s.hinged = true; view.sites[i * 4 + 3] = 0;
    p.dv.mesh.setEnabled(true);
    let bottom = Infinity; for (const f of p.debris.frags) bottom = Math.min(bottom, f.pivot[1] - f.half[1]);
    hinges.set(id, { i, p, oy, hx, hz, sign, angle, last: NaN, threshold: oy + bottom });
    g.engine?.snapshotRenderingReset?.();
    return true;
  }
  loop.add({ name: 'hinges', update: () => {
    for (const [id, h] of hinges) {
      if (ruins.has(id)) { hinges.delete(id); sites[h.i].hinged = false; continue; }
      const a = h.angle() * h.sign;
      if (a === h.last) continue;
      h.last = a;
      const c = Math.cos(a), sn = Math.sin(a), qs = Math.sin(a / 2), qc = Math.cos(a / 2), s = sites[h.i], xf = h.p.dv.xf;
      h.p.debris.frags.forEach((f, k) => {
        const x = f.pivot[0] - h.hx, z = f.pivot[2] - h.hz;
        xf[k * 8] = s.at[0] + h.hx + x * c + z * sn; xf[k * 8 + 1] = h.oy + f.pivot[1]; xf[k * 8 + 2] = s.at[1] + h.hz - x * sn + z * c;
        xf[k * 8 + 4] = 0; xf[k * 8 + 5] = qs; xf[k * 8 + 6] = 0; xf[k * 8 + 7] = qc;
      });
      h.p.dv.upload();
    }
  } });

  /** A hinged door's threshold height (world y), or NaN. */
  const threshold = (id) => hinges.get(id)?.threshold ?? NaN;
  g.destruction = { collapse, prepare, ruins, dust, hinge, threshold };
}
