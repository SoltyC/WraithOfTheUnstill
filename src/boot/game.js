// The `game` facade the dev overlay, photo spots, benches and automation drive: teleports,
// settle checks, pending photo-spot scripts, dev spawns, and the save manager.

/** @param {any} g  shared boot context (world + actors) */
export async function createGame(g) {
  const { engine, scene, camera, loop, controller, arm, streamer, ground, terrainState, content, pois, requestTeleport, pendingTp,
    warden, wardenMod, combat, shaped, shapedMod, wraithView, weather, post, spots } = g;
  const streamingMod = await import('../core/streaming.js');
  const saves = await createSaves(g);
  const game = {
    engine, scene, camera, loop, controller, arm, saves, streaming: streamingMod.streaming,
    streamer, ground, terrainState, clipmap: content.clipmap, pois,
    teleport(x, z) { requestTeleport(x, z); },
    /** True once the player stands on streamed ground with every nearby tile resident. */
    worldSettled() {
      if (pendingTp.active || streamer.arrived.length > 0) return false;
      if (streamer.pendingNear(controller.pos.x, controller.pos.z) !== 0) return false;
      if (terrainState.pendingPages !== 0) return false;
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
    shapedArchetypes: Object.keys((await import('../game/shaped/archetypes.js')).ARCHETYPES),
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
  return game;
}

/** Saves (lazy: the worker and IndexedDB open only when first used, so idle frames stay clean). */
async function createSaves(g) {
  const { controller, arm, paramsMod, clock, terrainState, frost, warden, wardenMod, weather, restoration } = g;
  const [{ SaveManager, WorkerCodec }, { SaveStore, openSaveDb }, { worldState }] = await Promise.all([
    import('../game/save/saveManager.js'),
    import('../game/save/saveStore.js'),
    import('../game/worldState.js'),
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
    async collect(s) {
      const p = controller.pos;
      s.player.pos = [p.x, p.y, p.z];
      s.player.yaw = controller.yaw;
      s.playSeconds = clock.simTime;
      s.world.timeOfDay = paramsMod.params.v.timeOfDay;
      s.world.weather = worldState.weather;
      s.world.biome = worldState.biome;
      s.world.restoration = { ...worldState.restoration };
      s.world.weatherOverride = worldState.weatherOverride;
      if (g.quests) Object.assign(s.quests, g.quests.serialize());
      if (g.progress) g.progress.collect(s);
      s.entities.crystals = frost.serializeCrystals(clock.simTime);
      if (warden.active) {
        const W = wardenMod.W, b = warden.body;
        s.entities.warden = { state: warden.state === W.RELEASE || warden.state === W.RESTED ? 'rested' : 'dormant', x: b.x, z: b.z, heading: b.heading };
      }
      // Last: the terrain pages (read back across frames; everything above is this frame's).
      s.terrainPages = await terrainState.snapshot();
    },
    apply(s) {
      // Back to where the save was made, once the ground (and any floor) there is known.
      g.requestTeleport(s.player.pos[0], s.player.pos[2]);
      controller.yaw = s.player.yaw;
      arm.yaw = s.player.yaw;
      paramsMod.setParam('timeOfDay', s.world.timeOfDay);
      worldState.weather = s.world.weather;
      worldState.weatherOverride = s.world.weatherOverride ?? null;
      Object.assign(worldState.restoration, s.world.restoration);
      restoration.value = worldState.restoration.frost === 'restored' ? 1 : 0; restoration.snap = true;
      weather.snap = true;
      if (g.quests) g.quests.restore(s.quests);
      if (g.progress) g.progress.apply(s);
      g.navSync?.();
      // Saved game times (pages, formations) move onto this session's clock.
      const shift = clock.simTime - s.playSeconds;
      terrainState.restore(s.terrainPages.map((p) => ({ key: p.key, savedAt: p.savedAt + shift, data: p.data })));
      frost.restoreCrystals(s.entities.crystals, clock.simTime);
      // The Warden is placed again by its system: dormant in its arena, or lying where it rests.
      const w = s.entities.warden;
      g.wardenRest = w && w.state === 'rested' ? { x: w.x, z: w.z, heading: w.heading } : null;
      warden.active = false;
    },
  });
}
