// The player, the verbs, the creatures and the cinematic pieces, created in the same order as
// always (their meshes draw in creation order, after the world's): the controller and the
// spring-arm camera with the deferred teleport, the surf wake, frost bending (ribbon, crystals),
// the Shaped, the Warden and its climb, the knockdown, combat, speed streaks, the release camera
// and its DOM letterbox/flash, the weather and the footprint writer. Results go onto `g`.

/** @param {any} g  shared boot context (world objects from boot/world.js) */
export async function createActors(g) {
  const { scene, atmosphere, shadows, bindShadows, ground, wraithView, terrainState, content, camera, capture, qs } = g;
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
  const restoration = { value: ws.restoration.frost === 'restored' ? 1 : 0 };
  // Frost bending (Phase 4): Sweep on a tap of Primary, Ribbon while held, Crystallize on Heavy.
  const frostMod = await import('../game/bending/frost.js');
  const frost = frostMod.createFrostBending({ ts: terrainState, fx: wraithView, ground, lights: content.clipmap.spellLights });
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
  shadows.addCaster(wardenView.mesh, wardenView.makeShadowMaterial, 3);
  wardenView.freeze();
  // The fight's pillars (filled from the arena's sites by systems/wardenFight.js), their crystals
  // (the Crystallize renderer, its own records) and the spike barrage (the Shaped's shard shader).
  const { ARENA } = await import('../world/architecture.js');
  const pillars = { n: ARENA.pillars, x: new Float64Array(8), z: new Float64Array(8), y0: new Float64Array(8).fill(-1e4), up: new Float64Array(8), H: ARENA.pillarH, r: ARENA.pillarShaft };
  const pillarCrystals = createCrystals(scene, atmosphere, new Float32Array(ARENA.pillars * 8 * 12));
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
  const spikesView = createShapedView(scene, atmosphere, spikes.chunks, { name: 'spikes' });
  bindShadows(spikesView.material, shadows);
  shadows.addCaster(spikesView.mesh, spikesView.makeShadowMaterial, 2);
  spikesView.freeze();
  const { createClimb } = await import('../game/warden/climb.js');
  const climb = createClimb({ warden, ground, pillars });
  arm.occluder = warden;
  // Knockdown: the release's shockwave throws the Wraith onto its back (character/knockdown.js).
  const { createKnockdown } = await import('../character/knockdown.js');
  const BRUSH_PLOUGH = (await import('../shaders/terrainState.wgsl.js')).BRUSH.PLOUGH;
  const knock = createKnockdown(ground);
  // Combat (Phase 5): focus, hits and reactions, lock-on, dodge, wounds and death.
  const { createCombat, combatTuning } = await import('../game/combat/combat.js');
  const { clock } = await import('../core/clock.js');
  const combat = createCombat({ shaped, frost, warden, controller, ts: terrainState, clock, teleport: (x, z) => requestTeleport(x, z) });
  climb.spend = (c) => combat.spend(c);
  combat.sfx = sfx;
  combat.shrineX = monastery.pos[0]; combat.shrineZ = monastery.pos[1];
  const vignette = document.createElement('div');
  vignette.className = 'wound-vignette';
  document.body.append(vignette);
  const { createSpeedStreaks } = await import('../render/speedStreaks.js');
  const streaks = createSpeedStreaks(scene, atmosphere);
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
    frostMod, frost, ribbon, crystals, shapedMod, shaped, shapedView, wardenMod, warden, SFX, sfx, music, wardenView,
    climb, knock, BRUSH_PLOUGH, pillars, pillarCrystals, spikes, spikesView, losBlocker: blocker, combatTuning, combat, vignette, streaks, releaseCam, bars, flashEl, weather, footprints,
    /** A cast's flash at the hand (0..1): set by the verbs, eased out by the combat system. */
    castFlash: { v: 0.5 - 0.5 },
  });
}
