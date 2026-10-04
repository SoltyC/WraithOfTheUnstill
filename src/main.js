// Entry point: WebGPU check → instrumentation → engine → world → actors → systems → warm-up → loop.
// URL parameters:
//   ?spot=<id>      apply a photo spot after loading
//   &capture=1      capture mode: frozen clock, no overlay, sets window.__wraith.captureReady
//   &overlay=1      open the dev overlay at start
//   &shots=<prefix> gate shots on the target GPU (core/shots.js); &bench=… benchmarks (core/bench.js)
//
// Boot is split by concern (keep each module focused; BRIEF §16):
//   boot/engine.js   the WebGPU engine and the render-size policy
//   boot/world.js    scene, camera, streaming, atmosphere, terrain, shadows, post, world meshes
//   boot/actors.js   player, camera rig, verbs, creatures, cinematic pieces, weather, writers
//   boot/game.js     the `game` facade (photo spots, dev tools, saves)
//   systems/*.js     the per-frame systems, registered below in their run order
// Everything shared travels on one context object `g`; systems read what they need from it once.

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

/** Frames for TAA to converge from a history reset before a capture (3 jitter cycles). */
const TAA_SETTLE = 24;

async function boot() {
  const qs = new URLSearchParams(location.search);
  // Gate shots on the target GPU (?shots=<spot prefix>): one page load per spot.
  const shotsMod = qs.get('shots') ? await import('./core/shots.js') : null;
  if (shotsMod && shotsMod.shotsRedirect(qs)) return;
  const capture = qs.get('capture') === '1' || !!shotsMod;
  const fill = document.getElementById('loading-fill');
  const progress = (f) => { if (fill) fill.style.width = Math.round(f * 100) + '%'; };
  window.__wraith = { ready: false, captureReady: false, capture };

  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('view'));
  const { createEngine } = await import('./boot/engine.js');
  const { engine, gpuTimer, setRenderScale } = await createEngine(canvas, qs);
  progress(0.2);

  /** The shared boot context. */
  const g = { qs, capture, progress, engine, setRenderScale };
  await (await import('./boot/world.js')).createWorld(g);
  progress(0.4);
  await (await import('./boot/actors.js')).createActors(g);

  const [loopMod, inputMod, paramsMod, systemsMod, spots, overlayMod] = await Promise.all([
    import('./core/loop.js'),
    import('./input/actions.js'),
    import('./core/params.js'),
    import('./core/systems.js'),
    import('./ui/photoSpots.js'),
    import('./ui/overlay/devOverlay.js'),
  ]);
  const loop = new loopMod.Loop(engine, g.scene);
  inputMod.attachInput(canvas);
  Object.assign(g, {
    loop, input: inputMod.input, Action: inputMod.Action, paramsMod, params: paramsMod.params,
    toggles: systemsMod.toggles, registerToggle: systemsMod.registerToggle, spots,
  });
  const game = g.game = await (await import('./boot/game.js')).createGame(g);

  // Per-frame systems, in run order: environment and streaming, the climb (it owns the Wraith
  // while gripping), the player, the verbs, the Wraith, the creatures and combat, the release
  // cinematic, then the world's rendering inputs (atmosphere … terrain state).
  const [sysWorld, sysClimb, playerMod, sysBending, sysWraith, sysCreatures, sysCinematic, sysEnv] = await Promise.all([
    import('./systems/world.js'), import('./systems/climb.js'), import('./character/playerSystem.js'),
    import('./systems/bending.js'), import('./systems/wraith.js'), import('./systems/creatures.js'),
    import('./systems/cinematic.js'), import('./systems/environment.js'),
  ]);
  sysWorld.addWorldSystems(g);
  sysClimb.addClimbSystem(g);
  loop.add(playerMod.createPlayerSystem({ controller: g.controller, arm: g.arm, ...g.content, material: g.streamer }));
  sysBending.addBendingSystem(g);
  sysWraith.addWraithSystem(g);
  sysCreatures.addCreatureSystems(g);
  sysCinematic.addCinematicSystem(g);
  await sysEnv.addEnvironmentSystems(g);

  const overlay = new overlayMod.DevOverlay(game);
  overlay.refreshToggles();
  loop.addLate(overlay);
  loop.addLate({ name: 'saves', update: () => { if (systemsMod.toggles.on.autosave && !capture) game.saves.tick(); } });
  const bench = qs.get('bench') ? await import('./core/bench.js') : null;
  if (bench) loop.addLate(bench.benchSystem);
  loop.addLate({ name: 'inputEnd', update: inputMod.endInputFrame });

  const { env, clock, atmosphere, post, scene, streamer, controller } = g;
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
    ready: true, game, shadows: g.shadows, terrainState: g.terrainState, wraithView: g.wraithView, frost: g.frost, shaped: g.shaped,
    combat: g.combat, warden: g.warden, climb: g.climb, env: env.env,
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
