// The Wraith follows the controller; each footfall stamps a footprint on its exact frame. Also
// the photo spots' scripted walk-ins and surf runs (one-off code paths for captures).

/** @param {any} g  shared boot context */
export function addWraithSystem(g) {
  const { loop, game, wraithView, controller, arm, clock, params, weather, restoration, warden, knockCtl, frost, surfWake, toggles, streamer, ground, footprints, sfx, SFX, capture } = g;
  loop.add({ name: 'wraith', update: () => {
    const w = wraithView.wraith, p = controller.pos;
    w.bx = p.x; w.by = p.y; w.bz = p.z; w.vx = controller.vel.x; w.vz = controller.vel.z;
    w.yaw = controller.yaw; w.grounded = controller.grounded; w.dt = clock.dt; w.time = clock.simTime;
    // The cloth feels the wind field where the Wraith stands: its direction and the gusts.
    const wf = g.wind;
    if (wf) { wf.sx = p.x; wf.sz = p.z; wf.sample(); w.windX = wf.outX; w.windZ = wf.outZ; w.windStrength = wf.speed * 0.9; } // ×0.9: the old frost cloth strength on average
    else w.windStrength = params.v.windStrength * weather.wind * (0.04 + 0.96 * restoration.value) + 2.2 * warden.gust;
    w.surf = Math.max(controller.surf.blend, controller.dodgeT > 0 ? 0.85 : 0); w.surfLean = controller.surf.lean;
    knockCtl.feedOverride(w);
    w.cast = Math.max(frost.gesture > 0 ? 1 : 0, frost.ribbonStrength > 0.05 ? 1 : 0);
    wraithView.time = clock.simTime;
    if (!wraithView.isEnabled()) return;
    // Photo spots with a walk: once the world is in, walk the Wraith into place, then hold it.
    if (game.pendingWalk !== null) {
      if (game.worldSettled() && game.pendingTrail === null) { walkIntoPlace(game.pendingWalk); game.pendingWalk = null; }
      return;
    }
    // Photo spots with a surf run: carve it a few substeps per frame (brushes drain 16 a frame and
    // the state window must follow), then hold the pose.
    if (game.pendingSurf !== null) {
      if (!surfRoll.active && game.worldSettled() && game.pendingTrail === null) startSurfRoll(game.pendingSurf);
      if (surfRoll.active) stepSurfRoll();
      return;
    }
    if (game.wraithHeld || game.pendingBend !== null) return;
    surfWake.x = p.x; surfWake.y = p.y; surfWake.z = p.z; surfWake.grounded = controller.grounded;
    surfWake.enabled = toggles.on.footprints !== false;
    surfWake.update();
    wraithView.update();
    wraithFootfalls();
  } });
  const surfRoll = { active: false, t: 0, spec: null };
  function startSurfRoll(spec) {
    surfRoll.active = true; surfRoll.t = 0; surfRoll.spec = spec;
    controller.scripted = true;
    if (spec.facing !== undefined) controller.yaw = spec.facing;
  }
  /** Scripted carve (photo spots): S-turns of the given amplitude and period; one-off code path. */
  function stepSurfRoll() {
    const spec = surfRoll.spec, sf = controller.surf, w = wraithView.wraith, p = controller.pos, dt = 1 / 60;
    for (let k = 0; k < 8 && surfRoll.t < spec.seconds; k++) {
      sf.want = true;
      streamer.mqx = p.x; streamer.mqz = p.z; streamer.sampleMaterial(); sf.canSurf = streamer.mat === 0;
      sf.steer = (spec.steer ?? 0.6) * Math.sin((2 * Math.PI * surfRoll.t) / (spec.period ?? 4));
      sf.throttle = spec.throttle ?? 0;
      controller.dt = dt; controller.update();
      w.bx = p.x; w.by = p.y; w.bz = p.z; w.vx = controller.vel.x; w.vz = controller.vel.z;
      w.yaw = controller.yaw; w.grounded = controller.grounded; w.dt = dt;
      w.time = clock.simTime - (spec.seconds - surfRoll.t); wraithView.time = w.time;
      w.surf = sf.blend; w.surfLean = sf.lean;
      surfWake.x = p.x; surfWake.y = p.y; surfWake.z = p.z; surfWake.grounded = controller.grounded; surfWake.enabled = true;
      surfWake.update();
      wraithView.update();
      surfRoll.t += dt;
    }
    if (surfRoll.t >= spec.seconds) {
      surfRoll.active = false; game.pendingSurf = null; game.wraithHeld = capture; // held only for frozen-clock captures
      controller.scripted = false; controller.vel.x = 0; controller.vel.z = 0;
      // Camera relative to where the run ended up (its heading is not known in advance).
      const c = spec.camera;
      if (c) { arm.yaw = controller.yaw + c.yaw; arm.pitch = c.pitch; arm.zoomTarget = c.dist; arm.zoom = c.dist; arm.armLen = c.dist; }
      arm.snap(controller.pos);
    }
  }
  function wraithFootfalls() {
    const gt = wraithView.wraith.gait, ev = gt.ev;
    footprints.enabled = toggles.on.footprints !== false;
    for (let e = 0; e < gt.evCount; e++) {
      const o = e * 7;
      sfx.x = ev[o]; sfx.y = ev[o + 1]; sfx.z = ev[o + 2]; sfx.gain = 0.35 + 0.08 * Math.min(ev[o + 6], 6); sfx.play(SFX.STEP);
      footprints.ex = ev[o]; footprints.ez = ev[o + 2]; footprints.edx = ev[o + 3]; footprints.edz = ev[o + 4];
      footprints.stampFoot();
      wraithView.spray(ev[o], ev[o + 1], ev[o + 2], ev[o + 3], ev[o + 4], ev[o + 6]);
    }
  }
  /** Photo spots: simulate the Wraith walking (or running) along its facing for `seconds`, ending
   *  where the player stands, with every footfall printed and sprayed; then hold the pose (the
   *  capture clock is frozen). One-off, so allocation is fine. */
  function walkIntoPlace(walk) {
    const w = wraithView.wraith, p = controller.pos;
    const f = walk.facing ?? controller.yaw, dx = Math.sin(f), dz = Math.cos(f);
    const dt = 1 / 60, n = Math.round(walk.seconds / dt);
    const v = new Float64Array(n);
    let dist = 0;
    for (let i = 0; i < n; i++) { v[i] = walk.speed * Math.min(1, (i + 1) * dt / 0.6); dist += v[i] * dt; }
    let s = -dist, lastRip = -1e9;
    for (let i = 0; i < n; i++) {
      s += v[i] * dt;
      const x = p.x + dx * s, z = p.z + dz * s;
      ground.qx = x; ground.qz = z; ground.sample();
      // Wading: the wake it leaves (water ripples at the times they were made).
      const tw = clock.simTime - (n - 1 - i) * dt, lv = g.water ? g.water.levelAt(x, z) : NaN;
      if (lv === lv && ground.h < lv && tw - lastRip > 0.25) { g.water.ripple(x, z, tw, Math.min(1.2, 0.35 + 0.35 * v[i])); lastRip = tw; }
      w.bx = x; w.by = ground.h; w.bz = z; w.vx = dx * v[i]; w.vz = dz * v[i];
      w.yaw = f; w.grounded = true; w.dt = dt; w.time = clock.simTime - (n - 1 - i) * dt;
      wraithView.time = w.time;
      wraithView.update();
      wraithFootfalls();
    }
    game.wraithHeld = capture; // held only for frozen-clock captures
  }
}
