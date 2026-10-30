// Fixed GPU staging buffers. Copy in Babylon's current encoder; map only after its frame submit.
// WebGPU mapAsync promises and mapped-range views remain API-required allocations per read.
export function createGpuReadbackPool(engine, bytes, capacity) {
  const device = engine._device;
  let disposed = false;
  const slots = Array.from({ length: capacity }, () => {
    const buffer = device.createBuffer({ label: 'pooled-readback', size: bytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const slot = { buffer, state: 0, target: null, done: null, failed: null, mapped: null, rejected: null };
    slot.rejected = () => {
      if (slot.state === 0) return;
      slot.state = 0;
      if (!disposed) slot.failed();
    };
    slot.mapped = () => {
      if (disposed) return;
      try {
        slot.target.set(new Float32Array(buffer.getMappedRange(0, bytes)));
        buffer.unmap();
      } catch {
        if (buffer.mapState === 'mapped') buffer.unmap();
        slot.rejected();
        return;
      }
      slot.state = 0;
      slot.done();
    };
    return slot;
  });
  const endFrame = engine.onEndFrameObservable.add(() => {
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot.state !== 1) continue;
      slot.state = 2;
      slot.buffer.mapAsync(GPUMapMode.READ, 0, bytes).then(slot.mapped, slot.rejected);
    }
  });
  const pool = {
    slots,
    copy(index, source) {
      const slot = slots[index];
      if (disposed || slot.state !== 0) return false;
      engine._renderEncoder.copyBufferToBuffer(source, 0, slot.buffer, 0, bytes);
      slot.state = 1;
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      engine.onEndFrameObservable.remove(endFrame);
      engine.onDisposeObservable.remove(onDispose);
      for (let i = 0; i < slots.length; i++) { slots[i].state = 0; slots[i].buffer.destroy(); }
    },
  };
  const onDispose = engine.onDisposeObservable.add(pool.dispose);
  return pool;
}
