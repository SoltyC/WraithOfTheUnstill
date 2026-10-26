// The Bell-mace's plunge (docs/mace-design.md): LMB in the air with the bell drawn commits the
// Wraith to a straight fall at 30 m/s that pays out the height it has stored as one tolling blow:
// 18 + 3.2 h damage in a shockwave of 1.6 + 0.16 h m that strikes the crown (no plate turns it), a
// dent scaled by h, and, if it connected, a rebound that throws the Wraith up again by 0.5 h (30 %
// less each time in a chain). Around it: the Updraft's +4 m, the Downdraft's +5 m, the dunk of a
// Shaped caught airborne, the ice star on frozen ground, the Flow 2 and 3 effects, and the telegraph
// (glow and pitch) that reads the stored height with no number. The numbers live in the def
// (defs3.js `plunge`, forged by tiers.js); the pure parts in plungeMath.js; the world's side in
// plungeFx.js. Allocation-free per frame: fields in, fixed arrays.

import { MAX_SHAPED } from '../shaped/shaped.js';
import { ARCHETYPES } from '../shaped/archetypes.js';
import { bodyRadius } from './arcs.js';
import { PHASE } from './machine.js';
import { controllerTuning } from '../../character/capsuleController.js';
import { StoredHeight, plungeDamage, tollRadius, tollFalloff, reboundHeight, launchSpeed, inStar } from './plungeMath.js';
import { createPlungeFx } from './plungeFx.js';

export { plungeDamage, tollRadius, tollFalloff, reboundHeight, reboundKeep, launchSpeed, inStar, StoredHeight } from './plungeMath.js';

/**
 * @param {{ shaped: any, combat: any, controller: any, clock: any, ts: any, fx: any, flow: any, ground: any, inventory: any, machine: any,
 *   strike: (i: number, a: any, dx: number, dz: number, falloff: number) => void, gale?: any, frost?: any, wind?: any, sfx?: any, SFX?: any }} ctx
 */
export function createPlunge(ctx) {
  const { shaped, combat, controller, flow, ground, inventory, machine: m, strike } = ctx;
  const gale = ctx.gale || null, frost = ctx.frost || null, sfx = ctx.sfx || null, SFX = ctx.SFX || null;
  const air = shaped.air, G = controllerTuning.gravity;
  const pfx = createPlungeFx(ctx);
  const hs = new StoredHeight();
  const radius = {};
  for (const k in ARCHETYPES) radius[k] = bodyRadius(ARCHETYPES[k]);
  // Doubles live in an object's fields (a closure variable holding a double boxes on every write).
  const st = { active: false, t: 0.5 - 0.5, fromGlide: false, chain: 0, inChain: 0, down: false, scour: false, glow: 0.5 - 0.5, pitch: 0.5 - 0.5, hNow: 0.5 - 0.5,
    block: 0.5 - 0.5, clear: 0.5 - 0.5, gy: 0.5 - 0.5, can: false, press: false, rimT: 0.5 - 0.5, rimX: 0.5 - 0.5, rimZ: 0.5 - 0.5, rimS: 0.5 - 0.5, rimN: 0, hits: 0 };
  /** The blow as the shared strike path reads it (weapons.js): refilled for each impact. */
  const pa = { dmg: 0.5 - 0.5, stagger: true, knock: 0.5 - 0.5, chip: 0.5 - 0.5, stop: 0.5 - 0.5, shake: 0.5 - 0.5, kick: 0.5 - 0.5, sfx: 'boom', crown: true, shatter: false };
  // Dunked bodies that have landed (queued by air.onLand, struck at the next update) and the damage each carries down.
  const dq = { i: new Int8Array(MAX_SHAPED), x: new Float64Array(MAX_SHAPED), z: new Float64Array(MAX_SHAPED), n: 0 };
  const dunkDmg = new Float64Array(MAX_SHAPED);
  /** Telemetry for the bot, the overlay and the tests. */
  const last = { h: 0.5 - 0.5, dmg: 0.5 - 0.5, radius: 0.5 - 0.5, rebound: 0.5 - 0.5, hits: 0, shatters: 0, star: false, dunkHits: 0, y: 0.5 - 0.5, bonus: 0.5 - 0.5, chain: 0 };
  const stats = { dunkLands: 0, plunges: 0, hits: 0, misses: 0, rebounds: 0, dunks: 0, stars: 0, maxH: 0.5 - 0.5, updraftSpent: 0, downdrafts: 0, thunder: 0, rimmed: 0 };

  if (air) air.onLand = (i, x, z, dunked) => { if (dunked && dq.n < MAX_SHAPED) { dq.i[dq.n] = i; dq.x[dq.n] = x; dq.z[dq.n] = z; dq.n++; } };

  /** A strike on slot i from the plunge, as a heavy whatever the machine is doing. */
  function hit(i, dx, dz, falloff) {
    const hv = m.heavy, pw = m.power;
    m.heavy = true; m.power = 1;
    strike(i, pa, dx, dz, falloff);
    m.heavy = hv; m.power = pw;
  }
  const crownY = (b) => Math.max(b.sy[1], b.hy) + 0.25;

  const self = {
    hs, last, stats, st,
    /** Inputs (fields), set by weapons.js: a fresh press this frame, dt. */
    pressed: false, dt: 0.5 - 0.5,
    /** The fall is on (the controller holds the line). */
    get falling() { return st.active; },
    /** 0..1 of the stored height for the telegraph: the bell's glow and the hum's pitch (0 on the ground); `cap` when more height adds nothing. */
    get glow() { return st.glow; }, get pitch() { return st.pitch; }, get cap() { return st.hNow >= 20; },
    get hNow() { return st.hNow; }, get chain() { return st.chain; }, get downUsed() { return st.down; },

    /** Before the machine: is a press this frame for the plunge (the bell drawn, airborne, enough air under the Wraith, the weapon free)? Then weapons.js does not start a swing with it. */
    prepare(def) {
      st.can = false;
      if (def === null || def.id !== 'mace' || st.active) return false;
      if (controller.grounded || controller.swimming) return false;
      ground.qx = controller.pos.x; ground.qz = controller.pos.z; ground.sample();
      st.gy = ground.h; st.clear = controller.pos.y - ground.h;
      if (st.clear < def.plunge.clearance || m.phase !== PHASE.IDLE) return false;
      st.can = true;
      return this.pressed;
    },

    /** After the machine, once a frame (any weapon in hand): the stored height, the telegraph, the commit, the fall, the dunks. */
    update(def) {
      const dt = this.dt, mace = def !== null && def.id === 'mace', P = mace ? def.plunge : null;
      if (st.block > 0) { st.block -= dt; if (st.block <= 0 && !st.active) controller.glide.blocked = false; }
      // The machine was reset under the plunge (a dodge, a swap, a blow, death): it is over, and the height with it.
      if (st.active && (!m.plunge || !mace)) this.abort();
      if (dq.n > 0 && mace) dunked(P);
      if (st.rimN > 0) rim(dt);
      // Landed (a plunge ends on the ground or on a crown): the blow, before anything resets.
      if (st.active) {
        st.t += dt;
        if (controller.grounded && st.t > 0.02) impact(P, controller.pos.x, controller.pos.y, controller.pos.z, -1);
        else fall(P);
      }
      // The stored height.
      hs.glideHalf = mace ? P.glideHalf : 0.5; hs.y = controller.pos.y; hs.gliding = controller.glide.active;
      if (controller.grounded) { hs.rest(); st.chain = 0; st.inChain = 0; st.down = false; st.scour = false; }
      else hs.fly();
      // The telegraph.
      let want = 0;
      if (mace && !controller.grounded) {
        if (!st.active) { ground.qx = controller.pos.x; ground.qz = controller.pos.z; ground.sample(); st.gy = ground.h; st.clear = controller.pos.y - ground.h; }
        st.hNow = hs.h(st.gy);
        want = Math.min(1, st.hNow / P.hMax);
      } else st.hNow = 0;
      st.glow += (want - st.glow) * (1 - Math.exp(-(want > st.glow ? 10 : 5) * dt));
      st.pitch = st.glow;
      // The commit: a fresh press (or one kept through a hop-swing's recovery) with the air for it.
      if (mace && !st.active && !controller.grounded && !controller.swimming && st.clear >= P.clearance) {
        const kept = m.phase === PHASE.RECOVER && m.bufT > 0;
        if ((st.can && this.pressed) || kept) commit(P);
      }
    },

    /** A Gust cast during the fall fires down under the Wraith: +5 m stored (still capped at 20 for damage). The caller spends the focus. */
    downdraft(def) {
      if (!st.active || st.down || def === null || def.id !== 'mace') return false;
      st.down = true; st.scour = true; hs.bonus += def.plunge.downdraft; stats.downdrafts++;
      pfx.downdraft(controller.pos.x, controller.pos.y, controller.pos.z);
      return true;
    },

    /** The hop-swing (the ground heavy) springs the Wraith `a.hop` m up. */
    hop(a) {
      controller.pos.y += 0.06; controller.grounded = false;
      controller.vel.y = launchSpeed(a.hop + 0.1, G);
    },

    /** The plunge ends without its blow (a dodge, a swap, a hit, death): the line is released and the height is lost. */
    abort() {
      st.active = false; controller.plungeV = 0; controller.glide.blocked = false; st.block = 0;
      hs.y = controller.pos.y; hs.top = hs.y; hs.bonus = 0;
    },
    reset() { this.abort(); hs.y = controller.pos.y; hs.rest(); st.chain = 0; st.inChain = 0; st.glow = 0; st.rimN = 0; dq.n = 0; },
  };

  function commit(P) {
    m.beginPlunge(P.hit);
    st.active = true; st.t = 0; st.down = false; st.scour = false;
    const gl = controller.glide, k = gl.active ? P.glideDrift : P.drift;
    st.fromGlide = gl.active;
    controller.vel.x *= k; controller.vel.z *= k;
    gl.active = false; gl.blocked = true;
    controller.plungeV = P.speed; controller.vel.y = -P.speed;
    // Inside a standing Updraft the column pushes the bell down as it collapses: +4 m, and it is spent.
    const col = gale !== null ? gale.columnAt(controller.pos.x, controller.pos.y, controller.pos.z) : -1;
    if (col >= 0) { hs.bonus += P.updraft; gale.collapse(col); stats.updraftSpent++; }
    if (st.chain > 0) flow.chainHit();
    stats.plunges++;
    if (sfx !== null) { sfx.x = controller.pos.x; sfx.y = controller.pos.y; sfx.z = controller.pos.z; sfx.gain = 0.7; sfx.tone = 0; sfx.play(SFX.SWISH); }
  }

  /** The fall, per frame: the aim assist bends the line toward the nearest Shaped below, and a crown struck on the way down is the blow. */
  function fall(P) {
    const p = controller.pos, v = controller.vel;
    ground.qx = p.x; ground.qz = p.z; ground.sample();
    const tf = Math.max(0.03, (p.y - ground.h) / P.speed);
    let best = -1, bm = P.assist, bx = 0, bz = 0;
    for (let i = 0; i < MAX_SHAPED; i++) {
      if (!shaped.isLive(i)) continue;
      const b = shaped.slots[i].body, r = radius[shaped.slots[i].arch];
      const dx = b.sx[1] - p.x, dz = b.sz[1] - p.z;
      const miss = Math.sqrt((dx - v.x * tf) * (dx - v.x * tf) + (dz - v.z * tf) * (dz - v.z * tf)) - r;
      if (miss < bm) { bm = miss; best = i; bx = dx; bz = dz; }
      // The crown: close enough above the head to land on it.
      const dd = Math.sqrt(dx * dx + dz * dz), cy = crownY(b);
      if (dd - r < 0.45 && p.y <= cy && p.y > cy - 2.4) { impact(P, p.x, p.y, p.z, i); return; }
    }
    if (best >= 0) {
      const k = 1 - Math.exp(-14 * self.dt);
      v.x += (Math.max(-14, Math.min(14, bx / tf)) - v.x) * k; v.z += (Math.max(-14, Math.min(14, bz / tf)) - v.z) * k;
    }
  }

  /** The bell lands at (x, y, z), on the ground or on the crown of slot `contact`. */
  function impact(P, x, y, z, contact) {
    ground.qx = x; ground.qz = z; ground.sample();
    // The impact point: where the bell lands (a floor), the ground under a crown it struck on foot, or the crown of a Shaped caught in the air (the dunk).
    const gy = ground.h, yi = contact >= 0 && air.on[contact] === 0 ? gy : y, hRaw = hs.h(yi), hc = Math.min(P.hMax, hRaw), R = tollRadius(P, hc);
    const def = inventory.def;
    const ice = hc >= P.starFrom && frost !== null && frost.iceAt(x, z), starLen = hc * P.starLen, starYaw = 0.35;
    pa.dmg = plungeDamage(P, hRaw); pa.knock = P.knock0 + P.knockPerM * hc; pa.chip = P.chip; pa.stop = P.stop * 0.3; pa.shake = 0; pa.kick = 0;
    let hits = 0, shatters = 0, dunk = false;
    for (let i = 0; i < MAX_SHAPED; i++) {
      if (!shaped.isLive(i)) continue;
      const s = shaped.slots[i], b = s.body, r = radius[s.arch], isContact = i === contact;
      if (air.on[i] === 1 && !isContact) continue;                  // up in the air: the shock runs under it
      let dmin = 1e9;
      if (isContact) dmin = 0;
      else for (let j = 0; j < b.sx.length; j++) { const d = Math.hypot(b.sx[j] - x, b.sz[j] - z); if (d < dmin) dmin = d; }
      const edge = Math.max(0, dmin - r), frozen = shaped.isFrozen(i);
      const starred = ice && frozen && inStar(x, z, starYaw, starLen, 0.8 + r, b.sx[1], b.sz[1]);
      if (edge > R && !starred) continue;
      const dx = b.sx[1] - x, dz = b.sz[1] - z, dl = Math.hypot(dx, dz);
      pa.shatter = ice && frozen;
      shaped.poiseMul = hc >= P.poiseFrom ? 2 : 1;                  // a tall plunge counts double against poise: the brute staggers
      const wasAir = air.on[i] === 1;
      hit(i, dl > 0.2 ? dx / dl : 0, dl > 0.2 ? dz / dl : 1, tollFalloff(P, edge, R));
      shaped.poiseMul = 1; pa.shatter = false;
      hits++; if (frozen && !shaped.isLive(i)) shatters++;
      if (wasAir && isContact) { air.slam(i); dunkDmg[i] = pa.dmg * P.dunk; dunk = true; stats.dunks++; }
    }
    // Frost bell, third plunge in a chain: the ring freezes.
    st.inChain++;
    if (def !== null && inventory.infusion(def.id) === 'frost' && st.inChain === 3) {
      for (let i = 0; i < MAX_SHAPED; i++) {
        if (!shaped.isLive(i) || shaped.isFrozen(i)) continue;
        const b = shaped.slots[i].body;
        if (Math.hypot(b.sx[1] - x, b.sz[1] - z) - radius[shaped.slots[i].arch] <= R) shaped.freeze(i, P.infuseFreeze);
      }
      pfx.freeze(x, z, R);
    }
    pfx.toll(x, gy, z, hc, R, P);
    if (ice) { pfx.star(x, z, starYaw, starLen); stats.stars++; }
    if (st.scour) { pfx.scour(x, z, R); st.scour = false; }
    // Flow 2: a rim of wind rings out for 1.5 s. Flow 3 (or the forged Thunderhead): a small Updraft from a tall plunge.
    if (flow.tier >= 2) { st.rimT = P.flowRim; st.rimX = x; st.rimZ = z; st.rimS = 0.5 + hc / P.hMax; st.rimN = 2; stats.rimmed++; }
    if (hc >= P.flowUpdraft && gale !== null && (flow.tier >= 3 || P.thunder)) { gale.spawnDraft(x, z, P.updraftPower, P.updraftLife); stats.thunder++; }
    // The machine plays the blow and then the recovery (or the kneel).
    m.strikePlunge(hits > 0 ? P.hit : P.miss);
    controller.plungeV = 0; st.active = false; st.block = 0.35;
    last.h = hRaw; last.dmg = pa.dmg; last.radius = R; last.hits = hits; last.shatters = shatters; last.star = ice; last.y = y; last.bonus = hs.bonus; last.chain = st.chain; last.dunkHits = 0; last.rebound = 0;
    stats.hits += hits; stats.maxH = Math.max(stats.maxH, hRaw);
    const v = controller.vel;
    if (hits > 0) rebound(P, x, y, z, hRaw, contact);
    else { stats.misses++; v.x = 0; v.z = 0; hs.y = y; hs.rest(); }
  }

  /** The bell throws the Wraith back up: 0.5 h (max 8 m), 30 % less each time in the chain, drifting toward the nearest other Shaped. */
  function rebound(P, x, y, z, hRaw, contact) {
    const def = inventory.def, inf = def !== null ? inventory.infusion(def.id) : null;
    const reb = reboundHeight(P, hRaw, st.chain, flow.tier, inf === 'gale' ? P.infuseRebound : 0), vy = launchSpeed(reb, G), v = controller.vel;
    st.chain++; stats.rebounds++; last.rebound = reb; last.chain = st.chain;
    controller.pos.y = y + 0.1; controller.grounded = false; v.y = vy;
    let bd = P.reboundDrift, bx = 0, bz = 0;
    for (let i = 0; i < MAX_SHAPED; i++) {
      if (i === contact || !shaped.isLive(i)) continue;
      const b = shaped.slots[i].body, dx = b.sx[1] - x, dz = b.sz[1] - z, d = Math.sqrt(dx * dx + dz * dz);
      if (d < bd) { bd = d; bx = dx; bz = dz; }
    }
    if (bd < P.reboundDrift) {
      const sp = Math.min(P.reboundDriftSpeed, bd / Math.max(0.2, 2 * vy / G));
      v.x += bx / bd * sp; v.z += bz / bd * sp;
    }
    hs.y = y; hs.rest();
  }

  /** The dunked bodies that landed: the second impact, 60 % of the blow, in a 2.4 m disc, knocking down what it lands among. */
  function dunked(P) {
    for (let q = 0; q < dq.n; q++) {
      const slot = dq.i[q], x = dq.x[q], z = dq.z[q];
      pa.dmg = dunkDmg[slot]; pa.knock = P.dunkKnock; pa.chip = P.chip * 0.6; pa.stop = P.stop * 0.4; pa.shatter = false;
      let n = 0;
      for (let i = 0; i < MAX_SHAPED; i++) {
        if (i === slot || !shaped.isLive(i) || air.on[i] === 1) continue;
        const b = shaped.slots[i].body, r = radius[shaped.slots[i].arch];
        let dmin = 1e9;
        for (let j = 0; j < b.sx.length; j++) { const d = Math.hypot(b.sx[j] - x, b.sz[j] - z); if (d < dmin) dmin = d; }
        const edge = Math.max(0, dmin - r);
        if (edge > P.dunkRadius) continue;
        const dx = b.sx[1] - x, dz = b.sz[1] - z, dl = Math.hypot(dx, dz);
        shaped.poiseMul = 1000;                                   // knocked down, whatever its poise
        hit(i, dl > 0.2 ? dx / dl : 0, dl > 0.2 ? dz / dl : 1, tollFalloff(P, edge, P.dunkRadius));
        shaped.poiseMul = 1; n++;
      }
      ground.qx = x; ground.qz = z; ground.sample();
      pfx.dunk(x, ground.h, z, P.dunkRadius, P);
      last.dunkHits = n; stats.dunkLands++;
    }
    dq.n = 0;
  }

  /** Flow 2's rim: the wind rings out again at 0.5 s and 1.0 s after the toll, so the grass ripples for 1.5 s. */
  function rim(dt) {
    const before = st.rimT; st.rimT -= dt;
    if (ctx.wind && Math.floor(before / 0.5) !== Math.floor(Math.max(0, st.rimT) / 0.5)) ctx.wind.burst(st.rimX, st.rimZ, st.rimS * 0.8);
    if (st.rimT <= 0) st.rimN = 0;
  }

  return self;
}
