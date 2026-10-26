// The Bellwether fight in play (game/bellwether/fight.js is the director; this is its body in the
// world): the chimney vents (their turf caps are the sites manor-vent-0..2 and are blown off), the
// Gust and Vortex bursts that strip them, the gale (an inhale that draws the grass in, then a wind wall
// that sweeps the forecourt, shoves and hurts), the valves struck from the neck, the readout, the music
// cues, the reset on death or leaving — and the release: a slow orbit of the manor as the head lowers,
// a wind front rolling down the hill and out over Hearn, the village answering (soot gone, bells, the
// mill sails), the meadow restored, the Gale kept for good.
//
// State that must outlive the session is the chapter flag `meadow:bellwether-released` (saved with the
// quests) plus worldState.restoration.meadow (saved with the world). Photo spots set restoration.meadow
// freely, so the flag alone decides whether the manor lies at rest.
//
// Dev: ?bell=fight (the stair is open; it wakes as you near the forecourt), ?bell=release (the released,
// restored state at once).

import { createBellFight, BFIGHT, BEV, bellTuning } from '../game/bellwether/fight.js';
import { B } from '../game/bellwether/bellwether.js';
import { manorWorld, MANOR, BACK, VENT_U, VENT_Y } from '../world/manor.js';
import { worldState } from '../game/worldState.js';
import { BRUSH } from '../shaders/terrainState.wgsl.js';

export const FLAG = { WOKE: 'meadow:bellwether-woke', RELEASED: 'meadow:bellwether-released', ANSWERED: 'meadow:village-answered', STAIR: 'meadow:stair-open' };

/** Tunables of the wiring (the director's own are in bellTuning). */
export const bellSys = {
  aimRange: 120, aimR: 5,   // an aimed Gust (the view ray) strips a chimney this far off, within this miss
  gustReach: 12,         // m added to a Gust's half width: the burst is felt this far in 3D (the vents are 38 m up the hall)
  vortexEvery: 0.6,      // s between a held Vortex's strips
  vortexPower: 1.5,      // Gust is power 1 (see fight.js windHit)
  frontStart: 0.6,       // s into the release before the wind front leaves the mouth
  frontSpeed: 55,        // m/s
  frontMax: 340,         // m
  frontHalfArc: 0.9,     // rad either side of the way to the village
  cineEnd: 14,           // s: the cinematic's length (the head lowers and rests by 11.5)
  musicTail: 40,         // s the release bed is wanted after the cinematic
  galeFrontK: 2.2,       // the wall's front reaches galeR after galeTime / this
  summonNames: ['sedgerunner', 'sedgerunner', 'hedgewarden', 'chanter'],
};

const TAU = Math.PI * 2;
const ease = (k) => { k = k < 0 ? 0 : k > 1 ? 1 : k; return k * k * (3 - 2 * k); };

// ---- pure helpers (tested in Node) ----------------------------------------------------------

/** The three vents' world positions (their turf caps): [{ x, y, z }]. */
export function ventPositions() {
  return VENT_U.map((u) => { const [x, z] = manorWorld(u, -26 - BACK); return { x, y: MANOR.y + VENT_Y, z }; });
}

/** The forecourt's centre, where the fight is held. */
export function arenaCentre() { const [x, z] = manorWorld(0, 20); return { x, z, y: MANOR.y }; }

/**
 * The director aims the gale with atan2(dz, dx); the body (bellwether.js exhaleFrom / exhaleTo) reads headings as
 * atan2(dx, dz). This wraps the body for the director: the angles it writes and reads cross over (h → π/2 − h), the rest
 * passes through. (fight.js and its tests stay as they are.)
 */
export function bellForDirector(bell) {
  const f = (a) => Math.PI / 2 - a;
  return {
    get hx() { return bell.hx; }, get hy() { return bell.hy; }, get hz() { return bell.hz; },
    get valves() { return bell.valves; }, get state() { return bell.state; },
    get exhaleFrom() { return f(bell.exhaleFrom); }, set exhaleFrom(a) { bell.exhaleFrom = f(a); },
    get exhaleTo() { return f(bell.exhaleTo); }, set exhaleTo(a) { bell.exhaleTo = f(a); },
    wake: () => bell.wake(), inhale: () => bell.inhale(), exhale: () => bell.exhale(), shake: () => bell.shake(), roar: () => bell.roar(),
    release: () => bell.release(), reset: () => bell.reset(), openValve: (k) => bell.openValve(k),
  };
}

/**
 * Reports the Gale's bursts to the director. A Gust is one burst per cast (power 1, on the first frame its front is
 * within reach of a sealed vent); a held Vortex strips every `vortexEvery` seconds (power 1.5).
 * @param {{ windHit: (x:number,y:number,z:number,r:number,p:number) => number }} fight
 */
export function createWindReporter(fight, cfg = bellSys) {
  const used = new Uint32Array(8);
  let vt = 0;
  return {
    /** gale: { gustActive, gustFX, gustFZ, gustHW, gustId, vortexX, vortexZ, vortexStrength }. Returns the vents hit. */
    update(gale, y, dt) {
      let hits = 0;
      for (let k = 0; k < gale.gustActive.length; k++) {
        if (!gale.gustActive[k] || gale.gustHW[k] < 0.05) continue;
        const id = gale.gustId[k];
        if (used[k] === id) continue;
        const n = fight.windHit(gale.gustFX[k], y, gale.gustFZ[k], gale.gustHW[k] + cfg.gustReach, 1);
        if (n > 0) { used[k] = id; hits += n; }
      }
      if (gale.vortexStrength > 0.5) {
        vt -= dt;
        if (vt <= 0) { vt = cfg.vortexEvery; hits += fight.windHit(gale.vortexX, y, gale.vortexZ, 2.3 + cfg.gustReach, cfg.vortexPower); }
      } else vt = 0;
      return hits;
    },
  };
}

/** How far the gale's wind wall has run (m from the mouth) at director progress k (0..1). */
export function galeFrontDistance(k, reach = bellTuning.galeR, speedK = bellSys.galeFrontK) { return reach * Math.min(1, Math.max(0, k) * speedK); }

/** The sweep's heading (atan2(dx, dz) of the body) at progress k. */
export function sweepHeading(bell, k) { return bell.exhaleFrom + (bell.exhaleTo - bell.exhaleFrom) * Math.min(1, Math.max(0, k)); }

/** The release's wind front: its radius (m) a given time into the release. */
export function frontRadius(t, cfg = bellSys) { return Math.min(cfg.frontMax, Math.max(0, t - cfg.frontStart) * cfg.frontSpeed); }

/** Seconds into the release at which the front reaches `dist` metres. */
export function frontArrival(dist, cfg = bellSys) { return cfg.frontStart + dist / cfg.frontSpeed; }

/**
 * The release camera: a slow orbit of the manor from the side of the mouth, rising a little as the head lowers.
 * (cx, cz) is the orbit's centre, `yaw` the mouth's heading when it began; the target is the head. Writes
 * out = { x, y, z, yaw, pitch, fov }.
 */
export function releaseCamPose(t, cx, cz, floorY, yaw, head, out) {
  const u = Math.min(1, t / bellSys.cineEnd), e = ease(u);
  const ang = yaw + 1.35 + 0.075 * t, R = 52 - 8 * e;
  out.x = cx + Math.sin(ang) * R; out.z = cz + Math.cos(ang) * R;
  out.y = floorY + 19 + 9 * e;
  const dx = head.x - out.x, dy = head.y - out.y, dz = head.z - out.z;
  out.yaw = Math.atan2(dx, dz); out.pitch = Math.atan2(-dy, Math.hypot(dx, dz));
  out.fov = 0.78 - 0.1 * e;
  return out;
}

/** A readout's pips: vents (3) then valves (3); true = still to do. */
export function pipsLeft(vents, valvesOpen, out = []) {
  for (let k = 0; k < 3; k++) out[k] = vents[k] > 0;
  for (let k = 0; k < 3; k++) out[3 + k] = k >= valvesOpen;
  return out;
}

// ---- the system -------------------------------------------------------------------------------

/** @param {any} g  shared boot context */
export function addBellwetherFightSystem(g) {
  const { loop, bellwether: bell, bellClimb, shaped, shapedMod, combat, controller, clock, input, Action, sfx, SFX, arm, wraithView, terrainState: ts, ground, chapter, hud, music, releaseCam, gale, qs, capture } = g;
  const T = bellTuning;
  if (!bell || !bellClimb) return;
  const flags = chapter.graph.flags;
  const devQ = qs ? qs.get('bell') : null;
  const devFight = devQ === 'fight', devRelease = devQ === 'release' || (qs?.get('spot') || '').startsWith('p8-bell-released');

  const arena = arenaCentre();
  const vents = ventPositions();
  const blk = g.losBlocker;
  const sheltered = (px, pz, mx, mz) => {
    blk.solids = g.solids; blk.body = false;
    const y = controller.pos.y + 1.2;
    blk.ax = px; blk.ay = y; blk.az = pz; blk.bx = mx; blk.by = y; blk.bz = mz;
    return blk.segBlocked();
  };

  const fight = g.bellFight = createBellFight({
    bell: bellForDirector(bell), B, arena, vents,
    allowed: () => devFight || flags.has(FLAG.STAIR),
    sheltered,
    nearValve: () => bellClimb.nearValve,
    spawn: (name, x, z) => shaped.spawn(name, x, z),
    alive: (i) => shaped.isLive(i) || shaped.slots[i].state === shapedMod.S.RISING,
    kill: (i) => shaped.damage(i, 1e9, false, 0, 0),
    summonNames: bellSys.summonNames,
  });
  const windRep = createWindReporter(fight), vp = { x: 0, y: 0, z: 0 }, aimSeen = new Uint32Array(8), aimDir = { x: 0, y: 0, z: 1 };

  let seed = 90211;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  /** A burst of motes (turf and dust) from a point. */
  function puff(x, y, z, n, speed, up = 0.6) {
    for (let q = 0; q < n; q++) {
      wraithView.ex = x + (rnd() - 0.5) * 0.8; wraithView.ey = y + rnd() * 0.8; wraithView.ez = z + (rnd() - 0.5) * 0.8;
      wraithView.evx = (rnd() - 0.5) * speed; wraithView.evy = 1 + rnd() * speed * up; wraithView.evz = (rnd() - 0.5) * speed;
      wraithView.esize = 0.06 + 0.12 * rnd(); wraithView.emit();
    }
  }
  const sound = (x, y, z, gain, ...kinds) => { sfx.x = x; sfx.y = y; sfx.z = z; sfx.gain = gain; for (const k of kinds) sfx.play(k); };
  /** A brush stamp along (dx, dz) from (x, z): grass laid flat (the Gust's own brush). */
  function flatten(x, z, dx, dz, halfLen, halfW, depth, comp) {
    ts.bx = x; ts.bz = z; ts.bdx = dx; ts.bdz = dz; ts.bl = halfLen; ts.bw = halfW; ts.bd = depth; ts.bc = comp;
    ts.bk = BRUSH.FLATTEN; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0.6; ts.stamp();
  }

  // ── Readout: its hold (shrinks as the fight goes), vents and valves as pips, one line ────────────
  const box = document.createElement('div'); box.className = 'warden-fight';
  const bar = document.createElement('div'); bar.className = 'bar'; const fill = document.createElement('b'); bar.append(fill);
  const gems = document.createElement('div'); gems.className = 'gems on';
  const pips = []; for (let k = 0; k < 6; k++) { const e = document.createElement('i'); gems.append(e); pips.push(e); }
  const line = document.createElement('div'); line.className = 'line';
  box.append(bar, gems, line);
  document.body.append(box);
  const left = [];
  let lastFill = -1, lastPips = '', lastLine = '', lastOn = false;
  function readout(on) {
    if (on !== lastOn) { box.classList.toggle('on', on); lastOn = on; }
    if (!on) return;
    const f = Math.round(100 * (1 - fight.progress / 6));
    if (f !== lastFill) { fill.style.width = f + '%'; lastFill = f; }
    pipsLeft(fight.vents, fight.valvesOpen, left);
    const key = left.map((b) => (b ? 1 : 0)).join('');
    if (key !== lastPips) { lastPips = key; for (let k = 0; k < 6; k++) pips[k].className = left[k] ? '' : 'broken'; }
    const alarm = fight.galeWarn || fight.galeActive;
    const text = fight.hint || '';
    if (text !== lastLine) { line.textContent = text; lastLine = text; }
    line.classList.toggle('alarm', alarm);
  }

  // ── Music: the fight bed while it is on, the release bed through the cinematic (over the director) ──
  let musicOver = null, musicWant = music.want, musicUntil = 0;
  Object.defineProperty(music, 'want', { configurable: true, get: () => (musicOver !== null ? musicOver : musicWant), set: (v) => { musicWant = v; } });

  // ── Vent caps: sink a little as they are blown at, vanish when stripped ────────────────────────────
  const prevVent = new Float64Array(3).fill(T.ventStrength);
  const ventSites = [0, 1, 2].map((k) => g.archSites.findIndex((s) => s.id === 'manor-vent-' + k));
  function ventsTick() {
    for (let k = 0; k < 3; k++) {
      // (Idle, the director's vents read 0; they are sealed until it wakes.)
      const v = fight.phase === BFIGHT.IDLE ? T.ventStrength : fight.vents[k], was = prevVent[k];
      if (v === was) continue;
      const s = ventSites[k] >= 0 ? g.archSites[ventSites[k]] : null;
      if (v >= T.ventStrength) { // sealed again (a reset)
        if (s) { s.sink = 0; } g.setVentHidden(k, false);
      } else if (v < was) {
        const done = v <= 0;
        if (s) s.sink = done ? 0 : (1 - v / T.ventStrength) * 0.5;
        puff(vents[k].x, vents[k].y + 0.8, vents[k].z, done ? 60 : 16, done ? 11 : 6, 0.5);
        sound(vents[k].x, vents[k].y, vents[k].z, done ? 1.7 : 1.1, done ? SFX.SHATTER : SFX.CRUNCH, SFX.WHOOSH);
        if (done) {
          g.setVentHidden(k, true);
          // The air comes out of the chimney: a plume straight up.
          for (let q = 0; q < 24; q++) { wraithView.ex = vents[k].x + (rnd() - 0.5) * 1.6; wraithView.ey = vents[k].y; wraithView.ez = vents[k].z + (rnd() - 0.5) * 1.6; wraithView.evx = (rnd() - 0.5) * 1.5; wraithView.evy = 5 + rnd() * 9; wraithView.evz = (rnd() - 0.5) * 1.5; wraithView.esize = 0.1 + 0.2 * rnd(); wraithView.emit(); }
          arm.shake += 0.012;
          if (!capture) hud.notice('The Bellwether', 'A vent is open', fight.strippedCount + ' of 3', 4);
        }
      }
      prevVent[k] = v;
    }
  }

  // ── The gale: the inhale draws the grass and the leaves toward the mouth; the wall sweeps out ──────
  let galeT = 0, galePrev = 0, galeBurstT = 0;
  function galeTick(dt) {
    const mx = bell.mx, my = bell.my, mz = bell.mz;
    if (fight.galeWarn) {
      // Drawn in: grass laid toward the mouth over the sweep's arc, leaves and dust streaming in.
      galeT += dt;
      if (galeT > 0.1) {
        galeT = 0;
        const h = sweepHeading(bell, rnd());
        const r = 8 + 40 * rnd(), dx = Math.sin(h), dz = Math.cos(h);
        flatten(mx + dx * r, mz + dz * r, -dx, -dz, 3, 3.5, 0.02, 0.6);
      }
      for (let q = 0; q < 3; q++) {
        const h = sweepHeading(bell, rnd()), r = 12 + 40 * rnd(), dx = Math.sin(h), dz = Math.cos(h);
        ground.qx = mx + dx * r; ground.qz = mz + dz * r; ground.sample();
        wraithView.ex = ground.qx; wraithView.ey = ground.h + 0.3 + rnd() * 2.5; wraithView.ez = ground.qz;
        const sp = 7 + 5 * rnd();
        wraithView.evx = -dx * sp; wraithView.evy = 0.4 + rnd(); wraithView.evz = -dz * sp;
        wraithView.esize = 0.05 + 0.08 * rnd(); wraithView.emit();
      }
      galePrev = 0;
    } else if (fight.galeActive) {
      const k = fight.galeK, h = sweepHeading(bell, k), dx = Math.sin(h), dz = Math.cos(h);
      const d = galeFrontDistance(k, T.galeR);
      if (d > galePrev + 0.5) {
        // The wall's front: grass flattened along the lane it has just crossed, a rolling band of dust.
        const half = (d - galePrev) * 0.5, wedgeW = 4 + Math.tan(T.wedge) * d;
        flatten(mx + dx * (galePrev + half), mz + dz * (galePrev + half), dx, dz, half, wedgeW, 0.04, 0.85);
        for (let q = 0; q < 14; q++) {
          const lat = (rnd() - 0.5) * 2 * wedgeW, px = mx + dx * d - dz * lat, pz = mz + dz * d + dx * lat;
          ground.qx = px; ground.qz = pz; ground.sample();
          wraithView.ex = px; wraithView.ey = ground.h + 0.2 + rnd() * 1.4; wraithView.ez = pz;
          wraithView.evx = dx * (14 + 10 * rnd()) - dz * (rnd() - 0.5) * 3; wraithView.evy = 0.5 + rnd() * 1.5; wraithView.evz = dz * (14 + 10 * rnd()) + dx * (rnd() - 0.5) * 3;
          wraithView.esize = 0.07 + 0.12 * rnd(); wraithView.emit();
        }
        galePrev = d;
      }
      galeBurstT -= dt;
      if (galeBurstT <= 0 && g.wind) { galeBurstT = 0.12; g.wind.burst(mx + dx * d, mz + dz * d, 2.2); }
    } else { galePrev = 0; galeBurstT = 0; }
    void my;
  }
  function galeHit() {
    const p = controller.pos;
    if (!controller.god) {
      controller.vel.x += fight.shoveX; controller.vel.z += fight.shoveZ; controller.vel.y = Math.max(controller.vel.y, 4 + 0.35 * fight.shove);
      controller.grounded = false;
      if (fight.damage > 0) combat.hurtRaw(fight.damage);
    }
    sound(p.x, p.y + 1, p.z, 1.6, SFX.WHOOSH, SFX.THUD);
    arm.shake += 0.05; if (!capture) clock.hitStop = Math.max(clock.hitStop, 0.07);
    puff(p.x, p.y + 0.5, p.z, 22, 6, 0.5);
  }

  // ── Restored state: the manor lies at rest, the village is whole ─────────────────────────────────
  let applied = false;
  function settleBell() {
    const sf = bell.sfx; bell.sfx = null;
    for (let k = 0; k < 3; k++) bell.openValve(k);
    if (bell.state !== B.RESTED) {
      bell.forceIdle(); bell.release();
      for (let i = 0; i < 700 && bell.state !== B.RESTED; i++) bell.update(1 / 30, bell.time);
    }
    bell.sfx = sf;
  }
  function villageWhole(on) {
    if (on) g.villageFire?.restoreAll();
    g.villageRestoredSites?.(on);
  }
  function applyRestored() {
    applied = true;
    fight.phase = BFIGHT.DONE; fight.valvesOpen = 3; fight.vents.fill(0); fight.hint = '';
    settleBell();
    for (let k = 0; k < 3; k++) { g.setVentHidden(k, true); prevVent[k] = 0; }
    villageWhole(true);
    worldState.restoration.meadow = 'restored';
    g.elements?.unlock('gale');
    flags.add(FLAG.WOKE);
  }
  function unapply() {
    applied = false;
    fight.reset(); g.resetVents(); prevVent.fill(T.ventStrength);
    for (const s of [0, 1, 2]) if (ventSites[s] >= 0) g.archSites[ventSites[s]].sink = 0;
    g.millSpin = null;
  }

  // ── The release ──────────────────────────────────────────────────────────────────────────────
  const rel = { active: false, t: 0, answered: false, ox: 0, oz: 0, heading: 0, cx: 0, cz: 0, yaw: 0, bells: 0, bellT: 0, fxT: 0, ended: false };
  const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 0.7 };
  const head = { x: 0, y: 0, z: 0 };
  const market = (g.village && g.village.market) || [93, 926];
  const mdist = Math.hypot(market[0] - arena.x, market[1] - arena.z);

  function startRelease() {
    flags.add(FLAG.RELEASED); g.calm?.note(g.controller.pos.x, g.controller.pos.z);   // calm after the peak (systems/calm.js)
    worldState.restoration.meadow = 'restored';
    g.elements?.unlock('gale');
    chapter.raise('bellwether:released');
    applied = true;
    for (let k = 0; k < 3; k++) { g.setVentHidden(k, true); }
    if (capture) { applyRestored(); return; }
    rel.active = true; rel.t = 0; rel.answered = false; rel.bells = 0; rel.ended = false;
    rel.ox = bell.mx; rel.oz = bell.mz;
    rel.heading = Math.atan2(market[0] - rel.ox, market[1] - rel.oz);
    rel.cx = bell.hx; rel.cz = bell.hz; rel.yaw = Math.atan2(bell.mdx, bell.mdz);
    g.bellCine = true;
    // Off the neck and onto the forecourt: she watches from the flagstones (held, so nothing moves her).
    bellClimb.grip = false;
    const p = controller.pos, spot = manorWorld(0, 16);
    p.x = spot[0]; p.z = spot[1]; p.y = MANOR.y + 0.1;
    controller.vel.x = 0; controller.vel.y = 0; controller.vel.z = 0; controller.hold = true; controller.grounded = true;
    releaseCam.hold = true; releaseCam.bars = Math.max(releaseCam.bars, 0.01);
    g.post && (g.post.post.resetHistory = true);
    musicOver = 'release'; musicUntil = clock.simTime + bellSys.cineEnd + bellSys.musicTail; music.rearm('release');
    hud.notice('The Bellwether', 'It breathes out', 'The wind is free.', 9);
  }

  function villageAnswers() {
    rel.answered = true;
    flags.add(FLAG.ANSWERED);
    villageWhole(true);
    rel.bells = 5; rel.bellT = 0;
    hud.notice('Hearn', 'The bells ring', 'The air is moving again.', 8);
    if (!capture) g.game?.saves?.requestAutosave();
  }

  function releaseTick(dt) {
    const rdt = clock.realDt;
    rel.t += dt;
    if (input.pressed[Action.Jump] || input.pressed[Action.Interact]) rel.t = Math.max(rel.t, bellSys.cineEnd);
    // The front: a band of wind across the hill toward the village.
    const R = frontRadius(rel.t);
    if (R > 0 && R < bellSys.frontMax) {
      for (let q = 0; q < 7; q++) {
        const a = rel.heading + (rnd() - 0.5) * 2 * bellSys.frontHalfArc, dx = Math.sin(a), dz = Math.cos(a);
        const x = rel.ox + dx * R, z = rel.oz + dz * R;
        flatten(x, z, dx, dz, 3.5, 6, 0.04, 0.85);
        if (q < 4) {
          ground.qx = x; ground.qz = z; ground.sample();
          for (let m = 0; m < 3; m++) {
            wraithView.ex = x + (rnd() - 0.5) * 6; wraithView.ey = ground.h + 0.3 + rnd() * 1.5; wraithView.ez = z + (rnd() - 0.5) * 6;
            wraithView.evx = dx * (16 + 10 * rnd()); wraithView.evy = 1 + 2 * rnd(); wraithView.evz = dz * (16 + 10 * rnd());
            wraithView.esize = 0.08 + 0.14 * rnd(); wraithView.emit();
          }
        }
      }
      rel.fxT -= dt;
      if (rel.fxT <= 0 && g.wind) { rel.fxT = 0.15; const a = rel.heading + (rnd() - 0.5) * bellSys.frontHalfArc; g.wind.burst(rel.ox + Math.sin(a) * R, rel.oz + Math.cos(a) * R, 3); }
    }
    if (!rel.answered && (R >= mdist - 20 || rel.t >= bellSys.cineEnd)) villageAnswers();
    if (rel.bells > 0) {
      rel.bellT -= dt;
      if (rel.bellT <= 0) { rel.bellT = 0.9; rel.bells--; sound(market[0], 14, market[1], 2.2, SFX.CHIME); }
    }
    // The camera: an orbit of the manor, the head the subject; the letterbox is the cinematic system's.
    const rc = releaseCam;
    head.x = bell.hx; head.y = bell.hy - 1; head.z = bell.hz;
    releaseCamPose(rel.t, rel.cx, rel.cz, MANOR.y, rel.yaw, head, pose);
    rc.x = pose.x; rc.y = pose.y; rc.z = pose.z; rc.tx = head.x; rc.ty = head.y; rc.tz = head.z;
    rc.bars = Math.min(1, rc.bars + rdt * 1.6);
    arm.setPose(pose.x, pose.y, pose.z, pose.yaw, pose.pitch, pose.fov);
    controller.hold = true; controller.vel.x = 0; controller.vel.z = 0;
    if (rel.t >= bellSys.cineEnd) endRelease();
  }
  function endRelease() {
    rel.active = false; rel.ended = true;
    g.bellCine = false; releaseCam.hold = false; controller.hold = false;
    arm.setFree(false); arm.yaw = pose.yaw; arm.pitch = 0.2; arm.snap(controller.pos);
    g.post && (g.post.post.resetHistory = true);
    settleBell();   // (a skipped cinematic: the head is down)
    g.millSpin = g.millSpin || null;
  }

  // ── Frame ────────────────────────────────────────────────────────────────────────────────────
  let wasDying = false, devDone = false, lastNear = -1;
  loop.add({ name: 'bellwetherFight', update: () => {
    const dt = clock.dt, p = controller.pos;
    if (!devDone) {
      devDone = true;
      if (devFight) flags.add(FLAG.STAIR);
      if (devRelease) flags.add(FLAG.RELEASED);
    }
    const released = flags.has(FLAG.RELEASED);
    if (flags.has(FLAG.WOKE) && g.elements && !g.elements.unlocked.has('gale')) g.elements.unlock('gale');   // a loaded save mid-fight
    if (released && !applied && !rel.active) applyRestored();
    else if (!released && applied && !rel.active) unapply();

    if (!released || rel.active) {
      fight.px = p.x; fight.py = p.y; fight.pz = p.z; fight.dt = dt; fight.climbing = bellClimb.climbing;
      bell.climbed = bellClimb.climbing;
      if (fight.phase === BFIGHT.VENTS) {
        windRep.update(gale, p.y + 1.2, dt);
        // An aimed Gust: the chimneys stand 38 m up, out of reach of a Gust's ground lane, so a Gust cast
        // while looking at one strips it — the camera's view ray within aimR of a sealed vent, up to
        // aimRange m (bot playtest 2026-10-24: from the forecourt nothing could reach them).
        let fresh = false;   // a Gust cast this frame (castGust is consumed by the bending system before this runs)
        for (let k = 0; k < gale.gustActive.length; k++) if (gale.gustActive[k] && gale.gustId[k] !== aimSeen[k]) { aimSeen[k] = gale.gustId[k]; fresh = true; }
        if (fresh) {
          // View direction from the camera's Euler rotation (the spring arm sets rotation (pitch, yaw, roll); pitch + is down).
          const c = g.camera, rp = c.rotation.x, ry = c.rotation.y, cp = Math.cos(rp);
          const fwd = aimDir; fwd.x = Math.sin(ry) * cp; fwd.y = -Math.sin(rp); fwd.z = Math.cos(ry) * cp;
          const ox = c.position.x, oy = c.position.y, oz = c.position.z;
          for (let k = 0; k < 3; k++) {
            if (!(fight.vents[k] > 0)) continue;
            fight.ventPos(k, vp);
            const dx = vp.x - ox, dy = vp.y - oy, dz = vp.z - oz, t = dx * fwd.x + dy * fwd.y + dz * fwd.z;
            if (t < 0 || t > bellSys.aimRange) continue;
            const ex = dx - fwd.x * t, ey = dy - fwd.y * t, ez = dz - fwd.z * t;
            if (ex * ex + ey * ey + ez * ez < bellSys.aimR * bellSys.aimR) { fight.windHit(vp.x, vp.y, vp.z, 0.5, 1); break; }
          }
        }
      }
      const dying = combat.dying > 0;
      if (dying && !wasDying) fight.playerDead();
      wasDying = dying;
      lastNear = bellClimb.nearValve;
      g.verbBlock = g.verbBlock || (fight.active && bellClimb.climbing && lastNear >= 0);
      if (bellClimb.climbing && input.pressed[Action.Primary] && !dying && fight.tryValve()) {
        const k = lastNear;
        if (k >= 0) { puff(bell.valves.x[k], bell.valves.y[k], bell.valves.z[k], 28, 5, 0.6); sound(bell.valves.x[k], bell.valves.y[k], bell.valves.z[k], 1.4, SFX.CHIME); }
        arm.shake += 0.015; if (!capture) clock.hitStop = Math.max(clock.hitStop, 0.08);
      }
      fight.update();
      ventsTick();
      galeTick(dt);

      const ev = fight.ev;
      if (ev) {
        if (ev & BEV.WAKE) {
          flags.add(FLAG.WOKE); music.sting('wake');
          // The air it has held so long leaks out of the stones round it, and the Wraith can bend it: Gale, before the
          // release makes it hers for good (bot playtest 2026-10-24: without ?gale=1 the chimneys could not be stripped).
          const fresh = !g.elements?.unlocked.has('gale');
          g.elements?.unlock('gale'); g.elements?.select('gale');
          if (!capture) hud.notice('The Bellwether', 'The manor wakes', (fresh ? 'Its held wind leaks out of the stones: you can bend it (Gale, key 2). ' : '') + 'Blow the turf off the three chimneys: look up at one and Gust.', 10);
        }
        if (ev & BEV.NECK_RISES && !capture) hud.notice('The Bellwether', 'Its neck rears', 'Climb it (hold right mouse at its base). Strike each valve (click) when you reach it.', 9);
        if (ev & BEV.INHALE) sound(bell.mx, bell.my, bell.mz, 1.8, SFX.CHARGE);
        if (ev & BEV.GALE) sound(bell.mx, bell.my, bell.mz, 2, SFX.BOOM, SFX.WHOOSH);
        if (ev & BEV.GALE_HIT) galeHit();
        if (ev & BEV.VALVE && !capture) hud.notice('The Bellwether', 'A valve opens', fight.valvesOpen + ' of 3', 4);
        if (ev & BEV.SHAKE) { arm.shake += 0.04; sound(bell.mx, bell.my, bell.mz, 1.4, SFX.RUMBLE); }
        if (ev & BEV.SUMMON && !capture) hud.notice('The Bellwether', 'It calls the Shaped', 'They come out of the meadow grass.', 6);
        if (ev & BEV.RESET) { g.resetVents(); prevVent.fill(T.ventStrength); for (const s of ventSites) if (s >= 0) g.archSites[s].sink = 0; musicOver = null; galePrev = 0; }
        if (ev & BEV.RELEASED) startRelease();
      }
    }
    if (rel.active) releaseTick(dt);

    // Music: the fight bed while it is on and near; the release bed through the cinematic.
    if (musicOver === 'release' && clock.simTime > musicUntil) musicOver = null;
    else if (musicOver !== 'release') {
      const near = (p.x - arena.x) * (p.x - arena.x) + (p.z - arena.z) * (p.z - arena.z) < 190 * 190;
      musicOver = fight.active && near && combat.dying === 0 ? 'fight' : null;
    }
    readout(fight.active && !capture && !rel.active);
  } });
  g.resetBellFight = () => { if (rel.active) return; fight.reset(); };
}
