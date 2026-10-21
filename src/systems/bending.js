// Bending in play (BRIEF §9): the element in hand (1–5, game/elements.js) takes a tap of Primary,
// a hold, and Heavy — Frost: Sweep, Ribbon, Crystallize; Gale: Gust, Vortex, Updraft. The aim
// point; the speed streaks; and the photo spots' scripted bending sequence.

import { ELEMENTS, ELEMENT_NAMES } from '../game/elements.js';

/** @param {any} g  shared boot context */
export function addBendingSystem(g) {
  const { loop, game, input, Action, frost, frostMod, gale, elements, ribbon, crystals, streaks, controller, arm, combat, combatTuning, sfx, SFX, clock, ground, camera, shaped, wraithView, castFlash, capture } = g;
  let primaryHeld = 0;
  const HOLD = 0.22; // s: a shorter press is a tap (Sweep), a longer one holds the Ribbon
  /** Aim: where the camera's view ray meets the ground, kept within the verbs' range. → aim.x/y/z */
  const aim = { x: 0.5, y: 0.5, z: 0.5 };
  function updateAim() {
    if (combat.lock >= 0) {
      const b = shaped.slots[combat.lock].body;
      aim.x = b.sx[1]; aim.z = b.sz[1]; ground.qx = aim.x; ground.qz = aim.z; ground.sample(); aim.y = ground.h;
      return;
    }
    const cp = camera.position, cy = Math.cos(arm.pitch), dx = Math.sin(arm.yaw) * cy, dy = -Math.sin(arm.pitch), dz = Math.cos(arm.yaw) * cy;
    let t = 0, hit = false;
    for (let k = 1; k <= 80 && !hit; k++) {
      t = k * 0.6;
      ground.qx = cp.x + dx * t; ground.qz = cp.z + dz * t; ground.sample();
      if (cp.y + dy * t <= ground.h) hit = true;
    }
    let ax = cp.x + dx * t - controller.pos.x, az = cp.z + dz * t - controller.pos.z;
    const d = Math.sqrt(ax * ax + az * az) || 1, T = frostMod.ribbonTuning;
    const c = Math.min(T.maxRange, Math.max(T.minRange, hit ? d : T.maxRange));
    ax = ax / d * c; az = az / d * c;
    aim.x = controller.pos.x + ax; aim.z = controller.pos.z + az;
    ground.qx = aim.x; ground.qz = aim.z; ground.sample(); aim.y = ground.h;
  }
  /** The Gale after the frost verbs (it takes the light slots they left); the Updraft's rising
   *  air lifts the Wraith (the controller reads it next step). */
  function stepGale(dt, time) {
    gale.x = controller.pos.x; gale.y = controller.pos.y; gale.z = controller.pos.z;
    gale.aimX = Math.sin(arm.yaw); gale.aimZ = Math.cos(arm.yaw);
    gale.tx = aim.x; gale.ty = aim.y; gale.tz = aim.z;
    gale.dt = dt; gale.time = time; gale.lightBase = frost.lightsUsed;
    gale.update();
    controller.lift = gale.liftAt(controller.pos.x, controller.pos.y, controller.pos.z);
    pushGaleFx(time);
  }
  /** The Gale's visuals (render/galeFx.js): its block, the time, the wind, and how much meadow lies
   *  under the caster (grass and petals for debris there, snow elsewhere). */
  function pushGaleFx(time) {
    const gf = g.galeFx; if (!gf) return;
    gf.gale.set(gale.fx);
    const A = g.streamer.biomeA, wb = g.wind.block;
    let meadow = 0;
    if (A) {
      const i = Math.min(1023, Math.max(0, Math.floor((controller.pos.x + 4096) / 8))), j = Math.min(1023, Math.max(0, Math.floor((4096 - controller.pos.z) / 8)));
      const o = (j * 1024 + i) * 4; meadow = A[o + 1] / Math.max(A[o] + A[o + 1] + A[o + 2] + A[o + 3], 1);
    }
    gf.galeT.x = time; gf.galeT.y = wb[0]; gf.galeT.z = wb[1]; gf.galeT.w = meadow;
    gf.update();
  }
  /** Photo spots with a scripted bending sequence (`bend`): Sweep ahead, a Ribbon figure-eight,
   *  a Crystallize formation, then settle — 4 substeps per frame (the frozen capture clock). */
  const bendRoll = { active: false, t: 0, spec: null };
  function stepBendRoll() {
    const spec = bendRoll.spec, p = controller.pos, w = wraithView.wraith, dt = 1 / 60;
    const f = controller.yaw, fx = Math.sin(f), fz = Math.cos(f), rx = fz, rz = -fx;
    const galeRoll = spec.element === 'gale';
    for (let k = 0; k < 4 && bendRoll.t < spec.seconds; k++) {
      const t = bendRoll.t;
      if (galeRoll) {
        // Gale: a Gust off to the right, a Vortex held ahead-left (drifting), an Updraft ahead.
        gale.castGust = t === 0;
        gale.vortexHeld = t > 0.5 && t < 2.4;
        const a = (t - 0.5) * 1.2;
        gale.tx = p.x + fx * (8 + Math.sin(a)) - rx * (3.5 + Math.cos(a)); gale.tz = p.z + fz * (8 + Math.sin(a)) - rz * (3.5 + Math.cos(a));
        if (Math.abs(t - 2.9) < dt * 0.5) { gale.tx = p.x + fx * 9 + rx * 3.5; gale.tz = p.z + fz * 9 + rz * 3.5; gale.castUpdraft = true; }
        ground.qx = gale.tx; ground.qz = gale.tz; ground.sample(); gale.ty = ground.h;
        w.bx = p.x; w.by = p.y; w.bz = p.z; w.vx = 0; w.vz = 0; w.yaw = f; w.grounded = true; w.dt = dt;
        w.time = clock.simTime - (spec.seconds - t); wraithView.time = w.time;
        w.cast = (gale.gesture > 0 || gale.vortexStrength > 0.05) ? 1 : 0;
        wraithView.update();
        const sa = f + 0.12; // the Gust nearly straight ahead, across the frame
        gale.x = p.x; gale.y = p.y; gale.z = p.z; gale.aimX = Math.sin(sa); gale.aimZ = Math.cos(sa);
        gale.dt = dt; gale.time = w.time; gale.lightBase = 0;
        gale.update();
        pushGaleFx(w.time);
        bendRoll.t += dt;
        continue;
      }
      frost.castSweep = t === 0;
      frost.ribbonHeld = t > 0.5 && t < 2.6;
      // Each verb gets its own ground: Sweep angled right, the Ribbon's figure-eight ahead-left,
      // the crystals further out on the left.
      const a = (t - 0.5) * 2.4;
      const ahead = 7.5 + 2.2 * Math.sin(a), side = -3 + 2.2 * Math.sin(a) * Math.cos(a);
      frost.tx = p.x + fx * ahead + rx * side; frost.tz = p.z + fz * ahead + rz * side;
      if (Math.abs(t - 2.9) < dt * 0.5) { frost.tx = p.x + fx * 9 - rx * 8.5; frost.tz = p.z + fz * 9 - rz * 8.5; frost.castCrystal = true; }
      ground.qx = frost.tx; ground.qz = frost.tz; ground.sample(); frost.ty = ground.h;
      w.bx = p.x; w.by = p.y; w.bz = p.z; w.vx = 0; w.vz = 0; w.yaw = f; w.grounded = true; w.dt = dt;
      w.time = clock.simTime - (spec.seconds - t); wraithView.time = w.time;
      w.cast = (frost.gesture > 0 || frost.ribbonStrength > 0.05) ? 1 : 0;
      wraithView.update();
      const b = w.body;
      frost.hx = b.ha[3]; frost.hy = b.ha[4]; frost.hz = b.ha[5];
      const sa = f + 0.5; // Sweep heads off to the right
      frost.x = p.x; frost.y = p.y; frost.z = p.z; frost.aimX = Math.sin(sa); frost.aimZ = Math.cos(sa);
      frost.dt = dt; frost.time = w.time;
      frost.update();
      bendRoll.t += dt;
    }
    if (frost.crystalsDirty) { crystals.dirty = true; frost.crystalsDirty = false; }
    ribbon.time = frost.time; ribbon.update();
    crystals.time = clock.simTime; crystals.update();
    if (bendRoll.t >= spec.seconds) { bendRoll.active = false; game.pendingBend = null; game.wraithHeld = capture; }
  }
  loop.add({ name: 'bending', update: () => {
    if (game.pendingBend !== null) {
      if (!bendRoll.active && game.worldSettled() && game.pendingTrail === null && game.pendingWalk === null) {
        bendRoll.active = true; bendRoll.t = 0; bendRoll.spec = game.pendingBend;
      }
      if (bendRoll.active) stepBendRoll();
      return;
    }
    const dt = clock.dt;
    // No casting mid-conversation (the mouse is still captured while someone speaks).
    const can = !arm.free && !controller.scripted && !controller.surf.active && !(g.chapter && g.chapter.talking) && !g.verbBlock;
    const able = can && combat.dying === 0;
    // The element in hand (keys 1–5): only unlocked, built elements answer.
    for (let k = 0; k < ELEMENTS.length; k++) {
      if (input.pressed[Action.Element1 + k] && elements.select(ELEMENTS[k]) && g.hud && !capture) g.hud.notice('Element', ELEMENT_NAMES[ELEMENTS[k]], '', 2);
    }
    const isGale = elements.active === 'gale';
    if (able) {
      if (input.down[Action.Primary]) primaryHeld += dt;
      if (input.released[Action.Primary] && primaryHeld < HOLD && combat.spend(isGale ? combatTuning.costGust : combatTuning.costSweep)) {
        if (isGale) gale.castGust = true; else frost.castSweep = true;
        castFlash.v = 1; arm.kick += 0.012; sfx.x = controller.pos.x; sfx.y = controller.pos.y + 1; sfx.z = controller.pos.z; sfx.gain = 0.9; sfx.play(SFX.WHOOSH);
      }
      if (!input.down[Action.Primary]) primaryHeld = 0;
    } else primaryHeld = 0;
    const holding = able && primaryHeld >= HOLD && combat.focus > 1;
    frost.ribbonHeld = holding && !isGale;
    gale.vortexHeld = holding && isGale;
    if (able && input.pressed[Action.Heavy] && combat.spend(isGale ? combatTuning.costUpdraft : combatTuning.costCrystal)) {
      if (isGale) gale.castUpdraft = true; else frost.castCrystal = true;
      arm.shake += 0.01; castFlash.v = 1; arm.kick += 0.02;
    }
    // The Wraith turns to face what it bends.
    if (frost.castSweep || frost.castCrystal || frost.ribbonHeld || gale.castGust || gale.castUpdraft || gale.vortexHeld) controller.yaw = arm.yaw;
    updateAim();
    const b = wraithView.wraith.body;
    frost.hx = b.ha[3]; frost.hy = b.ha[4]; frost.hz = b.ha[5];
    frost.tx = aim.x; frost.ty = aim.y; frost.tz = aim.z;
    frost.x = controller.pos.x; frost.y = controller.pos.y; frost.z = controller.pos.z;
    frost.aimX = Math.sin(arm.yaw); frost.aimZ = Math.cos(arm.yaw);
    frost.dt = dt; frost.time = clock.simTime;
    frost.update();
    stepGale(dt, clock.simTime);
    ribbon.time = clock.simTime;
    ribbon.update();
    if (frost.crystalsDirty) { crystals.dirty = true; frost.crystalsDirty = false; }
    crystals.time = clock.simTime;
    crystals.update();
    streaks.vx = controller.vel.x; streaks.vy = controller.vel.y; streaks.vz = controller.vel.z;
    streaks.dt = clock.dt; streaks.engaged = controller.surf.blend;
    streaks.update();
  } });
}
