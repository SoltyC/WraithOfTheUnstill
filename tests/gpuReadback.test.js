import { describe, it, expect, vi } from 'vitest';
import { createGpuReadbackPool } from '../src/core/gpuReadback.js';
function observable() {
  const callbacks = new Set();
  return { add(fn) { callbacks.add(fn); return fn; }, remove(fn) { callbacks.delete(fn); },
    fire() { for (const fn of callbacks) fn(); }, callbacks };
}
function setup() {
  globalThis.GPUBufferUsage = { MAP_READ: 1, COPY_DST: 2 };
  globalThis.GPUMapMode = { READ: 1 };
  const buffers = [], copies = [];
  const engine = { onEndFrameObservable: observable(), onDisposeObservable: observable(),
    _device: { createBuffer() {
      const b = { mapState: 'unmapped', data: new Float32Array([1, 2, 3, 4]),
        mapAsync: vi.fn(() => new Promise((resolve, reject) => { b.resolve = resolve; b.reject = reject; })),
        getMappedRange() { return b.data.buffer; }, unmap: vi.fn(), destroy: vi.fn() };
      buffers.push(b); return b;
    } }, _renderEncoder: { copyBufferToBuffer(...args) { copies.push(args); } } };
  const pool = createGpuReadbackPool(engine, 16, 2), done = vi.fn(), failed = vi.fn();
  for (const slot of pool.slots) { slot.target = new Float32Array(4); slot.done = done; slot.failed = failed; }
  return { engine, pool, buffers, copies, done, failed };
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
describe('fixed GPU readback pool', () => {
  it('records copies immediately but maps only after frame submission, then reuses staging storage', async () => {
    const t = setup(), source = {};
    expect(t.pool.copy(0, source)).toBe(true);
    expect(t.copies[0]).toEqual([source, 0, t.buffers[0], 0, 16]);
    expect(t.buffers[0].mapAsync).not.toHaveBeenCalled();
    expect(t.pool.copy(0, source)).toBe(false);
    t.engine.onEndFrameObservable.fire(); t.engine.onEndFrameObservable.fire();
    expect(t.buffers[0].mapAsync).toHaveBeenCalledTimes(1);
    t.buffers[0].resolve(); await tick();
    expect(Array.from(t.pool.slots[0].target)).toEqual([1, 2, 3, 4]);
    expect(t.done).toHaveBeenCalledTimes(1);expect(t.buffers[0].unmap).toHaveBeenCalledTimes(1);
    expect(t.pool.copy(0, source)).toBe(true);expect(t.buffers).toHaveLength(2);
  });
  it('isolates concurrent maps and recovers rejected slots', async () => {
    const t = setup(); t.pool.copy(0, {}); t.pool.copy(1, {}); t.engine.onEndFrameObservable.fire();
    t.buffers[1].resolve(); t.buffers[0].reject(new Error('map failed')); await tick();
    expect(t.done).toHaveBeenCalledTimes(1);expect(t.failed).toHaveBeenCalledTimes(1);
    expect(t.pool.copy(0, {})).toBe(true);expect(t.pool.slots[1].state).toBe(0);
  });
  it('unmaps and releases a slot when mapped-range access fails', async () => {
    const t = setup();t.pool.copy(0, {});t.engine.onEndFrameObservable.fire();
    t.buffers[0].mapState = 'mapped';t.buffers[0].getMappedRange = () => { throw new Error('range unavailable'); };
    t.buffers[0].resolve();await tick();
    expect(t.failed).toHaveBeenCalledTimes(1);expect(t.buffers[0].unmap).toHaveBeenCalledTimes(1);
    expect(t.pool.copy(0, {})).toBe(true);
  });
  it('disposes buffers and observers once and ignores outstanding map callbacks', async () => {
    const t = setup();t.pool.copy(0, {});t.pool.copy(1, {});t.engine.onEndFrameObservable.fire();
    t.engine.onDisposeObservable.fire();t.pool.dispose();
    t.buffers[0].resolve();t.buffers[1].reject(new Error('disposed'));await tick();
    expect(t.done).not.toHaveBeenCalled();expect(t.failed).not.toHaveBeenCalled();
    expect(t.pool.copy(0, {})).toBe(false);expect(t.engine.onEndFrameObservable.callbacks.size).toBe(0);
    for(const buffer of t.buffers)expect(buffer.destroy).toHaveBeenCalledTimes(1);
  });
});
