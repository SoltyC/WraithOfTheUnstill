// The Warden fight in play (game/warden/fight.js): the arena's pillars rise and sink (their sites'
// seats), the crystals on them (the Crystallize renderer: whole, cracking, gone) and the healing
// streaming from them into the Warden, striking a crystal from a pillar's top, the spike barrage
// (its sound, its hits — not dodgeable), the Shaped it calls, the fight's readout (health, crystals,
// one line of what to do) and its reset when the Wraith dies or walks away.

import { createFight, FIGHT, EV, fightTuning } from '../game/warden/fight.js';
import { ARENA, SEEDLING_H } from '../world/architecture.js';
import { BRUSH } from '../shaders/terrainState.wgsl.js';

const PER = 8;   // crystal prisms per pillar (a centre and seven satellites)
const SEED = ARENA.pillars;   // the seedling's pillar index (after the arena's six)
/** The seedling (Varo's lesson): a small crystal that stills and sheds spikes of its own. */
const seedTuning = { rise: 3, wait: 7, charge: 2.5, fire: 1.3, aimedEvery: 0.32, wildPerSecond: 10, wildR: 16, near: 45 };

/** @param {any} g  shared boot context */
export function addWardenFightSystem(g) {
  const { loop, warden, wardenMod, spikes, spikesView, pillars, pillarCrystals, shaped, shapedMod, combat, combatTuning, controller, climb,
    clock, input, Action, sfx, SFX, arm, wraithView, terrainState: ts, ground, chapter, hud, capture } = g;
  const W = wardenMod.W;
  const sites = g.archSites;
  const pSite = [];
  for (let k = 1; k <= ARENA.pillars; k++) pSite.push(sites.findIndex((s) => s.id === 'warden-pillar-' + k));
  pSite.push(sites.findIndex((s) => s.id === 'seedling'));
  const NP = pSite[SEED] >= 0 ? ARENA.pillars + 1 : ARENA.pillars;
  pillars.n = NP; pillars.h[SEED] = SEEDLING_H;
  const arena = g.pois.find((p) => p.id === 'warden-frost');
  if (!arena || pSite.slice(0, ARENA.pillars).some((i) => i < 0)) return;
  const graph = chapter.graph;
  function stepOf(q) { const st = graph.quests[q]; if (!st || st.state !== 'active') return null; return graph.byId.get(q).steps[st.step]?.id ?? null; }
  g.losBlocker.solids = g.solids;
  spikes.sfx = sfx;

  const fight = g.fight = createFight({
    warden, spikes, pillars, count: ARENA.pillars, ground,
    spawn: (name, x, z) => shaped.spawn(name, x, z),
    alive: (i) => shaped.isLive(i) || shaped.slots[i].state === shapedMod.S.RISING,
    kill: (i) => shaped.damage(i, 1e9, false, 0, 0),
  });
  fight.homeHeading = Math.atan2(g.monastery.pos[0] - arena.pos[0], g.monastery.pos[1] - arena.pos[1]);
  // A wild spike through a Shaped in the open wounds it.
  spikes.hitShaped = () => {
    for (let i = 0; i < shapedMod.MAX_SHAPED; i++) {
      if (!shaped.isLive(i)) continue;
      const b = shaped.slots[i].body, dx = b.x - spikes.sx, dz = b.z - spikes.sz;
      if (dx * dx + dz * dz < 1.3 * 1.3) { shaped.damage(i, 22, true, 0, 0); return true; }
    }
    return false;
  };

  // ── Crystals: positions (pillar tops) and their prisms ────────────────────────────────────
  const cx = new Float64Array(8), cy = new Float64Array(8), cz = new Float64Array(8);
  const data = pillarCrystals.data;
  const shape = new Float64Array(ARENA.pillars * PER * 4);   // per prism: dx, dz, axis angle, tilt (fixed)
  let rs = 4711;
  const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
  for (let k = 0; k < NP * PER; k++) {
    const centre = k % PER === 0, a = rnd() * Math.PI * 2, r = centre ? 0 : 0.22 + 0.3 * rnd();
    shape[k * 4] = Math.cos(a) * r; shape[k * 4 + 1] = Math.sin(a) * r; shape[k * 4 + 2] = centre ? rnd() * 6.28 : a + (rnd() - 0.5) * 0.5; shape[k * 4 + 3] = centre ? 0.05 : 0.25 + 0.4 * rnd();
  }
  /** Prisms of crystal k standing for `left` strikes left (3 whole … 0 gone); born at `born`. */
  const shown = new Int8Array(8).fill(-1);
  function writeCrystal(k, left, born) {
    const keep = left >= 3 ? PER : left === 2 ? 5 : left === 1 ? 3 : 0;
    for (let j = 0; j < PER; j++) {
      const q = k * PER + j, o = q * 12, centre = j === 0;
      if (j >= keep) { data[o + 3] = 1e9; continue; }
      const ta = shape[q * 4 + 2], tilt = shape[q * 4 + 3], st = Math.sin(tilt);
      data[o] = cx[k] + shape[q * 4]; data[o + 1] = cy[k] - 0.1; data[o + 2] = cz[k] + shape[q * 4 + 1];
      if (data[o + 3] > 1e8 || born >= 0) data[o + 3] = (born >= 0 ? born : clock.simTime) + (centre ? 0 : 0.1 + 0.3 * rnd());
      data[o + 4] = Math.cos(ta) * st; data[o + 5] = Math.cos(tilt); data[o + 6] = Math.sin(ta) * st;
      data[o + 7] = centre ? 2.5 : 0.8 + 0.8 * rnd(); data[o + 8] = centre ? 0.42 : 0.12 + 0.1 * rnd();
      data[o + 9] = rnd(); data[o + 10] = centre ? 0.9 : 0.5 + 0.3 * rnd(); data[o + 11] = k;
    }
    shown[k] = left;
    pillarCrystals.dirty = true;
  }
  function burst(x, y, z, n, speed) {
    for (let q = 0; q < n; q++) {
      wraithView.ex = x + (rnd() - 0.5) * 0.6; wraithView.ey = y + rnd() * 1.6; wraithView.ez = z + (rnd() - 0.5) * 0.6;
      wraithView.evx = (rnd() - 0.5) * speed; wraithView.evy = 1 + rnd() * speed * 0.6; wraithView.evz = (rnd() - 0.5) * speed;
      wraithView.esize = 0.05 + 0.1 * rnd(); wraithView.emit();
    }
  }

  // ── Readout: health, crystals, one line of what to do ──────────────────────────────────────
  const box = document.createElement('div'); box.className = 'warden-fight';
  const bar = document.createElement('div'); bar.className = 'bar'; const fill = document.createElement('b'); bar.append(fill);
  const gems = document.createElement('div'); gems.className = 'gems';
  const gemEls = []; for (let k = 0; k < ARENA.pillars; k++) { const e = document.createElement('i'); gems.append(e); gemEls.push(e); }
  const line = document.createElement('div'); line.className = 'line';
  box.append(bar, gems, line);
  document.body.append(box);
  let lastFill = -1, lastGems = '', lastLine = '', lastOn = false;
  function readout(on, onTop) {
    if (on !== lastOn) { box.classList.toggle('on', on); lastOn = on; }
    if (!on) return;
    const f = Math.round(warden.hp);
    if (f !== lastFill) { fill.style.width = f + '%'; lastFill = f; }
    let key = fight.phase === FIGHT.WARD ? 'w' : 'o';
    for (let k = 0; k < ARENA.pillars; k++) key += fight.crystal[k];
    if (key !== lastGems) {
      lastGems = key;
      gems.classList.toggle('on', fight.phase === FIGHT.WARD);
      for (let k = 0; k < ARENA.pillars; k++) gemEls[k].className = fight.crystal[k] <= 0 ? 'broken' : fight.crystal[k] < fightTuning.crystalHits ? 'cracked' : '';
      bar.classList.toggle('warded', fight.phase === FIGHT.WARD);
    }
    const ws = warden.state;
    const text = ws === W.CHARGE || ws === W.BARRAGE ? 'Get behind stone'
      : fight.phase === FIGHT.WARD ? (onTop >= 0 ? 'Strike the crystal (click)' : climb.climbing ? 'Climb (W) to the top' : 'Its crystals heal it. Climb a pillar (hold right mouse at its foot) and break them')
      // Every seam broken (80 of its 100): the rest is worn off its body with the verbs.
      : warden.joint[0] === 2 && warden.joint[1] === 2 && warden.joint[2] === 2 && warden.joint[3] === 2 && warden.hp > 0 ? 'Its seams are broken. Wear it down: Sweep and Ribbon against its body'
      : '';
    if (text !== lastLine) { line.textContent = text; lastLine = text; line.classList.toggle('alarm', ws === W.CHARGE || ws === W.BARRAGE); }
  }

  // ── Healing: ice dust streaming from each standing crystal into the Warden ─────────────────
  function healStreams() {
    const b = warden.body, hx = b.sx[2], hy = b.sy[2] + 3, hz = b.sz[2];
    const strong = warden.hp < 99.5 ? 3 : 1;
    for (let k = 0; k < ARENA.pillars; k++) {
      if (fight.crystal[k] <= 0 || pillars.up[k] < 1) continue;
      const sx = cx[k], sy = cy[k] + 1.6, sz = cz[k];
      for (let q = 0; q < strong; q++) {
        const t = rnd(), sag = Math.sin(Math.PI * t) * 2.5;
        wraithView.ex = sx + (hx - sx) * t; wraithView.ey = sy + (hy - sy) * t + sag; wraithView.ez = sz + (hz - sz) * t;
        wraithView.evx = (hx - sx) * 0.06; wraithView.evy = 0.25; wraithView.evz = (hz - sz) * 0.06;
        wraithView.esize = 0.05 + 0.05 * rnd(); wraithView.emit();
      }
    }
  }

  // ── Pillars: rise (snow sheeting off, a berm thrown up round the foot), stand, sink ─────────
  const lastUp = new Float64Array(8);
  function pillarsTick(dt) {
    for (let k = 0; k < NP; k++) {
      const s = sites[pSite[k]], H = pillars.h[k], crystalLeft = k === SEED ? seed.crystal : fight.crystal[k];
      pillars.x[k] = s.at[0]; pillars.z[k] = s.at[1];
      if (s.seatY === undefined) { pillars.up[k] = Math.min(pillars.up[k], 0); continue; }
      const u = pillars.up[k], e = u * u * (3 - 2 * u);
      s.sink = (1 - e) * (H + 1.2);
      pillars.y0[k] = s.seatY - s.sink;
      cx[k] = s.at[0]; cy[k] = s.seatY - s.sink + H; cz[k] = s.at[1];
      // Glyph light: the ward's cold glow while its crystal stands.
      s.glow = u <= 0 ? 0 : crystalLeft > 0 ? 0.9 : 0.12;
      if (u > lastUp[k] && u < 1) {
        // Breaking out of the snow: powder thrown off, the ground heaving round it.
        if (lastUp[k] === 0) {
          ts.bx = s.at[0]; ts.bz = s.at[1]; ts.bdx = 1; ts.bdz = 0; ts.bl = 0; ts.bw = ARENA.pillarCap + 1.6; ts.bd = 0.5; ts.bc = 0.8;
          ts.bk = BRUSH.PLOUGH; ts.bwet = 0; ts.bbias = 0; ts.bberm = 1.4; ts.stamp();
          sfx.x = s.at[0]; sfx.y = s.seatY; sfx.z = s.at[1]; sfx.gain = 1.4; sfx.play(SFX.RUMBLE);
        }
        for (let q = 0; q < 6; q++) {
          const a = rnd() * Math.PI * 2, r = ARENA.pillarCap + 0.3 * rnd();
          wraithView.ex = s.at[0] + Math.cos(a) * r; wraithView.ey = s.seatY + 0.2; wraithView.ez = s.at[1] + Math.sin(a) * r;
          wraithView.evx = Math.cos(a) * (1 + 2 * rnd()); wraithView.evy = 1 + 3 * rnd(); wraithView.evz = Math.sin(a) * (1 + 2 * rnd());
          wraithView.esize = 0.1 + 0.2 * rnd(); wraithView.emit();
        }
        // Snow sliding off the capital as it comes up.
        for (let q = 0; q < 2; q++) {
          const a = rnd() * Math.PI * 2;
          wraithView.ex = s.at[0] + Math.cos(a) * ARENA.pillarCap; wraithView.ey = cy[k]; wraithView.ez = s.at[1] + Math.sin(a) * ARENA.pillarCap;
          wraithView.evx = Math.cos(a) * 0.6; wraithView.evy = -0.5; wraithView.evz = Math.sin(a) * 0.6; wraithView.esize = 0.06 + 0.08 * rnd(); wraithView.emit();
        }
        arm.shake += 0.002;
      }
      lastUp[k] = u;
      // The crystal: grows once its pillar stands, whole until struck; gone with the fight.
      const want = u >= 1 ? crystalLeft : 0;
      if (want !== shown[k]) {
        if (want < shown[k] && shown[k] > 0) {
          burst(cx[k], cy[k], cz[k], want === 0 ? 70 : 26, want === 0 ? 9 : 5);
          sfx.x = cx[k]; sfx.y = cy[k] + 1; sfx.z = cz[k]; sfx.gain = want === 0 ? 1.6 : 1.1; sfx.play(SFX.SHATTER);
        }
        writeCrystal(k, want, shown[k] <= 0 && want > 0 ? clock.simTime : -1);
      }
    }
    void dt;
  }

  // ── Reset: dying (or walking away) restarts the fight from the dormant Warden ─────────────
  let away = 0, wasDying = false;
  const deathT = combatTuning.deathTime;
  function resetIfNeeded(dt) {
    if (!fight.active) { away = 0; return; }
    const dying = combat.dying > 0;
    // At the moment the Wraith re-forms at the shrine (out of sight of the arena).
    if (dying && combat.dying >= deathT && !wasDying) { doReset(); wasDying = true; return; }
    if (!dying) wasDying = false;
    const dx = controller.pos.x - arena.pos[0], dz = controller.pos.z - arena.pos[1];
    away = dx * dx + dz * dz > 170 * 170 ? away + dt : 0;
    if (away > 15) doReset();
  }
  function doReset() {
    if (climb.climbing) { climb.grip = false; }
    fight.reset();
    for (let k = 0; k < ARENA.pillars; k++) { lastUp[k] = 0; if (shown[k] !== 0) writeCrystal(k, 0, -1); }
    away = 0;
  }
  g.resetWardenFight = doReset;

  // ── The seedling ──────────────────────────────────────────────────────────────────────────
  const seed = { crystal: 0, t: 0.5 - 0.5, phase: 0, aimT: 0.5 - 0.5, wild: 0.5 - 0.5, risen: false };
  function seedlingTick(dt) {
    if (NP === ARENA.pillars) return;
    const flags = graph.flags, p = controller.pos;
    if (flags.has('seedling-broken') || stepOf('watching-stone') !== 'seedling') {
      // Broken (or not its time): it goes back into the snow, slowly.
      seed.crystal = 0; seed.phase = 0;
      pillars.up[SEED] = Math.max(0, pillars.up[SEED] - dt / 8);
      return;
    }
    const dx = p.x - cx[SEED], dz = p.z - cz[SEED];
    if (!seed.risen && dx * dx + dz * dz > seedTuning.near * seedTuning.near) return;
    if (!seed.risen) { seed.risen = true; seed.crystal = fightTuning.crystalHits; seed.t = 0; seed.phase = 0; }
    pillars.up[SEED] = Math.min(1, pillars.up[SEED] + dt / seedTuning.rise);
    if (pillars.up[SEED] < 1 || seed.crystal <= 0) return;
    seed.t += dt;
    const T = seedTuning;
    if (seed.phase === 0 && seed.t >= T.wait) { seed.phase = 1; seed.t = 0; sfx.x = cx[SEED]; sfx.y = cy[SEED] + 1; sfx.z = cz[SEED]; sfx.gain = 1.6; sfx.play(SFX.CHARGE); }
    else if (seed.phase === 1) {
      // Gathering: light motes stream up off it, faster and faster.
      const n = 1 + Math.floor(4 * seed.t / T.charge);
      for (let q = 0; q < n; q++) { wraithView.ex = cx[SEED] + (rnd() - 0.5) * 1.2; wraithView.ey = cy[SEED] + rnd() * 2.2; wraithView.ez = cz[SEED] + (rnd() - 0.5) * 1.2; wraithView.evx = (rnd() - 0.5) * 0.5; wraithView.evy = 1 + 2 * rnd(); wraithView.evz = (rnd() - 0.5) * 0.5; wraithView.esize = 0.05 + 0.05 * rnd(); wraithView.emit(); }
      if (seed.t >= T.charge) { seed.phase = 2; seed.t = 0; seed.aimT = 0; seed.wild = 0; sfx.x = cx[SEED]; sfx.y = cy[SEED]; sfx.z = cz[SEED]; sfx.gain = 1.2; sfx.play(SFX.WHOOSH); }
    } else if (seed.phase === 2) {
      spikes.fx0 = cx[SEED]; spikes.fy0 = cy[SEED] + 2.2; spikes.fz0 = cz[SEED];
      seed.aimT -= dt;
      if (seed.aimT <= 0) { seed.aimT += T.aimedEvery; spikes.px = p.x; spikes.py = p.y; spikes.pz = p.z; spikes.fireAimed(); }
      seed.wild += T.wildPerSecond * dt;
      while (seed.wild >= 1) {
        seed.wild -= 1;
        const a = rnd() * Math.PI * 2, r = 3 + Math.sqrt(rnd()) * (T.wildR - 3);
        spikes.tx = cx[SEED] + Math.cos(a) * r; spikes.tz = cz[SEED] + Math.sin(a) * r;
        ground.qx = spikes.tx; ground.qz = spikes.tz; ground.sample(); spikes.ty = ground.h;
        spikes.fireWild();
      }
      if (seed.t >= T.fire) { seed.phase = 0; seed.t = 0; }
    }
  }
  /** The seedling's crystal within reach of the Wraith on its top? */
  function seedReach(x, y, z) {
    if (NP === ARENA.pillars || seed.crystal <= 0 || pillars.up[SEED] < 1) return false;
    const dx = x - cx[SEED], dz = z - cz[SEED];
    return dx * dx + dz * dz < fightTuning.reach * fightTuning.reach && y > cy[SEED] - 1.2 && y < cy[SEED] + 2.5;
  }

  let striking = -1, firstCharge = true;
  loop.add({ name: 'wardenFight', update: () => {
    const dt = clock.dt;
    // The fight belongs to the arena (photo spots and the overlay place the Warden elsewhere).
    const home = warden.active && Math.hypot(warden.homeX - arena.pos[0], warden.homeZ - arena.pos[1]) < 5;
    // Consequences from the quests.
    const flags = chapter.graph.flags;
    fight.crackedCrystal = flags.has('tobin-listened') ? 2 : -1;
    fight.denCleared = flags.has('cleared:den');
    if (home) {
      fight.px = controller.pos.x; fight.py = controller.pos.y; fight.pz = controller.pos.z; fight.dt = dt;
      fight.update();
    }
    seedlingTick(dt);
    pillarsTick(dt);
    // Striking a crystal from the pillar's top: Primary strikes (no Sweep is cast there).
    const p = controller.pos;
    striking = home ? fight.reachable(p.x, p.y, p.z, cx, cy, cz) : -1;
    if (striking < 0 && seedReach(p.x, p.y, p.z)) striking = SEED;
    g.verbBlock = striking >= 0;
    if (striking >= 0 && input.pressed[Action.Primary] && combat.dying === 0) {
      let hit = false;
      if (striking === SEED) {
        seed.crystal--; hit = true;
        if (seed.crystal <= 0) {
          graph.flags.add('seedling-broken'); chapter.raise('seedling:broken');
          if (!capture) hud.notice('The Watching Stone', 'The seedling breaks', 'Varo will want to hear it.', 6);
        }
      } else hit = fight.strike(striking);
      if (hit) {
        clock.hitStop = Math.max(clock.hitStop, 0.09); arm.shake += 0.02; arm.kick += 0.04; g.castFlash.v = 1;
        controller.yaw = Math.atan2(cx[striking] - p.x, cz[striking] - p.z);
      }
    }
    // The seedling's line.
    if (!capture && NP > ARENA.pillars) {
      const active = seed.risen && seed.crystal > 0 && stepOf('watching-stone') === 'seedling';
      hud.line('seedling', !active ? '' : seed.phase >= 1 ? 'Put the stone between you' : striking === SEED ? 'Strike the crystal (click)' : climb.climbing ? 'Climb (W) to the top' : 'Climb the seedling (hold right mouse at its foot) and break its crystal', active && seed.phase >= 1);
    }
    if (home && fight.phase === FIGHT.WARD) healStreams();
    // Spikes: they strike through a bend-step; only stone stops them.
    spikes.px = p.x; spikes.py = p.y; spikes.pz = p.z; spikes.dt = dt;
    spikes.update();
    if (spikes.hits > 0 && !controller.god) combat.hurtRaw(spikes.hitDamage);
    spikesView.update();
    pillarCrystals.time = clock.simTime; pillarCrystals.update();
    // Events: sound and notices.
    const ev = fight.ev;
    if (!capture) {
      if (ev & EV.RISE) chapter.raise('warden:awake');
      if (ev & EV.WARD_BROKEN) chapter.raise('warden:ward');
      if (ev & EV.RISE) hud.notice('The Held Snow', 'Pillars rise out of the snow', 'A crystal burns on each. While they stand, they heal it.', 7);
      if (ev & EV.CHARGE) {
        const b = warden.body; sfx.x = b.sx[2]; sfx.y = b.sy[2] + 4; sfx.z = b.sz[2]; sfx.gain = 2.2; sfx.play(SFX.CHARGE);
        if (firstCharge) { firstCharge = false; hud.notice('The Held Snow', 'It gathers itself', 'Get behind stone. Nothing else stops what comes next.', 6); }
      }
      if (ev & EV.BARRAGE) { const b = warden.body; sfx.x = b.sx[2]; sfx.y = b.sy[2] + 4; sfx.z = b.sz[2]; sfx.gain = 1.8; sfx.play(SFX.BOOM); sfx.play(SFX.WHOOSH); }
      if ((ev & EV.CRYSTAL_BROKEN) && !(ev & EV.WARD_BROKEN)) hud.notice('The Held Snow', 'A crystal breaks', (ARENA.pillars - fight.standing) + ' of ' + ARENA.pillars, 4);
      if (ev & EV.WARD_BROKEN) hud.notice('The Held Snow', 'The ward breaks', 'Its seams are open. Crystallize (F) beside one, then Sweep through the ice.', 9);
      if (ev & EV.SUMMON) hud.notice('The Held Snow', 'It calls the Shaped', 'They rise out of the snow at the edge of the arena.', 6);
    }
    resetIfNeeded(dt);
    readout(home && fight.active && !capture && warden.state !== W.RELEASE, striking);
  } });
}
