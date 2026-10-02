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
  const capture = qs.get('capture') === '1';
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
  const atmosphere = createAtmosphere(scene, camera);
  const content = createWorldScene(scene, streamer.buffers, atmosphere);
  const [{ createShadows }, { bindShadows }] = await Promise.all([import('./render/shadows.js'), import('./render/shadowBindings.js')]);
  const shadows = createShadows(scene, camera, { clipmap: content.clipmap, capsule: content.capsule });
  bindShadows(content.clipmap.material, shadows);
  bindShadows(content.capsuleMat, shadows);
  const ring = ringMod.createMountainRing(scene, atmosphere, await ringData);
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
  loop.add(playerMod.createPlayerSystem({ controller, arm, ...content }));
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
  // Debug writer (Phase 1 only): stamps a trail behind the player while the toggle is on.
  let lastStampX = 1e9, lastStampZ = 1e9;
  loop.add({ name: 'terrainState', update: () => {
    const tsFollow = terrainState.followOverride;
    terrainState.px = tsFollow ? terrainState.followX : controller.pos.x;
    terrainState.pz = tsFollow ? terrainState.followZ : controller.pos.z;
    terrainState.time = clock.simTime;
    if (systemsMod.toggles.on.stampTrail) {
      const dx = controller.pos.x - lastStampX, dz = controller.pos.z - lastStampZ;
      if (dx * dx + dz * dz > 0.09) {
        terrainState.bx = controller.pos.x; terrainState.bz = controller.pos.z; terrainState.br = 0.45; terrainState.bd = 0.12;
        terrainState.stamp();
        lastStampX = controller.pos.x; lastStampZ = controller.pos.z;
      }
    }
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
  reg({ key: 'player', label: 'player', group: 'System', on: true, onChange: meshToggle(content.capsule) });
  reg({ key: 'shadows', label: 'shadows', group: 'System', on: true, onChange: (on) => { shadows.strength = on ? 1 : 0; } });
  reg({ key: 'autosave', label: 'autosave', group: 'System', on: true });
  reg({ key: 'stampTrail', label: 'stamp trail (debug writer)', group: 'Terrain', on: false });

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
    applySpot(spot) { spots.applySpot(spot, { controller, arm, teleport: requestTeleport }); },
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
    ready: true, game, shadows, terrainState, env: env.env, gpuStats, gpuTimer, frameStats: loopMod.frameStats, params: paramsMod.params, clock,
    /** Capture hook: apply a spot, render settle frames, then resolve. */
    async prepareSpot(id, frames = 6) {
      game.applySpot(spots.findSpot(id));
      env.updateEnvironment();
      await waitUntil(engine, () => game.worldSettled());
      await waitFrames(engine, frames);
      return true;
    },
  });
  if (capture) {
    await waitUntil(engine, () => game.worldSettled());
    await waitFrames(engine, 6);
    window.__wraith.captureReady = true;
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
