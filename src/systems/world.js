// Per-frame systems: the lighting environment, then world streaming and pending teleports.

/** @param {any} g  shared boot context */
export function addWorldSystems(g) {
  const { loop, env, arm, pendingTp, streamer, camera, controller, ground, post, atmosphere } = g;
  loop.add({ name: 'environment', update: () => env.updateEnvironment() });
  loop.add({ name: 'world', update: () => {
    // Stream around a pending teleport target first, else the free camera, else the player.
    // (A directed scene — systems/scenes.js — loads the place it is about to cut to: g.streamFocus.)
    const sf = !pendingTp.active ? g.streamFocus : null;
    const focusFree = arm.free && !pendingTp.active;
    streamer.px = sf ? sf.x : pendingTp.active ? pendingTp.x : focusFree ? camera.position.x : controller.pos.x;
    streamer.pz = sf ? sf.z : pendingTp.active ? pendingTp.z : focusFree ? camera.position.z : controller.pos.z;
    streamer.vx = sf || focusFree || pendingTp.active ? 0 : controller.vel.x;
    streamer.vz = sf || focusFree || pendingTp.active ? 0 : controller.vel.z;
    streamer.update();
    if (pendingTp.active) {
      // Complete only on a fine patch computed after the last tile upload, with every nearby tile
      // resident, so the drop height matches the final collision surface (and the GPU terrain).
      ground.qx = pendingTp.x; ground.qz = pendingTp.z;
      if (ground.coversFine() && ground.f.version === streamer.residencyVersion && streamer.arrived.length === 0
          && streamer.pendingNear(pendingTp.x, pendingTp.z) === 0
          && (!g.solids || g.solids.seatedNear(pendingTp.x, pendingTp.z))) { // built floors known
        controller.teleport(pendingTp.x, pendingTp.z);
        controller.hold = false;
        pendingTp.active = false;
        post.post.resetHistory = true; atmosphere.snapExposure = true;
        arm.snap(controller.pos);
      }
    }
  } });
}
