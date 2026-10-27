// Babylon's reset() also enables snapshot rendering. Resize/culling invalidation must respect
// an explicitly disabled setting (loading, the user's toggle and fixed-step capture).
export function preserveSnapshotSetting(engine) {
  const reset = engine.snapshotRenderingReset;
  engine.snapshotRenderingReset = function () {
    if (this.snapshotRendering) reset.call(this);
  };
}
