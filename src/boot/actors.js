// The player, the verbs, the creatures and the cinematic pieces, created in the same order as
// always (their meshes draw in creation order, after the world's): the controller and the
// spring-arm camera with the deferred teleport, the surf wake, frost bending (ribbon, crystals),
// the Shaped, the Warden and its climb, the knockdown, combat, speed streaks, the release camera
// and its DOM letterbox/flash, the weather and the footprint writer. Results go onto `g`.

/** @param {any} g  shared boot context (world objects from boot/world.js) */
export async function createActors(g) {
  const { scene, atmosphere, shadows, bindShadows, ground, wraithView, terrainState, content, camera, capture, qs, engine } = g;
  const [worldPois, ctl, armMod] = await Promise.all([
    import('../../data/world/pois.json'),
    import('../character/capsuleController.js'),
    import('../camera/springArm.js'),
  ]);

  const controller = new ctl.CapsuleController(ground);
  const arm = new armMod.SpringArmCamera(camera, ground);
  const pois = worldPois.default.pois;
  /** Baked routes (the Shapers' Run: centre line and gates). */
  const routes = worldPois.default.routes || [];
  const monastery = pois.find((p) => p.id === 'monastery');

  // Deferred teleport: hold the player until a fine collision patch covers the target.
  const pendingTp = { active: false, x: 0.5, z: 0.5 };
  const requestTeleport = (x, z) => {
    controller.god = false;
    controller.hold = true;
    controller.pos.x = x; controller.pos.z = z;
    controller.vel.x = 0; controller.vel.y = 0; controller.vel.z = 0;
    pendingTp.active = true; pendingTp.x = x; pendingTp.z = z;
    arm.setFree(false);
  };
  requestTeleport(monastery.pos[0], monastery.pos[1]);

  // Snow-surf wake: groove, berms and spray along the carve (terrain-state writer).
  const { createSurfWake } = await import('../character/surfWake.js');
  const surfWake = createSurfWake(terrainState, wraithView);
  surfWake.surf = controller.surf;
  /** Frost restoration 0 (stilled) … 1 (restored): read by the wind, grade, spindrift and dust. */
  const { worldState: ws } = await import('../game/worldState.js');
  const restoration = { value: ws.restoration.frost === 'restored' ? 1 : 0, frost: ws.restoration.frost === 'restored' ? 1 : 0, meadow: ws.restoration.meadow === 'restored' ? 1 : 0 };
  // Frost bending (Phase 4): Sweep on a tap of Primary, Ribbon while held, Crystallize on Heavy.
  const frostMod = await import('../game/bending/frost.js');
  const frost = frostMod.createFrostBending({ ts: terrainState, fx: wraithView, ground, lights: content.clipmap.spellLights });
  // Gale bending (Phase 8 M6): Gust on a tap, Vortex while held, Updraft on Heavy, with the
  // element in hand chosen by 1–5 (game/elements.js).
  const galeMod = await import('../game/bending/gale.js');
  const gale = galeMod.createGaleBending({ ts: terrainState, ground, wind: g.wind, lights: content.clipmap.spellLights });
  const { createElements } = await import('../game/elements.js');
  const elements = createElements(qs.get('gale') === '1' ? ['frost', 'gale'] : ['frost']);
  const { createRibbon } = await import('../render/ribbon.js');
  const ribbon = createRibbon(scene, atmosphere, frost.ribbonNodes, frostMod.ribbonTuning.radius);
  bindShadows(ribbon.material, shadows);
  ribbon.freeze();
  const { createCrystals } = await import('../render/crystals.js');
  const crystals = createCrystals(scene, atmosphere, frost.crystals);
  bindShadows(crystals.material, shadows);
  shadows.addCaster(crystals.mesh, crystals.makeShadowMaterial, 2);
  crystals.freeze();
  // The Shaped (Phase 5): creatures of the biome's material, and their renderer.
  const shapedMod = await import('../game/shaped/shaped.js');
  const shaped = shapedMod.createShaped({ ts: terrainState, fx: wraithView, ground });
  const { createShapedView } = await import('../render/shapedView.js');
  const shapedView = createShapedView(scene, atmosphere, shaped.chunks);
  bindShadows(shapedView.material, shadows);
  shadows.addCaster(shapedView.mesh, shapedView.makeShadowMaterial, 2);
  shapedView.freeze();
  // The Frost Warden (Phase 5): a colossal Shaped with water joints; its own chunk view.
  const wardenMod = await import('../game/warden/warden.js');
  const warden = wardenMod.createWarden({ ts: terrainState, fx: wraithView, ground });
  // Sound (audio/sfx.js): live play only (captures and benches stay silent); it starts on the
  // first key or pointer press.
  const { createSfx, SFX } = await import('../audio/sfx.js');
  const sfx = createSfx();
  sfx.enabled = !capture && !qs.get('bench');
  // Music (audio/music.js): the user's score, through the same context.
  const { createMusic } = await import('../audio/music.js');
  const music = createMusic(sfx);
  music.enabled = sfx.enabled;
  const unlockAudio = () => { sfx.unlock(); music.unlock(); };
  window.addEventListener('pointerdown', unlockAudio); window.addEventListener('keydown', unlockAudio);
  shaped.sfx = sfx; warden.sfx = sfx;
  // The Warden's shard volley flies in the Shaped's shard pool (rendered with them).
  warden.shoot = () => {
    shaped.sx = warden.sx; shaped.sy = warden.sy; shaped.sz = warden.sz; shaped.tx = warden.tx; shaped.ty = warden.ty; shaped.tz = warden.tz;
    shaped.shotSpeed = 15; shaped.shotDmg = 14; shaped.shoot();
  };
  const wardenView = createShapedView(scene, atmosphere, warden.chunks, { subdivisions: 4, name: 'warden', shader: 'warden', neighbours: warden.nbr });
  bindShadows(wardenView.material, shadows);
  shadows.addCaster(wardenView.mesh, wardenView.makeShadowMaterial, 1);
  wardenView.freeze();
  // Its distant self (systems/visibility.js swaps them by distance): the same records on a coarse
  // sphere (162 vertices a chunk instead of 2562), casting only into the far cascade.
  const wardenFar = createShapedView(scene, atmosphere, warden.chunks, { subdivisions: 2, name: 'wardenFar', shader: 'warden', neighbours: warden.nbr });
  bindShadows(wardenFar.material, shadows);
  shadows.addCaster(wardenFar.mesh, wardenFar.makeShadowMaterial, 2, 2);
  wardenFar.freeze();
  // The fight's pillars (filled from the arena's sites by systems/wardenFight.js), their crystals
  // (the Crystallize renderer, its own records) and the spike barrage (the Shaped's shard shader).
  const { ARENA } = await import('../world/architecture.js');
  const pillars = { n: ARENA.pillars + 1, x: new Float64Array(8), z: new Float64Array(8), y0: new Float64Array(8).fill(-1e4), up: new Float64Array(8), h: new Float64Array(8).fill(ARENA.pillarH), r: ARENA.pillarShaft };   // the arena's six, then the seedling
  const pillarCrystals = createCrystals(scene, atmosphere, new Float32Array((ARENA.pillars + 1) * 8 * 12));
  bindShadows(pillarCrystals.material, shadows);
  shadows.addCaster(pillarCrystals.mesh, pillarCrystals.makeShadowMaterial, 2);
  pillarCrystals.freeze();
  // Line of sight against the built solids (set by the architecture system once they exist).
  // With `body` set (an aimed spike looking for the Wraith), the Warden's own bulk counts too:
  // under its belly the spikes off its back cannot reach.
  const blocker = { ax: 0.5, ay: 0.5, az: 0.5, bx: 0.5, by: 0.5, bz: 0.5, t: 0.5, solids: null, body: false,
    segBlocked() {
      const so = this.solids;
      if (so !== null) { so.ax = this.ax; so.ay = this.ay; so.az = this.az; so.bx = this.bx; so.by = this.by; so.bz = this.bz; if (so.segBlocked()) { this.t = so.t; return true; } }
      if (this.body && warden.active) {
        for (let k = 3; k <= 9; k++) {
          const t = k / 10; warden.qx = this.ax + (this.bx - this.ax) * t; warden.qy = this.ay + (this.by - this.ay) * t; warden.qz = this.az + (this.bz - this.az) * t;
          if (warden.probe()) { this.t = t; return true; }
        }
      }
      this.t = 2; return false;
    } };
  const { createSpikes } = await import('../game/warden/spikes.js');
  const spikes = createSpikes({ ground, ts: terrainState, fx: wraithView, blocker });
  shaped.blocker = blocker;
  const spikesView = createShapedView(scene, atmosphere, spikes.chunks, { name: 'spikes' });
  bindShadows(spikesView.material, shadows);
  shadows.addCaster(spikesView.mesh, spikesView.makeShadowMaterial, 2);
  spikesView.freeze();
  const { createClimb } = await import('../game/warden/climb.js');
  const climb = createClimb({ warden, ground, pillars });
  // The Bellwether (the meadow Warden, Stage 6): only its neck and head are a live chunk body — the
  // rest is the manor. Placed DORMANT in the west wing; Meadow-material chunks through the 'shaped'
  // shader (turf, drystone, root, amber pods); near/far views like the Warden; drawn within ~600 m.
  const bellMod = await import('../game/bellwether/bellwether.js');
  const bellwether = bellMod.createBellwether({ ground });
  bellwether.sfx = sfx;
  const bellView = createShapedView(scene, atmosphere, bellwether.chunks, { subdivisions: 3, name: 'bellwether', shader: 'bellwether', neighbours: bellwether.nbr });
  bindShadows(bellView.material, shadows);
  shadows.addCaster(bellView.mesh, bellView.makeShadowMaterial, 1);
  bellView.freeze();
  const bellFar = createShapedView(scene, atmosphere, bellwether.chunks, { subdivisions: 2, name: 'bellwetherFar', shader: 'bellwether', neighbours: bellwether.nbr });
  bindShadows(bellFar.material, shadows);
  shadows.addCaster(bellFar.mesh, bellFar.makeShadowMaterial, 2, 2);
  bellFar.freeze();
  const { createNeckClimb } = await import('../game/bellwether/neckClimb.js');
  const bellClimb = createNeckClimb({ bell: bellwether, ground });
  bellClimb.spend = (c) => combatSpend(c);
  const combatSpend = (c) => (g.combat ? g.combat.spend(c) : true);
  {
    const { clock: bclock } = await import('../core/clock.js');
    const BELL_WAKE_SETTLE = 7.5; const BELL = bellMod.B, NEAR = 320, FAR = 700;
    const drawn = new Map();
    const setOn = (mesh, on) => {
      // Culled only after it has drawn for a while (pipelines are made while the loading screen is up).
      if (mesh.isEnabled()) drawn.set(mesh, (drawn.get(mesh) || 0) + 1);
      if (!on && (drawn.get(mesh) || 0) < 30) return;
      if (mesh.isEnabled() !== on) { mesh.setEnabled(on); engine.snapshotRenderingReset(); }
    };
    // Dev hook: ?bell=wake | idle | exhale | shake (captures settle the pose at once).
    const spotId = qs.get('spot') || '';
    const hookQ = qs.get('bell'), hook = (['wake', 'idle', 'exhale', 'shake'].includes(hookQ) ? hookQ : null) || (spotId && spotId.startsWith('p8-bell-wake') ? 'wake' : spotId === 'p8-bell-climb' ? 'idle' : null);
    let devT = 0, hooked = false;
    const settle = (secs) => { for (let k = 0; k < Math.round(secs * 60); k++) bellwether.update(1 / 60, 0); };
    const aimAtWraith = () => { const p = g.controller.pos; bellwether.targetX = p.x; bellwether.targetY = p.y + 1.4; bellwether.targetZ = p.z; };
    g.bellwetherSystem = { name: 'bellwether', update: () => {
      aimAtWraith();
      let dt = bclock.dt;
      if (hook && !hooked && (capture || bclock.simTime > 1)) {
        hooked = true;
        if (hook === 'wake') { if (capture) { bellwether.wake(); settle(BELL_WAKE_SETTLE); } else bellwether.wake(); }
        else { bellwether.forceIdle(); if (capture) { if (hook === 'exhale') { bellwether.inhale(); settle(3.2); bellwether.exhale(); settle(0.9); } else if (hook === 'shake') { bellwether.shake(); settle(0.9); } else settle(2); } }
      }
      if (hook && hooked) {
        devT += dt;
        if (hook === 'exhale' && devT >= 6 && bellwether.state === BELL.IDLE) { devT = 0; bellwether.inhale(); }
        if (hook === 'exhale' && bellwether.state === BELL.INHALE && bellwether.inhaled) bellwether.exhale();
        if (hook === 'shake' && devT >= 5 && bellwether.state === BELL.IDLE) { devT = 0; bellwether.shake(); }
      }
      bellwether.update(dt, bclock.simTime);
      const b = bellwether.base, cx = camera.position.x, cz = camera.position.z, d2 = (b.x - cx) * (b.x - cx) + (b.z - cz) * (b.z - cz);
      const near = d2 < NEAR * NEAR || bellwether.state === BELL.EXHALE;
      if (d2 < FAR * FAR) { if (near && !bellView.mesh.isEnabled()) bellView.update(); if (!near && !bellFar.mesh.isEnabled()) bellFar.update(); }
      setOn(bellView.mesh, near && d2 < FAR * FAR);
      setOn(bellFar.mesh, !near && d2 < FAR * FAR);
      const v = bellView.mesh.isEnabled() ? bellView : bellFar.mesh.isEnabled() ? bellFar : null;
      if (v !== null) { if (bellwether.nbrDirty) { bellView.updateNeighbours(); bellFar.updateNeighbours(); bellwether.nbrDirty = false; } v.update(); }
    } };
    // The frame loop is created after the actors: register the system the moment g.loop is assigned
    // (set g.bellwetherManual first to register it yourself, e.g. in a systems file).
    let loopRef = g.loop;
    Object.defineProperty(g, 'loop', { configurable: true, enumerable: true, get: () => loopRef, set: (l) => { loopRef = l; if (l && !g.bellwetherManual) l.add(g.bellwetherSystem); } });
    if (loopRef && !g.bellwetherManual) loopRef.add(g.bellwetherSystem);
  }
  // The camera keeps out of the warden's and the Bellwether's bodies (architecture.js wraps this once more).
  arm.occluder = {
    qx: 0.5, qy: 0.5, qz: 0.5,
    probe() {
      warden.qx = this.qx; warden.qy = this.qy; warden.qz = this.qz;
      if (warden.probe()) return true;
      bellwether.qx = this.qx; bellwether.qy = this.qy; bellwether.qz = this.qz;
      return bellwether.probe();
    },
  };
  // Knockdown: the release's shockwave throws the Wraith onto its back (character/knockdown.js).
  const { createKnockdown } = await import('../character/knockdown.js');
  const BRUSH_PLOUGH = (await import('../shaders/terrainState.wgsl.js')).BRUSH.PLOUGH;
  const knock = createKnockdown(ground);
  // Combat (Phase 5): focus, hits and reactions, lock-on, dodge, wounds and death.
  const { createCombat, combatTuning } = await import('../game/combat/combat.js');
  const { clock } = await import('../core/clock.js');
  const { createFlow, flowTuning } = await import('../game/flow.js');
  const flow = createFlow();
  const combat = createCombat({ shaped, frost, gale, warden, controller, flow, ts: terrainState, clock, teleport: (x, z) => requestTeleport(x, z) });
  climb.spend = (c) => combat.spend(c);
  combat.sfx = sfx;
  combat.shrineX = monastery.pos[0]; combat.shrineZ = monastery.pos[1];
  const vignette = document.createElement('div');
  vignette.className = 'wound-vignette';
  document.body.append(vignette);
  const { createSpeedStreaks } = await import('../render/speedStreaks.js');
  const streaks = createSpeedStreaks(scene, atmosphere);
  // The weapons (docs §11.2): their mesh (carried and lying in the world), shadow and swing trail.
  const { createWeaponView } = await import('../render/weaponView.js');
  const weaponView = createWeaponView(scene, atmosphere, g.matLib, content.clipmap);
  bindShadows(weaponView.material, shadows);
  shadows.addCaster(weaponView.mesh, weaponView.makeShadowMaterial, 2);
  weaponView.freeze();
  // The release cinematic: when the last joint breaks the camera takes a slow orbit around the
  // Warden as it exhales and lies down (letterboxed, skippable).
  const { createReleaseCam } = await import('../camera/releaseCam.js');
  const releaseCam = createReleaseCam(ground);
  const bars = [document.createElement('div'), document.createElement('div')];
  bars[0].className = 'letterbox letterbox-top'; bars[1].className = 'letterbox letterbox-bottom';
  document.body.append(bars[0], bars[1]);
  // The slam's flash: a brief white-out (DOM overlay, eased out).
  const flashEl = document.createElement('div'); flashEl.className = 'release-flash'; document.body.append(flashEl);
  // Weather (BRIEF §5.6, world/weather.js): the frost state machine, driven by restoration and
  // time (or forced by the overlay / a photo spot); feeds the sky, light, fog, wind and snow.
  const { createWeather } = await import('../world/weather.js');
  const weather = createWeather();
  // Writers: the player's footprints; scripted trails from photo spots once the world is settled.
  const [{ createFootprints }, paramsMod] = await Promise.all([import('../terrain/state/footprints.js'), import('../core/params.js')]);
  const footprints = createFootprints(terrainState, { get v() { return paramsMod.params.v.deformDepth; } });

  Object.assign(g, {
    clock, ws, pois, routes, monastery, controller, arm, pendingTp, requestTeleport, surfWake, restoration,
    bellwether, bellView, bellFar, bellClimb, frostMod, frost, galeMod, gale, elements, ribbon, crystals, shapedMod, shaped, shapedView, wardenMod, warden, SFX, sfx, music, wardenView, wardenFar,
    climb, knock, BRUSH_PLOUGH, pillars, pillarCrystals, spikes, spikesView, losBlocker: blocker, combatTuning, combat, flow, flowTuning, vignette, streaks, weaponView, releaseCam, bars, flashEl, weather, footprints,
    /** A cast's flash at the hand (0..1): set by the verbs, eased out by the combat system. */
    castFlash: { v: 0.5 - 0.5 },
  });
}
