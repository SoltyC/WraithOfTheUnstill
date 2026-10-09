// Combat (BRIEF §10): health and focus, verbs hitting the Shaped, reactions, hit-stop, lock-on,
// the bend-step dodge's groove, damage to the Wraith and its death. No HUD: everything reads on
// the body and in the world — focus is the hand-light, health is the cowl light and the frost
// creeping up the robe (BRIEF §12). Allocation-free per frame.

import { MAX_SHAPED } from '../shaped/shaped.js';
import { BRUSH } from '../../shaders/terrainState.wgsl.js';
import { SFX } from '../../audio/sfx.js';

export const combatTuning = {
  health: 100, focus: 100,
  focusIdle: 6, focusMove: 14, focusSurf: 28,   // per second: movement and flow restore focus
  costSweep: 14, costRibbon: 16, costCrystal: 30, costDodge: 8,   // focus
  sweepDamage: 16, ribbonDps: 26, shatterMul: 3, freezeTime: 3,
  hitStopHit: 0.055, hitStopLight: 0.02, hitStopShatter: 0.12, hitStopHurt: 0.06,
  kickHit: 0.02, kickShatter: 0.06,      // camera punch (rad of FOV)
  lockRange: 20,
  wardenSweepChip: 2.5, wardenRibbonChip: 0.6,   // the Warden's health per Sweep through it / per Ribbon tick (5 a second)
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
  /** Seconds until the Ribbon may strike each slot again (it strikes in ticks, not per frame: a
   *  per-frame strike on a frozen Shaped re-armed the shatter hit-stop every frame, and with the
   *  clock stopped the stream did no damage — the game froze while the camera punch piled up). */
  const ribbonCd = new Float64Array(MAX_SHAPED);
  const RIBBON_TICK = 0.18;
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
    /** Camera shake and punch (FOV kick) requested this frame (owner adds them to the arm). */
    shake: 0.5 - 0.5, kick: 0.5 - 0.5,
    /** Sound (audio/sfx.js), set by the owner; null = silent. */
    sfx: null,
    /** Inputs (fields) for one frame. */
    dt: 0.5, wantLockToggle: false,

    /** Can the Wraith afford a verb? Spends the focus if so. */
    spend(cost) { if (this.focus < cost || this.dying > 0) return false; this.focus -= cost; return true; },

    update() {
      const dt = this.dt;
      this.shake = 0; this.kick = 0;
      if (this.dying > 0) { stepDeath(dt); return; }
      // Focus: restored by movement and flow, spent by the verbs.
      const sp = Math.hypot(controller.vel.x, controller.vel.z);
      const regen = controller.surf.active ? T.focusSurf : sp > 2 ? T.focusMove : T.focusIdle;
      this.focus = Math.min(T.focus, this.focus + regen * dt);
      if (frost.ribbonStrength > 0.3) this.focus = Math.max(0, this.focus - T.costRibbon * dt);
      this.wound += ((1 - this.health / T.health) - this.wound) * (1 - Math.exp(-dt * 3));
      ribbonTick -= dt; bodyTick -= dt;
      hits(dt);
      if (warden && warden.active) { wardenHits(); wardenBody(); }
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
        ribbonCd[i] = Math.max(0, ribbonCd[i] - dt);
        if (touch) {
          s.wet = 2.5;
          if (ribbonCd[i] <= 0) {
            ribbonCd[i] = RIBBON_TICK;
            const ux = cx - controller.pos.x, uz = cz - controller.pos.z, ul = Math.hypot(ux, uz) || 1;
            strike(i, T.ribbonDps * RIBBON_TICK, ux / ul, uz / ul, false);
            if (!shaped.isLive(i)) continue;
          }
        }
      }
      // Crystallize: the formation freezes what it catches.
      if (frost.crystalEvent) {
        const dx = cx - frost.crystalX, dz = cz - frost.crystalZ;
        if (dx * dx + dz * dz < 2.8 * 2.8) shaped.freeze(i, T.freezeTime);
      }
    }
  }

  /** Verbs → the Warden's joints: Crystallize freezes a joint near the formation; a Sweep through a
   *  liquid joint chills it, through a frozen one shatters it. The knees are always in reach; the
   *  shoulder and hip seams open as it sags (warden.exposed); climbing reaches the rest. */
  const wardenSweepSeen = new Uint32Array(4 * 4);
  function wardenHits() {
    for (let k = 0; k < 4; k++) {
      if (warden.joint[k] === 2 || !warden.exposed(k)) continue;
      const jx = warden.jx[k], jz = warden.jz[k];
      if (frost.crystalEvent && Math.hypot(frost.crystalX - jx, frost.crystalZ - jz) < 9) warden.freezeJoint(k);
      for (let q = 0; q < 4; q++) {
        if (!frost.sweepActive[q] || frost.sweepHW[q] <= 0.05 || wardenSweepSeen[q * 4 + k] === frost.sweepId[q]) continue;
        const ex = jx - frost.sweepFX[q], ez = jz - frost.sweepFZ[q];
        const along = ex * frost.sweepDX[q] + ez * frost.sweepDZ[q], across = Math.abs(-ex * frost.sweepDZ[q] + ez * frost.sweepDX[q]);
        if (along < 2.4 && along > -2.8 && across < frost.sweepHW[q] + 2.4) {
          wardenSweepSeen[q * 4 + k] = frost.sweepId[q];
          if (warden.joint[k] === 0) warden.freezeJoint(k);        // a cold crescent chills the water: a second one breaks it
          else if (warden.strikeJoint(k)) breakJoint();
        }
      }
    }
  }
  /** Verbs → the Warden's body (not a joint): material chips off where it is struck, it
   *  flinches and turns on the Wraith. A Sweep crescent through a leg or under the body, the
   *  Ribbon's stream into it, a formation at its feet. */
  const wardenBodySeen = new Uint32Array(4);
  let bodyTick = 0;
  function wardenBody() {
    if (warden.state === 4 || warden.state === 5) return;
    const b = warden.body, legs = b.shape.legs.length;
    for (let q = 0; q < 4; q++) {
      if (!frost.sweepActive[q] || frost.sweepHW[q] <= 0.05 || wardenBodySeen[q] === frost.sweepId[q]) continue;
      for (let l = 0; l < legs; l++) {
        const ex = b.kx[l] - frost.sweepFX[q], ez = b.kz[l] - frost.sweepFZ[q];
        const along = ex * frost.sweepDX[q] + ez * frost.sweepDZ[q], across = Math.abs(-ex * frost.sweepDZ[q] + ez * frost.sweepDX[q]);
        if (along < 2 && along > -2.5 && across < frost.sweepHW[q] + 2) {
          wardenBodySeen[q] = frost.sweepId[q];
          warden.hx = b.kx[l]; warden.hy = b.ky[l]; warden.hz = b.kz[l]; warden.hdx = -frost.sweepDX[q]; warden.hdz = -frost.sweepDZ[q];
          warden.chip = T.wardenSweepChip; warden.bodyHit(); self.shake += 0.006; self.kick += T.kickHit * 0.6;
          if (self.sfx) { const sx = self.sfx; sx.x = b.kx[l]; sx.y = b.ky[l]; sx.z = b.kz[l]; sx.gain = 1.3; sx.play(SFX.THUD); sx.play(SFX.CRUNCH); }
          clock.hitStop = Math.max(clock.hitStop, T.hitStopHit * 0.7);
          break;
        }
      }
    }
    if (frost.ribbonStrength > 0.2 && bodyTick <= 0) {
      const n = frost.ribbonNodes;
      for (let k = 0; k < n.length; k += 4) {
        if (n[k + 3] <= 0.05) continue;
        warden.qx = n[k]; warden.qy = n[k + 1]; warden.qz = n[k + 2];
        if (warden.probe()) {
          const ux = n[k] - controller.pos.x, uz = n[k + 2] - controller.pos.z, ul = Math.hypot(ux, uz) || 1;
          warden.hx = n[k]; warden.hy = n[k + 1]; warden.hz = n[k + 2]; warden.hdx = -ux / ul; warden.hdz = -uz / ul;
          warden.chip = T.wardenRibbonChip; warden.bodyHit(); bodyTick = 0.2; self.kick += T.kickHit * 0.25;
          break;
        }
      }
    }
  }

  /** A joint shatters: the heaviest impact in the game so far. */
  function breakJoint() {
    clock.hitStop = Math.max(clock.hitStop, 0.16);
    self.shake += 0.06; self.kick += 0.09;
    if (self.sfx) { const sx = self.sfx; sx.x = controller.pos.x; sx.y = controller.pos.y + 2; sx.z = controller.pos.z; sx.gain = 1.4; sx.play(SFX.SHATTER); sx.play(SFX.BOOM); }
  }
  self.breakJoint = breakJoint;

  let ribbonTick = 0;
  /** A hit on slot i: frozen Shaped shatter (the reaction), others take damage and stagger. */
  function strike(i, dmg, dx, dz, heavy) {
    const frozen = shaped.isFrozen(i);
    const amount = frozen ? dmg * T.shatterMul : dmg;
    const b = shaped.slots[i].body, bx = b.sx[1], by = b.sy[1], bz = b.sz[1];
    shaped.chip(i, dx, dz, frozen && heavy ? 40 : heavy ? 24 : frozen ? 10 : 3);
    const killed = shaped.damage(i, amount, true, dx * 3, dz * 3);
    const sx = self.sfx, big = frozen && (heavy || killed);
    if (sx && (big || heavy || ribbonTick <= 0)) {
      sx.x = bx; sx.y = by; sx.z = bz; sx.gain = big ? 1.2 : heavy ? 1 : 0.5;
      sx.play(big ? SFX.SHATTER : heavy ? SFX.THUD : SFX.CRUNCH);
    }
    // The big shatter stop for a heavy blow or the blow that breaks it; a Ribbon tick on the ice is a light one.
    if (frozen && (heavy || killed)) { clock.hitStop = Math.max(clock.hitStop, T.hitStopShatter); self.shake += 0.02; self.kick += T.kickShatter; }
    else if (frozen) { clock.hitStop = Math.max(clock.hitStop, T.hitStopLight); self.kick += T.kickHit * 0.3; }
    else if (heavy) { clock.hitStop = Math.max(clock.hitStop, T.hitStopHit); self.shake += 0.008; self.kick += T.kickHit; }
    else if (ribbonTick <= 0) { clock.hitStop = Math.max(clock.hitStop, T.hitStopLight); ribbonTick = 0.18; self.kick += T.kickHit * 0.3; }
  }

  /** Shaped → the Wraith: lunges land unless the Wraith is mid bend-step. */
  function hurt() {
    if (shaped.slams > 0) self.shake += 0.02 * Math.max(0, 1 - shaped.slamDist / 16);
    const wh = warden && warden.active ? warden.hits : 0;
    if (shaped.hits === 0 && wh === 0) return;
    if (controller.dodgeT > 0) return;               // the bend-step slips through
    self.health -= shaped.hitDamage * self.shapedDamageMul + (wh ? warden.hitDamage : 0);
    if (self.sfx) { const sx = self.sfx; sx.x = controller.pos.x; sx.y = controller.pos.y + 1; sx.z = controller.pos.z; sx.gain = 1.1; sx.play(SFX.THUD); }
    clock.hitStop = Math.max(clock.hitStop, T.hitStopHurt);
    self.shake += 0.015;
    if (self.health <= 0) { self.health = 0; self.dying = 1e-4; self.lock = -1; }
  }

  /** The worn robe's modest guard against the Shaped's blows (game/robes.js; 1 = none). */
  self.shapedDamageMul = 1;
  /** Damage that no bend-step slips (the Warden's spikes): a blow, and death at nothing left. */
  self.hurtRaw = (amount) => {
    if (self.dying > 0 || amount <= 0) return;
    self.health -= amount;
    if (self.sfx) { const sx = self.sfx; sx.x = controller.pos.x; sx.y = controller.pos.y + 1; sx.z = controller.pos.z; sx.gain = 1.1; sx.play(SFX.THUD); }
    clock.hitStop = Math.max(clock.hitStop, T.hitStopHurt);
    self.shake += 0.02;
    if (self.health <= 0) { self.health = 0; self.dying = 1e-4; self.lock = -1; }
  };

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
