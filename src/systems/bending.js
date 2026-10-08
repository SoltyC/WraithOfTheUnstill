// Frost bending in play (BRIEF §9): Sweep on a tap of Primary, the Ribbon while held, Crystallize
// on Heavy; the aim point; the speed streaks; and the photo spots' scripted bending sequence.

/** @param {any} g  shared boot context */
export function addBendingSystem(g) {
  const { loop, game, input, Action, frost, frostMod, ribbon, crystals, streaks, controller, arm, combat, combatTuning, sfx, SFX, clock, ground, camera, shaped, wraithView, castFlash, capture } = g;
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
  /** Photo spots with a scripted bending sequence (`bend`): Sweep ahead, a Ribbon figure-eight,
   *  a Crystallize formation, then settle — 4 substeps per frame (the frozen capture clock). */
  const bendRoll = { active: false, t: 0, spec: null };
  function stepBendRoll() {
    const spec = bendRoll.spec, p = controller.pos, w = wraithView.wraith, dt = 1 / 60;
    const f = controller.yaw, fx = Math.sin(f), fz = Math.cos(f), rx = fz, rz = -fx;
    for (let k = 0; k < 4 && bendRoll.t < spec.seconds; k++) {
      const t = bendRoll.t;
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
    if (able) {
      if (input.down[Action.Primary]) primaryHeld += dt;
      if (input.released[Action.Primary] && primaryHeld < HOLD && combat.spend(combatTuning.costSweep)) { frost.castSweep = true; castFlash.v = 1; arm.kick += 0.012; sfx.x = controller.pos.x; sfx.y = controller.pos.y + 1; sfx.z = controller.pos.z; sfx.gain = 0.9; sfx.play(SFX.WHOOSH); }
      if (!input.down[Action.Primary]) primaryHeld = 0;
    } else primaryHeld = 0;
    frost.ribbonHeld = able && primaryHeld >= HOLD && combat.focus > 1;
    if (able && input.pressed[Action.Heavy] && combat.spend(combatTuning.costCrystal)) { frost.castCrystal = true; arm.shake += 0.01; castFlash.v = 1; arm.kick += 0.02; }
    // The Wraith turns to face what it bends.
    if (frost.castSweep || frost.castCrystal || frost.ribbonHeld) controller.yaw = arm.yaw;
    updateAim();
    const b = wraithView.wraith.body;
    frost.hx = b.ha[3]; frost.hy = b.ha[4]; frost.hz = b.ha[5];
    frost.tx = aim.x; frost.ty = aim.y; frost.tz = aim.z;
    frost.x = controller.pos.x; frost.y = controller.pos.y; frost.z = controller.pos.z;
    frost.aimX = Math.sin(arm.yaw); frost.aimZ = Math.cos(arm.yaw);
    frost.dt = dt; frost.time = clock.simTime;
    frost.update();
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
