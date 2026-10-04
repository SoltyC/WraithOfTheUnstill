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
  boot().catch(async (e) => {
    console.error(e);
    window.__wraith = { ...(window.__wraith || {}), error: String(e && e.stack || e) };
    const qs = new URLSearchParams(location.search);
    if (qs.get('shots')) (await import('./core/shots.js')).shotsBootFailed(qs, e);
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
    // No MSAA: the post chain's TAA anti-aliases (and resolves shading aliasing MSAA cannot).
    antialias: false,
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
  // Post chain (Phase 6, src/post/): the camera renders into an HDR target, post passes follow.
  const { createPostChain } = await import('./post/chain.js');
  const post = createPostChain(scene, camera, atmosphere, shadows);
  post.fog.keyDir = env.env.keyDir;
  const ring = ringMod.createMountainRing(scene, atmosphere, await ringData);
  // Ground blow (spindrift): created after the opaque meshes, drawn in the transparent pass.
  const { createSpindrift } = await import('./render/spindrift.js');
  const spindrift = createSpindrift(scene, content.clipmap, atmosphere);
  bindShadows(spindrift.material, shadows);
  // Diamond dust: the stilled air's motionless ice grains (drawn after the spindrift).
  const { createDiamondDust } = await import('./render/diamondDust.js');
  const dust = createDiamondDust(scene, content.clipmap, atmosphere);
  bindShadows(dust.material, shadows);
  // Falling snow (weather): snowfall and blizzard flakes around the camera.
  const { createSnowfall } = await import('./render/snowfall.js');
  const snowfall = createSnowfall(scene, content.clipmap, atmosphere);
  bindShadows(snowfall.material, shadows);
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
        post.post.resetHistory = true; atmosphere.snapExposure = true;
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
    if (climb.grabbed) {
      // A hand bites into the crust: a puff of snow knocked loose, a small jolt.
      sfx.x = climb.gx; sfx.y = climb.gy; sfx.z = climb.gz; sfx.gain = 0.8; sfx.play(SFX.CRUNCH);
      for (let q = 0; q < 10; q++) {
        const a = q * 0.618 * Math.PI * 2;
        wraithView.ex = climb.gx; wraithView.ey = climb.gy; wraithView.ez = climb.gz;
        wraithView.evx = -climb.fx * 0.8 + Math.cos(a) * 0.5; wraithView.evy = -0.4 + (q % 3) * 0.3; wraithView.evz = -climb.fz * 0.8 + Math.sin(a) * 0.5;
        wraithView.esize = 0.03 + 0.015 * (q % 3); wraithView.emit();
      }
      arm.shake += 0.0035;
    }
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
    stepKnock(clock.dt);
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
  /** A cast's flash at the hand (0..1, eased out in the combat system). */
  let castFlash = 0;
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
  // Sound (audio/sfx.js): live play only (captures and benches stay silent); it starts on the
  // first key or pointer press.
  const { createSfx, SFX } = await import('./audio/sfx.js');
  const sfx = createSfx();
  sfx.enabled = !capture && !qs.get('bench');
  const unlockAudio = () => sfx.unlock();
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
  const { createClimb } = await import('./game/warden/climb.js');
  const climb = createClimb({ warden });
  arm.occluder = warden;
  // Knockdown: the release's shockwave throws the Wraith onto its back (character/knockdown.js).
  const { createKnockdown } = await import('./character/knockdown.js');
  const BRUSH_PLOUGH = (await import('./shaders/terrainState.wgsl.js')).BRUSH.PLOUGH;
  const knock = createKnockdown(ground);
  let knockHitT = -1, prevShockR = -1;
  /** Shockwave → knockdown; while down the knockdown owns the Wraith's position. */
  function stepKnock(dt) {
    const p = controller.pos;
    if (warden.active && warden.shockR > 0 && !knock.active && !climb.climbing && combat.dying === 0 && !controller.god) {
      const dx = p.x - warden.shockX, dz = p.z - warden.shockZ, d = Math.hypot(dx, dz);
      if (prevShockR >= 0 && prevShockR < d && warden.shockR >= d && d < 70) {
        knock.hx = p.x; knock.hy = p.y; knock.hz = p.z; knock.hdx = dx / (d || 1); knock.hdz = dz / (d || 1);
        knock.hit(); knockHitT = warden.t;
        sfx.x = p.x; sfx.y = p.y + 1; sfx.z = p.z; sfx.gain = 1.6; sfx.play(SFX.RUMBLE); sfx.play(SFX.WHOOSH);
        arm.shake += 0.07; if (!capture) clock.hitStop = Math.max(clock.hitStop, 0.09);
      }
    }
    prevShockR = warden.active ? warden.shockR : -1;
    const was = knock.active;
    knock.dt = dt; knock.hold = releaseCam.active || releaseCam.hold; knock.update();
    if (knock.active) {
      controller.hold = true; controller.grounded = false;
      p.x = knock.footX; p.y = knock.footY; p.z = knock.footZ;
      controller.vel.x = knock.vx; controller.vel.y = knock.vy; controller.vel.z = knock.vz;
      if (knock.landed) {
        sfx.x = knock.x; sfx.y = knock.y; sfx.z = knock.z; sfx.gain = 1.2; sfx.play(SFX.THUD); sfx.play(SFX.CRUNCH);
        // A thump in the snow: powder from under it.
        for (let q = 0; q < 26; q++) {
          const a = q * 0.2417 * Math.PI * 2;
          wraithView.ex = knock.x + Math.cos(a) * 0.3; wraithView.ey = knock.y - 0.1; wraithView.ez = knock.z + Math.sin(a) * 0.3;
          wraithView.evx = Math.cos(a) * 2.2 + knock.vx * 0.3; wraithView.evy = 1 + (q % 5) * 0.4; wraithView.evz = Math.sin(a) * 2.2 + knock.vz * 0.3;
          wraithView.esize = 0.08 + 0.02 * (q % 4); wraithView.emit();
        }
        arm.shake += 0.02;
      }
      if (knock.sliding) {
        // Its back ploughs a furrow through the snow.
        const sp = Math.hypot(knock.vx, knock.vz) || 1;
        terrainState.bx = knock.x; terrainState.bz = knock.z; terrainState.bdx = knock.vx / sp; terrainState.bdz = knock.vz / sp;
        terrainState.bl = 0.3; terrainState.bw = 0.42; terrainState.bd = 0.12; terrainState.bc = 0.6;
        terrainState.bk = BRUSH_PLOUGH; terrainState.bwet = 0; terrainState.bbias = 0; terrainState.bberm = 0.8;
        terrainState.stamp();
      }
    } else if (was) {
      // On its feet again, facing back toward where it was thrown from.
      controller.hold = false; controller.grounded = true;
      controller.vel.x = 0; controller.vel.y = 0; controller.vel.z = 0;
      controller.yaw = Math.atan2(-knock.dx, -knock.dz);
    }
  }
  /** The Wraith's pose override from the climb or the knockdown (shared with the captures). */
  function feedWraithOverride(w) {
    if (knock.active) {
      w.climbing = true; w.knocked = true; w.climbBlend = 1; w.gripOn = false;
      w.cpx = knock.x; w.cpy = knock.y; w.cpz = knock.z; w.climbPhase = clock.simTime * 6;
      w.cr[0] = knock.rx; w.cr[1] = knock.ry; w.cr[2] = knock.rz; w.cu[0] = knock.ux; w.cu[1] = knock.uy; w.cu[2] = knock.uz;
      w.cf[0] = knock.fx; w.cf[1] = knock.fy; w.cf[2] = knock.fz;
      return;
    }
    w.knocked = false;
    w.climbing = climb.climbing; w.climbBlend = climb.blend; w.gripOn = climb.climbing;
    if (climb.climbing) {
      for (let i = 0; i < 12; i++) w.grip[i] = climb.holds[i];
      w.feetFree = climb.feetFree;
      w.cpx = climb.x; w.cpy = climb.y; w.cpz = climb.z; w.climbPhase = climb.phase;
      w.cr[0] = climb.rx; w.cr[1] = climb.ry; w.cr[2] = climb.rz; w.cu[0] = climb.ux; w.cu[1] = climb.uy; w.cu[2] = climb.uz;
      w.cf[0] = climb.fx; w.cf[1] = climb.fy; w.cf[2] = climb.fz;
    }
  }
  climb.spend = (c) => combat.spend(c);
  // Combat (Phase 5): focus, hits and reactions, lock-on, dodge, wounds and death.
  const { createCombat, combatTuning } = await import('./game/combat/combat.js');
  const combat = createCombat({ shaped, frost, warden, controller, ts: terrainState, clock, teleport: (x, z) => requestTeleport(x, z) });
  combat.sfx = sfx;
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
      if (inputState.released[Act.Primary] && primaryHeld < HOLD && combat.spend(combatTuning.costSweep)) { frost.castSweep = true; castFlash = 1; arm.kick += 0.012; sfx.x = controller.pos.x; sfx.y = controller.pos.y + 1; sfx.z = controller.pos.z; sfx.gain = 0.9; sfx.play(SFX.WHOOSH); }
      if (!inputState.down[Act.Primary]) primaryHeld = 0;
    } else primaryHeld = 0;
    frost.ribbonHeld = able && primaryHeld >= HOLD && combat.focus > 1;
    if (able && inputState.pressed[Act.Heavy] && combat.spend(combatTuning.costCrystal)) { frost.castCrystal = true; arm.shake += 0.01; castFlash = 1; arm.kick += 0.02; }
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
    w.windStrength = paramsMod.params.v.windStrength * weather.wind * (0.04 + 0.96 * restoration.value) + 2.2 * warden.gust;
    w.surf = Math.max(controller.surf.blend, controller.dodgeT > 0 ? 0.85 : 0); w.surfLean = controller.surf.lean;
    feedWraithOverride(w);
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
      if (game.worldSettled() && game.pendingTrail === null) {
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
          knockHitT = -1; prevShockR = -1;
          feedReleaseCam(rc); rc.start();
          const n = Math.round(spec.release * 60);
          for (let k = 0; k < n; k++) {
            const t = clock.simTime - (n - k) / 60;
            wraithView.time = t;
            warden.px = controller.pos.x; warden.pz = controller.pos.z;
            warden.dt = 1 / 60; warden.update();
            rc.hold = true; stepKnock(1 / 60);
            const p = controller.pos;
            w.bx = p.x; w.by = p.y; w.bz = p.z; w.vx = controller.vel.x; w.vz = controller.vel.z; w.yaw = controller.yaw;
            w.grounded = !knock.active; w.dt = 1 / 60; w.time = t; w.surf = 0; w.cast = 0;
            feedWraithOverride(w); w.climbPhase = t * 6;
            wraithView.update();
            feedReleaseCam(rc); rc.dt = 1 / 60; rc.skip = false; rc.update();
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
            w.time = clock.simTime - (hangN - k) / 60; feedWraithOverride(w);
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
    arm.shake += combat.shake + warden.shake; arm.kick += combat.kick;
    castFlash *= Math.exp(-clock.realDt * 6);
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
    wraithView.handLight = (0.12 + 0.75 * combat.focus / combatTuning.focus + 1.2 * castFlash) * Math.max(deathFade, reform);
    wraithView.frost = Math.min(1, w * 1.15);
    wraithView.wraith.collapse = dying > 0 ? (dying < combatTuning.deathTime ? Math.min(1, dying / 0.9) : 1 - reform) : 0;
    vignette.style.opacity = String(Math.max(0, (w - 0.65) / 0.35).toFixed(3));
  } });
  // The release cinematic: when the last joint breaks the camera takes a slow orbit around the
  // Warden as it exhales and lies down (letterboxed, skippable).
  const { createReleaseCam } = await import('./camera/releaseCam.js');
  const releaseCam = createReleaseCam(ground);
  const bars = [document.createElement('div'), document.createElement('div')];
  bars[0].className = 'letterbox letterbox-top'; bars[1].className = 'letterbox letterbox-bottom';
  document.body.append(bars[0], bars[1]);
  let barsShown = -1;
  // The slam's flash: a brief white-out (DOM overlay, eased out).
  const flashEl = document.createElement('div'); flashEl.className = 'release-flash'; document.body.append(flashEl);
  let flash = 0, flashShown = -1, releaseWasActive = false;
  /** Release camera inputs from the Warden and the Wraith. */
  function feedReleaseCam(rc) {
    const b = warden.body;
    rc.wt = warden.state === wardenMod.W.RESTED ? 99 : warden.t;
    rc.tx = b.sx[3]; rc.ty = b.sy[3] + 2; rc.tz = b.sz[3];
    rc.hx = b.hx; rc.hy = b.hy; rc.hz = b.hz;
    if (knock.active) { rc.px = knock.x; rc.py = knock.y; rc.pz = knock.z; }
    else { rc.px = controller.pos.x; rc.py = controller.pos.y + 0.9; rc.pz = controller.pos.z; }
    rc.hitT = knockHitT;
  }
  loop.add({ name: 'releaseCam', update: () => {
    const rc = releaseCam;
    rc.dt = clock.realDt;
    const releasing = warden.active && warden.state === wardenMod.W.RELEASE;
    if (releasing) {
      feedReleaseCam(rc);
      if (!rc.played && !rc.active && !capture) { knockHitT = -1; rc.start(); }
      if (warden.slam && !capture) { clock.hitStop = Math.max(clock.hitStop, 0.22); flash = 0.85; }
    } else if (!rc.active && warden.state !== wardenMod.W.RESTED) rc.played = false;
    const was = rc.active;
    rc.skip = rc.active && (inputState.pressed[Act.Jump] || inputState.pressed[Act.Interact]);
    if (rc.skip || rc.active !== releaseWasActive) post.post.resetHistory = true; // camera cuts
    releaseWasActive = rc.active;
    if (rc.skip) {
      // Skipped: straight to the end — lain down in the land, the Wraith on its feet.
      warden.finishRelease(); knock.reset(); stepKnock(0);
    }
    if (rc.active) feedReleaseCam(rc);
    rc.update();
    if (rc.active) arm.setPose(rc.x, rc.y, rc.z, rc.yaw, rc.pitch, rc.fov);
    // The cinematic's restrained depth of field: focus on the Warden, the far steppe softens.
    const taa = post.taa;
    const cine = rc.active || (rc.hold && rc.bars > 0.5); // held cinematic frames (captures) too
    taa.dofOn = cine;
    if (cine) {
      const dx = rc.tx - rc.x, dy = rc.ty - rc.y, dz = rc.tz - rc.z;
      taa.focus = Math.sqrt(dx * dx + dy * dy + dz * dz); taa.focusRange = Math.max(18, taa.focus * 0.55);
    }
    else if (was) {
      // Back to the Wraith, looking the way the camera last looked.
      arm.setFree(false); arm.yaw = rc.yaw; arm.pitch = 0.2; arm.snap(controller.pos);
    }
    const shown = Math.round(rc.bars * 100);
    if (shown !== barsShown) { barsShown = shown; bars[0].style.transform = bars[1].style.transform = 'scaleY(' + (rc.bars * rc.bars * (3 - 2 * rc.bars)).toFixed(3) + ')'; }
    flash *= Math.exp(-clock.realDt * 4.5);
    const fs = Math.round(flash * 100);
    if (fs !== flashShown) { flashShown = fs; flashEl.style.opacity = (fs / 100).toFixed(2); }
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
  loop.add(post);
  loop.add({ name: 'rocks', update: () => { rocks.camX = camera.position.x; rocks.camZ = camera.position.z; rocks.update(); } });
  // Restoration (BRIEF §2.4): the frost steppe is stilled until its Warden is released — still
  // air, no spindrift, a flat, cool, desaturated grade; restored brings back wind, spindrift and
  // warmth. `restore` eases toward the state (the Warden's release drives it directly).
  restoration.value = ws.restoration.frost === 'restored' ? 1 : 0;
  // Weather (BRIEF §5.6, world/weather.js): the frost state machine, driven by restoration and
  // time (or forced by the overlay / a photo spot); feeds the sky, light, fog, wind and snow.
  const { createWeather } = await import('./world/weather.js');
  const weather = createWeather();
  let fogGroundY = controller.pos.y, snowWX = 1, snowWZ = 0;
  loop.add({ name: 'weather', update: () => {
    weather.restored = ws.restoration.frost === 'restored' ? 1 : 0;
    weather.override = ws.weatherOverride;
    weather.dt = clock.dt;
    weather.update();
    ws.weather = weather.state;
    atmosphere.cover = weather.cover; atmosphere.snow = weather.snow;
    // The fog's base follows the ground under the camera, eased (no jumps on steps or teleports
    // beyond what the fog itself would show).
    ground.qx = camera.position.x; ground.qz = camera.position.z; ground.sample();
    fogGroundY += (ground.h - fogGroundY) * (pendingTp.active ? 1 : 1 - Math.exp(-clock.realDt * 0.5));
    const pf = post.fog;
    pf.weather = weather; pf.groundY = fogGroundY; pf.dt = clock.dt;
  } });
  // Grades (post/grades.js): the LUT is rebuilt only when the blended grade moves.
  const { blendGrade } = await import('./post/grades.js');
  let lastGradeR = -1, lastGradeS = -1;
  loop.add({ name: 'restoration', update: () => {
    const target = ws.restoration.frost === 'restored' ? 1 : 0;
    if (warden.active && warden.state === wardenMod.W.RELEASE) restoration.value = Math.max(restoration.value, warden.restore);
    else restoration.value += (target - restoration.value) * (1 - Math.exp(-clock.realDt * 1.5));
    if (warden.restore >= 1 && ws.restoration.frost !== 'restored') ws.restoration.frost = 'restored';
    const r = restoration.value, gs = paramsMod.params.v.gradeStrength;
    if (Math.abs(r - lastGradeR) > 0.002 || gs !== lastGradeS) {
      lastGradeR = r; lastGradeS = gs;
      blendGrade(post.post.grade, r, gs);
      post.post.gradeDirty = true;
    }
  } });
  loop.add({ name: 'spindrift', update: () => {
    const w = paramsMod.params.v.windStrength * weather.wind * (0.04 + 0.96 * restoration.value) + 1.2 * warden.gust;
    spindrift.time = clock.simTime;
    // Ground blow thickens with the weather (a blizzard is mostly snow on the move).
    spindrift.strength = Math.min(1.5, Math.max(0, (w - 0.15) / 0.5) * (1 + 0.6 * weather.snow * weather.gust));
    spindrift.drift.z = 0.4 + w;
    spindrift.update();
    // Stilled air holds its ice grains motionless; as it is restored they drift off and thin.
    const r = restoration.value;
    dust.moving += clock.dt * (r * (0.6 + 0.4 * paramsMod.params.v.windStrength) + 2.5 * warden.gust);
    dust.density = Math.max(0, 1 - r * 1.25);
    dust.time = clock.simTime;
    dust.update();
    // Falling snow: density from the weather, carried by the prevailing wind (eased direction).
    streamer.mqx = camera.position.x; streamer.mqz = camera.position.z; streamer.sampleWind();
    const ke = 1 - Math.exp(-clock.dt * 0.3);
    snowWX += (streamer.windX - snowWX) * ke; snowWZ += (streamer.windZ - snowWZ) * ke;
    const wl = Math.sqrt(snowWX * snowWX + snowWZ * snowWZ) || 1;
    snowfall.windX = snowWX / wl; snowfall.windZ = snowWZ / wl;
    snowfall.windSpeed = 1 + 7 * Math.pow(Math.max(w, 0), 1.5);
    snowfall.fallSpeed = 1.1 + 0.9 * weather.gust;
    snowfall.density = weather.snow; snowfall.dt = clock.dt;
    snowfall.update();
    // Sound: listener at the camera; the wind bed follows the wind (silent while stilled); the
    // Ribbon hisses while it flows; a formation chimes where it rises.
    const cp = camera.position;
    sfx.lx = cp.x; sfx.ly = cp.y; sfx.lz = cp.z; sfx.rx = Math.cos(arm.yaw); sfx.rz = -Math.sin(arm.yaw);
    sfx.wind = Math.min(1, w / 1.1); sfx.hiss = Math.min(1, frost.ribbonStrength); sfx.time = clock.simTime;
    if (frost.crystalEvent) { sfx.x = frost.crystalX; sfx.y = controller.pos.y + 0.5; sfx.z = frost.crystalZ; sfx.gain = 1.1; sfx.play(SFX.CHIME); }
    sfx.update();
  } });
  // Writers: the player's footprints; scripted trails from photo spots once the world is settled.
  const { createFootprints } = await import('./terrain/state/footprints.js');
  const footprints = createFootprints(terrainState, { get v() { return paramsMod.params.v.deformDepth; } });
  loop.add({ name: 'terrainState', update: () => {
    const tsFollow = terrainState.followOverride;
    terrainState.px = tsFollow ? terrainState.followX : controller.pos.x;
    terrainState.pz = tsFollow ? terrainState.followZ : controller.pos.z;
    terrainState.time = clock.simTime;
    // Falling snow fills depressions (BRIEF §4.3: weather writes too): refill runs faster under it.
    terrainState.healScale = paramsMod.params.v.refillRate * (1 + 5 * weather.snow);
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
  reg({ key: 'snowfall', label: 'falling snow', group: 'System', on: true, onChange: meshToggle(snowfall.mesh) });
  reg({ key: 'rocks', label: 'rock outcrops', group: 'System', on: true, onChange: (on) => { for (const m of rocks.meshes) m.setEnabled(on); engine.snapshotRenderingReset(); } });
  reg({ key: 'player', label: 'player (the Wraith)', group: 'System', on: true, onChange: (on) => { wraithView.setEnabled(on); engine.snapshotRenderingReset(); } });
  // Shadows fade under a closed cloud deck (what little sun remains is diffused by it).
  let shadowsOn = true;
  reg({ key: 'shadows', label: 'shadows', group: 'System', on: true, onChange: (on) => { shadowsOn = on; } });
  loop.add({ name: 'shadowStrength', update: () => { shadows.strength = shadowsOn ? 1 - 0.85 * atmosphere.deck : 0; } });
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
    /** Dev: break every joint of the active Warden at once (plays the release). */
    releaseWarden() {
      if (!warden.active) return;
      for (let k = 0; k < wardenMod.JOINTS; k++) { warden.freezeJoint(k); warden.strikeJoint(k); }
      combat.breakJoint();
    },
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
      weather.snap = true; post.post.resetHistory = true;
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
  if (capture) { clock.frozen = true; atmosphere.alwaysSnap = true; }
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
      post.post.resetHistory = true; // TAA converges from here, the same way every load
      await waitFrames(engine, frames + TAA_SETTLE);
      return true;
    },
  });
  if (capture) {
    await waitUntil(engine, () => game.worldSettled() && game.stateSettled());
    post.post.resetHistory = true;
    await waitFrames(engine, 6 + TAA_SETTLE);
    window.__wraith.captureReady = true;
    if (shotsMod) shotsMod.shotsTake(engine, qs);
  }
  if (bench) bench.runBench(game, qs);
}

/** Frames for TAA to converge from a history reset before a capture (3 jitter cycles). */
const TAA_SETTLE = 24;

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
