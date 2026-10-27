#!/usr/bin/env node
// Isolation tests, filmed (docs/gameplay-design.md §9): the bare verb with no content, in the bot's film mode (src/core/bot.js filmRun:
// fixed 60 fps, 1/60 s of game time a frame) in chunks of CHUNK seconds, frames renamed into one numbered run under
// screenshots/isolation/frames/<name>/ (not committed), then encoded by tools/bot/isolation-encode.sh.
//   WRAITH_URL=http://localhost:4177 node tools/bot/isolation-film.mjs <surf|glide|combat> [--dry] [--chunks N] [--chunk S]
// surf   : an empty frost slope, (700, 3440) down to (393, 2766): chunks are runs, the Wraith carried back up between them (a cut).
// glide  : off the Shelf's edge (1440, 2915), the restored frost's Shelf stream worked up between rings 2 and 3, to ring 4, then the surf.
// combat : 3 hounds on flat open ground, the staff and Frost: Sweep, Crystallize (the freeze), the heavy on a frozen one (the shatter).
// Each film prints a JSON line of telemetry (Flow tier seconds, speeds, glide airspeed and sink, hits).
import fs from 'node:fs';
import path from 'node:path';
const base = process.env.WRAITH_URL || 'http://localhost:4177';
const [, , which = 'surf', ...rest] = process.argv;
const opt = (k, d) => { const i = rest.indexOf('--' + k); return i >= 0 ? rest[i + 1] : d; };
const dry = rest.includes('--dry');
const CHUNK = +opt('chunk', 30), CHUNKS = +opt('chunks', which === 'surf' ? 4 : 1);
const RESET_EVERY = +opt('reset', which === 'surf' ? 2 : 1);
const SIZE = [+opt('w', 1920), +opt('h', 1080)];
const bot = async (cmd, a = {}) => {
  const { id } = await (await fetch(base + '/__wraith/bot/cmd', { method: 'POST', body: JSON.stringify({ do: cmd, ...a }) })).json();
  return await (await fetch(`${base}/__wraith/bot/reply?id=${id}&wait=600000`)).json();
};
const ev = async (js) => { const r = await bot('eval', { js }); if (r.ok === false) throw new Error(r.error); return r.result; };

// ---- the per-frame drivers, installed in the page as w.isoStep(dt, cam) -------------------------------------------------
const COMMON = `
  const inj = (k, d) => w.inject(k, d), c = g.controller;
  const wrap = (a) => a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI;
  const ground = (x, z) => { g.ground.qx = x; g.ground.qz = z; g.ground.sample(); return g.ground.h; };
  const I = w.iso = { t: 0, tier: [0, 0, 0, 0], maxSpeed: 0, speedSum: 0, n: 0, cx: 0, cy: 0, cz: 0, hx: 0, hz: 1, vmax: 0, sink: [], air: [], log: [] };
  const chase = (cam, back, up, look, fov, k = 0.08) => {
    const p = c.pos, v = c.vel, sp = Math.hypot(v.x, v.z);
    if (sp > 2) { const a = Math.atan2(v.x, v.z); I.hx += (Math.sin(a) - I.hx) * 0.05; I.hz += (Math.cos(a) - I.hz) * 0.05; }
    const n = Math.hypot(I.hx, I.hz) || 1, hx = I.hx / n, hz = I.hz / n;
    const tx = p.x - hx * back, ty = p.y + up, tz = p.z - hz * back;
    if (!I.cam) { I.cx = tx; I.cy = ty; I.cz = tz; I.cam = true; } else { I.cx += (tx - I.cx) * k; I.cy += (ty - I.cy) * k; I.cz += (tz - I.cz) * k; }
    const gy = ground(I.cx, I.cz) + 1.2; if (I.cy < gy) I.cy = gy;
    cam.at(I.cx, I.cy, I.cz, p.x + hx * look, p.y + 1.2, p.z + hz * look, fov);
  };
  const tally = (dt) => { I.t += dt; I.tier[g.flow.tier] += dt; };
`;

const surfDriver = (path) => `${COMMON}
  const PATH = ${JSON.stringify(path)}; I.idx = 0; I.sp = 0; I.surfT = 0; I.n = 0; I.cam = false;
  w.isoStep = (dt, cam) => {
    const p = c.pos; tally(dt);
    while (I.idx < PATH.length - 1 && Math.hypot(PATH[I.idx][0] - p.x, PATH[I.idx][1] - p.z) < 24) I.idx++;
    const T = PATH[Math.min(I.idx + 1, PATH.length - 1)];
    // Carve: weave across the fall line (the Flow wants grip, not a straight dive).
    const lead = Math.atan2(T[0] - p.x, T[1] - p.z), weave = Math.sin(I.t * 0.7) * 0.5 * Math.min(1, I.idx / 6);
    g.arm.yaw = lead + weave;
    inj('MoveForward', true); inj('Traverse', true);
    const sf = c.surf; if (sf.active) { I.surfT += dt; I.maxSpeed = Math.max(I.maxSpeed, sf.speed); I.speedSum += sf.speed; I.n++; }
    chase(cam, 8.5, 3.2, 14, 0.9);
  };
`;

const glideDriver = () => `${COMMON}
  const gl = c.glide, st = g.streams, RATIO = 7.2 * 0.92;
  const lines = st.list.filter((s) => g.restoration[s.biome] > 0.5);
  const distTo = (s, x, z) => { st.px = x; st.pz = z; return st.distance(st.list.indexOf(s)); };
  let soar = null, dir = 1, flown = false, turned = -9, frame = 0; I.cam = false; I.landed = 0; I.rings = 0; I.soarT = 0; I.lift = 0;
  w.isoStep = (dt, cam) => {
    const p = c.pos; tally(dt);
    const course = g.shelfCourse, T0 = course.rings[Math.min(course.next, course.rings.length - 1)], T = { x: T0.x, y: T0.y, z: T0.z, r: T0.r };
    I.rings = course.next;
    const gh = ground(p.x, p.z), agl = p.y - gh;
    inj('Traverse', !c.grounded && !c.swimming || (flown && !gl.active && c.grounded && I.landed > 0.5));
    if (gl.active) { flown = true; I.air.push(+gl.speed.toFixed(1)); I.sink.push(+gl.vy.toFixed(1)); I.vmax = Math.max(I.vmax, gl.speed); I.lift = Math.max(I.lift, gl.rise || 0); }
    if (flown && !gl.active && c.grounded) I.landed += dt;
    let tx = T.x, tz = T.z;
    const dist = Math.hypot(T.x - p.x, T.z - p.z), reach = (p.y - (T.y - T.r * 0.6)) * RATIO / 1.1;
    if (gl.active && dist > reach && lines.length) {
      let best = null, bc = 1e9;
      for (const s of lines) { const d = distTo(s, p.x, p.z); let ed = 1e9; for (const q of s.pts) ed = Math.min(ed, Math.hypot(q[0] - T.x, q[1] - T.z)); if (d < agl * RATIO * 0.75 + 40 && d + ed < bc) { bc = d + ed; best = s; } }
      if (best) {
        soar = best; I.soarT += dt; const P = best.pts, a = P[0], b = P[P.length - 1];
        const e = dir > 0 ? [a[0] + (b[0] - a[0]) * 0.8, a[1] + (b[1] - a[1]) * 0.8] : [a[0] + (b[0] - a[0]) * 0.2, a[1] + (b[1] - a[1]) * 0.2];
        const gx = ground(e[0] + 10, e[1]) - ground(e[0] - 10, e[1]), gz = ground(e[0], e[1] + 10) - ground(e[0], e[1] - 10), gm = Math.hypot(gx, gz) || 1;
        tx = e[0] - gx / gm * 28; tz = e[1] - gz / gm * 28;
        if ((Math.hypot(tx - p.x, tz - p.z) < 70 || agl < 22) && I.t - turned > 3.5) { dir = -dir; turned = I.t; }
      }
    } else soar = null;
    if (gl.active && agl < 16) { const gx = ground(p.x + 10, p.z) - ground(p.x - 10, p.z), gz = ground(p.x, p.z + 10) - ground(p.x, p.z - 10), gm = Math.hypot(gx, gz) || 1; tx = p.x - gx / gm * 60; tz = p.z - gz / gm * 60; }
    if (course.next >= 4 || (flown && !gl.active && c.grounded)) { tx = 393; tz = 2766; }   // the rings done: down to the flat and the surf
    const want = Math.atan2(tx - p.x, tz - p.z), have = gl.active ? gl.heading : c.yaw;
    let d = wrap(want - have); if (gl.active) d -= gl.turnRate * 0.9;
    const duty = Math.min(1, Math.abs(d) / 0.35), on = (frame++ % 5) < Math.round(duty * 5);
    inj('MoveLeft', gl.active && d < 0 && on); inj('MoveRight', gl.active && d > 0 && on);
    inj('MoveForward', !gl.active); if (gl.active || I.landed > 0) g.arm.yaw = want; else if (!flown) g.arm.yaw = want;
    inj('Jump', !flown && c.grounded && (Math.floor(I.t / 0.4) % 3 === 0));
    I.soar = soar && soar.id;
    chase(cam, gl.active ? 13 : 8, gl.active ? 4.5 : 3.2, 12, 0.95, 0.06);
  };
`;

const combatDriver = () => `${COMMON}
  const S = { TELEGRAPH: 3, LUNGE: 4 }, slots = g.shaped.slots, m = g.weapons.machine, reach = g.weapons.def.combo[0].reach;
  const held = { Primary: false, MoveForward: false, MoveBack: false };
  const set = (n, d) => { if (held[n] !== d) { held[n] = d; inj(n, d); } };
  const tapAt = {}; const tap = (n, ms) => { inj(n, true); setTimeout(() => inj(n, false), ms); };
  let heavyT = -9, tapT = 0, dodged = -9, sweepT = -9, crysT = -9, downSince = -1; I.sweeps = 0; I.crystals = 0; I.shatters = 0; I.heavies = 0; I.cam = false; I.ids = [];
  I.cax = 0; I.caz = 0;
  w.isoStep = (dt, cam) => {
    const p = c.pos, now = I.t; tally(dt);
    let best = -1, bd = 1e9, frozen = -1, fd = 1e9, live = 0;
    for (const i of I.ids) {
      if (!g.shaped.isLive(i)) continue; live++;
      const b = slots[i].body, d = Math.hypot(b.sx[1] - p.x, b.sz[1] - p.z);
      if (g.shaped.isFrozen(i)) { if (d < fd) { fd = d; frozen = i; } } else if (d < bd) { bd = d; best = i; }
    }
    const tgt = frozen >= 0 && fd < 9 ? frozen : best >= 0 ? best : frozen;
    if (tgt >= 0) {
      const b = slots[tgt].body, d = Math.hypot(b.sx[1] - p.x, b.sz[1] - p.z);
      g.arm.yaw = Math.atan2(b.sx[1] - p.x, b.sz[1] - p.z);
      set('MoveForward', d > reach * 0.72 + 0.3 && !m.busy); set('MoveBack', d < 0.8 && !m.busy);
      let threat = false;
      for (const i of I.ids) { if (!g.shaped.isLive(i)) continue; const q = slots[i], qb = q.body; if ((q.state === S.TELEGRAPH || q.state === S.LUNGE) && Math.hypot(qb.sx[1] - p.x, qb.sz[1] - p.z) < 4.2) threat = true; }
      if (threat && now - dodged > 0.9 && m.phase !== 1 && m.phase !== 3) { dodged = now; tap('Dodge', 50); }
      const isFrozen = g.shaped.isFrozen(tgt);
      if (!isFrozen && now - crysT > 3 && best >= 0 && bd > 3 && bd < 9 && g.combat.focus >= 30 && !m.busy) { crysT = now; I.crystals++; tap('Heavy', 60); }
      else if (!isFrozen && now - sweepT > 1.4 && bd > 4.5 && bd < 13 && g.combat.focus >= 14 && !m.busy) { sweepT = now; I.sweeps++; tap('Bend', 45); }
      if (d < reach + 0.4) {
        if (isFrozen || now - heavyT > 3.5) {
          if (m.phase === 0 && downSince < 0) { set('Primary', true); downSince = now; }
          if (downSince >= 0 && now - downSince > 0.55) { set('Primary', false); downSince = -1; heavyT = now; I.heavies++; }
        } else if (now - tapT > 0.2 && downSince < 0) { tapT = now; tap('Primary', 45); }
      } else if (downSince >= 0 && now - downSince > 0.55) { set('Primary', false); downSince = -1; }
    } else { set('Primary', false); set('MoveForward', false); set('MoveBack', false); }
    // Side camera across the line to the fight, 8 m off, looking at the midpoint of the Wraith and the nearest foe.
    let fx = p.x + Math.sin(g.arm.yaw) * 4, fz = p.z + Math.cos(g.arm.yaw) * 4;
    if (tgt >= 0) { const b = slots[tgt].body; fx = (p.x + b.sx[1]) / 2; fz = (p.z + b.sz[1]) / 2; }
    if (!I.cam) { I.cax = fx; I.caz = fz; I.cam = true; } else { I.cax += (fx - I.cax) * 0.08; I.caz += (fz - I.caz) * 0.08; }
    const side = I.side ?? (I.side = g.arm.yaw + Math.PI / 2), cx = I.cax + Math.sin(side) * 9, cz = I.caz + Math.cos(side) * 9;
    cam.at(cx, Math.max(ground(cx, cz) + 1.5, p.y + 2.6), cz, I.cax, p.y + 1, I.caz, 0.75);
  };
`;

// ---- the path of the slope, traced in node from the baked world ------------------------------------------------------------
async function surfPath() {
  const { createWorldSampler } = await import('../world/sample.mjs'); const S = createWorldSampler();
  let x = 700, z = 3440, hd = null; const out = [[x, z]]; let d = 0;
  for (let i = 0; i < 400; i++) {
    const e = 4, gx = (S.h(x + e, z) - S.h(x - e, z)) / (2 * e), gz = (S.h(x, z + e) - S.h(x, z - e)) / (2 * e), m = Math.hypot(gx, gz) || 1e-6;
    const dx = -gx / m, dz = -gz / m; hd = hd ? [hd[0] * 0.85 + dx * 0.15, hd[1] * 0.85 + dz * 0.15] : [dx, dz]; const n = Math.hypot(...hd); hd = [hd[0] / n, hd[1] / n];
    x += hd[0] * 8; z += hd[1] * 8; d += 8; if (d % 24 === 0) out.push([Math.round(x), Math.round(z)]);
    const w = S.water(x, z); if (w.lake > 60 || w.river > 60 || S.slope(x, z) > 0.7 || d > 900) break;
  }
  return out;
}

// ---- setups ----------------------------------------------------------------------------------------------------------------
const settle = `for (let i = 0; i < 300 && !g.game.worldSettled(); i++) await new Promise((r) => setTimeout(r, 100)); await new Promise((r) => setTimeout(r, 2000));`;
async function setup() {
  if (which === 'surf') {
    const path = await surfPath();
    await ev(`g.clock.pinHour = 12.4; g.game.killShaped(); g.game.teleport(${path[0][0]}, ${path[0][1]}); ${settle} g.combat.health = 100; g.combat.focus = 100; g.flow.reset(true); return 1`);
    await ev(surfDriver(path) + 'return 1');
    return { path, resetJs: `g.game.teleport(${path[0][0]}, ${path[0][1]}); ${settle} g.flow.reset(true); const I = window.__wraith.iso; I.idx = 0; I.cam = false; return 1` };
  }
  if (which === 'glide') {
    await ev(`g.clock.pinHour = 12.4; g.game.killShaped(); g.ws.restoration.frost = 'restored'; g.restoration.snap = true; g.elements.unlock('gale');
      const f = g.chapter.graph.flags; f.add('restored:shelf-told');
      g.game.teleport(1446, 2917); ${settle} g.arm.yaw = Math.atan2(1280 - 1446, 2935 - 2917); g.arm.pitch = 0.1; g.combat.health = 100; g.combat.focus = 100; g.flow.reset(true); return 1`);
    await ev(glideDriver() + 'return 1');
    return { resetJs: `g.game.teleport(1446, 2917); ${settle} g.flow.reset(true); g.shelfCourse.next = 0; g.shelfCourse.running = false; const I = window.__wraith.iso; I.cam = false; return 1` };
  }
  // combat: the flattest open frost ground clear of content (860, 2940): 3 m of relief over 60 m, 172 m from the nearest place.
  await ev(`g.clock.pinHour = 12.4; g.game.killShaped(); g.game.teleport(${process.env.AT_X || 860}, ${process.env.AT_Z || 2940}); ${settle}
    g.inventory.give('staff'); g.inventory.equip('staff'); g.weapons.machine.reset(); g.elements.select('frost'); g.combat.health = 100; g.combat.focus = 100; g.combat.dying = 0; g.flow.reset(true);
    return 1`);
  await ev(combatDriver() + `const I = window.__wraith.iso, p = c.pos, f = g.arm.yaw; for (let k = 0; k < 3; k++) { const a = f + (k - 1) * 0.6; I.ids.push(g.shaped.spawn('hound', p.x + Math.sin(a) * 11, p.z + Math.cos(a) * 11)); } await new Promise((r) => setTimeout(r, 2200)); return I.ids`);
  return {};
}

const step = `w.isoStep(1 / 60, cam);`;
const stats = () => ev(`const I = window.__wraith.iso, c = g.controller; const mean = (a) => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : 0;
  return { t: +I.t.toFixed(1), tierSecs: I.tier.map((x) => +x.toFixed(1)), surfMax: +I.maxSpeed.toFixed(1), surfMean: I.n ? +(I.speedSum / I.n).toFixed(1) : 0, glideMax: +I.vmax.toFixed(1), glideMean: mean(I.air), sinkMean: mean(I.sink), sinkMin: I.sink.length ? Math.min(...I.sink) : 0, sinkMax: I.sink.length ? Math.max(...I.sink) : 0,
    lift: +(I.lift || 0).toFixed(1), rings: I.rings, soarT: +(I.soarT || 0).toFixed(1), sweeps: I.sweeps, crystals: I.crystals, heavies: I.heavies, shatters: g.shaped.shattered, alive: I.ids ? I.ids.filter((i) => g.shaped.isLive(i)).length : null,
    hp: +g.combat.health.toFixed(0), pos: [Math.round(c.pos.x), Math.round(c.pos.y), Math.round(c.pos.z)], flowNow: g.flow.tier, late: window.__wraith.gpuStats?.late?.length ?? null };`);

const ctx = await setup();
if (dry) {
  // Live run without filming (real time): the per-frame driver on rAF for CHUNK s.
  const r = await ev(`const I = window.__wraith.iso, dt = 1 / 60; let last = performance.now(), acc = 0; const cam = { at() {} };
    while (I.t < ${CHUNK}) { await new Promise((r) => requestAnimationFrame(r)); const n = performance.now(); acc += Math.min(0.1, (n - last) / 1000); last = n; while (acc >= dt) { window.__wraith.isoStep(dt, cam); acc -= dt; } }
    for (const k of ['MoveForward', 'MoveLeft', 'MoveRight', 'Traverse', 'Jump', 'Primary']) window.__wraith.inject(k, false); return 1`);
  console.log(JSON.stringify(await stats()));
  process.exit(0);
}
const root = path.resolve('screenshots/isolation/frames', which);
fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root, { recursive: true });
let offset = 0;
for (let c = 0; c < CHUNKS; c++) {
  if (c > 0 && ctx.resetJs && c % RESET_EVERY === 0) { await ev(ctx.resetJs); }
  const name = `${which}-c${c}`;
  const r = await bot('film', { name, dir: 'isolation', seconds: CHUNK, fps: 60, size: SIZE, quality: 0.9, warm: c === 0 ? 40 : 6, js: step });
  console.log(JSON.stringify({ chunk: c, ...r }));
  const dir = path.resolve('screenshots/isolation/frames', name);
  for (const f of fs.readdirSync(dir).sort()) fs.renameSync(path.join(dir, f), path.join(root, 'f' + String(offset++).padStart(6, '0') + '.jpg'));
  fs.rmSync(dir, { recursive: true, force: true });
}
await ev(`for (const k of ['MoveForward', 'MoveLeft', 'MoveRight', 'Traverse', 'Jump', 'Primary']) window.__wraith.inject(k, false); return 1`);
console.log(JSON.stringify({ film: which, frames: offset, ...(await stats()) }));
