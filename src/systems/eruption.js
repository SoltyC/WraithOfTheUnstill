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
import { SOW_FARMS, CAMP } from '../world/sow.js';
import { CINDER } from '../world/cinderhold.js';
import { CHAPEL } from '../world/ashChapel.js';
import { PIT } from '../world/crater.js';

export const ERUPTION_S = 480;
const HOLD_S = 40;
/** The places: their people within r of `at`, their buildings. */
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
  const E = g.eruption = { T: 0, on: false, done: false, start, fronts: flows.map(() => 0), places: PLACES, rate: 1, fate: null };

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
  function lose(n, how) {
    n.dead = true; flags.add('ember:dead:' + n.id); vars['ember:dead'] = (vars['ember:dead'] || 0) + 1;
    if (how === 'lava') { flags.add('ember:dead-lava:' + n.id); n.brain = (q) => { q.hide = true; }; if (n.target) { n.target.hidden = true; n.target = null; } return; }
    let t = 0;
    n.brain = (q, dt) => { q.vx = q.vz = 0; q.noLook = true; t += dt; q.view.ash = Math.min(1, t * 1.5); if (t > 0.8) q.frozen = true; };
    if (n.target) { n.target.hidden = true; n.target = null; }
  }

  let toPrepare = [], prepT = 0;
  function start() {
    if (E.on || has('ember:erupted')) return;
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
      const L = Math.min(fr, 700), cool = E.done ? Math.max(0, 1 - (T - ERUPTION_S) / 300) : 1;
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

  // The places' fates.
  const fate = E.fate = new Map(PLACES.map((p) => [p.id, null]));
  function doom(pl, how, dir) {
    fate.set(pl.id, how);
    for (const n of peopleAt(pl)) lose(n, how);
    const lost = npcsOf().filter((n) => n.dead && Math.hypot(n.x - pl.at[0], n.z - pl.at[1]) < pl.r + 40).length;
    if (lost) flags.add('ember:lost:' + pl.id);
    // Its buildings: down, from the side it came, charred; the lava's places as the front reaches each piece.
    const fi = how === 'lava' ? flows.findIndex((f, i) => nearFlow(i, pl)) : -1;
    // (No char yet: the heat builds on them as it comes — burn() below — and the fire takes them.)
    for (const id of pl.sites) {
      g.destruction?.collapse(id, { force: dir, cause: how, strength: how === 'surge' ? 1.6 : 1, seed: id.length * 31 + 7,
        release: fi >= 0 ? (x, z, y) => releaseByFlow(fi, x, z, y) : undefined });
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
      arch.char[b.si] = Math.max(arch.char[b.si], b.heat * 0.95);
      const r = g.destruction?.ruins.get(id);
      if (!r || !r.debris || !r.view) continue;
      // Its fires: on its highest pieces of timber, thatch or roof (else its highest of all), a few per building.
      if (!b.fires.length && b.heat > 0.12) {
        const fr = r.debris.frags.map((f, k) => [f, k]).filter(([f]) => !f.fixed);
        fr.sort((a, c) => (c[0].top + (c[0].mat === 3 || c[0].mat === 9 || c[0].mat === 13 ? 3 : 0)) - (a[0].top + (a[0].mat === 3 || a[0].mat === 9 || a[0].mat === 13 ? 3 : 0)));
        const pick = [];
        for (const [f, k] of fr) { if (pick.length >= 4) break; if (pick.every(([g2]) => Math.hypot(g2.pivot[0] - f.pivot[0], g2.pivot[2] - f.pivot[2]) > 3)) pick.push([f, k]); }
        b.fires = pick.map(([, k], n) => ({ k, start: b.t + n * 3, size: 2.4 + 1.6 * ((k * 7) % 5) / 5 }));
      }
      for (const fire of b.fires) {
        if (slot >= FIRE0 + FIREN) break;
        const age = b.t - fire.start, xf = r.view.xf, k = fire.k;
        const grow = Math.max(0, Math.min(1, age / 12)) * (1 - Math.max(0, Math.min(1, (age - 80) / 25)));
        const o = slot * 4;
        F[o] = xf[k * 8]; F[o + 1] = xf[k * 8 + 1] + 0.2; F[o + 2] = xf[k * 8 + 2]; F[o + 3] = grow > 0.01 ? fire.size * (0.4 + 0.9 * grow) : 0;
        FX[o] = 1.6; FX[o + 1] = grow; FX[o + 2] = 1; FX[o + 3] = 1;
        FL[o] = 1; FL[o + 1] = 0; FL[o + 2] = 0; FL[o + 3] = 0;
        slot++;
      }
    }
    for (; slot < FIRE0 + FIREN; slot++) F[slot * 4 + 3] = 0;
  }
  const dist2 = (b) => { const s = g.archSites[b.si]; return (s.at[0] - controller.pos.x) ** 2 + (s.at[1] - controller.pos.z) ** 2; };
  /** Seconds from now until flow i's front is nearest (x, z) (its pieces let go as it gets there). */
  function releaseByFlow(i, x, z, y = 0) {
    const f = flows[i]; let best = Infinity, bk = 0;
    f.pts.forEach((p, k) => { const d = Math.hypot(p[0] - x, p[1] - z); if (d < best) { best = d; bk = k; } });
    // When the front gets there (and its edge spreads out to the piece), then the time the melt takes to eat through
    // its footing — seconds to half a minute, piece by piece (a hash of where it is: never two walls alike).
    const h = Math.sin(x * 12.9898 + z * 78.233 + y * 37.719) * 43758.5453, rnd = h - Math.floor(h);
    return Math.max(0, (alongs[i][bk] - E.fronts[i]) / 3) + Math.max(0, best - f.pts[bk][3]) * 0.35 + 6 + 18 * rnd;
  }
  function nearFlow(i, pl) { return flows[i].pts.some((p) => Math.hypot(p[0] - pl.at[0], p[1] - pl.at[1]) < p[3] + pl.r * 0.5); }
  /** Has flow i's front reached place pl? (Its nearest point is behind the front.) */
  function lavaAt(i, pl) {
    const f = flows[i]; let best = Infinity, bk = -1;
    f.pts.forEach((p, k) => { const d = Math.hypot(p[0] - pl.at[0], p[1] - pl.at[1]); if (d < best) { best = d; bk = k; } });
    return best < f.pts[bk][3] + pl.r * 0.5 && alongs[i][bk] <= E.fronts[i];
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
  loop.add({ name: 'eruption', update: () => {
    const dt = clock.dt;
    // The day after Fire (systems/emberClock.js): stage 5.
    if (!E.on && !has('ember:erupted') && (vars['ember:stage'] || 0) >= 5) start();
    if (has('ember:erupted') && !E.done) { E.done = true; ensureLava(); T = ERUPTION_S + 1000; }
    // At Fire (a day ahead of it), the places it may reach are broken ahead of time, one every couple of seconds: their
    // collapses then start without the cost of making their pieces (systems/destruction.js prepare).
    if (!E.on && !E.done && (vars['ember:stage'] || 0) >= 4) {
      if (!toPrepare.length && !E.prepared) { toPrepare = PLACES.flatMap((p) => p.sites); E.prepared = true; }
      prepT += dt; if (toPrepare.length && prepT > 2) { prepT = 0; g.destruction?.prepare(toPrepare.shift()); }
    }
    if (!E.on && !E.done) return;
    ensureLava();
    if (E.on) { T += dt * E.rate; vars['ember:erupt-t'] = T; }
    E.T = T;
    // The fronts: each flow's own time, less what it was held.
    flows.forEach((f, i) => { if (holdUntil[i] > T && E.on) held[i] += dt; E.fronts[i] = frontAt(f, alongs[i], (E.done ? 1e9 : T - held[i]) * 1); });
    lava.fronts = [...E.fronts, 0].slice(0, 4); lava.holds = flows.map((_, i) => (holdUntil[i] > T ? 1 : 0)).concat([0]).slice(0, 4);
    lava.time = clock.simTime; lava.eruptT = Math.min(T, ERUPTION_S + 600); lava.shown = 1;
    lava.cooling = E.done ? 1 : Math.max(0, Math.min(1, (T - ERUPTION_S) / 300));
    lava.update();
    lavaLight();
    // The sky: black at noon near the mountain; ash falling.
    const d = Math.hypot(controller.pos.x - PIT.x, controller.pos.z - PIT.z), near = 1 - Math.max(0, Math.min(1, (d - 1500) / 4500));
    const k = E.done ? 0.35 * near : near * Math.min(1, T / 20) * (T > ERUPTION_S ? Math.max(0.35, 1 - (T - ERUPTION_S) / 200) : 1);
    // (The thunderstorm's channel darkens the sky and the exposure with it — the meadow's storms, systems/storm.js — and
    // brings the column's lightning; the weather fog alone would be a white-out, not the dark.)
    if (weather && k > 0) { weather.cover = Math.max(weather.cover, k); weather.fog = Math.max(weather.fog, 0.22 * k); weather.storm = Math.max(weather.storm, 0.9 * k); }
    if (snowfall) snowfall.ashFall = E.done ? 0.15 * near : 0.9 * k;
    // The eye closes under the ash (systems/lung.js applies it): the land dark, the lava and the fires still bright in it.
    g.ashDark = 1 - 0.72 * k;
    if (g.ruinDust) g.ruinDust.glow = k;
    if (burning.size) burn(dt);
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
        const [x, z, y] = pointAt(flows[sowFlow], alongs[sowFlow], fm), [x1, z1] = pointAt(flows[sowFlow], alongs[sowFlow], fm + 8);
        let dx = x1 - x, dz = z1 - z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const half = 30 + (fm - s.from) * s.spread * 0.6;
        for (let k = 0; k < n * 3; k++) {
          const u = (Math.random() * 2 - 1) * half, back = Math.random() * 25, sz = 7 + 9 * Math.random(), sh = 0.8 + 0.4 * Math.random();
          dust.spawn(x - dz * u - dx * back, y + 1 + Math.random() * 12, z + dx * u - dz * back, dx * s.speed * (0.7 + 0.5 * Math.random()), 2 + 5 * Math.random(), dz * s.speed * (0.7 + 0.5 * Math.random()), sz, 0.11 * sh, 0.1 * sh, 0.095 * sh, 18 + 14 * Math.random());
        }
      }
    }
    acc += dt; if (acc < 0.2) return; acc = 0;
    // The places it reaches.
    for (const pl of PLACES) {
      if (fate.get(pl.id)) continue;
      const lavaHit = flows.findIndex((f, i) => lavaAt(i, pl));
      if (lavaHit >= 0) { const q = pointAt(flows[lavaHit], alongs[lavaHit], E.fronts[lavaHit]), dx = pl.at[0] - q[0], dz = pl.at[1] - q[1], l = Math.hypot(dx, dz) || 1; doom(pl, 'lava', [dx / l, dz / l]); continue; }
      for (const s of SURGES) {
        const fm = surgeFront(s, T); if (fm < 0) continue;
        const [x, z] = pointAt(flows[sowFlow], alongs[sowFlow], fm);
        // (The cloud spreads as it goes: the valley's is hundreds of metres wide by the time it reaches the farms.)
        if (Math.hypot(x - pl.at[0], z - pl.at[1]) < pl.r + 60 + (fm - s.from) * s.spread) { const dx = pl.at[0] - x, dz = pl.at[1] - z, l = Math.hypot(dx, dz) || 1; doom(pl, 'surge', [dx / l, dz / l]); break; }
      }
    }
    // The words: where people are still at home and nothing has come yet.
    PLACES.forEach((pl, k) => { const it = runs[k]; it.hidden = !!fate.get(pl.id) || !peopleAt(pl).some((n) => !n.fleeing); if (!(it.y > 0) && g.ground) { g.ground.qx = it.x; g.ground.qz = it.z; if (g.ground.covers()) { g.ground.sample(); it.y = g.ground.h + 0.5; } } });
    // The end: the mountain spent.
    if (T >= ERUPTION_S && !has('ember:erupted')) {
      flags.add('ember:erupted'); flags.delete('ember:erupting'); E.on = false; E.done = true; chapter.raise?.('ember:erupted');
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
    for (const n of g.npcs) if (has('ember:dead:' + n.id)) { lose(n, has('ember:dead-lava:' + n.id) ? 'lava' : 'surge'); vars['ember:dead']--; }
  } });
  void params;
}
