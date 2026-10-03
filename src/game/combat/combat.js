// Combat (BRIEF §10): health and focus, verbs hitting the Shaped, reactions, hit-stop, lock-on,
// the bend-step dodge's groove, damage to the Wraith and its death. No HUD: everything reads on
// the body and in the world — focus is the hand-light, health is the cowl light and the frost
// creeping up the robe (BRIEF §12). Allocation-free per frame.

import { MAX_SHAPED } from '../shaped/shaped.js';
import { BRUSH } from '../../shaders/terrainState.wgsl.js';

export const combatTuning = {
  health: 100, focus: 100,
  focusIdle: 6, focusMove: 14, focusSurf: 28,   // per second: movement and flow restore focus
  costSweep: 14, costRibbon: 16, costCrystal: 30, costDodge: 8,   // focus
  sweepDamage: 16, ribbonDps: 26, shatterMul: 3, freezeTime: 3,
  hitStopHit: 0.035, hitStopShatter: 0.07, hitStopHurt: 0.05,
  lockRange: 20,
  deathTime: 2.4, reformTime: 1.6,
};

/**
 * @param {{ shaped: any, frost: any, controller: any, ts: any, clock: any, teleport: (x: number, z: number) => void }} ctx
 */
export function createCombat(ctx) {
  const { shaped, frost, controller, ts, clock, teleport } = ctx;
  const warden = ctx.warden || null;
  const T = combatTuning;
  const sweepSeen = new Uint32Array(4 * MAX_SHAPED);   // last sweep id that hit each slot, per sweep slot
  const self = {
    health: T.health, focus: T.focus,
    /** 0..1 eased "low health" for the robe frost, cowl gutter and vignette. */
    wound: 0.5 - 0.5,
    /** Locked Shaped slot or −1. */
    lock: -1,
    /** Death: 0 alive; >0 seconds into the collapse/re-form sequence. */
    dying: 0.5 - 0.5,
    /** Respawn point (the last shrine). */
    shrineX: 0.5, shrineZ: 0.5,
    /** Camera shake impulse requested this frame (owner adds it to the arm). */
    shake: 0.5 - 0.5,
    /** Inputs (fields) for one frame. */
    dt: 0.5, wantLockToggle: false,

    /** Can the Wraith afford a verb? Spends the focus if so. */
    spend(cost) { if (this.focus < cost || this.dying > 0) return false; this.focus -= cost; return true; },

    update() {
      const dt = this.dt;
      this.shake = 0;
      if (this.dying > 0) { stepDeath(dt); return; }
      // Focus: restored by movement and flow, spent by the verbs.
      const sp = Math.hypot(controller.vel.x, controller.vel.z);
      const regen = controller.surf.active ? T.focusSurf : sp > 2 ? T.focusMove : T.focusIdle;
      this.focus = Math.min(T.focus, this.focus + regen * dt);
      if (frost.ribbonStrength > 0.3) this.focus = Math.max(0, this.focus - T.costRibbon * dt);
      this.wound += ((1 - this.health / T.health) - this.wound) * (1 - Math.exp(-dt * 3));
      hits(dt);
      if (warden && warden.active) wardenHits();
      hurt();
      lockOn();
      // The bend-step slides through the snow: a short groove.
      if (controller.dodgeT > 0) {
        ts.bx = controller.pos.x; ts.bz = controller.pos.z; ts.bdx = controller.dodgeX; ts.bdz = controller.dodgeZ;
        ts.bl = 0.2; ts.bw = 0.3; ts.bd = 0.08; ts.bc = 0.6; ts.bk = BRUSH.PLOUGH; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0.9;
        ts.stamp();
      }
    },
  };

  /** Verbs → Shaped: Sweep's crescent, the Ribbon's stream, Crystallize's formation. */
  function hits(dt) {
    for (let i = 0; i < MAX_SHAPED; i++) {
      if (!shaped.isLive(i)) continue;
      const s = shaped.slots[i], b = s.body;
      const cx = b.sx[1], cz = b.sz[1];
      // Sweep: the crescent's front passing over the body (once per sweep).
      for (let k = 0; k < 4; k++) {
        if (!frost.sweepActive[k] || frost.sweepHW[k] <= 0.05) continue;
        if (sweepSeen[k * MAX_SHAPED + i] === frost.sweepId[k]) continue;
        const ex = cx - frost.sweepFX[k], ez = cz - frost.sweepFZ[k];
        const along = ex * frost.sweepDX[k] + ez * frost.sweepDZ[k];
        const across = Math.abs(-ex * frost.sweepDZ[k] + ez * frost.sweepDX[k]);
        if (along < 0.8 && along > -1.2 && across < frost.sweepHW[k] + 0.4) {
          sweepSeen[k * MAX_SHAPED + i] = frost.sweepId[k];
          strike(i, T.sweepDamage, frost.sweepDX[k], frost.sweepDZ[k], true);
        }
      }
      // Ribbon: any live node of the stream through the body cuts it (and soaks it).
      if (frost.ribbonStrength > 0.2) {
        const n = frost.ribbonNodes;
        let touch = false;
        for (let k = 0; k < n.length; k += 4) {
          if (n[k + 3] <= 0.05) continue;
          const dx = n[k] - cx, dy = n[k + 1] - b.sy[1], dz = n[k + 2] - cz;
          if (dx * dx + dy * dy + dz * dz < 0.5) { touch = true; break; }
        }
        if (touch) {
          s.wet = 2.5;
          const ux = cx - controller.pos.x, uz = cz - controller.pos.z, ul = Math.hypot(ux, uz) || 1;
          strike(i, T.ribbonDps * dt, ux / ul, uz / ul, false);
          if (!shaped.isLive(i)) continue;
        }
      }
      // Crystallize: the formation freezes what it catches.
      if (frost.crystalEvent) {
        const dx = cx - frost.crystalX, dz = cz - frost.crystalZ;
        if (dx * dx + dz * dz < 2.8 * 2.8) shaped.freeze(i, T.freezeTime);
      }
    }
  }

  /** Verbs → the Warden's knee joints: Crystallize freezes a joint near the formation; a Sweep
   *  crescent through a frozen joint shatters it (the back joints are reached by climbing). */
  const wardenSweepSeen = new Uint32Array(4 * 2);
  function wardenHits() {
    for (let k = 0; k < 2; k++) {
      if (warden.joint[k] === 2) continue;
      const jx = warden.jx[k], jz = warden.jz[k];
      if (frost.crystalEvent && Math.hypot(frost.crystalX - jx, frost.crystalZ - jz) < 5) warden.freezeJoint(k);
      for (let q = 0; q < 4; q++) {
        if (!frost.sweepActive[q] || frost.sweepHW[q] <= 0.05 || wardenSweepSeen[q * 2 + k] === frost.sweepId[q]) continue;
        const ex = jx - frost.sweepFX[q], ez = jz - frost.sweepFZ[q];
        const along = ex * frost.sweepDX[q] + ez * frost.sweepDZ[q], across = Math.abs(-ex * frost.sweepDZ[q] + ez * frost.sweepDX[q]);
        if (along < 1.5 && along > -2 && across < frost.sweepHW[q] + 1.6) {
          wardenSweepSeen[q * 2 + k] = frost.sweepId[q];
          if (warden.strikeJoint(k)) breakJoint();
        }
      }
    }
  }
  /** A joint shatters: the heaviest impact in the game so far. */
  function breakJoint() {
    clock.hitStop = Math.max(clock.hitStop, 0.13);
    self.shake += 0.05;
  }
  self.breakJoint = breakJoint;

  /** A hit on slot i: frozen Shaped shatter (the reaction), others take damage and stagger. */
  function strike(i, dmg, dx, dz, heavy) {
    const frozen = shaped.isFrozen(i);
    const amount = frozen ? dmg * T.shatterMul : dmg;
    shaped.chip(i, dx, dz, frozen ? 40 : heavy ? 18 : 2);
    shaped.damage(i, amount, heavy, dx * 3, dz * 3);
    if (frozen) { clock.hitStop = Math.max(clock.hitStop, T.hitStopShatter); self.shake += 0.012; }
    else if (heavy) { clock.hitStop = Math.max(clock.hitStop, T.hitStopHit); self.shake += 0.004; }
  }

  /** Shaped → the Wraith: lunges land unless the Wraith is mid bend-step. */
  function hurt() {
    if (shaped.slams > 0) self.shake += 0.02 * Math.max(0, 1 - shaped.slamDist / 16);
    const wh = warden && warden.active ? warden.hits : 0;
    if (shaped.hits === 0 && wh === 0) return;
    if (controller.dodgeT > 0) return;               // the bend-step slips through
    self.health -= shaped.hitDamage + (wh ? warden.hitDamage : 0);
    clock.hitStop = Math.max(clock.hitStop, T.hitStopHurt);
    self.shake += 0.015;
    if (self.health <= 0) { self.health = 0; self.dying = 1e-4; self.lock = -1; }
  }

  /** Soft lock-on: toggle to the nearest live Shaped in front; drops when it dies or strays. */
  function lockOn() {
    if (self.wantLockToggle) {
      self.wantLockToggle = false;
      if (self.lock >= 0) self.lock = -1;
      else {
        let best = -1, bestD = T.lockRange;
        for (let i = 0; i < MAX_SHAPED; i++) {
          if (!shaped.isLive(i)) continue;
          const b = shaped.slots[i].body;
          const d = Math.hypot(b.x - controller.pos.x, b.z - controller.pos.z);
          if (d < bestD) { bestD = d; best = i; }
        }
        self.lock = best;
      }
    }
    if (self.lock >= 0) {
      const b = shaped.slots[self.lock].body;
      if (!shaped.isLive(self.lock) || Math.hypot(b.x - controller.pos.x, b.z - controller.pos.z) > T.lockRange * 1.3) self.lock = -1;
    }
  }

  /** Death: the light gutters, the robe collapses; the Wraith re-forms at the shrine. */
  function stepDeath(dt) {
    self.dying += dt;
    controller.hold = true;
    // At the shrine: the deferred teleport waits for the ground there to stream in.
    if (self.dying >= T.deathTime && self.dying - dt < T.deathTime) teleport(self.shrineX, self.shrineZ);
    if (self.dying >= T.deathTime + T.reformTime) {
      self.dying = 0; controller.hold = false;
      self.health = T.health; self.focus = T.focus * 0.5; self.wound = 0;
    }
  }

  return self;
}
