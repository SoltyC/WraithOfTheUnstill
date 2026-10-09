// The streamed world and everything drawn in it, created in draw order (the single rendering
// group draws in creation order): sky, clipmap terrain, shadows, the post chain, the mountain ring,
// spindrift, diamond dust, falling snow, rocks, the Wraith; then the terrain state the clipmap
// reads. Results go onto the shared context `g`.

/** @param {any} g  shared boot context: engine, qs, progress; receives the world objects */
export async function createWorld(g) {
  const { engine } = g;
  const [{ Scene }, { TargetCamera }, { Vector3 }, { Color4 }] = await Promise.all([
    import('@babylonjs/core/scene.js'),
    import('@babylonjs/core/Cameras/targetCamera.js'),
    import('@babylonjs/core/Maths/math.vector.js'),
    import('@babylonjs/core/Maths/math.color.js'),
  ]);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.03, 0.05, 1);
  scene.skipPointerMovePicking = true;
  scene.skipPointerDownPicking = true;
  scene.skipPointerUpPicking = true;
  scene.autoClearDepthAndStencil = true;
  const camera = new TargetCamera('camera', new Vector3(0, 10, -10), scene);
  // Scanned PBR materials (src/materials): decoded and uploaded while the world loads.
  const matLibP = import('../materials/library.js').then((m) => m.loadMaterialLibrary(engine, scene));
  camera.minZ = 0.1;
  camera.maxZ = 40000; // the mountain ring reaches 28 km from the centre

  const [{ createWorldScene }, { WorldStreamer }, { PatchGround }, env] = await Promise.all([
    import('../render/worldScene.js'),
    import('../world/streamer.js'),
    import('../world/patchGround.js'),
    import('../render/environment.js'),
  ]);
  g.progress(0.45);

  // World: the worker loads the bake; collision comes from worker-computed patches.
  const ground = new PatchGround();
  const streamer = new WorldStreamer(engine, ground);
  await streamer.init(import.meta.env.BASE_URL + 'world/');
  const ringMod = await import('../render/mountainRing.js');
  const ringData = ringMod.requestRing(streamer.manifest.seed); // builds on its own worker meanwhile
  const { createAtmosphere } = await import('../render/atmosphere.js');
  const atmosphere = createAtmosphere(scene, camera, streamer.buffers.biomeA);
  const content = createWorldScene(scene, streamer.buffers, atmosphere);
  const [{ createShadows }, { bindShadows }] = await Promise.all([import('../render/shadows.js'), import('../render/shadowBindings.js')]);
  const shadows = createShadows(scene, camera, { clipmap: content.clipmap, capsule: content.capsule });
  bindShadows(content.clipmap.material, shadows);
  bindShadows(content.capsuleMat, shadows);
  // Post chain (Phase 6, src/post/): the camera renders into an HDR target, post passes follow.
  const { createPostChain } = await import('../post/chain.js');
  const post = createPostChain(scene, camera, atmosphere, shadows);
  post.fog.keyDir = env.env.keyDir;
  const ring = ringMod.createMountainRing(scene, atmosphere, await ringData);
  // Ground blow (spindrift): created after the opaque meshes, drawn in the transparent pass.
  const { createSpindrift } = await import('../render/spindrift.js');
  const spindrift = createSpindrift(scene, content.clipmap, atmosphere);
  bindShadows(spindrift.material, shadows);
  // Diamond dust: the stilled air's motionless ice grains (drawn after the spindrift).
  const { createDiamondDust } = await import('../render/diamondDust.js');
  const dust = createDiamondDust(scene, content.clipmap, atmosphere);
  bindShadows(dust.material, shadows);
  // Falling snow (weather): snowfall and blizzard flakes around the camera.
  const { createSnowfall } = await import('../render/snowfall.js');
  const snowfall = createSnowfall(scene, content.clipmap, atmosphere);
  bindShadows(snowfall.material, shadows);
  // Rock outcrops with accumulation (frost): cast and receive shadows.
  const { createRocks } = await import('../render/rocks.js');
  const rocks = createRocks(scene, content.clipmap, atmosphere);
  bindShadows(rocks.material, shadows);
  // Rocks shadow the near and middle cascades only (beyond ~800 m they are sub-texel).
  for (const m of rocks.meshes) shadows.addCaster(m, rocks.makeShadowMaterial, 2);
  rocks.freeze();
  // The Wraith (Phase 3): procedural gait, cloth robe; replaces the Phase 0 capsule's look.
  const { createWraithView } = await import('../render/wraith.js');
  // The Wraith's feet and hem stand on built floors too (solids arrive with the architecture).
  const wraithGround = (await import('../world/solids.js')).flooredGround(ground);
  const wraithView = createWraithView(scene, atmosphere, ground, content.clipmap, { simGround: wraithGround });
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
  const { createTerrainState } = await import('../terrain/state/terrainState.js');
  const terrainState = createTerrainState(engine, { surface: streamer.buffers.surface, base: import.meta.env.BASE_URL + 'world/' });
  content.clipmap.bindState(terrainState);
  rocks.bindState(terrainState);

  const matLib = await matLibP;
  Object.assign(g, { scene, camera, env, ground, streamer, atmosphere, content, bindShadows, shadows, post, ring, spindrift, dust, snowfall, rocks, wraithView, wraithGround, terrainState, matLib });
}
