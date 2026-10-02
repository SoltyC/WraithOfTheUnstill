// GPU frame timing via WebGPU timestamp queries on the main render pass.
// Presented frame time (rAF) is capped by the display's refresh rate, so it hides headroom;
// GPU pass time shows what the frame actually costs. Off by default; when off it costs nothing.
// When on (bench mode, overlay toggle) it allocates a promise per frame for the readback,
// which is acceptable for measurement runs and never part of the idle gate.
//
// Wiring: babylonTweaks' _startMainRenderPass calls `gpuTimer.beginPass(desc)`, and its
// flushFramebuffer calls `gpuTimer.resolve(encoder)` before finish and `gpuTimer.afterSubmit()`.
//
// Phase 0 has a single render pass, so pass time = GPU frame time. Later phases with compute and
// render-target passes extend this to one query pair per pass.

const RING = 4;
const HISTORY = 8192;

export const gpuTimer = {
  supported: false,
  active: false,
  /** GPU main-pass times in ms, newest at (count-1) % HISTORY. */
  ms: new Float32Array(HISTORY),
  count: 0,
  lastMs: 0,
  _device: null,
  _querySet: null,
  _resolveBuf: null,
  _ring: [],
  _writes: null,
  _pending: false,
  _pendingSlot: -1,
  /** Time one frame in N: each readback allocates a promise; sampling keeps that garbage low. */
  sampleEvery: 4,
  _frame: 0,

  /** @param {GPUDevice} device */
  init(device) {
    this.supported = device.features.has('timestamp-query');
    if (!this.supported) return;
    this._device = device;
    this._querySet = device.createQuerySet({ type: 'timestamp', count: 2, label: 'wraith-gpu-timer' });
    this._resolveBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC, label: 'wraith-gpu-timer-resolve' });
    for (let i = 0; i < RING; i++) {
      this._ring.push({ buf: device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST, label: 'wraith-gpu-timer-read' + i }), busy: false });
    }
    this._writes = { querySet: this._querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 };
  },

  setActive(on) { this.active = on && this.supported; },

  /** Called while building the main pass descriptor. */
  beginPass(desc) {
    if (!this.active) return;
    if (++this._frame % this.sampleEvery !== 0) { desc.timestampWrites = undefined; return; }
    desc.timestampWrites = this._writes;
    this._pending = true;
  },

  /** Called on the render encoder after the main pass ended, before finish(). */
  resolve(encoder) {
    if (!this._pending) return;
    this._pending = false;
    let slot = -1;
    for (let i = 0; i < RING; i++) if (!this._ring[i].busy) { slot = i; break; }
    if (slot < 0) return; // readbacks lagging: drop this sample
    encoder.resolveQuerySet(this._querySet, 0, 2, this._resolveBuf, 0);
    encoder.copyBufferToBuffer(this._resolveBuf, 0, this._ring[slot].buf, 0, 16);
    this._ring[slot].busy = true;
    this._pendingSlot = slot;
  },

  /** Called after queue.submit(). */
  afterSubmit() {
    const slot = this._pendingSlot;
    if (slot < 0) return;
    this._pendingSlot = -1;
    const r = this._ring[slot];
    r.buf.mapAsync(GPUMapMode.READ).then(() => {
      const t = new BigUint64Array(r.buf.getMappedRange());
      const ns = Number(t[1] - t[0]);
      r.buf.unmap();
      r.busy = false;
      if (ns > 0 && ns < 1e9) {
        const ms = ns / 1e6;
        this.ms[this.count % HISTORY] = ms;
        this.count++;
        this.lastMs = ms;
      }
    }, () => { r.busy = false; });
  },

  /** Clear recorded samples (start of a measured phase). */
  reset() { this.count = 0; },
};
