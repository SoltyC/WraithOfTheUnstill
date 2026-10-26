// The weapons in play (docs §11): the carried weapon's machine and pose, the swing's heading and
// lunge, hit detection against the Shaped, material reactions, the ground a heavy strikes, bleeding
// cuts and the Flow every connected hit feeds. Pure game logic over the boot objects it is given
// (testable with stand-ins); input and rendering live in systems/weapons.js and render/weaponView.js.
// Allocation-free per frame; fields in, fields out (no doubles as call arguments).

import { MAX_SHAPED, S } from '../shaped/shaped.js';
import { ARCHETYPES } from '../shaped/archetypes.js';
import { BRUSH } from '../../shaders/terrainState.wgsl.js';
import { FLOW_EVENT } from '../flow.js';
import { weaponFeel } from './defs.js';
import { WeaponMachine, PHASE } from './machine.js';
import { WeaponPose } from './pose.js';
import { arc, bodyRadius } from './arcs.js';
import { hitMat } from './affinity.js';
import { tierDef } from './tiers.js';
import { createBurn } from './burn.js';
import { createPlunge } from './plunge.js';
import { combatTuning } from '../combat/combat.js';

/** Tuning shared by the weapons, edited from the dev overlay. */
export const weaponTuning = { hitStopMul: 1, shakeMul: 1, damageMul: 1, bleedTick: 0.5, impactChip: 1 };

/**
 * @param {{ shaped: any, combat: any, controller: any, clock: any, ts: any, fx: any, flow: any, inventory: any, ground: any, sfx?: any, SFX?: any, buffs?: any }} ctx
 */
export function createWeapons(ctx) {
  const { shaped, combat, controller, clock, ts, fx, flow, inventory, ground } = ctx;
  const sfx = ctx.sfx || null, SFX = ctx.SFX || null, buffs = ctx.buffs || null;
  const F = weaponFeel, T = weaponTuning;
  const m = new WeaponMachine(), pose = new WeaponPose();
  const radius = {};
  for (const k in ARCHETYPES) radius[k] = bodyRadius(ARCHETYPES[k]);
  const bleedT = new Float64Array(MAX_SHAPED), bleedDps = new Float64Array(MAX_SHAPED);
  // Poise recovery: a Shaped that was staggered by a weapon cannot be staggered again by it while it reels or for POISE_WINDOW s after (the blows still land): no stagger-lock.
  const POISE_WINDOW = 1.2, poiseT = new Float64Array(MAX_SHAPED), poiseBy = new Array(MAX_SHAPED).fill('');
  // Frost infusion: blows landed on each slot in the last few seconds (the third freezes it).
  const chill = new Float64Array(MAX_SHAPED), chillT = new Float64Array(MAX_SHAPED);
  // Mutable state lives in an object of double fields (a closure variable holding a double boxes it on every write).
  const st = { prevProg: 0.5 - 0.5, swapT: 0.5 - 0.5, atkYaw: 0.5 - 0.5, push: 0.5 - 0.5 };
  let hitMask = 0, impacted = false, lastBlows = 0, passMark = 0, brushed = false;
  let curDef = null;
  let tdBase = null, tdTier = -1, tdDef = null;     // the forge's def for the weapon in hand, rebuilt only when the weapon or its tier changes
  const w = combat.wh;
  const burn = createBurn({ shaped, combat, fx, ts, ground });
  // The Bell-mace's plunge (plunge.js): its blow goes through this file's strike(), so the tea, the tiers and the affinities apply.
  const plunge = createPlunge({ shaped, combat, controller, clock, ts, fx, flow, ground, inventory, machine: m, gale: ctx.gale || null, frost: ctx.frost || null, wind: ctx.wind || null, sfx, SFX,
    strike: (i, a, dx, dz, f) => self.strike(i, a, dx, dz, f) });
  const nightOf = ctx.night || null;     // () => 0 (day) … 1 (night): the flame burns hotter in the dark
  let pinMask = 0, lastPhase = 0, flinging = false;

  const self = {
    machine: m, pose, inventory, burn, plunge,
    /** Inputs (fields), set each frame by systems/weapons.js. */
    down: false, pressed: false, dodgePressed: false, swapPressed: false, able: true, aimYaw: 0.5 - 0.5, dt: 0.5 - 0.5,
    /** Out: a dodge may go now; the swing is cutting (the trail), and where the weapon is heading. */
    dodgeNow: false, cutting: false, knockOv: 0.5 - 0.5, trailT: 0.5 - 0.5, swapT: 0.5 - 0.5, yaw: 0.5 - 0.5,
    /** Telemetry for the bot and the overlay. */
    stats: { swings: 0, heavies: 0, hits: 0, damage: 0, shatters: 0, glances: 0 },
    /** The tier of the weapon in hand (0 = as found). */
    get tier() { return curDef ? Math.max(0, inventory.tier(curDef.id)) : 0; },
    get def() { return curDef; },

    update() {
      const dt = this.dt;
      // Swap (X / wheel): the other carried weapon is drawn; nothing swings meanwhile.
      if (this.swapPressed && this.able && !m.busy && inventory.cycle()) st.swapT = F.swapTime;
      const base = inventory.def, bt = base !== null ? inventory.tier(base.id) : 0;
      if (base !== tdBase || bt !== tdTier) { tdBase = base; tdTier = bt; tdDef = tierDef(base, bt); }       // the forge's tier (tiers.js)
      const def = tdDef;
      if (def !== curDef) { curDef = def; m.def = def; pose.def = def; m.reset(); if (def) pose.snapRest(); }
      st.swapT = Math.max(0, st.swapT - dt); this.swapT = st.swapT;
      const live = this.able && combat.dying === 0;
      // The bell in the air: a press with the air for it is the plunge's (plunge.js), not a swing.
      plunge.dt = dt; plunge.pressed = this.pressed && live && st.swapT <= 0;
      const forPlunge = live && st.swapT <= 0 && plunge.prepare(def);
      m.dt = dt; m.down = this.down && live; m.pressed = this.pressed && live && st.swapT <= 0 && !forPlunge; m.dodgePressed = this.dodgePressed; m.blocked = !live || st.swapT > 0;
      // A blow on the Wraith knocks the weapon out of a windup or a charge (not out of the cut itself).
      if (combat.blows !== lastBlows) {
        lastBlows = combat.blows;
        const p = m.phase;
        if (p === PHASE.WINDUP || p === PHASE.CHARGE || p === PHASE.LOADED) m.reset();
      }
      m.update();
      plunge.update(def);
      this.dodgeNow = m.dodgeNow;
      const night = nightOf !== null ? nightOf() : 0;
      burn.update(dt, night);
      if (def === null) { this.cutting = false; return; }
      if (m.startEvent) this.onStart();
      if (m.activeEvent) this.onActive();
      const ph = m.phase, a = m.attack;
      // The heading: the swing follows the aim through the windup and the charge, then holds.
      if ((ph === PHASE.WINDUP || ph === PHASE.CHARGE || ph === PHASE.LOADED) && !m.plunge) this.steer(dt);
      this.cutting = ph === PHASE.ACTIVE && !m.plunge;
      if (this.cutting || (plunge.falling && plunge.hNow >= def.plunge.trailFrom)) this.trailT = 0.18; else this.trailT = Math.max(0, this.trailT - dt);
      if (ph === PHASE.ACTIVE && a !== null && !m.plunge) this.cut(a);
      else if (lastPhase === PHASE.ACTIVE && a !== null) this.endCut(a);
      lastPhase = ph;
      this.bleed(dt);
      for (let i = 0; i < MAX_SHAPED; i++) if (chillT[i] > 0) chillT[i] -= dt;
      // The body: footing slows, the facing is held, the pose follows the machine.
      const busy = ph !== PHASE.IDLE;
      controller.walkMul = busy ? (a !== null && a.kneel ? 0 : ph === PHASE.WINDUP ? def.move.windup : ph === PHASE.ACTIVE ? def.move.active : ph === PHASE.RECOVER ? def.move.recover : def.move.charge) : 1;
      controller.faceLock = busy;
      if (busy) this.yaw = st.atkYaw;
      pose.m = m; pose.dt = dt; pose.time = clock.simTime;
      pose.update();
      // The cloth feels the swing: a push that rises in the cut and fades after.
      st.push += ((ph === PHASE.ACTIVE ? 1 : 0) - st.push) * (1 - Math.exp(-(ph === PHASE.ACTIVE ? 30 : 7) * dt));
    },

    /** Face the aim: the lock-on target, else the nearest Shaped in the camera's cone, else the camera. */
    steer(dt) {
      let want = this.aimYaw;
      const lk = combat.lock;
      let tx = 0, tz = 0, found = false;
      if (lk >= 0 && shaped.isLive(lk)) { const b = shaped.slots[lk].body; tx = b.sx[1]; tz = b.sz[1]; found = true; }
      else {
        let best = F.assistCone;
        for (let i = 0; i < MAX_SHAPED; i++) {
          if (!shaped.isLive(i)) continue;
          const b = shaped.slots[i].body, dx = b.sx[1] - controller.pos.x, dz = b.sz[1] - controller.pos.z, d = Math.sqrt(dx * dx + dz * dz);
          if (d > F.assistRange || d < 0.05) continue;
          let da = Math.atan2(dx, dz) - this.aimYaw; da -= Math.round(da / (Math.PI * 2)) * Math.PI * 2;
          da = Math.abs(da) + d * 0.02;
          if (da < best) { best = da; tx = b.sx[1]; tz = b.sz[1]; found = true; }
        }
      }
      if (found) want = Math.atan2(tx - controller.pos.x, tz - controller.pos.z);
      let d = want - st.atkYaw; d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
      st.atkYaw += d * (1 - Math.exp(-F.turnRate * dt));
      controller.yaw = st.atkYaw;
    },

    onStart() {
      // Start from where the Wraith already faces, then ease to the aim.
      if (m.chained === 0) st.atkYaw = controller.yaw;
      this.stats.swings++; if (m.heavy) this.stats.heavies++;
      hitMask = 0; pinMask = 0; impacted = false; brushed = false; passMark = 0; st.prevProg = 0;
    },

    onActive() {
      const a = m.attack;
      if (m.plunge) return;       // the bell has landed (plunge.js did the rest)
      hitMask = 0; pinMask = 0; impacted = false; brushed = false; passMark = 0; st.prevProg = 0;
      this.steer(0);
      controller.yaw = st.atkYaw;
      // The lunge: a step into the blow.
      if (a.hop) plunge.hop(a);       // the Bell-mace's hop-swing leaves the Wraith in the air
      if (controller.grounded && a.lunge > 0) { controller.vel.x += Math.sin(st.atkYaw) * a.lunge; controller.vel.z += Math.cos(st.atkYaw) * a.lunge; }
      if (sfx !== null) {
        sfx.x = controller.pos.x; sfx.y = controller.pos.y + 1; sfx.z = controller.pos.z;
        sfx.gain = m.heavy ? 0.9 : 0.55; sfx.tone = m.heavy ? 0 : 1; sfx.play(SFX.SWISH);
      }
    },

    /** The active frames: sweep the wedge from last frame's angle to this frame's, strike once per body per pass;
     *  a blow with a radius lands on the ground at its impact point instead. */
    cut(a) {
      const def = curDef, p = m.prog, heavy = m.heavy;
      if (!brushed && p >= 0.4) { brushed = true; this.lightBrush(a); }
      if (a.radius > 0) {
        if (!impacted && p >= a.impactAt) { impacted = true; this.impact(a); }
        st.prevProg = p;
        return;
      }
      // Spin passes (clear the hit mask at each boundary; `byAngle` makes them equal shares of the turn), a thrust's reach grows as it is driven.
      const kind = heavy ? def.heavy.kind : '', spin = kind === 'spin', passes = spin ? def.heavy.passes : 1, blades = spin ? (def.heavy.blades || 2) : 1;
      if (passes > 1) { const pass = Math.min(passes - 1, Math.floor((def.heavy.byAngle ? Math.pow(p, 1.6) : p) * passes)); if (pass !== passMark) { passMark = pass; hitMask = 0; } }
      arc.px = controller.pos.x; arc.pz = controller.pos.z; arc.yaw = st.atkYaw; arc.inner = a.inner; arc.reach = kind === 'thrust' ? a.reach * (0.55 + 0.45 * p) : a.reach;
      const tip = def.tip, tipAt = tip ? a.reach * tip.from : 1e9;
      for (let blade = 0; blade < blades; blade++) {
        pose.q = st.prevProg;
        if (blade === 0) arc.a0 = pose.angle(); else arc.a0 = pose.angle2();
        pose.q = p;
        if (blade === 0) arc.a1 = pose.angle(); else arc.a1 = pose.angle2();
        for (let i = 0; i < MAX_SHAPED; i++) {
          if ((hitMask & (1 << i)) !== 0 || !shaped.isLive(i)) continue;
          const s = shaped.slots[i], b = s.body, r = radius[s.arch], n = b.sx.length;
          for (let j = 0; j < n; j++) {
            arc.cx = b.sx[j]; arc.cz = b.sz[j]; arc.r = r;
            if (!arc.test()) continue;
            hitMask |= 1 << i;
            const dx = b.sx[j] - controller.pos.x, dz = b.sz[j] - controller.pos.z, dl = Math.sqrt(dx * dx + dz * dz) || 1;
            this.strike(i, a, dx / dl, dz / dl, arc.dist > tipAt ? tip.mul : 1);      // the glaive's tip bites harder
            break;
          }
        }
      }
      if (a.scorch) this.orbitMark(a, p);
      st.prevProg = p;
    },

    /** One connected blow on slot i (direction dx, dz): the material decides what it does. */
    strike(i, a, dx, dz, falloff) {
      const def = curDef, s = shaped.slots[i], A = ARCHETYPES[s.arch];
      const frozen = shaped.isFrozen(i), heavy = m.heavy;
      hitMat.aff = def.affinity; hitMat.heavy = heavy; hitMat.frozen = frozen; hitMat.armour = A.armour || 0; hitMat.meadow = A.material === 'meadow';
      hitMat.resolve();
      if (a.crown) { hitMat.pierce = 1; hitMat.glance = false; }       // a blow from above strikes the crown: no plate turns it (the Bell-mace's plunge)
      if (a.shatter && frozen) hitMat.shatter = true;                   // the ice star breaks what it froze
      const inf = def.infusable ? inventory.infusion(def.id) : null;
      let dmg = a.dmg * (heavy ? m.power : 1) * (def.dmgMul || 1) * (buffs !== null ? buffs.damageMul : 1) * (inf === 'stone' ? 1.1 : 1) * hitMat.dmgMul * falloff * T.damageMul;
      if (hitMat.shatter) dmg = 1e9;
      else if (hitMat.armour > 0) dmg = dmg * hitMat.pierce / hitMat.armour;     // shaped.damage multiplies the armour back in
      w.i = i; w.dmg = dmg; w.dx = dx; w.dz = dz; w.stagger = a.stagger || inf === 'stone';
      if (w.stagger && poiseBy[i] === def.id && poiseT[i] > 0) w.stagger = false; w.knock = (this.knockOv > 0 ? this.knockOv : a.pull ? -a.pull : a.knock) * (inf === 'gale' ? 1.7 : 1); w.chip = a.chip * T.impactChip * (inf === 'stone' ? 1.5 : 1);
      w.stop = a.stop * T.hitStopMul * (hitMat.glance ? 0.4 : 1); w.shake = a.shake * T.shakeMul; w.kick = a.kick * T.shakeMul;
      w.heavy = heavy; w.glance = hitMat.glance; w.sound = hitMat.shatter ? 2 : hitMat.glance ? 3 : a.sfx === 'boom' ? 4 : a.sfx === 'cut' ? 1 : 0;
      combat.weaponHit();
      if (w.stagger && s.state === S.STAGGER && s.t >= 0) { poiseBy[i] = def.id; poiseT[i] = POISE_WINDOW; }
      if (inf !== null) this.infuse(inf, i);
      flow.hit(heavy ? FLOW_EVENT.WEAPON_HEAVY : FLOW_EVENT.WEAPON_LIGHT);
      const st = this.stats; st.hits++; st.damage += w.dealt; if (hitMat.shatter) st.shatters++; if (hitMat.glance) st.glances++;
      // Cuts bleed.
      const af = def.affinity;
      if (af.bleed && !w.killed && !hitMat.glance && !frozen) { bleedT[i] = af.bleedTime; bleedDps[i] = af.bleed * (heavy ? 1.4 : 1); }
      // Fire (the flail): what it strikes catches, sedge and turf worse, and worse again at night; ice thaws, unless the flame is frost-blue.
      if (af.burn && !w.killed) {
        const night = nightOf !== null ? nightOf() : 0, cold = inf === 'frost';
        if (frozen && af.thaw && !cold) shaped.thaw(i);
        burn.ignite(i, af.burn * (A.material === 'meadow' ? af.burnMeadow : 1) * (1 + af.burnNight * night) * (heavy ? 1.25 : 1) * (cold ? 0.5 : 1), af.burnTime + (heavy ? 1 : 0));
      }
      // The pin (the glaive's thrust): held where it stands, if the blow outweighs its poise (a long draw pins a brute).
      if (a.pin && !flinging && !w.killed && !hitMat.glance && !frozen && a.dmg * (heavy ? m.power : 1) * (def.dmgMul || 1) >= (A.poise || 0)) {
        if (shaped.pin(i, a.pin)) pinMask |= 1 << i;
      }
    },

    /** The swing's active frames are over: the glaive's fling (tier 5) throws back what the thrust pinned; the flail's pyre ring (tier 5) is lit. */
    endCut(a) {
      if (a.fling && pinMask !== 0) {
        const F = a.fling, ux = Math.sin(st.atkYaw), uz = Math.cos(st.atkYaw);
        flinging = true;
        for (let i = 0; i < MAX_SHAPED; i++) {
          if ((pinMask & (1 << i)) === 0 || !shaped.isLive(i)) continue;
          shaped.unpin(i); this.knockOv = F.knock; this.strike(i, a, ux, uz, F.frac); this.knockOv = 0;
        }
        flinging = false; pinMask = 0;
      }
      if (a.pyre) {
        const px = controller.pos.x, pz = controller.pos.z;
        burn.zone(px, pz, a.pyre.radius, a.pyre.time);
        for (let c = 0; c < 24; c++) {
          const ang = (c / 24) * Math.PI * 2, sp = 2 + Math.random() * 2;
          fx.ex = px + Math.sin(ang) * a.pyre.radius * 0.9; fx.ey = controller.pos.y + 0.1; fx.ez = pz + Math.cos(ang) * a.pyre.radius * 0.9;
          fx.evx = Math.sin(ang) * sp * 0.3; fx.evz = Math.cos(ang) * sp * 0.3; fx.evy = 1.5 + sp; fx.esize = 0.05 + 0.06 * Math.random(); fx.emit();
        }
        if (sfx !== null) { sfx.x = px; sfx.y = controller.pos.y + 0.5; sfx.z = pz; sfx.gain = 0.9; sfx.play(SFX.WHOOSH); }
      }
    },

    /** The lantern in its orbit (the wheel, the whirl): the grass under its path lies singed. */
    orbitMark(a, p) {
      pose.q = p;
      const ang = st.atkYaw + pose.angle(), R = a.reach * 0.8;
      ts.bx = controller.pos.x + Math.sin(ang) * R; ts.bz = controller.pos.z + Math.cos(ang) * R; ts.bdx = Math.cos(ang); ts.bdz = -Math.sin(ang);
      ts.bl = 0.9; ts.bw = 0.45; ts.bd = 0.01; ts.bc = 0.4; ts.bk = BRUSH.FLATTEN; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0.1;
      ts.stamp();
    },

    /** An infused blow's light reaction (tier 3+, forged): frost chills (the third blow freezes), gale feeds a breath of focus. */
    infuse(inf, i) {
      if (inf === 'frost' && !w.killed) {
        if (chillT[i] <= 0) chill[i] = 0;
        chillT[i] = 3; chill[i]++;
        if (chill[i] >= 3) { chill[i] = 0; shaped.freeze(i, 1.4); }
      } else if (inf === 'gale') combat.focus = Math.min(combatTuning.focus, combat.focus + 1.5);
    },

    /** A heavy strikes the ground: damage in a disc with falloff, the terrain dented or cratered, spray and a ring of dust. */
    impact(a) {
      const R = a.radius * (m.heavy ? 1 + (m.power - 1) * 0.5 : 1);
      const ix = controller.pos.x + Math.sin(st.atkYaw) * a.impactDist, iz = controller.pos.z + Math.cos(st.atkYaw) * a.impactDist;
      ground.qx = ix; ground.qz = iz; ground.sample();
      const iy = ground.h;
      for (let i = 0; i < MAX_SHAPED; i++) {
        if (hitMask & (1 << i) || !shaped.isLive(i)) continue;
        const s = shaped.slots[i], b = s.body, r = radius[s.arch];
        let dmin = 1e9;
        for (let j = 0; j < b.sx.length; j++) { const d = Math.hypot(b.sx[j] - ix, b.sz[j] - iz); if (d < dmin) dmin = d; }
        if (dmin - r > R) continue;
        hitMask |= 1 << i;
        const dx = b.sx[1] - ix, dz = b.sz[1] - iz, dl = Math.hypot(dx, dz);
        const fx0 = dl > 0.2 ? dx / dl : Math.sin(st.atkYaw), fz0 = dl > 0.2 ? dz / dl : Math.cos(st.atkYaw);
        this.strike(i, a, fx0, fz0, 1 - 0.35 * Math.min(1, Math.max(0, dmin - r) / R));
      }
      // Forged arts: the staff's shock lane down the heading; the maul's ring past the crater.
      if (a.shock) this.lane(a, ix, iz);
      if (a.ring) this.ring(a, ix, iz);
      // The ground: a dent (staff), a crater with its cracks (maul).
      const big = a.brush === 'crater', k = m.heavy ? 1 + (m.power - 1) * 0.6 : 1;
      ts.bx = ix; ts.bz = iz; ts.bdx = Math.sin(st.atkYaw); ts.bdz = Math.cos(st.atkYaw); ts.bl = 0; ts.bw = (big ? 1.5 : 0.85) * k; ts.bd = (big ? 0.5 : 0.2) * k; ts.bc = 0.7;
      ts.bk = BRUSH.PLOUGH; ts.bwet = 0; ts.bbias = 0; ts.bberm = big ? 1 : 0.7;
      ts.stamp();
      const cracks = big ? 5 : 3;
      for (let c = 0; c < cracks; c++) {
        const ang = st.atkYaw + (c / cracks) * Math.PI * 2 + 0.4, len = (big ? 1.6 : 0.8) * k;
        ts.bx = ix + Math.sin(ang) * len * 0.9; ts.bz = iz + Math.cos(ang) * len * 0.9; ts.bdx = Math.sin(ang); ts.bdz = Math.cos(ang);
        ts.bl = len; ts.bw = 0.07; ts.bd = big ? 0.14 : 0.07; ts.bc = 0.3; ts.bk = BRUSH.SCORE; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0;
        ts.stamp();
      }
      // Spray: a ring of the ground thrown up.
      const n = big ? 34 : 18;
      for (let c = 0; c < n; c++) {
        const ang = (c / n) * Math.PI * 2 + Math.random(), sp = (big ? 2.2 : 1.4) * (0.5 + Math.random());
        fx.ex = ix + Math.sin(ang) * 0.3; fx.ey = iy + 0.05; fx.ez = iz + Math.cos(ang) * 0.3;
        fx.evx = Math.sin(ang) * sp; fx.evz = Math.cos(ang) * sp; fx.evy = 1.2 + Math.random() * (big ? 3.4 : 2.2); fx.esize = 0.05 + 0.08 * Math.random();
        fx.emit();
      }
      combat.pendShake += a.shake * T.shakeMul; combat.pendKick += a.kick * T.shakeMul;
      clock.hitStop = Math.max(clock.hitStop, a.stop * T.hitStopMul * (w.i >= 0 && hitMask !== 0 ? 1 : 0.6));
      if (sfx !== null) {
        sfx.x = ix; sfx.y = iy; sfx.z = iz; sfx.gain = big ? 1.3 : 1;
        sfx.play(big ? SFX.BOOM : SFX.THUD); if (big) sfx.play(SFX.CRUNCH);
      }
    },

    /** The Plant (staff, tier 5): the slam's shock runs `len` m on down the heading from the impact; each Shaped within `hw` of the line takes `frac` of a blow. */
    lane(a, ix, iz) {
      const L = a.shock, ux = Math.sin(st.atkYaw), uz = Math.cos(st.atkYaw);
      for (let i = 0; i < MAX_SHAPED; i++) {
        if (hitMask & (1 << i) || !shaped.isLive(i)) continue;
        const s = shaped.slots[i], b = s.body, r = radius[s.arch];
        const ex = b.sx[1] - ix, ez = b.sz[1] - iz, along = ex * ux + ez * uz;
        if (along < 0 || along > L.len || Math.abs(-ex * uz + ez * ux) > L.hw + r) continue;
        hitMask |= 1 << i;
        this.strike(i, a, ux, uz, L.frac);
      }
    },
    /** Groundbreaker (maul, tier 5): everything within `radius` of the impact that the crater missed is thrown back by `frac` of a blow. */
    ring(a, ix, iz) {
      const R = a.ring;
      for (let i = 0; i < MAX_SHAPED; i++) {
        if (hitMask & (1 << i) || !shaped.isLive(i)) continue;
        const s = shaped.slots[i], b = s.body;
        const dx = b.sx[1] - ix, dz = b.sz[1] - iz, dl = Math.hypot(dx, dz);
        if (dl - radius[s.arch] > R.radius) continue;
        hitMask |= 1 << i;
        this.knockOv = R.knock;
        this.strike(i, a, dl > 0.2 ? dx / dl : Math.sin(st.atkYaw), dl > 0.2 ? dz / dl : Math.cos(st.atkYaw), R.frac);
        this.knockOv = 0;
      }
    },

    /** A light swing's brush on the ground: the staff's drag across the snow, the sickle laying the grass. */
    lightBrush(a) {
      const dist = a.reach * 0.55, cx = controller.pos.x + Math.sin(st.atkYaw) * dist, cz = controller.pos.z + Math.cos(st.atkYaw) * dist;
      if (a.brush === 'score') {
        // The tip trails across the snow: a short groove square to the heading.
        const px = Math.cos(st.atkYaw), pz = -Math.sin(st.atkYaw);
        ts.bx = cx; ts.bz = cz; ts.bdx = px; ts.bdz = pz; ts.bl = 0.8; ts.bw = 0.06; ts.bd = 0.04; ts.bc = 0.4; ts.bk = BRUSH.SCORE; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0.3;
        ts.stamp();
      } else if (a.brush === 'cut' || a.brush === 'scorch') {
        ts.bx = cx; ts.bz = cz; ts.bdx = Math.sin(st.atkYaw); ts.bdz = Math.cos(st.atkYaw); ts.bl = 0.6; ts.bw = 0.9; ts.bd = 0.01; ts.bc = 0.3; ts.bk = BRUSH.FLATTEN; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0.2;
        ts.stamp();
      }
    },

    /** Bleeding: a tick of damage each bleedTick, quiet (a trickle of spray). */
    bleed(dt) {
      for (let i = 0; i < MAX_SHAPED; i++) {
        if (poiseT[i] > 0) { const sl = shaped.slots[i]; if (sl.state === S.STAGGER && sl.t >= 0) poiseT[i] = POISE_WINDOW; else poiseT[i] -= dt; }
        if (bleedT[i] <= 0) continue;
        if (!shaped.isLive(i)) { bleedT[i] = 0; continue; }
        const before = bleedT[i];
        bleedT[i] -= dt;
        // Ticks fall on multiples of bleedTick in the remaining time.
        if (Math.floor(before / T.bleedTick) !== Math.floor(Math.max(0, bleedT[i]) / T.bleedTick)) {
          w.i = i; w.dmg = bleedDps[i] * T.bleedTick; w.dx = 0; w.dz = 0; w.stagger = false; w.knock = 0; w.chip = 2; w.stop = 0; w.shake = 0; w.kick = 0;
          w.heavy = false; w.glance = false; w.sound = -1;
          combat.weaponHit();
        }
      }
    },

    /** The wraith-facing numbers for this frame's pose push (0..1 of the swing's strength) and the swing's lateral sign. */
    get push() { return st.push; },
    get heading() { return st.atkYaw; },
    /** Clear everything (death, a load). */
    reset() { m.reset(); plunge.reset(); burn.reset(); pinMask = 0; bleedT.fill(0); poiseT.fill(0); chill.fill(0); chillT.fill(0); st.swapT = 0; st.push = 0; },
  };
  return self;
}
