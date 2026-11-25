// The eruption (docs/phase-11/ember-design.md §7; the mountain's fifth stage, systems/emberClock.js): the day after Fire,
// the Warden's hold breaks. It runs ERUPTION_S seconds of play, then the Waste is left as it is:
//   the blast        the crater explodes: a boom felt everywhere, the plume a black column (STAGES[5]), the lake over its rim
//   the sky          black at noon (the weather's cover and fog, near the mountain), and ash falling (the snowfall, grey)
//   the bells        the Ash Chapel's bell rings on its own (the surge's telegraph): in the first half-minute
//   the surges       a pyroclastic cloud rolls down the south-west flank over the chapel; late on a greater one pours down
//                    the west valley into the Sow (render/plume.js columns along its path, ground-hugging and black)
//   the lava         three flows (data/world/lavaFlows.json; render/lava.js) come down at the speed of their slope: through
//                    Cinderhold, down past the chapel into the basin and over its lip to Gwil's farm, and east into nothing
// What the player can do (§7 "the last rescues are play"): tell those still at home to run (one word at each place still
// lived in — they run for the camp; those still inside when it comes do not live), and Crystallize a lava front to glass,
// which holds it HOLD_S seconds (§4.4: Frost on the ember makes obsidian). Kept the promise to Annick — at her side when
// the bell rings on its own — and she takes the Wraith's hand and goes.
// When a flow or a surge reaches a place: its buildings come down (systems/destruction.js), charred; its people still
// there are lost: under the lava they are gone; in the surge the ash keeps their shapes (an ash-cast, where they stood,
// docs/people-and-cutscenes.md §2). Afterwards: `ember:erupted`, the flows cool black and stay, the dead stay seen.
// State: flags `ember:erupting`, `ember:erupted`, `ember:lost:<place>`, `ember:dead:<npc>`; vars `ember:erupt-t`, `ember:dead`.
// (The Ember Warden's fight in the crater during it, §7, is not built: the Warden is released by the eruption itself.)

import flowData from '../../data/world/lavaFlows.json';
import { createLavaFlows } from '../render/lava.js';
import { createBombs, BOMB_MAX } from '../render/bombs.js';
import { SOW_FARMS, CAMP, sowPoint, sowDoor } from '../world/sow.js';
import { CINDER, CINDER_PTS, cinderWorld } from '../world/cinderhold.js';
import { CHAPEL, CHAPEL_PTS, chapelWorld } from '../world/ashChapel.js';
import { PIT } from '../world/crater.js';
import { villageStayed, STAYED_LEAD, villageWatched, WATCHED_LEAD, townStayed, TOWN_LEAD, chapelStayed, CHAPEL_LEAD, campCount, countLines, warningArrives } from '../game/emberScenes.js';
import { Performance } from '../character/performance.js';

export const ERUPTION_S = 480;
const HOLD_S = 40;
/** The places: their people within r of `at`, their buildings. */
/** How far past a flow's edge its melt takes a building's footing (m); a release time meaning "stands" (game/collapse.js). */
const LAVA_REACH = 8, NEVER = 1e9;
const PLACES = [
  ...SOW_FARMS.map((f) => ({ id: f.id, name: f.id[0].toUpperCase() + f.id.slice(1) + "'s farm", at: f.at, r: 45, sites: [`sow-${f.id}-farm`, `sow-${f.id}-door`, `sow-${f.id}-cart`, `sow-${f.id}-load`, `sow-${f.id}-bundles`] })),
  { id: 'cinderhold', name: 'Cinderhold', at: CINDER.at, r: 110, sites: ['cin-town', 'cin-cage'] },
  { id: 'chapel', name: 'The Ash Chapel', at: CHAPEL.at, r: 70, sites: ['ash-chapel'] },
];
/** The surges: along the Sow flow's path from a point on it, starting at a time, at a speed (m/s), reaching so far. */
const SURGES = [{ id: 'flank', from: 0, to: 1100, t0: 38, speed: 16, spread: 0.03 }, { id: 'valley', from: 1450, to: 2400, t0: 330, speed: 11, spread: 0.22 }];

/** Along a flow: cumulative metres per point. */
function alongOf(f) { const a = [0]; for (let k = 1; k < f.pts.length; k++) a.push(a[k - 1] + Math.hypot(f.pts[k][0] - f.pts[k - 1][0], f.pts[k][1] - f.pts[k - 1][1])); return a; }
/** The front (m along) at flow-time τ: where the arrival times pass τ. */
export function frontAt(f, along, tau) {
  const P = f.pts;
  if (tau <= 0) return 0;
  for (let k = 1; k < P.length; k++) if (P[k][4] > tau) { const t0 = P[k - 1][4], t1 = P[k][4], u = (tau - t0) / Math.max(1e-3, t1 - t0); return along[k - 1] + (along[k] - along[k - 1]) * u; }
  return along[along.length - 1];
}
/** A point at m along: x, z, the ground's y, the half-width, its index. */
function pointAt(f, along, m) { let k = 1; while (k < along.length - 1 && along[k] < m) k++; const u = Math.max(0, Math.min(1, (m - along[k - 1]) / Math.max(1e-3, along[k] - along[k - 1]))), a = f.pts[k - 1], b = f.pts[k]; return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3], k]; }

/** @param {any} g  shared boot context */
export function addEruptionSystem(g) {
  const { chapter, loop, clock, controller, hud, capture, sfx, SFX, arm, scene, atmosphere, weather, snowfall, params } = g;
  if (!chapter.table['ash-annick']) return;
  const flags = chapter.graph.flags, vars = chapter.graph.vars, has = (f) => flags.has(f);
  const say = (t, s, x, secs = 7) => { if (!capture) hud.notice(t, s, x, secs); };
  const flows = flowData.flows, alongs = flows.map(alongOf), sowFlow = flows.findIndex((f) => f.id === 'sow');
  const held = flows.map(() => 0), holdUntil = flows.map(() => -1);
  let lava = null, T = vars['ember:erupt-t'] || 0;
  const E = g.eruption = { T: 0, on: false, done: false, start, fronts: flows.map(() => 0), places: PLACES, rate: 1, fate: null,
    // Stopped by the Ember Warden (systems/emberWarden.js, its release): stopT the eruption's time when it stopped (its
    // fronts held where they were); cool and open (0..1, driven by the release) the lava crusting over and the ash parting.
    stopT: 0, quell: 0, cool: 0, open: 0, stop, finish };   // quell: the column falling and the lake crusting over

  // The surges' clouds: dense ash billows thrown along the moving front (render/dust.js), rolling on at its speed.
  let surgeAcc = 0;
  const surgeFront = (s, t) => (t < s.t0 ? -1 : Math.min(s.to, s.from + (t - s.t0) * s.speed));

  // Tell them to run: one word at each place still lived in.
  const runs = PLACES.map((pl) => {
    const it = { kind: 'ember', id: 'run-' + pl.id, verb: 'Tell them to run', name: pl.name, x: pl.at[0], y: 0, z: pl.at[1], r: Math.min(30, pl.r), h: 1.6, hidden: true,
      onUse: () => {
        const ppl = peopleAt(pl).filter((n) => !n.fleeing);
        let went = 0;
        for (const n of ppl) { if (n.id === 'ember-annick' && !has('ember:seer-forced') && !has('ember:annick-came')) continue; flee(n); went++; }
        say(pl.name, went ? 'They run' : 'She will not go', went ? 'Out of the doors and down the road for the camp, carrying what is in their hands.' : 'Annick stands at the spring with her back to you.', 6);
      } };
    g.interactables.push(it); return it;
  });

  const npcsOf = () => (g.npcs || []).filter((n) => n.id.startsWith('ember-') && n.id !== 'ember-cole');
  function peopleAt(pl) { return npcsOf().filter((n) => !n.dead && !n.hide && Math.hypot(n.x - pl.at[0], n.z - pl.at[1]) < pl.r); }
  function flee(n) {
    n.fleeing = true;
    const a = Math.random() * Math.PI * 2, slot = [CAMP.at[0] + Math.cos(a) * 12, CAMP.at[1] + Math.sin(a) * 12];
    n.brain = (q, dt) => {
      const pd = Math.hypot(controller.pos.x - q.x, controller.pos.z - q.z), dx = slot[0] - q.x, dz = slot[1] - q.z, d = Math.hypot(dx, dz);
      if (d < 0.5) { q.vx = q.vz = 0; q.noLook = false; q.hunch = 0.4; return; }
      const sp = pd > 150 ? 14 : 3.6;
      q.vx = dx / d * sp; q.vz = dz / d * sp; q.x += q.vx * dt; q.z += q.vz * dt; q.yaw = Math.atan2(dx, dz); q.noLook = true; q.hunch = 0.15; q.hide = false;
    };
  }
  /** Lost: under the lava (gone), or kept by the ash where it found them. */
  /** The ash-casts falling apart (shaders/cloth.wgsl.js: ash 1..2): cracking a moment, then flakes and chunks dropping away
   *  from the top down, until about half of each is gone — a broken, hollow cast left where they stood. */
  const crumbling = [];
  function crumbleStep(dt) {
    for (const c of crumbling) {
      if (c.done) continue;
      c.t += dt;
      const k = Math.min(0.62, Math.max(0, c.t - 0.7) / 6.5), n = c.n;
      n.view?.setAsh?.(1 + k);   // (the figure's render view — render/wraith.js — set directly: frozen, it is not updated)
      if (n.costume && g.costumes) { if (n.costume.hat) g.costumes.ash(n.costume.hat, 1 + k); if (n.costume.basket) g.costumes.ash(n.costume.basket, 1 + k); }
      // Flakes from where it is breaking (high first, lower as it goes), and now and then a puff of the dust it makes.
      const D = g.ruinDust;
      if (D && k > 0 && k < 0.62) {
        const y0 = (n.y || 0) + 1.85 - k * 2.4;
        for (let i = 0; i < 5; i++) { const a = Math.random() * 6.283, r = 0.12 + Math.random() * 0.22;
          D.spawn(n.x + Math.cos(a) * r, y0 + Math.random() * 0.5, n.z + Math.sin(a) * r, Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3, (i < 2 ? 0.07 + Math.random() * 0.09 : 0.025 + Math.random() * 0.05), 0.36, 0.34, 0.32, -(0.9 + Math.random() * 0.6)); }
        if (Math.random() < dt * 5) D.spawn(n.x, y0, n.z, (Math.random() - 0.5) * 0.4, 0.1, (Math.random() - 0.5) * 0.4, 0.25 + Math.random() * 0.25, 0.34, 0.32, 0.3, 3 + 2 * Math.random());
      }
      if (k >= 0.62) c.done = true;
    }
  }
  function lose(n, how, dir, now = false) {
    n.dead = true; flags.add('ember:dead:' + n.id); vars['ember:dead'] = (vars['ember:dead'] || 0) + 1;
    if (how === 'lava') {
      flags.add('ember:dead-lava:' + n.id);
      if (n.target) { n.target.hidden = true; n.target = null; }
      if (n.inside) { n.brain = (q) => { q.hide = true; }; return; }   // (they went in: the house is where they are)
      // They turn and run from it, a few steps, before the glow takes them (on loading: simply gone).
      let t = now ? 99 : 0;
      const ax = dir ? dir[0] : 0, az = dir ? dir[1] : 1;
      n.brain = (q, dt) => {
        t += dt;
        if (t > 3.6) { q.hide = true; q.vx = q.vz = 0; return; }
        const sp = 3.4 * Math.min(1, t * 2);
        q.vx = ax * sp; q.vz = az * sp; q.x += q.vx * dt; q.z += q.vz * dt; q.yaw = Math.atan2(ax, az); q.noLook = true; q.hunch = 0.25; q.hide = false;
      };
      return;
    }
    let t = now ? 20 : 0, swirl = now ? 99 : 0;   // (on loading: already cast, already broken)
    n.brain = (q, dt) => {
      // (Fine ash in the air round them as it settles on them: small, slow, drifting with the cloud — not its billows.)
      swirl -= dt;
      if (g.ruinDust && t < 9 && swirl <= 0) { swirl = 0.08; const a = Math.random() * 6.283, r = 0.3 + Math.random() * 1.4;
        g.ruinDust.spawn(q.x + Math.cos(a) * r, (q.y || 0) + 0.4 + Math.random() * 1.8, q.z + Math.sin(a) * r, (dir ? dir[0] : 0) * 0.6, 0, (dir ? dir[1] : 0) * 0.6, 0.02 + Math.random() * 0.04, 0.36, 0.34, 0.32, -(1.2 + Math.random())); }   // (tiny falling flakes: a puff this close fills the lens)
      q.vx = q.vz = 0; q.noLook = true; t += dt; const ak = Math.min(1, Math.max(0, t - 1.5) / 4); q.view.ash = ak;   // (render/wraith.js reads the view's own: clothFrost.w)
      // Cast: held still; then it cracks and falls apart (crumbleStep below).
      if (t > 5.8 && !q.frozen) { q.frozen = true; crumbling.push({ n: q, t: now ? 99 : 0 }); } };   // (the cloud over them first, then the ash climbing them: the scene's close-ups watch it)
    if (n.target) { n.target.hidden = true; n.target = null; }
  }

  let toPrepare = [], prepT = 0;
  /** The Warden has plugged the vent: no more lava, bombs or lightning; the fronts stop where they are. */
  function stop() {
    if (!E.on) return;
    E.on = false; E.stopT = T; vars['ember:stopped-t'] = T; vars['ember:stopped-fronts'] = E.fronts.slice();
    flags.delete('ember:erupting');
  }
  /** And it is over (the release's end, or a skip): as the mountain's own end, with the land cooled and the sky open. */
  function finish() {
    if (E.done) return;
    if (E.on) stop();
    E.quell = E.cool = E.open = 1;
    flags.add('ember:erupted'); flags.add('ember:stopped'); E.done = true;
    resolveAftermath();
    closeQuests();
    chapter.raise?.('ember:erupted');
    for (const it of runs) it.hidden = true;
  }
  function start() {
    if (E.on || E.stopT || has('ember:erupted')) return;
    E.on = true; flags.add('ember:erupting'); T = vars['ember:erupt-t'] || 0;
    // Every place it may reach, broken ahead (one a moment, so no frame carries two).
    if (!E.prepared) { toPrepare = PLACES.flatMap((p) => p.sites); E.prepared = true; }
    if (T < 1) {
      sfx.x = controller.pos.x; sfx.y = controller.pos.y; sfx.z = controller.pos.z; sfx.gain = 1.4; sfx.play(SFX.BOOM);
      if (arm) arm.shake += 0.12;
      say('The mountain', 'The hold breaks', 'The summit goes up in a column of black. The ground throws you. Lava is over the crater\'s rim.', 9);
      chapter.raise?.('ember:erupting');
    }
  }
  function ensureLava() {
    if (lava) return;
    lava = g.lavaFlows = createLavaFlows(scene, atmosphere, flowData);
    if (g.shadows && g.bindShadows) g.bindShadows(lava.material, g.shadows);
    lava.freeze();
    g.engine?.snapshotRenderingReset?.();
  }

  // The flows' light on the land round them: segments along each flow's hot stretch (the clipmap's lavaSegs, seen from
  // anywhere), brightest at the front; and a light at each front in the world's grid (people, walls, the Wraith).
  const frontLights = flows.map(() => null);
  function lavaLight() {
    const cl = g.content?.clipmap, S = cl?.lavaSegs;
    if (!S) return;
    S.fill(0);
    const PER = Math.floor(S.length / 8 / flows.length);
    flows.forEach((f, i) => {
      const fr = E.fronts[i], A = alongs[i], held = holdUntil[i] > T;
      if (!(fr > 1)) { if (frontLights[i]) frontLights[i].level = 0; return; }
      const L = Math.min(fr, 700), cool = (E.done && !E.stopT ? Math.max(0, 1 - (T - ERUPTION_S) / 300) : 1) * (1 - E.cool);
      for (let k = 0; k < PER; k++) {
        const m0 = fr - L * (k + 1) / PER, m1 = fr - L * k / PER;
        const a = pointAt(f, A, Math.max(0, m0)), b = pointAt(f, A, m1);
        // Heat of that stretch: by how long ago the front passed it.
        const age = Math.max(0, T - f.pts[b[4]][4]), heat = Math.max(0.08, 0.95 - age / 320) * cool * (held && k === 0 ? 0.2 : 1);
        const o = (i * PER + k) * 8;
        S[o] = a[0]; S[o + 1] = a[2] + 1; S[o + 2] = a[1]; S[o + 3] = heat * (k === 0 ? 2.6 : 1.6);
        S[o + 4] = b[0]; S[o + 5] = b[2] + 1; S[o + 6] = b[1]; S[o + 7] = b[3] + 10;
      }
      if (!frontLights[i] && g.worldLights) frontLights[i] = g.worldLights.add({ x: 0, y: 0, z: 0, radius: 55, color: [1, 0.36, 0.08], intensity: 160, kind: 'fire', level: 0 });
      const fl = frontLights[i];
      if (fl) { const p = pointAt(f, A, fr); fl.x = p[0]; fl.y = p[2] + 3; fl.z = p[1]; fl.level = (held ? 0.15 : 1) * cool * (fr >= A[A.length - 1] - 1 ? 0.6 : 1); }
    });
  }

  // ---- Volcanic bombs: rock torn from the crater and clots of lava, thrown out of the summit ----
  // A volley at the blast, then bursts every few seconds, thinning as the eruption tires; up to half a kilometre high and
  // most of a kilometre out (the chapel and Cinderhold are under them). They fly on their arcs (gravity, the air's drag,
  // a tumble of their own), smoke behind them, land with a thud and a burst of dust, and stay where they fell, cooling.
  const bombs = [];   // { x, y, z, vx, vy, vz, q:[4], ax, ay, az, w, s, temp, landed, life }
  let bombView = null, nextBurst = 0, bombSeed = 12345;
  const brnd = () => { bombSeed = (Math.imul(bombSeed, 1664525) + 1013904223) >>> 0; return bombSeed / 4294967296; };
  const ovGround = (x, z) => {
    const G = g.ground; G.qx = x; G.qz = z;
    if (G.covers()) { G.sample(); return G.h; }
    const O = g.streamer?.overview; if (!O) return -1e4;
    const u = (x + 4096) / 8 - 0.5, v = (4096 - z) / 8 - 0.5, i = Math.max(0, Math.min(1022, Math.floor(u))), j = Math.max(0, Math.min(1022, Math.floor(v))), fu = u - i, fv = v - j;
    const H = (a, b) => O[b * 1024 + a] / 32 - 128;
    return (H(i, j) * (1 - fu) + H(i + 1, j) * fu) * (1 - fv) + (H(i, j + 1) * (1 - fu) + H(i + 1, j + 1) * fu) * fv;
  };
  function throwBomb(big) {
    if (!bombView) { bombView = createBombs(scene, atmosphere); if (g.shadows && g.bindShadows) g.bindShadows(bombView.material, g.shadows); bombView.freeze(); }
    // (The oldest landed one makes way when all are out.)
    if (bombs.length >= BOMB_MAX) { const k = bombs.findIndex((b) => b.landed); if (k < 0) return; bombs.splice(k, 1); }
    const a = brnd() * Math.PI * 2, r = brnd() * 35, el = (55 + 30 * brnd()) * Math.PI / 180, sp = (big ? 70 : 45) + 50 * brnd(), az = brnd() * Math.PI * 2;
    const s = 0.6 + 5.0 * Math.pow(brnd(), 2.2) * (big ? 1.3 : 1);
    const ax = brnd() - 0.5, ay = brnd() - 0.5, azz = brnd() - 0.5, al = Math.hypot(ax, ay, azz) || 1;
    bombs.push({ x: PIT.x + Math.cos(a) * r, y: lakeLevel() + 4, z: PIT.z + Math.sin(a) * r, vx: Math.cos(el) * Math.cos(az) * sp, vy: Math.sin(el) * sp, vz: Math.cos(el) * Math.sin(az) * sp,
      q: [0, 0, 0, 1], ax: ax / al, ay: ay / al, az: azz / al, w: 0.5 + 2.5 * brnd(), s, temp: 1, landed: false, smoke: 0, id: bombSeed });
  }
  const lakeLevel = () => g.volcano?.level ?? 736;
  function bombsStep(dt) {
    if (E.on) {
      // The blast's volley, then bursts.
      if (T < 5 && bombs.length < 90) for (let k = 0; k < 6; k++) throwBomb(true);
      nextBurst -= dt * E.rate;
      if (nextBurst <= 0 && T > 4 && T < ERUPTION_S) {
        const tire = 1 - 0.7 * T / ERUPTION_S;
        nextBurst = (1.5 + 4 * brnd()) / tire;
        const n = Math.round((5 + 12 * brnd()) * tire);
        for (let k = 0; k < n; k++) throwBomb(brnd() < 0.2);
        sfx.x = PIT.x; sfx.y = lakeLevel() + 20; sfx.z = PIT.z; sfx.gain = 0.9; sfx.play(SFX.BOOM);
      }
    }
    if (!bombs.length) return;
    const p = controller.pos, dust = g.ruinDust;
    let moving = false;
    for (const b of bombs) {
      if (b.landed) { b.temp = Math.max(0, b.temp - dt / 140); continue; }
      moving = true;
      // Gravity and the air (a big rock barely slowed, a small one more).
      const sp = Math.hypot(b.vx, b.vy, b.vz), drag = 0.0016 / Math.max(0.4, b.s) * sp;
      b.vx -= b.vx * drag * dt; b.vz -= b.vz * drag * dt; b.vy -= (9.81 + b.vy * drag) * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      const th = b.w * dt * 0.5, sn = Math.sin(th), dq = [b.ax * sn, b.ay * sn, b.az * sn, Math.cos(th)], q = b.q;
      b.q = [dq[3] * q[0] + dq[0] * q[3] + dq[1] * q[2] - dq[2] * q[1], dq[3] * q[1] - dq[0] * q[2] + dq[1] * q[3] + dq[2] * q[0], dq[3] * q[2] + dq[0] * q[1] - dq[1] * q[0] + dq[2] * q[3], dq[3] * q[3] - dq[0] * q[0] - dq[1] * q[1] - dq[2] * q[2]];
      b.temp = Math.max(0.55, b.temp - dt / 60);
      // Its smoke behind it (only where it can be seen to matter).
      const near = Math.hypot(b.x - p.x, b.z - p.z) < 1600;
      b.smoke -= dt;
      if (dust && near && b.smoke <= 0) { b.smoke = 0.05; const sh = 0.7 + 0.5 * Math.random(); dust.spawn(b.x - b.vx * 0.02, b.y - b.vy * 0.02, b.z - b.vz * 0.02, b.vx * 0.04, 0.8, b.vz * 0.04, 1.4 + b.s * 1.5, 0.07 * sh, 0.065 * sh, 0.06 * sh, 7 + 4 * Math.random()); }
      // Down.
      if (b.vy < 0) {
        const gy = ovGround(b.x, b.z);
        if (b.y - b.s * 0.5 < gy) {
          b.landed = true; b.y = gy + b.s * 0.25; b.vx = b.vy = b.vz = 0;
          const d = Math.hypot(b.x - p.x, b.z - p.z);
          if (dust && d < 1800) dust.burst(b.x, gy + 0.5, b.z, 3 + Math.round(b.s * 3), 1 + b.s * 1.6, 2 + b.s * 2, [0.13, 0.12, 0.11], 14, 0.6);
          if (d < 600) { sfx.x = b.x; sfx.y = gy; sfx.z = b.z; sfx.gain = Math.min(1.2, 0.3 + b.s * 0.3); sfx.play(b.s > 1.5 ? SFX.BOOM : SFX.THUD); }
          if (arm && d < 120) arm.shake += Math.min(0.08, b.s * 0.02 * (1 - d / 120));
          // The Wraith under it.
          if (d < b.s * 1.6 + 2.5 && Math.abs(p.y - gy) < 4) {
            const co = g.combat; if (co && co.dying <= 0) co.health -= Math.min(Math.max(0, co.health - co.maxHealth * 0.25), co.maxHealth * 0.25);
            controller.vel.x = (p.x - b.x) / (d || 1) * 8; controller.vel.z = (p.z - b.z) / (d || 1) * 8; controller.vel.y = 5;
            say('A bomb', 'Rock from the mountain', '', 3);
          }
        }
      }
    }
    // Up to the GPU.
    const R = bombView.rec;
    for (let k = 0; k < BOMB_MAX; k++) {
      const b = bombs[k], o = k * 12;
      if (!b) { R[o + 3] = 0; continue; }
      R[o] = b.x; R[o + 1] = b.y; R[o + 2] = b.z; R[o + 3] = b.s;
      R[o + 4] = b.q[0]; R[o + 5] = b.q[1]; R[o + 6] = b.q[2]; R[o + 7] = b.q[3];
      R[o + 8] = b.temp;
    }
    bombView.upload();
    if (!bombView.mesh.isEnabled()) { bombView.mesh.setEnabled(true); g.engine?.snapshotRenderingReset?.(); }
    void moving;
  }

  // Frost on a front: glass, held.
  let wasCrystal = false;
  function crystal() {
    const fr = g.frost; if (!fr) return;
    const ev = fr.crystalEvent && !wasCrystal; wasCrystal = !!fr.crystalEvent;
    if (!ev) return;
    flows.forEach((f, i) => {
      const [x, z, , hw] = pointAt(f, alongs[i], E.fronts[i]);
      if (E.fronts[i] <= 0 || E.fronts[i] >= alongs[i][alongs[i].length - 1] - 1) return;
      if (Math.hypot(fr.crystalX - x, fr.crystalZ - z) > hw + 10) return;
      holdUntil[i] = T + HOLD_S;
      sfx.x = x; sfx.y = controller.pos.y; sfx.z = z; sfx.gain = 1; sfx.play(SFX.SHATTER);
      say('The lava front', 'It stops, glass', 'The ice flashes to steam and the face of the flow goes black and glassy. It will not hold for long.', 6);
    });
  }

  /** The aftermath (the survivors' camp, systems/sow.js; the lines and the journal, data/quests/ember.json, data/remembrance.json):
   *  each community's outcome, once, from its own people — by where they lived, alive or not, gone to the camp or not.
   *  A Sow household that got anyone out has `ember:<id>-go` (its clearing at the camp; its lie, `-lied`, kept); one that
   *  lost someone at home and got no one out, `ember:<id>-stays`. Cinderhold and the chapel: `ember:fled-<id>` when any of
   *  them reached the camp, `ember:lost-<id>` when any died (both, when it went both ways). Then `ember:after`. */
  function resolveAftermath() {
    if (has('ember:after')) return;
    for (const pl of PLACES) {
      const ppl = npcsOf().filter((n) => Math.hypot(n.home[0] - pl.at[0], n.home[1] - pl.at[1]) < pl.r);
      const out = ppl.some((n) => !n.dead && (n.fleeing || n.gone || Math.hypot(n.x - CAMP.at[0], n.z - CAMP.at[1]) < 120));
      const died = ppl.some((n) => n.dead);
      if (pl.id === 'cinderhold' || pl.id === 'chapel') {
        if (out) flags.add('ember:fled-' + pl.id);
        if (died) flags.add('ember:lost-' + pl.id);
      } else if (out || has(`ember:${pl.id}-lied`)) flags.add(`ember:${pl.id}-go`);
      else if (died) flags.add(`ember:${pl.id}-stays`);
      // Stopped by the Ember Warden before it came to them: those who stayed at home are there still (fate: nothing reached it).
      if (has('ember:stopped') && !out && !died && !has(`ember:${pl.id}-lied`) && !fate.get(pl.id) && ppl.length) flags.add(pl.id === 'cinderhold' || pl.id === 'chapel' ? 'ember:spared-' + pl.id : `ember:${pl.id}-spared`);
    }
    flags.add('ember:after');
  }

  /** The mountain has decided what the Wraith did not: the Ember quests still open close where they stood (state 'closed':
   *  no goal, no marker — questGraph.goals() lists only active ones — and the journal keeps the lines reached). */
  function closeQuests() {
    const qs = chapter.graph.quests;
    for (const id in qs) if (id.startsWith('ember-') && qs[id].state === 'active') qs[id].state = 'closed';
    // (One never begun cannot begin now — no boy waiting at the shrine for a mountain that has gone: 'gone', not shown.)
    for (const id in qs) if (id.startsWith('ember-') && qs[id].state === 'locked') qs[id].state = 'gone';
  }
  /** When the lava is due at a place in s (eruption seconds; Infinity if no flow comes there). */
  function lavaEta(pl) {
    let eta = Infinity;
    flows.forEach((f, i) => {
      let best = Infinity, bk = -1;
      f.pts.forEach((p, k) => { const d = Math.hypot(p[0] - pl.at[0], p[1] - pl.at[1]); if (d < best) { best = d; bk = k; } });
      if (bk >= 0 && best < f.pts[bk][3] + pl.r * 0.5 && alongs[i][bk] > E.fronts[i]) eta = Math.min(eta, f.pts[bk][4] - T);
    });
    return eta;
  }
  /** The village that stayed (game/emberScenes.js): when the lava is a little way off a place whose people are still at
   *  home, and the Wraith is not there to see it, the scene cuts to them — once per place (flag `ember:scene:<id>`). */
  /** The village that left, watching (game/emberScenes.js villageWatched): when the lava is a little way off a farm whose
   *  family got out and stands at the headland camp, the scene cuts to them watching it go — once per eruption, and only if
   *  no village that stayed has had its scene (that one comes first: the loop asks stayedScene before this). */
  function watchedScene(pl) {
    if (!g.scenes || capture || has('ember:scene-played') || has('ember:scene:' + pl.id)) return;
    const farm = SOW_FARMS.find((f) => f.id === pl.id);
    if (farm && !(has(`ember:${pl.id}-go`) || has(`ember:${pl.id}-lied`))) return;   // (Cinderhold, the chapel: whoever of it reached the camp)
    const fam = npcsOf().filter((n) => !n.dead && n.home && Math.hypot(n.home[0] - pl.at[0], n.home[1] - pl.at[1]) < pl.r && Math.hypot(n.x - CAMP.at[0], n.z - CAMP.at[1]) < 220);
    if (!fam.length) return;
    if (Math.hypot(controller.pos.x - pl.at[0], controller.pos.z - pl.at[1]) < 220 || Math.hypot(controller.pos.x - CAMP.at[0], controller.pos.z - CAMP.at[1]) < 160) return;
    // (Timed to what takes it: Cinderhold's way is the winding tower on the lava's path; the chapel goes to the cloud.)
    const tower = cinderWorld(CINDER_PTS.engine), chapelAt = chapelWorld(CHAPEL_PTS.chapel);
    const eta = (pl.id === 'cinderhold' ? etaAt(tower[0], tower[1], LAVA_REACH + 3) : Math.min(etaAt(pl.at[0], pl.at[1], LAVA_REACH + 16), surgeEta(pl))) / Math.max(E.rate, 1e-3);
    if (!(eta < WATCHED_LEAD && eta > WATCHED_LEAD - 6)) return;
    flags.add('ember:scene:' + pl.id); flags.add('ember:scene-played');
    watched.add(pl.id);
    const focus = pl.id === 'cinderhold' ? tower : pl.id === 'chapel' ? chapelAt : null, far = pl.id === 'cinderhold' ? 2.4 : pl.id === 'chapel' ? 2.2 : 1;
    // At the lookout, beside the camp's own watchers (systems/campLife.js stands figures in its places), facing their farm.
    const lk = g.archSites.find((s) => s.id === 'emb-camp-lookout'), base = lk && !lk.hidden ? lk.at : CAMP.at;
    // (Toward the mountain: from the headland the Sow lies behind the wooded hills — they cannot see the farm, only the
    // mountain over the ridge it lies under.)
    const toward = Math.atan2(PIT.x - base[0], PIT.z - base[1]), cx = Math.cos(toward), cz = -Math.sin(toward);
    fam.forEach((n, k) => {
      const side = 2.4 + 1.0 * k;
      n.x = base[0] + cx * side - Math.sin(toward) * 0.5; n.z = base[1] + cz * side - Math.cos(toward) * 0.5; n.yaw = toward; n.hide = false;
      let t = 0, played = false;
      n.brain = (q, dt) => {
        t += dt;
        q.vx = q.vz = 0; q.noLook = true; q.hunch = 0.15 + 0.1 * k;
        if (q._perf) { const c = q._perf, xf = q.xf; c.x = xf.ox + (q.x - xf.ox) / xf.s; c.y = xf.oy + ((q.y || 0) - xf.oy) / xf.s; c.z = xf.oz + (q.z - xf.oz) / xf.s; }
        // One covers their face; the other turns to them and holds them. The rest are not a chorus: a few look up at the
        // mountain, each in their own time (or not at all); most simply stand and watch.
        const hk = Math.abs(Math.sin(k * 91.7 + 4.3) * 43758.5453) % 1;
        const when = k === 0 ? 22.2 : k === 1 ? 23.4 : hk > 0.55 ? 5 + 13 * hk + 1.7 * k : Infinity;
        if (!played && t > when) {
          played = true;
          const name = k === 0 ? 'emb-grief' : k === 1 ? 'emb-comfort' : (k % 2 ? 'emb-stare-b' : 'emb-stare-a'), b = sceneClips[name];
          if (b) { const c = new Performance(b); c.restart(0); c.yaw = toward; c.scale = 1; q.view.wraith.performance = c; q._perf = c; }
        }
        if (!q._perf) q.yaw += (((toward - q.yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * Math.min(1, dt * 2);
      };
    });
    // (Cinderhold and the chapel get their own wide shot of it: the tower beat of townStayed, the cloud beat of chapelStayed.)
    const awayOf = (p) => Math.atan2(p[0] - PIT.x, p[1] - PIT.z);
    const place = pl.id === 'cinderhold' ? { dur: 13, subject: { point: tower, up: 8 }, rig: 'static', yaw: awayOf(tower) - 0.5, dist: 46, height: 11, fov: 0.62, drift: 0.12 }
      : pl.id === 'chapel' ? { dur: 11, subject: { point: chapelAt, up: 25 }, rig: 'static', yaw: awayOf(chapelAt) - 0.35, dist: 110, height: 16, fov: 0.8, drift: 0.1 } : null;
    g.scenes.play(villageWatched({ name: pl.name, site: pl.sites[0], people: fam.map((n) => n.id), toward, focus, far, place }), { stale: 4 });
  }

  /** Where a place's people gather: a farm's door (world/sow.js), else its middle. */
  function farmDoor(pl) { const t = chapter.table?.[`sow-${pl.id}-yard`]?.pos || chapter.table?.[`sow-${pl.id}-door`]?.pos; return t ? [t[0], t.length > 2 ? t[2] : t[1]] : pl.at; }
  /** When the lava first comes within `reach` m (past its edge) of (x, z) — the first of its points that close, not the
   *  nearest: it runs along a building's side, reaching the upstream end first — in eruption seconds (Infinity: never). */
  function etaAt(x, z, reach) {
    let eta = Infinity;
    flows.forEach((f, i) => f.pts.forEach((p, k) => {
      if (alongs[i][k] > E.fronts[i] && Math.hypot(p[0] - x, p[1] - z) < p[3] + reach) eta = Math.min(eta, p[4] - T);
    }));
    return eta;
  }
  /** Cinderhold that stayed (game/emberScenes.js townStayed): the guild goes to the winding tower over the shaft — the
   *  lava's way through the town (data/world/lavaFlows.json: between the galleries, past the shaft) — and in at its door;
   *  the lava comes to it and it goes, with them. */
  function townScene(pl, ppl) {
    const tower = cinderWorld(CINDER_PTS.engine);
    const eta = etaAt(tower[0], tower[1], LAVA_REACH + 3) / Math.max(E.rate, 1e-3);
    if (!(eta < TOWN_LEAD && eta > TOWN_LEAD - 8)) return;
    flags.add('ember:scene:' + pl.id); flags.add('ember:scene-played');
    watched.add(pl.id);
    // The tower's door (world/towerKit.js windingTower: the ground floor's east face, the tower turned by 0.1), its step
    // (world/cinderhold.js), and just inside.
    const ya = 0.1 + Math.PI / 2, nx = Math.sin(ya), nz = Math.cos(ya);
    const at = (d, s = 0) => [tower[0] + nx * d - nz * s, tower[1] + nz * d + nx * s];
    const front = at(4.6), within = at(1.0), door = at(2.4);
    const hsh = (a) => { const x = Math.sin(a * 77.7 + 3.1) * 43758.5453; return x - Math.floor(x); };
    // (The head of the guild first, if he is there: he stands at the door and waves them in, and goes in last.)
    const order = [...ppl].sort((a, b) => (b.id === 'ember-orrin') - (a.id === 'ember-orrin'));
    // They are out in the yard south of the tower, the lamps lit, looking up at the mountain.
    order.forEach((n, k) => { const p = at(4.5 + (k % 3) * 1.6, -(10 + Math.floor(k / 3) * 1.7 + hsh(k + 9))); n.x = p[0]; n.z = p[1]; n.yaw = Math.atan2(PIT.x - n.x, PIT.z - n.z); n.vx = n.vz = 0; });
    let inCount = 0;
    const arrivals = [];
    order.forEach((n, k) => {
      let t = 0, leg = 0, waved = false;
      // (They start for the tower as its shot begins: game/emberScenes.js townStayed, the fourth beat at 13 s.)
      const go = 12.6 + 0.7 * k + 0.5 * hsh(k), side = k ? ((k % 2) ? 1 : -1) * (0.75 + 0.3 * k) : 0;
      n.brain = (q, dt) => {
        t += dt;
        if (q._perf) { const c = q._perf, xf = q.xf; c.x = xf.ox + (q.x - xf.ox) / xf.s; c.y = xf.oy + ((q.y || 0) - xf.oy) / xf.s; c.z = xf.oz + (q.z - xf.oz) / xf.s; }
        if (t < go) { q.vx = q.vz = 0; q.noLook = true; q.yaw += ((((Math.atan2(PIT.x - q.x, PIT.z - q.z) - q.yaw) + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * Math.min(1, dt * 2); return; }
        const goal = leg === 0 ? at(4.6 + Math.abs(side) * 0.5, side) : leg === 1 ? front : within;
        const dx = goal[0] - q.x, dz = goal[1] - q.z, d = Math.hypot(dx, dz);
        if (leg === 0 && d < 0.5) {
          q.vx = q.vz = 0;
          if (k === 0 && !waved && order.length > 1) { waved = true; const b = sceneClips['emb-beckon']; if (b) { const c = new Performance(b); c.restart(0); c.yaw = ya; c.scale = 1; q.view.wraith.performance = c; q._perf = c; } }
          // In one at a time in the order they reach the door; the head of the guild last, once the others are in or have
          // had time to come.
          if (!q._queued) { q._queued = true; arrivals.push(q); }
          const me = arrivals.indexOf(q), before = arrivals.slice(0, me).filter((o) => o !== order[0]);
          const ready = k === 0 ? (inCount >= arrivals.length - 1 && t > go + 2.5) || t > go + 9 : before.every((o) => o._inside) && t > go + 0.6;
          if (ready) { if (q._perf) { q._perf.leave(); q._perf = null; } leg = 1; }
          return;
        }
        if (leg === 1 && d < 0.35) { leg = 2; return; }
        if (leg === 2 && d < 0.4) { q.hide = true; q.inside = true; q._inside = true; q.vx = q.vz = 0; inCount++; leg = 3; return; }
        if (leg === 3) return;
        const sp = Math.min(leg ? 1.6 : 2.4, d * 2.2);
        q.vx = dx / d * sp; q.vz = dz / d * sp; q.x += q.vx * dt; q.z += q.vz * dt; q.yaw = Math.atan2(dx, dz); q.noLook = true; q.hunch = 0.25;
      };
    });
    const fi = flows.findIndex((f, i) => nearFlow(i, pl));
    const subjects = fi >= 0 ? { front: (out) => { const p = pointAt(flows[fi], alongs[fi], E.fronts[fi]); out[0] = p[0]; out[1] = p[2]; out[2] = p[1]; return out; } } : {};
    g.scenes.play(townStayed({ name: pl.name, site: 'cin-town', people: order.map((n) => n.id), door, tower,
      away: Math.atan2(pl.at[0] - PIT.x, pl.at[1] - PIT.z) }), { stale: 4, subjects });
  }
  /** The chapel that stayed (game/emberScenes.js chapelStayed): the faithful before the door, facing the summit, while the
   *  bell rings on its own; the cloud comes down over them (doom: 'surge' — the ash keeps their shapes). */
  function chapelScene(pl, ppl) {
    const eta = surgeEta(pl) / Math.max(E.rate, 1e-3);
    if (!(eta < CHAPEL_LEAD && eta > CHAPEL_LEAD - 8)) return;
    flags.add('ember:scene:' + pl.id); flags.add('ember:scene-played');
    watched.add(pl.id);
    const chapel = chapelWorld(CHAPEL_PTS.chapel), gather = chapelWorld([-4, -15]);
    const toward = Math.atan2(PIT.x - gather[0], PIT.z - gather[1]), fx = Math.sin(toward), fz = Math.cos(toward), rx = fz, rz = -fx;
    // Annick in front, nearest the mountain; the faithful behind her in two short rows, a little apart, as they came out.
    const order = [...ppl].sort((a, b) => (b.id === 'ember-annick') - (a.id === 'ember-annick'));
    const hsh = (a) => { const x = Math.sin(a * 91.3 + 1.7) * 43758.5453; return x - Math.floor(x); };
    order.forEach((n, k) => {
      const row = k === 0 ? 0 : 1 + Math.floor((k - 1) / 3), col = k === 0 ? 0 : ((k - 1) % 3) - 1;
      const f = 1.4 - row * 1.3 + (hsh(k) - 0.5) * 0.4, r = col * 1.25 + (row === 2 ? 0.6 : 0) + (hsh(k + 5) - 0.5) * 0.35;
      n.x = gather[0] + fx * f + rx * r; n.z = gather[1] + fz * f + rz * r; n.vx = n.vz = 0; n.hide = false;
      n.yaw = toward + (hsh(k + 11) - 0.5) * 0.3;
      let t = 0, played = false;
      n.brain = (q, dt) => {
        t += dt;
        q.vx = q.vz = 0; q.noLook = true; q.hunch = k === 0 ? 0 : 0.1 + 0.08 * (k % 3);
        if (q._perf) { const c = q._perf, xf = q.xf; c.x = xf.ox + (q.x - xf.ox) / xf.s; c.y = xf.oy + ((q.y || 0) - xf.oy) / xf.s; c.z = xf.oz + (q.z - xf.oz) / xf.s; }
        // (As they look up at the summit, one after another: the stare, each in their own time.)
        // (Not all, and never together: about half, seconds apart; Annick, at the front, stands still.)
        if (!played && k > 0 && hsh(k + 3) > 0.45 && t > 8.8 + 2.3 * (k - 1) + 1.6 * hsh(k + 7)) {
          played = true;
          const b = sceneClips[k % 4 === 0 ? 'emb-stare-a' : 'emb-stare-b'];
          if (b) { const c = new Performance(b); c.restart(0); c.yaw = toward; c.scale = 1; q.view.wraith.performance = c; q._perf = c; }
        }
        if (!q._perf) q.yaw += (((toward - q.yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * Math.min(1, dt * 1.5);
      };
    });
    g.scenes.play(chapelStayed({ name: pl.name, site: pl.sites[0], people: order.map((n) => n.id), chapel, gather,
      away: Math.atan2(chapel[0] - PIT.x, chapel[1] - PIT.z) }), { stale: 4 });
  }
  /** The camp on the coast (game/emberScenes.js campCount): after the eruption, the first time the Wraith comes up to the
   *  headland, the survivors gather at the fire and one of them counts who came from each place — and who did not. */
  /** The warning (game/emberScenes.js warningArrives): the first time the Wraith comes up to the Cinder Shrine, Cole comes
   *  running down the mountain to it, gets his breath, and tells it (his talk: chapter data, which sets ember:warned). */
  const SHRINE = [990, -1322];
  function warningScene() {
    if (!g.scenes || capture || has('ember:warned') || has('ember:scene:warning') || g.scenes.busy || chapter.talking) return;
    const p = controller.pos;
    if (Math.hypot(p.x - SHRINE[0], p.z - SHRINE[1]) > 110) return;
    const cole = (g.npcs || []).find((n) => n.id === 'ember-cole' && !n.dead);
    if (!cole) return;
    flags.add('ember:scene:warning');
    // (Staged in the open: the nearest clearing — no crown or shrub within 5 m, the line toward the mountain clear — the
    // Wraith brought to it as the scene cuts in. In the woods round the shrine, filmed where it happened to stand, every
    // camera was in a bush.)
    const near = g.trees?.crownNear;
    if (near) {
      const m0 = Math.atan2(PIT.x - p.x, PIT.z - p.z);
      search: for (let r = 0; r <= 70; r += 5) for (let k = 0; k < (r ? 16 : 1); k++) {
        const a = k / 16 * Math.PI * 2, sx = p.x + Math.sin(a) * r, sz = p.z + Math.cos(a) * r;
        if (near(sx, sz, 7)) continue;   // (the Wraith, and the camera a few metres behind it, in the open)
        if (g.trees.sightClear && !g.trees.sightClear(sx + Math.sin(m0) * 28, sz + Math.cos(m0) * 28, sx, sz, 0)) continue;
        if (r) g.requestTeleport(sx, sz);
        break search;
      }
    }
    // From up the slope toward the mountain, down to a pace and a half in front of the Wraith.
    // (He comes from the mountain's side, along whichever line nearest it runs clear of crowns and shrubs — render/trees.js
    // sightClear — so he is seen all the way and the cameras round him are not in a bush.)
    const mountain = Math.atan2(PIT.x - p.x, PIT.z - p.z), clear = g.trees?.sightClear;
    let toward = mountain;
    for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.8, -1.8, 2.3, -2.3, Math.PI]) {
      const a = mountain + da, ox = p.x + Math.sin(a) * 28, oz = p.z + Math.cos(a) * 28;
      const near = g.trees?.crownNear, tx = p.x + Math.sin(a) * 1.9, tz = p.z + Math.cos(a) * 1.9;
      if (!clear || (clear(ox, oz, p.x, p.z, 0) && clear(p.x - Math.sin(a + 0.9) * 7, p.z - Math.cos(a + 0.9) * 7, tx, tz, 0) && !(near && near(tx, tz, 2.6)))) { toward = a; break; }
    }
    // (The close shot from his side that is open.)
    const sideOpen = (sd) => !g.trees?.crownNear || !g.trees.crownNear(p.x + Math.sin(toward) * 1.9 + Math.sin(toward + sd) * 2.4, p.z + Math.cos(toward) * 1.9 + Math.cos(toward + sd) * 2.4, 0.6);
    const side = sideOpen(Math.PI / 2) ? Math.PI / 2 : -Math.PI / 2;
    const fx = Math.sin(toward), fz = Math.cos(toward);
    const from = [p.x + fx * 28 + fz * 4, p.z + fz * 28 - fx * 4], to = [p.x + fx * 1.9, p.z + fz * 1.9];
    cole.x = from[0]; cole.z = from[1]; cole.hide = false; cole.yaw = Math.atan2(to[0] - from[0], to[1] - from[1]);
    let t = 0, arrived = false;
    cole.brain = (q, dt) => {
      t += dt; q.noLook = true;
      const dx = to[0] - q.x, dz = to[1] - q.z, d = Math.hypot(dx, dz);
      if (!arrived && t > 1.2 && d > 0.25) {
        // (A boy running down a mountain: fast, a little ragged.)
        const sp = Math.min(3.9 + 0.4 * Math.sin(t * 5.3), d * 3);
        q.vx = dx / d * sp; q.vz = dz / d * sp; q.x += q.vx * dt; q.z += q.vz * dt; q.yaw = Math.atan2(dx, dz); q.hunch = 0.2;
        return;
      }
      if (t > 1.2) arrived = true;
      // Bent over, getting his breath, facing the Wraith.
      q.vx = q.vz = 0; q.yaw = Math.atan2(controller.pos.x - q.x, controller.pos.z - q.z);
      q.hunch = arrived ? 0.45 + 0.12 * Math.sin(t * 6) * Math.max(0, 1 - (t - 9) / 6) : 0.1;
    };
    g.scenes.play(warningArrives({ messenger: cole.id, from, to, toward, side }), { stale: 4, blendIn: 0.6, onEnd: () => { cole.brain = null; cole.noLook = false; chapter.talk('ember-cole'); } });
  }
  function campScene() {
    if (!g.scenes || capture || !has('ember:after') || has('ember:scene:count') || g.scenes.busy) return;
    if (Math.hypot(controller.pos.x - CAMP.at[0], controller.pos.z - CAMP.at[1]) > 70) return;
    const near = (n) => !n.dead && Math.hypot(n.x - CAMP.at[0], n.z - CAMP.at[1]) < 220;
    const here = npcsOf().filter(near);
    if (!here.length) return;
    flags.add('ember:scene:count');
    const of = (pl) => npcsOf().filter((n) => n.home && Math.hypot(n.home[0] - pl.at[0], n.home[1] - pl.at[1]) < pl.r);
    const rows = PLACES.map((pl) => { const res = of(pl); return { pl, name: pl.name, res: res.length, here: res.filter(near).length, lost: res.filter((n) => n.dead).length }; });
    const lines = countLines(rows);
    // Who keeps the count: Annick if she came, else the head of the guild, else the eldest of the farms.
    const pick = ['ember-annick', 'ember-orrin', 'ember-gwil', 'ember-aled', 'ember-mari'];
    const counter = here.find((n) => n.id === pick.find((id) => here.some((h) => h.id === id))) || here[0];
    // One of a place that lost someone, if any came.
    const lostPl = rows.filter((r) => r.lost && r.here).map((r) => r.pl);
    const mourner = here.find((n) => n !== counter && lostPl.some((pl) => Math.hypot(n.home[0] - pl.at[0], n.home[1] - pl.at[1]) < pl.r)) || null;
    // The ring round the fire: the counter at the mountain's side of it, the rest facing them across the fire.
    const fire = CAMP.at, toward = Math.atan2(PIT.x - fire[0], PIT.z - fire[1]);
    const cx = fire[0] + Math.sin(toward) * 2.6, cz = fire[1] + Math.cos(toward) * 2.6;
    counter.x = cx; counter.z = cz; counter.yaw = toward + Math.PI; counter.hide = false;
    // (The one who lost someone at the middle of the ring, straight across the fire: their close-up is clear of the others.)
    const rest = here.filter((n) => n !== counter && n !== mourner);
    if (mourner) rest.splice(Math.floor(rest.length / 2), 0, mourner);
    rest.forEach((n, k) => {
      const a = toward + Math.PI + (k - (rest.length - 1) / 2) * Math.min(0.42, 2.6 / Math.max(1, rest.length)), r = n === mourner ? 3.1 : 3.5 + 0.5 * ((k * 7) % 3) / 2;   // (the mourner a step in front)
      n.x = fire[0] + Math.sin(a) * r; n.z = fire[1] + Math.cos(a) * r; n.yaw = Math.atan2(cx - n.x, cz - n.z); n.hide = false;
    });
    const per = 3.4, griefAt = 6 + 5.5 + 2.4 + lines.length * per + 0.6;
    for (const n of here) {
      let t = 0, played = false;
      const yaw0 = n.yaw;
      n.brain = (q, dt) => {
        t += dt; q.vx = q.vz = 0; q.noLook = true; q.yaw = yaw0; q.hunch = q === counter ? 0.05 : 0.15;
        if (q._perf) { const c = q._perf, xf = q.xf; c.x = xf.ox + (q.x - xf.ox) / xf.s; c.y = xf.oy + ((q.y || 0) - xf.oy) / xf.s; c.z = xf.oz + (q.z - xf.oz) / xf.s; }
        if (q === mourner && !played && t > griefAt) {
          played = true; const b = sceneClips['emb-grief'];
          if (b) { const c = new Performance(b); c.restart(0); c.yaw = yaw0; c.scale = 1; q.view.wraith.performance = c; q._perf = c; }
        }
      };
    }
    g.scenes.play(campCount({ people: here.map((n) => n.id), counter: counter.id, mourner: mourner?.id || null, lines, fire, who: counter.name,
      faceYaw: toward + Math.PI, toward, mournerYaw: mourner ? mourner.yaw : 0 }), { stale: 4, blendIn: 0 });
  }
  function stayedScene(pl) {
    // (One per eruption: the first village that stayed. A second, straight after, the same shape, would feel like a template.)
    if (!g.scenes || capture || has('ember:scene:' + pl.id) || has('ember:scene-played')) return;
    const ppl = peopleAt(pl).filter((n) => !n.fleeing);
    if (!ppl.length || Math.hypot(controller.pos.x - pl.at[0], controller.pos.z - pl.at[1]) < 220) return;
    if (pl.id === 'cinderhold') { townScene(pl, ppl); return; }
    if (pl.id === 'chapel') { chapelScene(pl, ppl); return; }
    if (!SOW_FARMS.some((f) => f.id === pl.id)) return;
    // (Timed to the lava reaching the house — where it actually comes first — not the farm's middle.)
    const eta = Math.min(etaAt(pl.at[0], pl.at[1], LAVA_REACH + 16), surgeEta(pl)) / Math.max(E.rate, 1e-3);
    if (!(eta < STAYED_LEAD && eta > STAYED_LEAD - 8)) return;
    flags.add('ember:scene:' + pl.id); flags.add('ember:scene-played');
    watched.add(pl.id);
    // They see it: each turns to the mountain in their own time; then they go to each other in the yard; then, as it comes,
    // one after the other, in through the door — it swings open, they step through, the last pulls it shut behind them.
    const door = farmDoor(pl), dp = chapter.table?.[`sow-${pl.id}-door`]?.pos, inDoor = dp ? [dp[0], dp.length > 2 ? dp[2] : dp[1]] : door;
    const farm0 = SOW_FARMS.find((f) => f.id === pl.id), fwd0 = farm0 ? sowPoint(farm0, 0, 10) : null;
    let ox = 0, oz = 1;
    if (fwd0) { ox = fwd0[0] - farm0.at[0]; oz = fwd0[1] - farm0.at[1]; const l = Math.hypot(ox, oz) || 1; ox /= l; oz /= l; }
    // (The doorway itself, from the house's geometry: just outside it, and in through it into the dark.)
    const inDoor0 = farm0 ? sowDoor(farm0, 0) : inDoor;
    const outside = farm0 ? sowDoor(farm0, 1.9) : [inDoor[0] + ox * 1.1, inDoor[1] + oz * 1.1], within = farm0 ? sowDoor(farm0, -0.9) : [inDoor[0] - ox * 0.9, inDoor[1] - oz * 0.9];
    const hsh = (a) => { const x = Math.sin(a * 91.7 + pl.id.length * 13.1) * 43758.5453; return x - Math.floor(x); };
    // The door: open once the first of them is at it, shut a moment after the last is through.
    const D = { openAt: Infinity, shutAt: Infinity, t: 0 };
    const doorAngle = () => {
      const u = D.t;
      const open = Math.min(1, Math.max(0, (u - D.openAt) / 0.8)), shut = Math.min(1, Math.max(0, (u - D.shutAt) / 0.8));
      const e = (x) => x * x * (3 - 2 * x);
      return 1.75 * e(open) * (1 - e(shut));
    };
    const doorId = `sow-${pl.id}-door`;
    g.destruction?.prepare(doorId);
    let hinged = false, inCount = 0;
    // Their movement: walking is the body's own; the moments that carry it are clips made with Kimodo and passed through the
    // motion gate (docs/phase-10/motion-gate.md; data/motion/manifest.json): each stares at the mountain in their own take,
    // and whoever reaches the door first beckons the other in.
    const plan = ppl.map((n, k) => ({
      react: (has('ember:lie-found') ? 0.2 : 0.4 + 1.2 * hsh(k + 1)) + 0.5 * k,   // seconds before they turn to it (watching it already, after the lie)
      turn: 1.4 + 1.8 * hsh(k + 2),                       // how fast they turn
      pace: 1.8 + 0.8 * hsh(k + 3),                       // their walk
      stare: k % 2 ? 'emb-stare-b' : 'emb-stare-a',
      stareAt: 11.6 + 1.7 * k + 0.6 * hsh(k + 4),        // their take, in its own shot (game/emberScenes.js)
      goIn: 15.9 + 1.4 * k + 0.3 * hsh(k + 5),            // one after the other
      leg: 0,
    }));
    const wrap = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    /** A clip on a person, where they stand, facing yaw (the figure's simulation space: systems/npcs.js xf). */
    const perform = (q, name, yaw) => {
      const b = sceneClips[name]; if (!b) return null;
      const c = new Performance(b); c.restart(0); place(q, c, yaw); q.view.wraith.performance = c; q._perf = c; return c;
    };
    const place = (q, c, yaw) => { const xf = q.xf; c.x = xf.ox + (q.x - xf.ox) / xf.s; c.y = xf.oy + ((q.y || 0) - xf.oy) / xf.s; c.z = xf.oz + (q.z - xf.oz) / xf.s; c.yaw = yaw; c.scale = 1; };
    const stopClip = (q) => { if (q._perf) { q._perf.leave(); q._perf = null; } };
    let atDoor = 0;
    ppl.forEach((n, k) => {
      let t = 0;
      const P = plan[k];
      n.brain = (q, dt) => {
        t += dt; if (k === 0) D.t = t; P.q = q;
        if (!hinged && t > 6 && g.destruction?.hinge) hinged = g.destruction.hinge(doorId, doorAngle, [-ox, -oz]);
        const face = (yaw, rate) => { q.yaw += wrap(yaw - q.yaw) * Math.min(1, dt * rate); };
        const toMountain = Math.atan2(PIT.x - q.x, PIT.z - q.z);
        if (q._perf) place(q, q._perf, q._perf.yaw);
        if (t < P.react) { q.vx = q.vz = 0; q.noLook = false; q.hunch = 0.3; return; }
        // They turn to it, and stare (their take, once), until it is time to go in.
        if (t < P.goIn) {
          q.vx = q.vz = 0; q.noLook = true; q.hunch = 0.1;
          if (!P.stared && t > P.stareAt && Math.abs(wrap(toMountain - q.yaw)) < 0.25) { P.stared = true; perform(q, P.stare, toMountain); }
          if (!q._perf) face(toMountain, P.turn);
          return;
        }
        if (P.leg === 0 && !P.walking) { P.walking = true; stopClip(q); }
        // To the door; the first there beckons the others in; it opens when they are all at it; through it, and in.
        // (The others wait beside the doorway, a stride to the side, not in the one in front's place.)
        const goal = P.leg === 0 ? [outside[0] + (k ? (k % 2 ? 1 : -1) * oz * 1.0 + ox * 0.3 : 0), outside[1] + (k ? -(k % 2 ? 1 : -1) * ox * 1.0 + oz * 0.3 : 0)] : within;
        const dx = goal[0] - q.x, dz = goal[1] - q.z, d = Math.hypot(dx, dz);
        if (P.leg === 0 && d < 0.4) {
          if (!P.arrived) { P.arrived = true; atDoor++; if (atDoor === 1 && ppl.length > 1) { const o = ppl[1 - Math.min(k, 1)]; perform(q, 'emb-beckon', Math.atan2(o.x - q.x, o.z - q.z)); } }
          if (atDoor === ppl.length && D.openAt === Infinity) D.openAt = t;
          q.vx = q.vz = 0;
          if (!q._perf) face(Math.atan2(-ox, -oz), 4);
          // Through it in their order, once it is open (the beckoner last but one: they wait for the other).
          // (In single file: the next only once the one before is nearly through — a doorway is a metre wide.)
          const prev = k ? plan[k - 1] : null;
          const clear = !prev || prev.counted || (prev.leg === 1 && prev.q && Math.hypot(prev.q.x - within[0], prev.q.z - within[1]) < 1.3);
          if (doorAngle() > 1.2 && clear) { stopClip(q); P.leg = 1; }
          return;
        }
        // (Up the steps and over the sill: world/sow.js builds them as floors, so the figure's ground carries them up.)
        if (P.leg === 1 && d < 0.35) {
          q.hide = true; q.inside = true; q.vx = q.vz = 0;   // in, behind the walls
          if (!P.counted) { P.counted = true; inCount++; if (inCount === ppl.length) D.shutAt = t + 0.25; }
          return;
        }
        const sp = Math.min(P.pace, d * 2.2);
        q.vx = dx / d * sp; q.vz = dz / d * sp; q.x += q.vx * dt; q.z += q.vz * dt; face(Math.atan2(dx, dz), 8); q.noLook = true; q.hunch = 0.25 + 0.1 * hsh(k + 9);
      };
    });
    const farm = SOW_FARMS.find((f) => f.id === pl.id), yardAt = farm ? sowPoint(farm, 0, 10) : null;
    const front = yardAt ? [yardAt[0] - farm.at[0], yardAt[1] - farm.at[1]] : undefined;
    // (The front, live: the scene's camera watches it come — world x, y, z.)
    const fi = flows.findIndex((f, i) => nearFlow(i, pl));
    const subjects = fi >= 0 ? { front: (out) => { const p = pointAt(flows[fi], alongs[fi], E.fronts[fi]); out[0] = p[0]; out[1] = p[2]; out[2] = p[1]; return out; } } : {};
    // (While the scene opens on the Wraith — out of shot — they are put in the front yard, a few strides from the door, so no
    // walk to it crosses the house.)
    // (After the lie was found out — the night it was meant to go, and it did not — they are not at work: they stand at
    // their own door, watching the mountain that did not come, already turned to it. docs/people-and-cutscenes.md §3.2.)
    const lie = has('ember:lie-found');
    if (farm0) ppl.forEach((n, k) => { const sp = sowDoor(farm0, (lie ? 2.0 : 2.4) + (lie ? 0.5 : 1.3) * k); const side = (k % 2 ? 1 : -1) * (lie ? 0.55 + 0.25 * k : 0.6 + 0.5 * k); n.x = sp[0] + oz * side; n.z = sp[1] - ox * side; n.yaw = Math.atan2(PIT.x - n.x, PIT.z - n.z) + (lie ? 0.15 * (k % 2 ? 1 : -1) : 2.6); });
    const doorAt = farm0 ? sowDoor(farm0, 1.2) : outside;
    subjects.door = (out) => { out[0] = doorAt[0]; out[1] = g.scenes.groundAt(doorAt[0], doorAt[1]); out[2] = doorAt[1]; return out; };
    g.scenes.play(villageStayed({ name: pl.name, at: pl.at, site: pl.sites[0], people: ppl.map((n) => n.id), front }), { stale: 4, subjects });
  }

  // The places' fates.
  const fate = E.fate = new Map(PLACES.map((p) => [p.id, null]));
  /** The scene's clips (data/motion: Kimodo, gated), fetched once. */
  const sceneClips = {};
  for (const name of ['emb-stare-a', 'emb-stare-b', 'emb-beckon', 'emb-grief', 'emb-comfort']) fetch(import.meta.env.BASE_URL + 'motion/' + name + '.bin').then((r) => r.arrayBuffer()).then((b) => { sceneClips[name] = b; }).catch(() => {});
  /** Places a scene is watching (their collapse timed into its shots). */
  const watched = new Set();
  function doom(pl, how, dir) {
    fate.set(pl.id, how);
    // (The cloud takes everyone it covers at once; the lava only those it reaches — lavaTakes() below, as it comes.)
    if (how !== 'lava') for (const n of peopleAt(pl)) lose(n, how, dir);
    // The cloud over the place itself as it takes it: billows rolling through it on the cloud's way (render: surge billows).
    if (how === 'surge' && g.ruinDust) for (let k = 0; k < 260; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * pl.r * 0.9, sp = 6 + 8 * Math.random(), sz = 12 + 14 * Math.random(), sh = 0.7 + 0.35 * Math.random();
      const x = pl.at[0] + Math.cos(a) * r - dir[0] * 25 * Math.random(), z = pl.at[1] + Math.sin(a) * r - dir[1] * 25 * Math.random();
      const gy = g.scenes?.groundAt ? g.scenes.groundAt(x, z) : 0;
      g.ruinDust.spawn(x, gy + 1 + Math.random() * 10, z, dir[0] * sp, 0.5 * Math.random(), dir[1] * sp, -sz, 0.34 * sh, 0.31 * sh, 0.28 * sh, 12 + 8 * Math.random());
    }
    const lost = npcsOf().filter((n) => n.dead && Math.hypot(n.x - pl.at[0], n.z - pl.at[1]) < pl.r + 40).length;
    if (lost) flags.add('ember:lost:' + pl.id);
    // Its buildings: down, from the side it came, charred; the lava's places as the front reaches each piece.
    const fi = how === 'lava' ? flows.findIndex((f, i) => nearFlow(i, pl)) : -1;
    // (No char yet: the heat builds on them as it comes — burn() below — and the fire takes them.)
    for (const id of pl.sites) {
      g.destruction?.collapse(id, { force: dir, cause: how, strength: how === 'surge' ? 1.6 : 1, seed: id.length * 31 + 7, watched: watched.has(pl.id),
        release: fi >= 0 ? (x, z, y) => releaseByFlow(fi, x, z, y, watched.has(pl.id)) : undefined });
      const si = g.archSites.findIndex((s) => s.id === id);
      if (si >= 0 && !burning.has(id)) burning.set(id, { si, heat: 0, how, t: 0, fires: [] });
    }
  }
  // The heat on what the lava or the cloud has reached: the char creeps over it (the lava's places over half a minute,
  // the cloud's in seconds), and fire takes the roofs and the timber — flames and smoke on the pieces themselves, riding
  // them down as they fall, burning out over a minute and a half (the fire slots 48.. : render/fire.js).
  const burning = new Map();
  const FIRE0 = 48, FIREN = 16;
  function burn(dt) {
    const F = g.fire?.fires, FX = g.fire?.fireX, FL = g.fire?.fireL, arch = g.architecture;
    if (!F || !arch) return;
    let slot = FIRE0;
    // Nearest burning places first (the slots are few).
    const list = [...burning.entries()].sort((a, b) => dist2(a[1]) - dist2(b[1]));
    for (const [id, b] of list) {
      b.t += dt * E.rate;
      b.heat = Math.min(1, b.heat + dt * E.rate / (b.how === 'surge' ? 6 : 32));
      // (The cloud's: charred and then buried in its ash — over 1, shaders/architecture.wgsl.js — dark as the ground it lies on.)
      arch.char[b.si] = Math.max(arch.char[b.si], b.how === 'surge' ? b.heat * 1.95 : b.heat * 0.95);
      const r = g.destruction?.ruins.get(id);
      if (!r || !r.debris || !r.view) continue;
      // Its fires: on its highest pieces of timber, thatch or roof (else its highest of all), a few per building.
      if (!b.picked && b.heat > 0.12) {
        b.picked = true;   // (once: a stone town has nothing to burn, and is not searched again every frame)
        // (Only on what comes down: a building the lava does not reach stands, and does not burn.)
        const rel = r.opt?.releaseOf;
        // (And only what burns: timber, thatch, planks, cloth. Stone and iron do not take fire — a basalt tower under the
        // lava glows and smokes, it does not stand in flames.)
        // (In the cloud: none — it chars and smothers; its own billows are the smoke.)
        const BURNS = b.how === 'surge' ? new Set() : new Set([2, 3, 9, 12, 13]);
        const fr = r.debris.frags.map((f, k) => [f, k]).filter(([f]) => !f.fixed && BURNS.has(f.mat) && !(rel && rel[f.group] >= NEVER));
        fr.sort((a, c) => c[0].top - a[0].top);
        const pick = [];
        for (const [f, k] of fr) { if (pick.length >= 4) break; if (pick.every(([g2]) => Math.hypot(g2.pivot[0] - f.pivot[0], g2.pivot[2] - f.pivot[2]) > 3)) pick.push([f, k]); }
        // (A small piece — a post, a sleeper, a cart — smoulders and smokes; a roof's timbers stand in flame.)
        // (Each catches when the lava gets to it — its release — not when the lava first touches the place.)
        b.fires = pick.map(([f, k], n) => ({ k, start: b.t + (rel && rel[f.group] < NEVER ? rel[f.group] * E.rate : 0) + n * 1.5, size: 1.1 + 0.8 * ((k * 7) % 5) / 5, small: f.vol < 0.5 }));
      }
      for (const fire of b.fires) {
        if (slot >= FIRE0 + FIREN) break;
        const age = b.t - fire.start, xf = r.view.xf, k = fire.k;
        const grow = Math.max(0, Math.min(1, age / 12)) * (1 - Math.max(0, Math.min(1, (age - 80) / 25)));
        const o = slot * 4;
        F[o] = xf[k * 8]; F[o + 1] = xf[k * 8 + 1] + 0.2; F[o + 2] = xf[k * 8 + 2]; F[o + 3] = grow > 0.01 ? fire.size * (0.4 + 0.9 * grow) : 0;
        // (Fire the lava lit is low and smoky — timber charring in the heat — not a tall bright flame like a lamp's.)
        FX[o] = 2.4; FX[o + 1] = grow * (fire.small ? 0.12 : b.how === 'lava' ? 0.5 : 0.22); FX[o + 2] = 1; FX[o + 3] = 1;
        FL[o] = 1; FL[o + 1] = 0; FL[o + 2] = 0; FL[o + 3] = 0;
        slot++;
      }
    }
    for (; slot < FIRE0 + FIREN; slot++) F[slot * 4 + 3] = 0;
  }
  const dist2 = (b) => { const s = g.archSites[b.si]; return (s.at[0] - controller.pos.x) ** 2 + (s.at[1] - controller.pos.z) ** 2; };
  /** Seconds from now until flow i's front is nearest (x, z) (its pieces let go as it gets there). */
  function releaseByFlow(i, x, z, y = 0, fast = false) {
    const f = flows[i]; let best = Infinity, bk = 0;
    f.pts.forEach((p, k) => { const d = Math.hypot(p[0] - x, p[1] - z); if (d < best) { best = d; bk = k; } });
    // When the front gets there (and its edge spreads out to the piece), then the time the melt takes to eat through
    // its footing — seconds to half a minute, piece by piece (a hash of where it is: never two walls alike).
    const h = Math.sin(x * 12.9898 + z * 78.233 + y * 37.719) * 43758.5453, rnd = h - Math.floor(h);
    // (A place a scene is watching: the same order, sooner — the fall lands inside the scene's shot of it, not after.)
    // What the lava does not reach stands: only a piece within the flow's edge (and a few metres past it, where the melt
    // pushes out under the footing) lets go. NEVER, not Infinity: it saves (JSON) with the ruin.
    if (best > f.pts[bk][3] + LAVA_REACH) return NEVER;
    // When the front gets there (its own arrival time on the flow, in real seconds at the eruption's rate), then the melt
    // eating through the footing: longer the further it has to push out past the flow's edge.
    const arrive = Math.max(0, f.pts[bk][4] - T) / Math.max(E.rate, 1e-3), soak = Math.max(0, best - f.pts[bk][3]) * 0.3;
    if (fast) return arrive + soak * 0.5 + 3.5 + 4 * rnd;
    return arrive + soak + 1.5 + 6 * rnd;
  }
  function nearFlow(i, pl) { return flows[i].pts.some((p) => Math.hypot(p[0] - pl.at[0], p[1] - pl.at[1]) < p[3] + pl.r * 0.5); }
  /** Has flow i's front reached place pl? (Any of its points within the place, behind the front: its first building.) */
  function lavaAt(i, pl) {
    const f = flows[i];
    return f.pts.some((p, k) => alongs[i][k] <= E.fronts[i] && Math.hypot(p[0] - pl.at[0], p[1] - pl.at[1]) < p[3] + pl.r * 0.75);
  }
  /** How far along the surges' path a place lies (m: its nearest point). */
  const surgeMs = new Map();
  function surgeM(pl) {
    if (!surgeMs.has(pl.id)) {
      const f = flows[sowFlow]; let best = Infinity, bk = 0;
      f.pts.forEach((p, k) => { const d = Math.hypot(p[0] - pl.at[0], p[1] - pl.at[1]); if (d < best) { best = d; bk = k; } });
      surgeMs.set(pl.id, alongs[sowFlow][bk]);
    }
    return surgeMs.get(pl.id);
  }
  /** When the surge's front comes level with place pl (eruption seconds from now; Infinity if no surge takes it). */
  function surgeEta(pl) {
    const m = surgeM(pl);
    for (const s of SURGES) {
      if (m < s.from || m > s.to) continue;
      const [x, z] = pointAt(flows[sowFlow], alongs[sowFlow], m);
      if (Math.hypot(x - pl.at[0], z - pl.at[1]) >= pl.r + 60 + (m - s.from) * s.spread) continue;
      return s.t0 + Math.max(0, m - 10 - s.from) / s.speed - T;
    }
    return Infinity;
  }
  /** The lamps of a place the lava or the cloud reaches go out (systems/architecture.js g.archLights): under the lava,
   *  each as the lava comes to it; in the cloud, all of them. */
  function douse(pl, how) {
    const L = g.archLights, sv = g.architecture?.sites; if (!L || !sv) return;
    for (const { l } of L) {
      if (l.out || !pl.sites.includes(g.archSites[l.site]?.id)) continue;
      if (how !== 'lava') { l.out = true; continue; }
      const x = sv[l.site * 4] + l.x, z = sv[l.site * 4 + 2] + l.z;
      for (let i = 0; i < flows.length && !l.out; i++) {
        const f = flows[i]; let best = Infinity, bk = -1;
        f.pts.forEach((p, k) => { const d = Math.hypot(p[0] - x, p[1] - z); if (d < best) { best = d; bk = k; } });
        if (bk >= 0 && alongs[i][bk] <= E.fronts[i] && best < f.pts[bk][3] + LAVA_REACH) l.out = true;
      }
    }
  }
  /** The lava takes the people it reaches (in the open: under its edge; indoors: where its melt brings the walls down). */
  function lavaTakes(pl) {
    for (const n of npcsOf()) {
      if (n.dead || Math.hypot(n.x - pl.at[0], n.z - pl.at[1]) > pl.r + 20) continue;
      const reach = n.inside ? LAVA_REACH : 1.5;
      for (let i = 0; i < flows.length; i++) {
        const f = flows[i]; let best = Infinity, bk = -1;
        f.pts.forEach((p, k) => { const d = Math.hypot(p[0] - n.x, p[1] - n.z); if (d < best) { best = d; bk = k; } });
        if (bk < 0 || alongs[i][bk] > E.fronts[i] || best > f.pts[bk][3] + reach) continue;
        const q = f.pts[bk], dx = n.x - q[0], dz = n.z - q[1], l = Math.hypot(dx, dz) || 1;
        lose(n, 'lava', [dx / l, dz / l]); flags.add('ember:lost:' + pl.id);
        break;
      }
    }
  }

  // The Wraith in the lava or the surge.
  let thrown = 0;
  function hazards(dt) {
    thrown = Math.max(0, thrown - dt);
    if (thrown > 0) return;
    const p = controller.pos, co = g.combat;
    const hurt = (k, vx, vz, title, text) => {
      thrown = 2;
      if (co && co.dying <= 0) co.health -= Math.min(Math.max(0, co.health - co.maxHealth * 0.25), co.maxHealth * k);
      controller.vel.x = vx; controller.vel.z = vz; controller.vel.y = 6;
      if (arm) arm.shake += 0.08;
      say(title, text, '', 4);
    };
    flows.forEach((f, i) => {
      if (E.fronts[i] <= 0) return;
      for (let k = 0; k < f.pts.length; k += 2) {
        if (alongs[i][k] > E.fronts[i]) break;
        const q = f.pts[k], d = Math.hypot(p.x - q[0], p.z - q[1]);
        if (d < q[3] * 0.9 && p.y < q[2] + 2.5) { const nx = (p.x - q[0]) / (d || 1), nz = (p.z - q[1]) / (d || 1); hurt(0.3, nx * 9, nz * 9, 'The lava', 'It throws you out'); return; }
      }
    });
    SURGES.forEach((s) => {
      const fm = surgeFront(s, T); if (fm < 0 || fm >= s.to) return;
      const [x, z] = pointAt(flows[sowFlow], alongs[sowFlow], fm);
      if (Math.hypot(p.x - x, p.z - z) < 60) hurt(0.35, (p.x - x) * 0.3, (p.z - z) * 0.3, 'The surge', 'The hot cloud knocks you down');
    });
  }

  let acc = 0, bellT = 0, lastFlash = 0;
  // The chapter's own scenes, before and after the eruption (the eruption's update below runs only while it goes on).
  loop.add({ name: 'ember-scenes', update: () => { warningScene(); campScene(); } });
  loop.add({ name: 'eruption', update: () => {
    const dt = clock.dt;
    // The day after Fire (systems/emberClock.js): stage 5.
    if (!E.on && !has('ember:erupted') && (vars['ember:stage'] || 0) >= 5) start();
    if (has('ember:erupted') && !E.done) {
      E.done = true; ensureLava(); closeQuests();
      // (Stopped by the Warden: its fronts where they stopped, the land cooled, the sky open.)
      if (vars['ember:stopped-t']) { T = E.stopT = vars['ember:stopped-t']; E.quell = E.cool = E.open = 1; } else T = ERUPTION_S + 1000;
    }
    // At Fire (a day ahead of it), the places it may reach are broken ahead of time, one every couple of seconds: their
    // collapses then start without the cost of making their pieces (systems/destruction.js prepare).
    if (!E.on && !E.done && (vars['ember:stage'] || 0) >= 4) {
      if (!toPrepare.length && !E.prepared) { toPrepare = PLACES.flatMap((p) => p.sites); E.prepared = true; }
      prepT += dt; if (toPrepare.length && prepT > 2) { prepT = 0; g.destruction?.prepare(toPrepare.shift()); }
      // And its own things made and drawn once, unseen (no front yet; no bombs in the air): their pipelines compiled now,
      // not on the frame the mountain goes up (render/lava.js shown 0; render/bombs.js every size 0).
      if (!lava && prepT > 1) ensureLava();
      else if (lava && !bombView && prepT > 1) { bombView = createBombs(scene, atmosphere); if (g.shadows && g.bindShadows) g.bindShadows(bombView.material, g.shadows); bombView.freeze(); bombView.upload(); bombView.mesh.setEnabled(true); g.engine?.snapshotRenderingReset?.(); }
    }
    if (!E.on && !E.done && !E.stopT) return;
    ensureLava();
    if (E.on) { T += dt * E.rate; vars['ember:erupt-t'] = T; }
    E.T = T;
    // The fronts: each flow's own time, less what it was held.
    flows.forEach((f, i) => { if (holdUntil[i] > T && E.on) held[i] += dt; E.fronts[i] = E.stopT && vars['ember:stopped-fronts'] ? vars['ember:stopped-fronts'][i] : frontAt(f, alongs[i], (E.done ? 1e9 : T - held[i]) * 1); });
    lava.fronts = [...E.fronts, 0].slice(0, 4); lava.holds = flows.map((_, i) => (holdUntil[i] > T ? 1 : 0)).concat([0]).slice(0, 4);
    lava.time = clock.simTime; lava.eruptT = Math.min(T, ERUPTION_S + 600); lava.shown = 1;
    lava.cooling = E.done ? 1 : Math.max(E.cool, Math.min(1, (T - ERUPTION_S) / 300));
    lava.update();
    lavaLight();
    // The sky: black at noon near the mountain; ash falling.
    const d = Math.hypot(controller.pos.x - PIT.x, controller.pos.z - PIT.z), near = 1 - Math.max(0, Math.min(1, (d - 1500) / 4500));
    // (Stopped by the Warden, the ash parts as its release opens the sky: E.open.)
    const k = (1 - 0.85 * E.open) * (E.done ? 0.35 * near : E.stopT ? near : near * Math.min(1, T / 20) * (T > ERUPTION_S ? Math.max(0.35, 1 - (T - ERUPTION_S) / 200) : 1));
    // (The thunderstorm's channel darkens the sky and the exposure with it — the meadow's storms, systems/storm.js — and
    // brings the column's lightning; the weather fog alone would be a white-out, not the dark.)
    if (g.post?.fog) g.post.fog.ash = k;
    // (The ash's haze is thick near the mountain and thins with distance from it: from the headland camp, 1.7 km off, the
    // mountain and its column are seen through air, not lost in a grey wall.)
    const camD = Math.hypot((g.camera || scene.activeCamera).position.x - PIT.x, (g.camera || scene.activeCamera).position.z - PIT.z), hazeNear = Math.max(0.2, Math.min(1, 1 - (camD - 700) / 1300));
    if (weather && k > 0) { weather.cover = Math.max(weather.cover, k); weather.fog = Math.max(weather.fog, 0.22 * k * hazeNear); weather.storm = Math.max(weather.storm, 0.9 * k); }
    if (snowfall) snowfall.ashFall = E.done ? 0.15 * near : 0.9 * k;
    // Lightning in the column (world/lightning.js `column`): bolts every second or so at the blast, thinning as it tires; the
    // column leans downwind, so its middle is a few hundred metres off the crater.
    if (g.lightning) {
      const P = g.plume, base = P && P.y === P.y ? P.y : 900;
      g.lightning.column = E.on && !E.done && P ? { x: PIT.x + P.windX * 260, z: PIT.z + P.windZ * 260, r: 260, y0: base + 40, y1: base + 2600,
        rate: 0.5 * Math.max(0.2, 1 - T / 600) } : null;   // (now and then — not a strobe)
      // The column lit from inside where the bolt is (its middle).
      const L = g.lightning;
      if (P) { const on = L.column && L.botY === L.botY; P.flash = on ? L.bolt * L.bolt : 0; P.fx = L.gx; P.fy = on ? (L.topY + L.botY) / 2 : 0; P.fz = L.gz; }
    }
    // The eye closes under the ash (systems/lung.js applies it): the land dark, the lava and the fires still bright in it.
    // (A cutscene exposes for its scene, as a film would: the ash's darkening eases while one plays.)
    g.ashDark = 1 - (g.director?.active ? 0.35 : 0.72) * k;
    if (g.ruinDust) g.ruinDust.glow = k;
    if (burning.size) burn(dt);
    if (crumbling.length) crumbleStep(dt);
    if (E.on || bombs.length) bombsStep(dt);
    if (!E.on) return;
    if (toPrepare.length && Math.floor(T * 2) !== Math.floor((T - dt * E.rate) * 2)) g.destruction?.prepare(toPrepare.shift());
    // The bell on its own: the surge is coming (the first half-minute).
    bellT -= dt;
    if (T > 12 && T < 34 && bellT <= 0) { bellT = 5; g.ashChapel?.ring(); }
    // The promise kept: at her side as the bell rings on its own, Annick takes your hand.
    if (T > 12 && T < 38 && has('ember:annick-promise') && !has('ember:annick-came')) {
      const an = (g.npcs || []).find((n) => n.id === 'ember-annick');
      if (an && Math.hypot(controller.pos.x - an.x, controller.pos.z - an.z) < 15) { flags.add('ember:annick-came'); flee(an); say('The spring', 'She takes your hand', 'The bell is ringing by itself. Annick looks at it a long moment, then at you, and goes.', 8); }
    }
    // Lightning in the column, now and then.
    if (T - lastFlash > 7 + Math.random() * 9) { lastFlash = T; sfx.x = PIT.x; sfx.y = 900; sfx.z = PIT.z; sfx.gain = 0.9; sfx.play(SFX.THUNDER); }
    crystal();
    hazards(dt);
    // The surges' clouds: billows along the front, across its width, thrown forward and up, dark ash lit by the lava.
    surgeAcc += dt * E.rate;
    const dust = g.ruinDust;
    if (dust && surgeAcc > 1 / 30) {
      const n = Math.floor(surgeAcc * 30); surgeAcc -= n / 30;
      for (const s of SURGES) {
        const fm = surgeFront(s, T); if (fm < 0 || fm >= s.to) continue;
        const [x, z, y] = pointAt(flows[sowFlow], alongs[sowFlow], fm), [x1, z1, y1] = pointAt(flows[sowFlow], alongs[sowFlow], fm + 8);
        let dx = x1 - x, dz = z1 - z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        // (As wide as what it takes — doom: a place within 60 m + the spread of the path — so it is seen to reach them.)
        const slope = (y1 - y) / l, half = 60 + (fm - s.from) * s.spread, wide = Math.min(3, half / 45);
        // Billows thrown on ahead at the front's own speed, down the slope with it (the ground's fall along the path), from
        // low and dense at its head; they roll on, swell and climb (render: a surge billow, negative size), a dark wall.
        for (let k = 0; k < Math.round(n * 13 * wide); k++) {
          const u = (Math.random() * 2 - 1) * half * (0.6 + 0.4 * Math.random()), back = Math.random() * 14, sz = (13 + 15 * Math.random()) * (0.8 + 0.25 * wide), sh = 0.7 + 0.35 * Math.random();
          const sp = s.speed * (0.85 + 0.35 * Math.random());   // (slowed by the air in the render: it carries ~80 m, the front's 5 s)
          dust.spawn(x - dz * u - dx * back, y + 2 + Math.random() * 14, z + dx * u - dz * back, dx * sp, sp * slope + 0.6 * Math.random(), dz * sp, -sz, 0.34 * sh, 0.31 * sh, 0.28 * sh, 13 + 7 * Math.random());   // (pale grey-tan ash, as such clouds are: they stand out against the black ground)
        }
      }
    }
    acc += dt; if (acc < 0.2) return; acc = 0;
    // The places it reaches.
    for (const pl of PLACES) {
      // (A place's scenes keyed to its people and the lava's way through it, not to its first building going.)
      stayedScene(pl);
      watchedScene(pl);
      if (fate.get(pl.id) === 'lava') { lavaTakes(pl); douse(pl, 'lava'); }
      else if (fate.get(pl.id)) douse(pl, fate.get(pl.id));
      if (fate.get(pl.id)) continue;
      const lavaHit = flows.findIndex((f, i) => lavaAt(i, pl));
      if (lavaHit >= 0) { const q = pointAt(flows[lavaHit], alongs[lavaHit], E.fronts[lavaHit]), dx = pl.at[0] - q[0], dz = pl.at[1] - q[1], l = Math.hypot(dx, dz) || 1; doom(pl, 'lava', [dx / l, dz / l]); continue; }
      for (const s of SURGES) {
        const fm = surgeFront(s, T); if (fm < 0) continue;
        // (The cloud spreads as it goes: the valley's is hundreds of metres wide by the time it reaches the farms. It takes
        // a place as its front comes level with it — not while still coming down the mountain toward it.)
        const m = surgeM(pl);
        if (fm < m - 10 || m < s.from || m > s.to) continue;
        const [x, z] = pointAt(flows[sowFlow], alongs[sowFlow], m);
        if (Math.hypot(x - pl.at[0], z - pl.at[1]) < pl.r + 60 + (m - s.from) * s.spread) { const dx = pl.at[0] - x, dz = pl.at[1] - z, l = Math.hypot(dx, dz) || 1; doom(pl, 'surge', [dx / l, dz / l]); break; }
      }
    }
    // The words: where people are still at home and nothing has come yet.
    PLACES.forEach((pl, k) => { const it = runs[k]; it.hidden = !!fate.get(pl.id) || !peopleAt(pl).some((n) => !n.fleeing); if (!(it.y > 0) && g.ground) { g.ground.qx = it.x; g.ground.qz = it.z; if (g.ground.covers()) { g.ground.sample(); it.y = g.ground.h + 0.5; } } });
    // The end: the mountain spent.
    if (T >= ERUPTION_S && !has('ember:erupted')) {
      flags.add('ember:erupted'); flags.delete('ember:erupting'); E.on = false; E.done = true;
      resolveAftermath();
      closeQuests();
      chapter.raise?.('ember:erupted');
      for (const it of runs) it.hidden = true;
      const lostAt = PLACES.filter((p) => has('ember:lost:' + p.id)).map((p) => p.name);
      say('The mountain', 'It is over', lostAt.length ? `The ash comes down like snow over ${lostAt.join(', ')}.` : 'The ash comes down like snow. Everyone you could reach is at the camp.', 10);
    }
  } });
  // (On loading: the dead as they were left.)
  let restored = false;
  loop.add({ name: 'eruptionRestore', update: () => {
    if (restored || !g.npcs) return;
    restored = true;
    for (const n of g.npcs) if (has('ember:dead:' + n.id)) { lose(n, has('ember:dead-lava:' + n.id) ? 'lava' : 'surge', null, true); vars['ember:dead']--; }
    // (A save from before the aftermath existed: its outcomes worked out from the dead as saved.)
    if (has('ember:erupted')) resolveAftermath();
  } });
  void params;
}
