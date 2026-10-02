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
  });
  await engine.initAsync({ jsPath: '', wasmPath: '' }, { jsPath: '', wasmPath: '' });
  progress(0.3);

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.03, 0.05, 1);
  scene.skipPointerMovePicking = true;
  scene.skipPointerDownPicking = true;
  scene.skipPointerUpPicking = true;
  scene.autoClearDepthAndStencil = true;
  const camera = new TargetCamera('camera', new Vector3(0, 10, -10), scene);
  camera.minZ = 0.1;
  camera.maxZ = 9000;

  const [{ createTestScene }, env, groundMod, ctl, armMod, playerMod, loopMod, inputMod, paramsMod, systemsMod, spots, overlayMod, streamingMod] = await Promise.all([
    import('./render/testScene.js'),
    import('./render/environment.js'),
    import('./terrain/testGround.js'),
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

  // ?grid=N: dev-only coarser test terrain (used by the heap profiler to reach steady state
  // quickly on software GPUs). Never set in captures.
  const content = await createTestScene(scene, { gridCells: qs.get('grid') ? Number(qs.get('grid')) : undefined });
  progress(0.65);

  // Collision samples the built mesh grid so feet sit exactly on the drawn surface.
  const ground = new groundMod.GridGround(content.terrainData.positions, content.terrainData.normals);
  const controller = new ctl.CapsuleController(ground);
  controller.teleport(0, 0);
  const arm = new armMod.SpringArmCamera(camera, ground);
  arm.snap(controller.pos);

  const loop = new loopMod.Loop(engine, scene);
  inputMod.attachInput(canvas);

  // Environment first, then player/camera.
  loop.add({ name: 'environment', update: () => env.updateEnvironment() });
  loop.add(playerMod.createPlayerSystem({ controller, arm, ...content }));

  // Render scale follows the Quality slider.
  let lastScale = -1;
  loop.add({ name: 'renderScale', update: () => {
    const s = paramsMod.params.v.renderScale;
    if (s !== lastScale) { lastScale = s; engine.setHardwareScalingLevel(1 / s); }
  } });

  // System toggles.
  const reg = systemsMod.registerToggle;
  // Changing the drawn mesh set invalidates a recorded snapshot.
  const meshToggle = (mesh) => (on) => { mesh.setEnabled(on); engine.snapshotRenderingReset(); };
  reg({ key: 'sky', label: 'sky', group: 'System', on: true, onChange: meshToggle(content.sky) });
  reg({ key: 'terrain', label: 'terrain', group: 'System', on: true, onChange: meshToggle(content.terrain) });
  reg({ key: 'player', label: 'player', group: 'System', on: true, onChange: meshToggle(content.capsule) });
  reg({ key: 'autosave', label: 'autosave', group: 'System', on: true });

  // Saves (lazy: the worker and IndexedDB open only when first used, so idle frames stay clean).
  const saves = await createSaves({ controller, arm, paramsMod, clock });

  const game = {
    engine, scene, loop, controller, arm, saves, streaming: streamingMod.streaming,
    teleport(x, z) { controller.god = false; controller.teleport(x, z); arm.setFree(false); arm.snap(controller.pos); },
    applySpot(spot) { spots.applySpot(spot, { controller, arm }); },
    setFreeCam(on) { arm.setFree(on); },
    setGod(on) { controller.god = on; if (!on) controller.teleport(controller.pos.x, controller.pos.z); },
  };

  const overlay = new overlayMod.DevOverlay(game);
  overlay.refreshToggles();
  loop.addLate(overlay);
  loop.addLate({ name: 'saves', update: () => { if (systemsMod.toggles.on.autosave && !capture) saves.tick(); } });
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
  // screen so all pipelines exist before the late-pipeline detector arms.
  await scene.whenReadyAsync();
  progress(0.85);
  loop.start();
  await waitFrames(engine, 4);
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
    ready: true, game, env: env.env, gpuStats, frameStats: loopMod.frameStats, params: paramsMod.params, clock,
    /** Capture hook: apply a spot, render settle frames, then resolve. */
    async prepareSpot(id, frames = 6) {
      game.applySpot(spots.findSpot(id));
      env.updateEnvironment();
      await waitFrames(engine, frames);
      return true;
    },
  });
  if (capture) { await waitFrames(engine, 6); window.__wraith.captureReady = true; }
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
