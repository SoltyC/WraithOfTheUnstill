// What is drawn at all (PERF.md, Phase 7 visual pass): the creature meshes are fixed pools whose
// every chunk runs the vertex shader in the colour pass and each shadow cascade even when nothing
// is there. The Warden is drawn only within reach of the camera (or while its fight runs); the
// lesser Shaped only while one is up (or its shards fly); the barrage's spikes while any live; the
// pillar crystals near the arena. Toggles happen on threshold crossings and re-record the
// snapshot once (a mesh set change).

/** @param {any} g  shared boot context */
export function addVisibilitySystem(g) {
  const { loop, engine, camera, warden, wardenView, wardenFar, shaped, shapedMod, shapedView, spikes, spikesView, pillarCrystals, clock } = g;
  const S = shapedMod.S;
  const WARDEN_R = 1400, WARDEN_NEAR = 180, PILLAR_R = 300;
  let shapedHold = 0;
  const set = (mesh, on) => { if (mesh.isEnabled() !== on) { mesh.setEnabled(on); engine.snapshotRenderingReset(); } };
  loop.add({ name: 'visibility', update: () => {
    const cx = camera.position.x, cz = camera.position.z;
    // The Warden: near the camera, or awake.
    const b = warden.body, dw = (b.x - cx) * (b.x - cx) + (b.z - cz) * (b.z - cz);
    // Near: the full Warden; beyond WARDEN_NEAR its coarse copy (a few hundred metres off, a chunk
    // is a few pixels: the silhouette is the same); out of sight range neither.
    const fight = warden.active && warden.state > 0, near = dw < WARDEN_NEAR * WARDEN_NEAR || fight;
    // A view switched on uploads the current pose at once (no frame of a stale one).
    if (near && !wardenView.mesh.isEnabled()) wardenView.update();
    if (!near && !wardenFar.mesh.isEnabled()) wardenFar.update();
    set(wardenView.mesh, near);
    set(wardenFar.mesh, !near && dw < WARDEN_R * WARDEN_R);
    // The lesser Shaped: any slot up; held a few seconds after the last falls (shards, mounds).
    let any = false;
    for (let i = 0; i < shaped.slots.length; i++) if (shaped.slots[i].state !== S.EMPTY) { any = true; break; }
    shapedHold = any ? 4 : Math.max(0, shapedHold - clock.realDt);
    set(shapedView.mesh, any || shapedHold > 0);
    set(spikesView.mesh, spikes.live > 0);
    if (pillarCrystals) set(pillarCrystals.mesh, dw < PILLAR_R * PILLAR_R || (warden.active && warden.state > 0));
  } });
}
