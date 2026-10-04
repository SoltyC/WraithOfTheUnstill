// The Shaped, the Warden and combat, in that order each frame; plus the photo spots' scripted
// encounters (Shaped spawns, Warden placement, the release stepped to a given second, a climb).

/** @param {any} g  shared boot context */
export function addCreatureSystems(g) {
  const { loop, game, shaped, shapedMod, shapedView, warden, wardenMod, wardenView, controller, arm, clock, climb, combat, combatTuning, knock, knockCtl, releaseCam, wraithView, input, Action, vignette, castFlash, capture } = g;

  /** Photo spots with Shaped (`shaped: { spawn: [[name, dx, dz], …], seconds }`): spawn them
   *  around the player, simulate a few substeps per frame (frozen capture clock), then hold. */
  const shapedRoll = { t: -1 };
  function stepShapedRoll() {
    const spec = game.pendingShaped, p = controller.pos, f = controller.yaw;
    if (shapedRoll.t < 0) {
      const fx = Math.sin(f), fz = Math.cos(f), rx = fz, rz = -fx;
      for (const [name, dx, dz] of spec.spawn) shaped.spawn(name, p.x + rx * dx + fx * dz, p.z + rz * dx + fz * dz);
      shapedRoll.t = 0;
    }
    for (let k = 0; k < 6 && shapedRoll.t < spec.seconds; k++) {
      shaped.dt = 1 / 60; shaped.time = clock.simTime - (spec.seconds - shapedRoll.t);
      wraithView.time = shaped.time;
      shaped.update();
      shapedRoll.t += 1 / 60;
    }
    if (shapedRoll.t >= spec.seconds) {
      // Optional combat pose for the still: some Shaped frozen solid, the Wraith wounded.
      if (spec.freeze) for (const k of spec.freeze) shaped.freeze(k, 1e6);
      if (spec.telegraph) for (const k of spec.telegraph) { shaped.slots[k].state = shapedMod.S.TELEGRAPH; shaped.slots[k].glow = 1; shaped.slots[k].body.crouch = 1; shaped.update(); }
      if (spec.wound !== undefined) { combat.health = combatTuning.health * (1 - spec.wound); combat.wound = spec.wound; }
      game.pendingShaped = null; shapedRoll.t = -1;
    }
  }

  /** Photo spots: place the Warden (and optionally play its release to a second, or climb it). */
  function placeWardenForSpot() {
    const spec = game.pendingWarden, p = controller.pos, f = controller.yaw;
    const x = p.x + Math.sin(f) * spec.ahead + Math.cos(f) * (spec.side || 0), z = p.z + Math.cos(f) * spec.ahead - Math.sin(f) * (spec.side || 0);
    warden.place(x, z, Math.atan2(p.x - x, p.z - z) + (spec.turn || 0));
    // Settle it into its pose (frozen capture clock: substeps here).
    for (let k = 0; k < (spec.seconds || 1) * 60; k++) { warden.dt = 1 / 60; warden.update(); if (spec.dormant) warden.state = wardenMod.W.DORMANT; }
    if (spec.freezeJoints) for (const k of spec.freezeJoints) warden.freezeJoint(k);
    releaseCam.hold = false;
    if (spec.release !== undefined) {
      // The release, `release` seconds in: the Warden, the shockwave, the Wraith's knockdown
      // and the cinematic camera, all stepped together as they would play.
      warden.joint.fill(wardenMod.JOINT.SHATTERED); warden.state = wardenMod.W.RELEASE; warden.t = 0;
      const rc = releaseCam, w = wraithView.wraith;
      knockCtl.hitT = -1; knockCtl.prevShockR = -1;
      g.feedReleaseCam(rc); rc.start();
      const n = Math.round(spec.release * 60);
      for (let k = 0; k < n; k++) {
        const t = clock.simTime - (n - k) / 60;
        wraithView.time = t;
        warden.px = controller.pos.x; warden.pz = controller.pos.z;
        warden.dt = 1 / 60; warden.update();
        rc.hold = true; knockCtl.dt = 1 / 60; knockCtl.step();
        const pp = controller.pos;
        w.bx = pp.x; w.by = pp.y; w.bz = pp.z; w.vx = controller.vel.x; w.vz = controller.vel.z; w.yaw = controller.yaw;
        w.grounded = !knock.active; w.dt = 1 / 60; w.time = t; w.surf = 0; w.cast = 0;
        knockCtl.feedOverride(w); w.climbPhase = t * 6;
        wraithView.update();
        g.feedReleaseCam(rc); rc.dt = 1 / 60; rc.skip = false; rc.update();
      }
      wraithView.time = clock.simTime; wraithView.uploadFx();
      const cpose = rc.active;
      rc.active = false; rc.hold = true; rc.bars = 1;
      if (cpose) arm.setPose(rc.x, rc.y, rc.z, rc.yaw, rc.pitch, rc.fov);
      game.wraithHeld = capture;
    }
    warden.dt = 0; warden.update();
    if (spec.climb) {
      // On the Warden: grip at the given surface parameters and let the robe settle.
      const c = spec.climb;
      climb.mode = c.mode === 'leg' ? 1 : 2; climb.leg = c.leg || 0; climb.u = c.u ?? 0.5; climb.a = c.a ?? 0; climb.s = c.s ?? 2; climb.th = c.th ?? -1.2;
      warden.climbed = true;
      climb.crx = Math.cos(arm.yaw); climb.crz = -Math.sin(arm.yaw);
      if (c.outward && climb.mode === 1) {
        // On the outside of the leg (facing away from the body), so it can be seen.
        const wb = warden.body, l = climb.leg, at = wardenMod.WARDEN_SHAPE.legs[l].at;
        climb.a = Math.atan2(wb.pz[l] - wb.sz[at], wb.px[l] - wb.sx[at]) + (c.a || 0);
      }
      climb.grip = true; climb.regrip();
      const w = wraithView.wraith;
      // Hang still, then (moveT) climb up for a moment, so the shot can catch a reach.
      const moveT = c.moveT || 0, hangN = 150;
      for (let k = 0; k < hangN + Math.round(moveT * 60); k++) {
        combat.focus = 100; climb.grip = true; climb.mx = 0; climb.mz = k >= hangN ? 1 : 0; climb.dt = 1 / 60;
        climb.crx = Math.cos(arm.yaw); climb.crz = -Math.sin(arm.yaw);
        climb.update();
        controller.pos.x = climb.x - climb.ux * 0.85; controller.pos.y = climb.y - climb.uy * 0.85; controller.pos.z = climb.z - climb.uz * 0.85;
        w.bx = controller.pos.x; w.by = controller.pos.y; w.bz = controller.pos.z; w.vx = 0; w.vz = 0; w.yaw = controller.yaw; w.grounded = false; w.dt = 1 / 60;
        w.time = clock.simTime - (hangN - k) / 60; knockCtl.feedOverride(w);
        wraithView.update();
      }
      controller.hold = true;
      arm.pushX = -climb.fx * 1.6; arm.pushY = -climb.fy * 1.6; arm.pushZ = -climb.fz * 1.6;
      // Optionally aim the camera out from the surface (yaw relative to its normal).
      if (c.faceYaw !== undefined) arm.yaw = Math.atan2(climb.fx, climb.fz) + c.faceYaw;
      arm.snap(controller.pos);
      game.wraithHeld = capture;
    }
    game.pendingWarden = null;
  }

  loop.add({ name: 'shaped', update: () => {
    shaped.px = controller.pos.x; shaped.pz = controller.pos.z; shaped.pvx = controller.vel.x; shaped.pvz = controller.vel.z;
    shaped.pgrounded = controller.grounded && controller.dodgeT <= 0;
    if (game.pendingShaped !== null) {
      if (game.worldSettled() && game.pendingTrail === null) stepShapedRoll();
    } else if (!game.wraithHeld || !capture) {
      shaped.dt = clock.dt; shaped.time = clock.simTime;
      shaped.update();
    }
    shapedView.update();
  } });
  loop.add({ name: 'warden', update: () => {
    warden.px = controller.pos.x; warden.pz = controller.pos.z; warden.pgrounded = controller.grounded && controller.dodgeT <= 0;
    if (game.pendingWarden !== null) {
      if (game.worldSettled() && game.pendingTrail === null) placeWardenForSpot();
    } else if (!game.wraithHeld || !capture) { warden.dt = clock.dt; warden.update(); }
    wardenView.update();
    if (warden.nbrDirty) { wardenView.updateNeighbours(); warden.nbrDirty = false; }
  } });
  loop.add({ name: 'combat', update: () => {
    if (input.pressed[Action.LockOn]) combat.wantLockToggle = true;
    if (input.pressed[Action.Dodge] && !controller.god && combat.dying === 0 && combat.spend(combatTuning.costDodge)) controller.dodgeRequested = true;
    combat.dt = clock.dt;
    combat.update();
    arm.shake += combat.shake + warden.shake; arm.kick += combat.kick;
    castFlash.v *= Math.exp(-clock.realDt * 6);
    // Lock-on: the camera turns to keep the target ahead (soft; the mouse still pitches).
    if (combat.lock >= 0 && !controller.surf.active) {
      const b = shaped.slots[combat.lock].body;
      const want = Math.atan2(b.x - controller.pos.x, b.z - controller.pos.z);
      let d = want - arm.yaw; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
      arm.yaw += d * (1 - Math.exp(-clock.realDt * 5));
    }
    // On the body, not a HUD: focus is the hand-light, health the cowl light and the robe's frost.
    const w = combat.wound, dying = combat.dying;
    const gutter = w > 0.6 ? 0.75 + 0.25 * Math.sin(clock.simTime * 17) * Math.sin(clock.simTime * 7.3) : 1;
    const deathFade = dying > 0 ? Math.max(0, 1 - dying / 1.2) : 1;
    const reform = dying > combatTuning.deathTime ? Math.min(1, (dying - combatTuning.deathTime) / combatTuning.reformTime) : 0;
    wraithView.cowlLight = (1 - 0.65 * w) * gutter * Math.max(deathFade, reform);
    wraithView.handLight = (0.12 + 0.75 * combat.focus / combatTuning.focus + 1.2 * castFlash.v) * Math.max(deathFade, reform);
    wraithView.frost = Math.min(1, w * 1.15);
    wraithView.wraith.collapse = dying > 0 ? (dying < combatTuning.deathTime ? Math.min(1, dying / 0.9) : 1 - reform) : 0;
    vignette.style.opacity = String(Math.max(0, (w - 0.65) / 0.35).toFixed(3));
  } });
}
