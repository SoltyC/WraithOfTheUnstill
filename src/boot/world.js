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
  // The meadow village's layout and its ground mask (bake-world/villageMask.mjs: RGBA8, 0.5 m, box in village.json `mask`).
  const worldBase = import.meta.env.BASE_URL + 'world/';
  const village = g.village = await fetch(worldBase + 'village.json').then((r) => r.json()).catch(() => null);
  let villageMask = null;
  if (village && village.mask) {
    const buf = await fetch(worldBase + 'village_mask.rgba8').then((r) => r.arrayBuffer()).catch(() => null);
    if (buf && buf.byteLength === village.mask.size * village.mask.size * 4) villageMask = { ...village.mask, data: new Uint8Array(buf) };
  }
  const atmosphere = createAtmosphere(scene, camera, streamer.buffers.biomeA, villageMask);
  const matLib = await matLibP;
  const content = createWorldScene(scene, streamer.buffers, atmosphere, matLib);
  const { createRockMaskTexture }=await import('../render/rockMask.js');
  content.clipmap.rockMask=createRockMaskTexture(scene,streamer);
  content.clipmap.material.setTexture('rockMask',content.clipmap.rockMask);
  const [{ createShadows }, { bindShadows }] = await Promise.all([import('../render/shadows.js'), import('../render/shadowBindings.js')]);
  const shadows = createShadows(scene, camera, { clipmap: content.clipmap, capsule: content.capsule });
  bindShadows(content.clipmap.material, shadows);
  bindShadows(content.capsuleMat, shadows);
  // Post chain (Phase 6, src/post/): the camera renders into an HDR target, post passes follow.
  const { createPostChain } = await import('../post/chain.js');
  const post = createPostChain(scene, camera, atmosphere, shadows, content.clipmap.buffers.surface, content.clipmap.buffers.wind);
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
  // Rain (Phase 8 M11): streaks and splashes, the same stateless column; drawn after the snow.
  const { createRain } = await import('../render/rain.js');
  const rain = createRain(scene, content.clipmap, atmosphere);
  bindShadows(rain.material, shadows);
  bindShadows(rain.splashMaterial, shadows);
  // The lightning bolt (ribbons, additive): after the rain.
  const bolt = (await import('../render/lightningBolt.js')).createLightningBolt(scene);
  // Fire: the camp's hearth and the braziers (flames, embers, smoke), after the falling snow.
  const fire = (await import('../render/fire.js')).createFire(scene, atmosphere);
  // The Gale's wind made visible (Phase 8 M6): gust lines, vortex debris, updraft columns.
  const galeFx = (await import('../render/galeFx.js')).createGaleFx(scene, atmosphere);
  // The Chanters' pollen curtains (Phase 8 M8): gold motes and haze hanging in the dead air.
  const pollenFx = (await import('../render/pollenFx.js')).createPollenFx(scene, atmosphere);
  // Rock outcrops with accumulation (frost): cast and receive shadows; scanned rock surfaces.
  const { createRocks } = await import('../render/rocks.js');
  const rocks = createRocks(scene, content.clipmap, atmosphere, matLib);
  // No trees or rocks on the village's plots (+2 m) or roads (half width + 2 m).
  const { villageKeepout } = await import('../world/villageKeepout.js');
  // …nor on the summit (the manor and its forecourt) or the stair (its corridor + 3 m).
  const pois = await fetch(import.meta.env.BASE_URL + 'world/pois.json').then((r) => r.json());
  const manor = pois.pois.find((p) => p.id === 'manor'), stairR = pois.routes.find((r) => r.id === 'manor-stair');
  const vk = village ? villageKeepout(village) : null;
  // …nor on Dunn's threshing floor or Ketil's lantern post (data/restored.json).
  const rw = (await import('../../data/restored.json')).default, floorAt = rw.chaff.pos, postAt = rw.lantern.pos;
  const keepOut = (x, z, extra = 0) => {
    if (vk && vk(x, z, extra)) return true;
    { const dx = x - floorAt[0], dz = z - floorAt[1], r = 9 + extra; if (dx * dx + dz * dz < r * r) return true; }
    { const dx = x - postAt[0], dz = z - postAt[1], r = 4 + extra; if (dx * dx + dz * dz < r * r) return true; }
    if (manor) { const dx = (x - manor.pos[0]) / 85, dz = (z - manor.pos[1]) / 72; if (dx * dx + dz * dz < 1) return true; }
    if (stairR) { const P = stairR.points, r = 12 + extra; for (let k = 1; k < P.length; k++) { // 12 m to each side of the route
      const ax = P[k - 1][0], az = P[k - 1][1], bx = P[k][0] - ax, bz = P[k][1] - az, l2 = bx * bx + bz * bz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / l2)), ex = x - ax - bx * t, ez = z - az - bz * t;
      if (ex * ex + ez * ez < r * r) return true; } }
    return false;
  };
  if (keepOut) rocks.setKeepOut(keepOut);
  bindShadows(rocks.material, shadows);
  // Rocks shadow the near and middle cascades only (beyond ~800 m they are sub-texel).
  // Each rock tier casts only into the cascades its distances fall in (near < 140 m: 0–1; outcrops
  // < 420 m: 1–2; far: 2) — casters are not culled per cascade, every listed one runs its vertices.
  shadows.addCaster(rocks.meshes[0], rocks.makeShadowMaterial, 1, 0);
  shadows.addCaster(rocks.meshes[1], rocks.makeShadowMaterial, 2, 2);
  shadows.addCaster(rocks.meshes[2], rocks.makeShadowMaterial, 2, 1);
  rocks.freeze();
  // The ravines' cliff walls (Phase 9 D7b): sandstone faces along the canyon risers, built off the
  // main thread (world/canyon.worker.js) while the rest loads.
  const canyon = (await import('../render/canyonWalls.js')).createCanyonWalls(scene, atmosphere, matLib, shadows, bindShadows);
  canyon.freeze();
  // The wind field (Phase 8 M1): one function of place and time shared by the CPU and the GPU.
  const wind = (await import('../world/wind.js')).createWind();
  // Grass (Phase 8): GPU-built blades over the meadow, receiving the shadow cascades.
  const grass = (await import('../render/grass.js')).createGrass(scene, content.clipmap, atmosphere, wind);
  for (const m of grass.materials) bindShadows(m, shadows);
  grass.freeze();
  // Ground cover (Phase 8): leaf drifts, ferns, flowers, clover — built on the GPU like the grass.
  const groundCover = (await import('../render/groundcover.js')).createGroundCover(scene, content.clipmap, atmosphere, grass.push, wind);
  for (const m of groundCover.materials) bindShadows(m, shadows);
  groundCover.freeze();
  // Motes and pollen in the sunlight (Phase 8, M4b): glitter in the shafts under the canopy.
  const motes = (await import('../render/motes.js')).createMotes(scene, content.clipmap, atmosphere, wind);
  bindShadows(motes.material, shadows);
  motes.freeze();
  // Trees (Phase 8): grown variants in groves; near ones shadow the near cascades, far the far.
  const trees = (await import('../render/trees.js')).createTrees(scene, content.clipmap, atmosphere, matLib, streamer, wind);
  for (const m of trees.materials) bindShadows(m, shadows);
  for (const [m, c0, c1] of trees.casters) shadows.addCaster(m, trees.makeShadowMaterial, c1, c0);
  if (keepOut) trees.setKeepOut(keepOut);
  trees.freeze();
  // Water (Phase 8): the bake's unfrozen lakes, flat at their levels; absorb + surface passes, the
  // post chain's SSR reflects on them (waves and ripples shared through the wind block and a buffer).
  const water = await (await import('../render/water.js')).createWater(scene, content.clipmap, atmosphere, wind, streamer, post.post.waterRipples, import.meta.env.BASE_URL + 'world/', ground);
  bindShadows(water.materials[1], shadows); // the surface pass (the absorb pass reads no shadows)
  water.freeze();
  trees.setWater((x, z) => (water.wetAt(x, z) ? 1e9 : NaN)); // no trees in lakes, rivers or on their banks
  post.post.onParams((P) => { const b = wind.block; for (let k = 0; k < 8; k++) P[120 + k] = b[k]; });
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
  grass.bindState(terrainState);
  const sandDust = (await import('../render/sandDust.js')).createSandDust(scene, content.clipmap, atmosphere, wind, terrainState);
  bindShadows(sandDust.material, shadows);
  terrainState.brushFx = sandDust.bursts;

  await canyon.whenReady;
  // Light shafts in the slots (D7b): volumetric slices across them, lit where the sun gets in.
  const slotShafts = (await import('../render/slotShafts.js')).createSlotShafts(scene, atmosphere, shadows, bindShadows, canyon.spines, canyon.chunks);
  Object.assign(g, { scene, camera, env, ground, streamer, atmosphere, content, bindShadows, shadows, post, ring, spindrift, canyon, slotShafts, sandDust, dust, snowfall, rain, bolt, rocks, wraithView, wraithGround, terrainState, matLib, fire, galeFx, pollenFx, grass, groundCover, motes, trees, wind, water });
}
