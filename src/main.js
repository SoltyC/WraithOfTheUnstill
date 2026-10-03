// Entry point: WebGPU check → instrumentation → engine → scene → warm-up → loop.
// URL parameters:
//   ?spot=<id>      apply a photo spot after loading
//   &capture=1      capture mode: frozen clock, no overlay, sets window.__wraith.captureReady
//   &overlay=1      open the dev overlay at start

import { installGpuInstrumentation, armLatePipelineDetector, gpuStats } from './core/gpuInstrument.js';

if (!navigator.gpu) {
  document.getElementById('loading')?.remove();
  const line = document.createElement('div');
  line.className = 'nogpu';
  line.textContent = 'The Wraith of the Unstill needs a WebGPU browser.';
  document.body.append(line);
} else {
  installGpuInstrumentation();
  boot().catch((e) => {
    console.error(e);
    window.__wraith = { ...(window.__wraith || {}), error: String(e && e.stack || e) };
  });
}

async function boot() {
  const qs = new URLSearchParams(location.search);
  // Gate shots on the target GPU (?shots=<spot prefix>): one page load per spot.
  const shotsMod = qs.get('shots') ? await import('./core/shots.js') : null;
  if (shotsMod && shotsMod.shotsRedirect(qs)) return;
  const capture = qs.get('capture') === '1' || !!shotsMod;
  const fill = document.getElementById('loading-fill');
  const progress = (f) => { if (fill) fill.style.width = Math.round(f * 100) + '%'; };
  window.__wraith = { ready: false, captureReady: false, capture };

  const [{ WebGPUEngine }, { Scene }, { TargetCamera }, { Vector3 }, { Color4 }] = await Promise.all([
    import('@babylonjs/core/Engines/webgpuEngine.js'),
    import('@babylonjs/core/scene.js'),
    import('@babylonjs/core/Cameras/targetCamera.js'),
    import('@babylonjs/core/Maths/math.vector.js'),
    import('@babylonjs/core/Maths/math.color.js'),
  ]);
  progress(0.15);

  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('view'));
  // Empty glslang paths: every shader is WGSL, and any GLSL compile must fail loudly rather
  // than fetch a compiler from a CDN (BRIEF §3: no runtime CDN fetches).
  const engine = new WebGPUEngine(canvas, {
    antialias: true,
    powerPreference: 'high-performance',
    adaptToDeviceRatio: false,
    glslangOptions: { jsPath: '', wasmPath: '' },
    twgslOptions: { jsPath: '', wasmPath: '' },
    // Babylon keeps only features the adapter supports.
    deviceDescriptor: { requiredFeatures: ['timestamp-query'] },
  });
  await engine.initAsync({ jsPath: '', wasmPath: '' }, { jsPath: '', wasmPath: '' });
  // Reverse-Z: a 30 km far plane with a 10 cm near plane needs it to avoid z-fighting at range.
  engine.useReverseDepthBuffer = true;
  progress(0.2);

  const { installFastStages, disableBabylonInstrumentation, installConstantLabelFramePath } = await import('./render/babylonTweaks.js');
  const { AbstractEngine } = await import('@babylonjs/core/Engines/abstractEngine.js');
  installFastStages(); // before the Scene exists: its stages are created in the constructor
  disableBabylonInstrumentation(engine);
  installConstantLabelFramePath(engine, AbstractEngine.Version);
  const { gpuTimer } = await import('./core/gpuTimer.js');
  gpuTimer.init(gpuStats.device);

  // Render resolution: follow the window, or lock it with ?res=WxH (bench and captures on a
  // high-DPI monitor). The canvas is CSS-stretched to the window either way.
  // Render scale (Quality slider) applies on top of either mode. This is the only place that
  // sizes the backbuffer: setHardwareScalingLevel() would itself resize to the window.
  const resMatch = /^(\d+)x(\d+)$/.exec(qs.get('res') || '');
  let renderScale = 1;
  const applySize = () => {
    if (resMatch) engine.setSize(Math.round(Number(resMatch[1]) * renderScale), Math.round(Number(resMatch[2]) * renderScale));
    else engine.setHardwareScalingLevel(1 / renderScale); // resizes to window × scale
  };
  applySize();
  window.addEventListener('resize', applySize);

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.03, 0.05, 1);
  scene.skipPointerMovePicking = true;
  scene.skipPointerDownPicking = true;
  scene.skipPointerUpPicking = true;
  scene.autoClearDepthAndStencil = true;
  const camera = new TargetCamera('camera', new Vector3(0, 10, -10), scene);
  camera.minZ = 0.1;
  camera.maxZ = 40000; // the mountain ring reaches 28 km from the centre

  const [{ createWorldScene }, { WorldStreamer }, { PatchGround }, worldPois, env, ctl, armMod, playerMod, loopMod, inputMod, paramsMod, systemsMod, spots, overlayMod, streamingMod] = await Promise.all([
    import('./render/worldScene.js'),
    import('./world/streamer.js'),
    import('./world/patchGround.js'),
    import('../data/world/pois.json'),
    import('./render/environment.js'),
    import('./character/capsuleController.js'),
    import('./camera/springArm.js'),
    import('./character/playerSystem.js'),
    import('./core/loop.js'),
    import('./input/actions.js'),
    import('./core/params.js'),
    import('./core/systems.js'),
    import('./ui/photoSpots.js'),
    import('./ui/overlay/devOverlay.js'),
    import('./core/streaming.js'),
  ]);
  const { clock } = await import('./core/clock.js');
  progress(0.45);

  // World: the worker loads the bake; collision comes from worker-computed patches.
  const ground = new PatchGround();
  const streamer = new WorldStreamer(engine, ground);
  await streamer.init(import.meta.env.BASE_URL + 'world/');
  const ringMod = await import('./render/mountainRing.js');
  const ringData = ringMod.requestRing(streamer.manifest.seed); // builds on its own worker meanwhile
  const { createAtmosphere } = await import('./render/atmosphere.js');
  const atmosphere = createAtmosphere(scene, camera, streamer.buffers.biomeA);
  const content = createWorldScene(scene, streamer.buffers, atmosphere);
  const [{ createShadows }, { bindShadows }] = await Promise.all([import('./render/shadows.js'), import('./render/shadowBindings.js')]);
  const shadows = createShadows(scene, camera, { clipmap: content.clipmap, capsule: content.capsule });
  bindShadows(content.clipmap.material, shadows);
  bindShadows(content.capsuleMat, shadows);
  const ring = ringMod.createMountainRing(scene, atmosphere, await ringData);
  // Ground blow (spindrift): created after the opaque meshes, drawn in the transparent pass.
  const { createSpindrift } = await import('./render/spindrift.js');
  const spindrift = createSpindrift(scene, content.clipmap, atmosphere);
  bindShadows(spindrift.material, shadows);
  // Rock outcrops with accumulation (frost): cast and receive shadows.
  const { createRocks } = await import('./render/rocks.js');
  const rocks = createRocks(scene, content.clipmap, atmosphere);
  bindShadows(rocks.material, shadows);
  // Rocks shadow the near and middle cascades only (beyond ~800 m they are sub-texel).
  for (const m of rocks.meshes) shadows.addCaster(m, rocks.makeShadowMaterial, 2);
  rocks.freeze();
  // The Wraith (Phase 3): procedural gait, cloth robe; replaces the Phase 0 capsule's look.
  const { createWraithView } = await import('./render/wraith.js');
  const wraithView = createWraithView(scene, atmosphere, ground, content.clipmap);
  bindShadows(wraithView.material, shadows);
  bindShadows(wraithView.fur.material, shadows);
  bindShadows(wraithView.fx.material, shadows);
  shadows.addCaster(wraithView.mesh, wraithView.makeShadowMaterial, 2);
  // The spray plume casts a soft shadow in the near cascades (BRIEF §9.3).
  shadows.addCaster(wraithView.fx, wraithView.makeFxShadowMaterial, 1);
  wraithView.freeze();
  window.__wraith.wraithView = wraithView;
  content.capsule.setEnabled(false);
  // Terrain state (BRIEF §4.3): fine window + coarse pages; the clipmap reads it.
  const { createTerrainState } = await import('./terrain/state/terrainState.js');
  const terrainState = createTerrainState(engine, { surface: streamer.buffers.surface, base: import.meta.env.BASE_URL + 'world/' });
  content.clipmap.bindState(terrainState);
  progress(0.4);

  const controller = new ctl.CapsuleController(ground);
  const arm = new armMod.SpringArmCamera(camera, ground);
  const monastery = worldPois.default.pois.find((p) => p.id === 'monastery');

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

  const loop = new loopMod.Loop(engine, scene);
  inputMod.attachInput(canvas);

  // Environment, then world streaming and pending teleports, then player/camera, then clipmap.
  loop.add({ name: 'environment', update: () => env.updateEnvironment() });
  loop.add({ name: 'world', update: () => {
    // Stream around a pending teleport target first, else the free camera, else the player.
    const focusFree = arm.free && !pendingTp.active;
    streamer.px = pendingTp.active ? pendingTp.x : focusFree ? camera.position.x : controller.pos.x;
    streamer.pz = pendingTp.active ? pendingTp.z : focusFree ? camera.position.z : controller.pos.z;
    streamer.vx = focusFree || pendingTp.active ? 0 : controller.vel.x;
    streamer.vz = focusFree || pendingTp.active ? 0 : controller.vel.z;
    streamer.update();
    if (pendingTp.active) {
      // Complete only on a fine patch computed after the last tile upload, with every nearby tile
      // resident, so the drop height matches the final collision surface (and the GPU terrain).
      ground.qx = pendingTp.x; ground.qz = pendingTp.z;
      if (ground.coversFine() && ground.f.version === streamer.residencyVersion && streamer.arrived.length === 0
          && streamer.pendingNear(pendingTp.x, pendingTp.z) === 0) {
        controller.teleport(pendingTp.x, pendingTp.z);
        controller.hold = false;
        pendingTp.active = false;
        arm.snap(controller.pos);
      }
    }
  } });
  // Climbing the Warden (before the player system: while gripping, the climb owns the Wraith).
  loop.add({ name: 'climb', update: () => {
    const inp = inputMod.input, A = inputMod.Action, d = inp.down;
    climb.grip = d[A.Traverse] === 1 && !controller.surf.active && !arm.free && combat.dying === 0;
    climb.mx = d[A.MoveRight] - d[A.MoveLeft]; climb.mz = d[A.MoveForward] - d[A.MoveBack];
    climb.crx = Math.cos(arm.yaw); climb.crz = -Math.sin(arm.yaw);
    climb.px = controller.pos.x; climb.py = controller.pos.y; climb.pz = controller.pos.z;
    climb.dt = clock.dt;
    const was = climb.climbing;
    climb.update();
    // The camera's pivot stands off the climbed surface, so the Wraith is seen against it.
    const push = climb.climbing ? 1.6 : 0;
    arm.pushX = -climb.fx * push; arm.pushY = -climb.fy * push; arm.pushZ = -climb.fz * push;
    if (climb.climbing) {
      // Held to the surface: the feet point sits below the pelvis along the climb.
      controller.hold = true;
      controller.pos.x = climb.x - climb.ux * 0.85; controller.pos.y = climb.y - climb.uy * 0.85; controller.pos.z = climb.z - climb.uz * 0.85;
      controller.vel.x = climb.vx; controller.vel.y = climb.vy; controller.vel.z = climb.vz;
      controller.grounded = false;
      // Strike or freeze a back joint within reach (the verbs, at hand).
      if (climb.nearJoint >= 0) {
        if (inp.pressed[A.Primary] && warden.strikeJoint(climb.nearJoint)) combat.breakJoint();
        if (inp.pressed[A.Heavy] && combat.spend(combatTuning.costCrystal)) { warden.freezeJoint(climb.nearJoint); arm.shake += 0.01; }
      }
    } else if (was) {
      // Off the Warden: real momentum from here (thrown, dropped or slipped).
      controller.hold = false; controller.grounded = false;
      controller.vel.x = climb.vx; controller.vel.y = climb.vy; controller.vel.z = climb.vz;
      if (climb.fell === 1) arm.shake += 0.03;
    }
  } });
  loop.add(playerMod.createPlayerSystem({ controller, arm, ...content, material: streamer }));
  // Snow-surf wake: groove, berms and spray along the carve (terrain-state writer).
  const { createSurfWake } = await import('./character/surfWake.js');
  const surfWake = createSurfWake(terrainState, wraithView);
  surfWake.surf = controller.surf;
  /** Frost restoration 0 (stilled) … 1 (restored): declared before the systems that read it. */
  const { worldState: ws } = await import('./game/worldState.js');
  const restoration = { value: ws.restoration.frost === 'restored' ? 1 : 0 };
  // Frost bending (Phase 4): Sweep on a tap of Primary, Ribbon while held, Crystallize on Heavy.
  const { createFrostBending } = await import('./game/bending/frost.js');
  const frostMod = await import('./game/bending/frost.js');
  const frost = frostMod.createFrostBending({ ts: terrainState, fx: wraithView, ground, lights: content.clipmap.spellLights });
  const { createRibbon } = await import('./render/ribbon.js');
  const ribbon = createRibbon(scene, atmosphere, frost.ribbonNodes, frostMod.ribbonTuning.radius);
  bindShadows(ribbon.material, shadows);
  ribbon.freeze();
  const { createCrystals } = await import('./render/crystals.js');
  const crystals = createCrystals(scene, atmosphere, frost.crystals);
  bindShadows(crystals.material, shadows);
  shadows.addCaster(crystals.mesh, crystals.makeShadowMaterial, 2);
  crystals.freeze();
  // The Shaped (Phase 5): creatures of the biome's material, and their renderer.
  const shapedMod = await import('./game/shaped/shaped.js');
  const shaped = shapedMod.createShaped({ ts: terrainState, fx: wraithView, ground });
  const { createShapedView } = await import('./render/shapedView.js');
  const shapedView = createShapedView(scene, atmosphere, shaped.chunks);
  bindShadows(shapedView.material, shadows);
  shadows.addCaster(shapedView.mesh, shapedView.makeShadowMaterial, 2);
  shapedView.freeze();
  // The Frost Warden (Phase 5): a colossal Shaped with water joints; its own chunk view.
  const wardenMod = await import('./game/warden/warden.js');
  const warden = wardenMod.createWarden({ ts: terrainState, fx: wraithView, ground });
  const wardenView = createShapedView(scene, atmosphere, warden.chunks, { subdivisions: 4, name: 'warden', shader: 'warden', neighbours: warden.nbr });
  bindShadows(wardenView.material, shadows);
  shadows.addCaster(wardenView.mesh, wardenView.makeShadowMaterial, 3);
  wardenView.freeze();
  const { createClimb } = await import('./game/warden/climb.js');
  const climb = createClimb({ warden });
  arm.occluder = warden;
  climb.spend = (c) => combat.spend(c);
  // Combat (Phase 5): focus, hits and reactions, lock-on, dodge, wounds and death.
  const { createCombat, combatTuning } = await import('./game/combat/combat.js');
  const combat = createCombat({ shaped, frost, warden, controller, ts: terrainState, clock, teleport: (x, z) => requestTeleport(x, z) });
  combat.shrineX = monastery.pos[0]; combat.shrineZ = monastery.pos[1];
  const vignette = document.createElement('div');
  vignette.className = 'wound-vignette';
  document.body.append(vignette);
  const { createSpeedStreaks } = await import('./render/speedStreaks.js');
  const streaks = createSpeedStreaks(scene, atmosphere);
  const { input: inputState, Action: Act } = await import('./input/actions.js');
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
    const can = !arm.free && !controller.scripted && !controller.surf.active;
    const able = can && combat.dying === 0;
    if (able) {
      if (inputState.down[Act.Primary]) primaryHeld += dt;
      if (inputState.released[Act.Primary] && primaryHeld < HOLD && combat.spend(combatTuning.costSweep)) frost.castSweep = true;
      if (!inputState.down[Act.Primary]) primaryHeld = 0;
    } else primaryHeld = 0;
    frost.ribbonHeld = able && primaryHeld >= HOLD && combat.focus > 1;
    if (able && inputState.pressed[Act.Heavy] && combat.spend(combatTuning.costCrystal)) { frost.castCrystal = true; arm.shake += 0.01; }
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
  // The Wraith follows the controller; each footfall stamps a footprint on its exact frame.
  loop.add({ name: 'wraith', update: () => {
    const w = wraithView.wraith, p = controller.pos;
    w.bx = p.x; w.by = p.y; w.bz = p.z; w.vx = controller.vel.x; w.vz = controller.vel.z;
    w.yaw = controller.yaw; w.grounded = controller.grounded; w.dt = clock.dt; w.time = clock.simTime;
    w.windStrength = paramsMod.params.v.windStrength * (0.04 + 0.96 * restoration.value);
    w.surf = Math.max(controller.surf.blend, controller.dodgeT > 0 ? 0.85 : 0); w.surfLean = controller.surf.lean;
    w.climbing = climb.climbing; w.climbBlend = climb.blend;
    if (climb.climbing) {
      w.cpx = climb.x; w.cpy = climb.y; w.cpz = climb.z; w.climbPhase = climb.phase;
      w.cr[0] = climb.rx; w.cr[1] = climb.ry; w.cr[2] = climb.rz; w.cu[0] = climb.ux; w.cu[1] = climb.uy; w.cu[2] = climb.uz;
      w.cf[0] = climb.fx; w.cf[1] = climb.fy; w.cf[2] = climb.fz;
    }
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
    surfWake.enabled = systemsMod.toggles.on.footprints !== false;
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
    const g = wraithView.wraith.gait, ev = g.ev;
    footprints.enabled = systemsMod.toggles.on.footprints !== false;
    for (let e = 0; e < g.evCount; e++) {
      const o = e * 7;
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
    let s = -dist;
    for (let i = 0; i < n; i++) {
      s += v[i] * dt;
      const x = p.x + dx * s, z = p.z + dz * s;
      ground.qx = x; ground.qz = z; ground.sample();
      w.bx = x; w.by = ground.h; w.bz = z; w.vx = dx * v[i]; w.vz = dz * v[i];
      w.yaw = f; w.grounded = true; w.dt = dt; w.time = clock.simTime - (n - 1 - i) * dt;
      wraithView.time = w.time;
      wraithView.update();
      wraithFootfalls();
    }
    game.wraithHeld = capture; // held only for frozen-clock captures
  }
  loop.add({ name: 'shaped', update: () => {
    shaped.px = controller.pos.x; shaped.pz = controller.pos.z; shaped.pvx = controller.vel.x; shaped.pvz = controller.vel.z;
    if (game.pendingShaped !== null) {
      if (game.worldSettled() && game.pendingTrail === null) stepShapedRoll();
    } else if (!game.wraithHeld || !capture) {
      shaped.dt = clock.dt; shaped.time = clock.simTime;
      shaped.update();
    }
    shapedView.update();
  } });
  loop.add({ name: 'warden', update: () => {
    warden.px = controller.pos.x; warden.pz = controller.pos.z;
    if (game.pendingWarden !== null) {
      if (game.worldSettled() && game.pendingTrail === null) {
        const spec = game.pendingWarden, p = controller.pos, f = controller.yaw;
        const x = p.x + Math.sin(f) * spec.ahead + Math.cos(f) * (spec.side || 0), z = p.z + Math.cos(f) * spec.ahead - Math.sin(f) * (spec.side || 0);
        warden.place(x, z, Math.atan2(p.x - x, p.z - z) + (spec.turn || 0));
        // Settle it into its pose (frozen capture clock: substeps here).
        for (let k = 0; k < (spec.seconds || 1) * 60; k++) { warden.dt = 1 / 60; warden.update(); if (spec.dormant) warden.state = wardenMod.W.DORMANT; }
        if (spec.freezeJoints) for (const k of spec.freezeJoints) warden.freezeJoint(k);
        warden.dt = 0; warden.update();
        if (spec.climb) {
          // On the Warden: grip at the given surface parameters and let the robe settle.
          const c = spec.climb;
          climb.mode = c.mode === 'leg' ? 1 : 2; climb.leg = c.leg || 0; climb.u = c.u ?? 0.5; climb.a = c.a ?? 0; climb.s = c.s ?? 2; climb.th = c.th ?? -1.2;
          warden.climbed = true;
          const w = wraithView.wraith;
          for (let k = 0; k < 150; k++) {
            combat.focus = 100; climb.grip = true; climb.mx = 0; climb.mz = 0; climb.dt = 1 / 60;
            climb.crx = Math.cos(arm.yaw); climb.crz = -Math.sin(arm.yaw);
            climb.update(); climb.phase += 1 / 60 * 2;
            controller.pos.x = climb.x - climb.ux * 0.85; controller.pos.y = climb.y - climb.uy * 0.85; controller.pos.z = climb.z - climb.uz * 0.85;
            w.bx = controller.pos.x; w.by = controller.pos.y; w.bz = controller.pos.z; w.vx = 0; w.vz = 0; w.yaw = controller.yaw; w.grounded = false; w.dt = 1 / 60;
            w.climbing = true; w.climbBlend = climb.blend; w.cpx = climb.x; w.cpy = climb.y; w.cpz = climb.z; w.climbPhase = climb.phase;
            w.cr[0] = climb.rx; w.cr[1] = climb.ry; w.cr[2] = climb.rz; w.cu[0] = climb.ux; w.cu[1] = climb.uy; w.cu[2] = climb.uz;
            w.cf[0] = climb.fx; w.cf[1] = climb.fy; w.cf[2] = climb.fz;
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
    } else if (!game.wraithHeld || !capture) { warden.dt = clock.dt; warden.update(); }
    wardenView.update();
    if (warden.nbrDirty) { wardenView.updateNeighbours(); warden.nbrDirty = false; }
  } });
  loop.add({ name: 'combat', update: () => {
    if (inputState.pressed[Act.LockOn]) combat.wantLockToggle = true;
    if (inputState.pressed[Act.Dodge] && !controller.god && combat.dying === 0 && combat.spend(combatTuning.costDodge)) controller.dodgeRequested = true;
    combat.dt = clock.dt;
    combat.update();
    arm.shake += combat.shake + warden.shake;
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
    wraithView.handLight = (0.12 + 0.75 * combat.focus / combatTuning.focus) * Math.max(deathFade, reform);
    wraithView.frost = Math.min(1, w * 1.15);
    wraithView.wraith.collapse = dying > 0 ? (dying < combatTuning.deathTime ? Math.min(1, dying / 0.9) : 1 - reform) : 0;
    vignette.style.opacity = String(Math.max(0, (w - 0.65) / 0.35).toFixed(3));
  } });
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
  loop.add({ name: 'atmosphere', update: () => {
    env.env.screenInfo.x = engine.getRenderWidth(); env.env.screenInfo.y = engine.getRenderHeight();
    env.env.screenInfo.z = 1 / env.env.screenInfo.x; env.env.screenInfo.w = 1 / env.env.screenInfo.y;
    atmosphere.update();
  } });
  loop.add({ name: 'clipmap', update: () => {
    content.clipmap.camX = camera.position.x;
    content.clipmap.camZ = camera.position.z;
    content.clipmap.residencyVersion = streamer.residencyVersion;
    content.clipmap.update();
  } });
  loop.add({ name: 'shadows', update: () => shadows.update() });
  loop.add({ name: 'rocks', update: () => { rocks.camX = camera.position.x; rocks.camZ = camera.position.z; rocks.update(); } });
  // Restoration (BRIEF §2.4): the frost steppe is stilled until its Warden is released — still
  // air, no spindrift, a flat, cool, desaturated grade; restored brings back wind, spindrift and
  // warmth. `restore` eases toward the state (the Warden's release drives it directly).
  restoration.value = ws.restoration.frost === 'restored' ? 1 : 0;
  const STILLED = [0.5, -0.5, 0.45], RESTORED = [-0.1, 0.22, -0.12];
  loop.add({ name: 'restoration', update: () => {
    const target = ws.restoration.frost === 'restored' ? 1 : 0;
    if (warden.active && warden.state === wardenMod.W.RELEASE) restoration.value = Math.max(restoration.value, warden.restore);
    else restoration.value += (target - restoration.value) * (1 - Math.exp(-clock.realDt * 1.5));
    if (warden.restore >= 1 && ws.restoration.frost !== 'restored') ws.restoration.frost = 'restored';
    const r = restoration.value, ap = env.env.artParams;
    ap.y = STILLED[0] + (RESTORED[0] - STILLED[0]) * r;
    ap.z = STILLED[1] + (RESTORED[1] - STILLED[1]) * r;
    ap.w = STILLED[2] + (RESTORED[2] - STILLED[2]) * r;
  } });
  loop.add({ name: 'spindrift', update: () => {
    const w = paramsMod.params.v.windStrength * (0.04 + 0.96 * restoration.value);
    spindrift.time = clock.simTime;
    spindrift.strength = Math.min(1.5, Math.max(0, (w - 0.15) / 0.5));
    spindrift.drift.z = 0.4 + w;
    spindrift.update();
  } });
  // Writers: the player's footprints; scripted trails from photo spots once the world is settled.
  const { createFootprints } = await import('./terrain/state/footprints.js');
  const footprints = createFootprints(terrainState, { get v() { return paramsMod.params.v.deformDepth; } });
  loop.add({ name: 'terrainState', update: () => {
    const tsFollow = terrainState.followOverride;
    terrainState.px = tsFollow ? terrainState.followX : controller.pos.x;
    terrainState.pz = tsFollow ? terrainState.followZ : controller.pos.z;
    terrainState.time = clock.simTime;
    terrainState.healScale = paramsMod.params.v.refillRate;
    footprints.enabled = systemsMod.toggles.on.footprints !== false;
    footprints.px = controller.pos.x; footprints.pz = controller.pos.z;
    footprints.grounded = controller.grounded && !arm.free && content.capsule.isEnabled();
    footprints.update();
    if (game.pendingTrail !== null && game.worldSettled()) { footprints.stampTrail(game.pendingTrail); game.pendingTrail = null; }
    terrainState.update();
  } });

  // Render scale follows the Quality slider (checked via the integer params version).
  let lastParamsVersion = -1;
  loop.add({ name: 'renderScale', update: () => {
    if (paramsMod.params.version === lastParamsVersion) return;
    lastParamsVersion = paramsMod.params.version;
    const s = paramsMod.params.v.renderScale;
    if (s !== renderScale) { renderScale = s; applySize(); }
  } });

  // System toggles.
  const reg = systemsMod.registerToggle;
  // Changing the drawn mesh set invalidates a recorded snapshot.
  const meshToggle = (mesh) => (on) => { mesh.setEnabled(on); engine.snapshotRenderingReset(); };
  reg({ key: 'sky', label: 'sky', group: 'System', on: true, onChange: meshToggle(content.sky) });
  reg({ key: 'terrain', label: 'terrain', group: 'System', on: true, onChange: meshToggle(content.terrain) });
  reg({ key: 'ring', label: 'mountain ring', group: 'System', on: true, onChange: meshToggle(ring) });
  reg({ key: 'spindrift', label: 'spindrift', group: 'System', on: true, onChange: meshToggle(spindrift.mesh) });
  reg({ key: 'rocks', label: 'rock outcrops', group: 'System', on: true, onChange: (on) => { for (const m of rocks.meshes) m.setEnabled(on); engine.snapshotRenderingReset(); } });
  reg({ key: 'player', label: 'player (the Wraith)', group: 'System', on: true, onChange: (on) => { wraithView.setEnabled(on); engine.snapshotRenderingReset(); } });
  reg({ key: 'shadows', label: 'shadows', group: 'System', on: true, onChange: (on) => { shadows.strength = on ? 1 : 0; } });
  reg({ key: 'autosave', label: 'autosave', group: 'System', on: true });
  reg({ key: 'footprints', label: 'player footprints', group: 'Terrain', on: true });

  // Saves (lazy: the worker and IndexedDB open only when first used, so idle frames stay clean).
  const saves = await createSaves({ controller, arm, paramsMod, clock });

  const game = {
    engine, scene, camera, loop, controller, arm, saves, streaming: streamingMod.streaming,
    streamer, ground, terrainState, clipmap: content.clipmap, pois: worldPois.default.pois,
    teleport(x, z) { requestTeleport(x, z); },
    /** True once the player stands on streamed ground with every nearby tile resident. */
    worldSettled() {
      if (pendingTp.active || streamer.arrived.length > 0) return false;
      if (streamer.pendingNear(controller.pos.x, controller.pos.z) !== 0) return false;
      return !arm.free || streamer.pendingNear(camera.position.x, camera.position.z) === 0;
    },
    /** Photo-spot trail waiting for the world to settle (then stamped as footprints). */
    pendingTrail: null,
    /** Photo-spot walk ({ speed, seconds, facing? }) waiting for the world to settle. */
    pendingWalk: null,
    /** True while a spot's walked-in pose is held (no Wraith updates). */
    wraithHeld: false,
    /** Photo-spot surf run ({ seconds, facing?, steer?, period?, throttle? }) still to carve. */
    pendingSurf: null,
    /** Photo-spot bending sequence ({ seconds }) still to cast. */
    pendingBend: null,
    /** Photo-spot Shaped encounter still to simulate. */
    pendingShaped: null,
    /** Photo-spot Warden placement ({ ahead, side?, turn?, seconds?, dormant?, freezeJoints? }). */
    pendingWarden: null,
    /** Dev: place the Frost Warden ahead of the player. */
    spawnWarden() { this.pendingWarden = { ahead: 40, seconds: 0.1 }; },
    shapedArchetypes: Object.keys((await import('./game/shaped/archetypes.js')).ARCHETYPES),
    /** Dev: spawn n Shaped of an archetype in an arc 6 m in front of the player. */
    spawnShaped(name, n) {
      const p = controller.pos, f = arm.yaw;
      for (let k = 0; k < n; k++) {
        const a = f + (k - (n - 1) / 2) * 0.5;
        shaped.spawn(name, p.x + Math.sin(a) * 6, p.z + Math.cos(a) * 6);
      }
    },
    killShaped() { for (let i = 0; i < shapedMod.MAX_SHAPED; i++) shaped.damage(i, 1e9, false, 0, 0); },
    applySpot(spot) {
      spots.applySpot(spot, { controller, arm, teleport: requestTeleport, setPlayerVisible: this.setPlayerVisible });
      this.pendingTrail = spot.trail || null;
      this.pendingWalk = spot.walk || null;
      this.pendingSurf = spot.surf || null;
      this.pendingBend = spot.bend || null;
      this.pendingShaped = spot.shaped || null;
      this.pendingWarden = spot.warden || null;
      this.wraithHeld = false;
    },
    /** True when nothing a capture shows is still being written (spot trails, walks, brush queue). */
    stateSettled() { return this.pendingTrail === null && this.pendingWalk === null && this.pendingSurf === null && this.pendingBend === null && this.pendingShaped === null && this.pendingWarden === null && terrainState.pendingBrushes === 0; },
    setPlayerVisible(on) {
      if (wraithView.isEnabled() === on) return;
      wraithView.setEnabled(on); engine.snapshotRenderingReset();
    },
    setFreeCam(on) { arm.setFree(on); },
    setGod(on) { controller.god = on; if (!on) controller.teleport(controller.pos.x, controller.pos.z); },
  };

  const overlay = new overlayMod.DevOverlay(game);
  overlay.refreshToggles();
  loop.addLate(overlay);
  loop.addLate({ name: 'saves', update: () => { if (systemsMod.toggles.on.autosave && !capture) saves.tick(); } });
  const bench = qs.get('bench') ? await import('./core/bench.js') : null;
  if (bench) loop.addLate(bench.benchSystem);
  loop.addLate({ name: 'inputEnd', update: inputMod.endInputFrame });

  const spotId = qs.get('spot');
  if (spotId) {
    const spot = spots.findSpot(spotId);
    if (!spot) throw new Error('unknown photo spot ' + spotId);
    game.applySpot(spot);
  }
  if (capture) clock.frozen = true;
  env.updateEnvironment();

  // Warm-up (BRIEF §15): make every material ready, then render frames behind the loading
  // screen so all pipelines exist before the late-pipeline detector arms. The world streams
  // meanwhile; loading ends once the player stands on ground with every nearby tile resident.
  await scene.whenReadyAsync();
  progress(0.5);
  loop.start();
  await waitFrames(engine, 4);
  await waitUntil(engine, () => {
    const need = streamer.pendingNear(controller.pos.x, controller.pos.z);
    progress(0.5 + 0.5 * (1 - Math.min(1, need / 36)));
    return game.worldSettled();
  });
  progress(1);
  armLatePipelineDetector();
  // Snapshot rendering (standard mode): Babylon records render bundles once and replays them,
  // skipping its per-draw JS path (pipeline-cache lookups, labels, iterators) — most of the
  // engine's per-frame allocations. Uniforms and camera still update every frame.
  systemsMod.registerToggle({ key: 'snapshot', label: 'snapshot render', group: 'System', on: true, onChange: (on) => { engine.snapshotRendering = on; } });
  engine.snapshotRendering = qs.get('snapshot') !== '0';
  systemsMod.toggles.on.snapshot = engine.snapshotRendering;
  overlay.refreshToggles();

  const loading = document.getElementById('loading');
  if (capture) loading.remove();
  else { loading.classList.add('done'); setTimeout(() => loading.remove(), 1600); }
  if (qs.get('overlay') === '1') overlay.toggle(true);

  window.__wraith = Object.assign(window.__wraith, {
    ready: true, game, shadows, terrainState, wraithView, frost, shaped, combat, warden, climb, env: env.env,
    /** Automation: drive an action (Action name, down) as if from the keyboard/mouse. */
    inject(name, down) { inputMod.injectAction(inputMod.Action[name], down); }, gpuStats, gpuTimer, frameStats: loopMod.frameStats, params: paramsMod.params, clock,
    /** Capture hook: apply a spot, render settle frames, then resolve. */
    async prepareSpot(id, frames = 6) {
      game.applySpot(spots.findSpot(id));
      env.updateEnvironment();
      await waitUntil(engine, () => game.worldSettled() && game.stateSettled());
      await waitFrames(engine, frames);
      return true;
    },
  });
  if (capture) {
    await waitUntil(engine, () => game.worldSettled() && game.stateSettled());
    await waitFrames(engine, 6);
    window.__wraith.captureReady = true;
    if (shotsMod) shotsMod.shotsTake(engine, qs);
  }
  if (bench) bench.runBench(game, qs);
}

/** Resolve on the first end-of-frame where test() is true. */
function waitUntil(engine, test) {
  return new Promise((resolve) => {
    const obs = engine.onEndFrameObservable.add(() => {
      if (test()) { engine.onEndFrameObservable.remove(obs); resolve(); }
    });
  });
}

function waitFrames(engine, n) {
  return new Promise((resolve) => {
    let left = n;
    const obs = engine.onEndFrameObservable.add(() => {
      if (--left <= 0) { engine.onEndFrameObservable.remove(obs); resolve(); }
    });
  });
}

async function createSaves({ controller, arm, paramsMod, clock }) {
  const [{ SaveManager, WorkerCodec }, { SaveStore, openSaveDb }, { worldState }] = await Promise.all([
    import('./game/save/saveManager.js'),
    import('./game/save/saveStore.js'),
    import('./game/worldState.js'),
  ]);
  let store = null, codec = null;
  const lazyStore = {
    async ensure() { if (!store) store = new SaveStore(await openSaveDb()); return store; },
    async put(...a) { return (await this.ensure()).put(...a); },
    async get(...a) { return (await this.ensure()).get(...a); },
    async list() { return (await this.ensure()).list(); },
  };
  const lazyCodec = {
    encode(s) { codec ||= new WorkerCodec(); return codec.encode(s); },
    decode(b) { codec ||= new WorkerCodec(); return codec.decode(b); },
  };
  return new SaveManager({
    clock,
    store: lazyStore,
    codec: lazyCodec,
    collect(s) {
      const p = controller.pos;
      s.player.pos = [p.x, p.y, p.z];
      s.player.yaw = controller.yaw;
      s.playSeconds = clock.simTime;
      s.world.timeOfDay = paramsMod.params.v.timeOfDay;
      s.world.weather = worldState.weather;
      s.world.biome = worldState.biome;
      s.world.restoration = { ...worldState.restoration };
    },
    apply(s) {
      controller.god = false;
      controller.teleport(s.player.pos[0], s.player.pos[2]);
      controller.yaw = s.player.yaw;
      arm.setFree(false);
      arm.snap(controller.pos);
      paramsMod.setParam('timeOfDay', s.world.timeOfDay);
      worldState.weather = s.world.weather;
      Object.assign(worldState.restoration, s.world.restoration);
    },
  });
}
