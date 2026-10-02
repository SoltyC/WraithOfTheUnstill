// GPU frame timing via WebGPU timestamp queries on every pass of the frame.
// Presented frame time (rAF) is capped by the display's refresh rate, so it hides headroom;
// GPU time shows what the frame actually costs. Off by default; when off it costs one branch per
// pass. When on (bench mode) it allocates a promise per sampled frame for the readback, which is
// acceptable for measurement runs and never part of the idle gate.
//
// Every render and compute pass Babylon begins on the frame's render encoder gets a query pair
// (GPUCommandEncoder.prototype is wrapped once at init). Per sampled frame this records:
//   ms        frame span: first pass begin → last pass end
//   msMain    the main (swap-chain) pass
//   msShadow  render-target passes (the shadow cascades in Phase 1)
//   msCompute compute passes (clipmap, atmosphere, terrain state)
//
// Wiring: babylonTweaks' _startMainRenderPass calls `gpuTimer.beginPass(desc)` (marks the main
// pass), and its flushFramebuffer calls `gpuTimer.resolve(encoder)` before finish and
// `gpuTimer.afterSubmit()` after submit.

const RING = 4;
const HISTORY = 8192;
const MAX_PASSES = 48;
const KIND_MAIN = 0, KIND_RTT = 1, KIND_COMPUTE = 2;

export const gpuTimer = {
  supported: false,
  active: false,
  /** Per-sample results in ms, newest at (count-1) % HISTORY. */
  ms: new Float32Array(HISTORY),
  msMain: new Float32Array(HISTORY),
  msShadow: new Float32Array(HISTORY),
  msCompute: new Float32Array(HISTORY),
  /** Passes timed in the last sample. */
  lastPasses: 0,
  count: 0,
  lastMs: 0,
  _device: null,
  _querySet: null,
  _resolveBuf: null,
  _ring: [],
  _writes: [],
  _kinds: new Uint8Array(MAX_PASSES),
  _mainDesc: null,
  _sampling: false,
  _passes: 0,
  _pendingSlot: -1,
  /** Time one frame in N: each readback allocates a promise; sampling keeps that garbage low. */
  sampleEvery: 4,
  _frame: 0,

  /** @param {GPUDevice} device */
  init(device) {
    this.supported = device.features.has('timestamp-query');
    if (!this.supported) return;
    this._device = device;
    this._querySet = device.createQuerySet({ type: 'timestamp', count: 2 * MAX_PASSES, label: 'wraith-gpu-timer' });
    this._resolveBuf = device.createBuffer({ size: 16 * MAX_PASSES, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC, label: 'wraith-gpu-timer-resolve' });
    for (let i = 0; i < RING; i++) {
      this._ring.push({ buf: device.createBuffer({ size: 16 * MAX_PASSES, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST, label: 'wraith-gpu-timer-read' + i }), busy: false, passes: 0, kinds: new Uint8Array(MAX_PASSES) });
    }
    for (let k = 0; k < MAX_PASSES; k++) this._writes.push({ querySet: this._querySet, beginningOfPassWriteIndex: 2 * k, endOfPassWriteIndex: 2 * k + 1 });
    const timer = this;
    const proto = GPUCommandEncoder.prototype;
    const beginRender = proto.beginRenderPass, beginCompute = proto.beginComputePass;
    // Also runs while a reused descriptor still carries writes from a run that just ended.
    proto.beginRenderPass = function (desc) {
      if (timer.active || desc.timestampWrites) timer._tag(desc, desc === timer._mainDesc ? KIND_MAIN : KIND_RTT);
      return beginRender.call(this, desc);
    };
    proto.beginComputePass = function (desc) {
      if (desc && (timer.active || desc.timestampWrites)) timer._tag(desc, KIND_COMPUTE);
      return beginCompute.call(this, desc);
    };
  },

  setActive(on) { this.active = on && this.supported; if (!this.active) this._sampling = false; },

  /** Babylon reuses pass descriptors: always (re)set their timestampWrites while active. */
  _tag(desc, kind) {
    if (this._sampling && this._passes < MAX_PASSES) {
      desc.timestampWrites = this._writes[this._passes];
      this._kinds[this._passes++] = kind;
    } else desc.timestampWrites = undefined;
  },

  /** Called while building the main pass descriptor (marks it as the main pass). */
  beginPass(desc) { this._mainDesc = desc; },

  /** Called on the render encoder after the last pass ended, before finish(). */
  resolve(encoder) {
    const n = this._passes;
    this._passes = 0;
    // Decide whether the next frame is sampled (passes of a frame all precede its resolve).
    const sampled = this._sampling;
    this._sampling = this.active && ++this._frame % this.sampleEvery === 0;
    if (!sampled || n === 0) return;
    let slot = -1;
    for (let i = 0; i < RING; i++) if (!this._ring[i].busy) { slot = i; break; }
    if (slot < 0) return; // readbacks lagging: drop this sample
    const r = this._ring[slot];
    encoder.resolveQuerySet(this._querySet, 0, 2 * n, this._resolveBuf, 0);
    encoder.copyBufferToBuffer(this._resolveBuf, 0, r.buf, 0, 16 * n);
    r.busy = true; r.passes = n; r.kinds.set(this._kinds);
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
      let first = t[0], last = t[1], main = 0, shadow = 0, compute = 0, ok = true;
      for (let k = 0; k < r.passes; k++) {
        const b = t[2 * k], e = t[2 * k + 1];
        if (e < b || b === 0n) { ok = false; break; }
        if (b < first) first = b;
        if (e > last) last = e;
        const ms = Number(e - b) / 1e6;
        if (r.kinds[k] === KIND_MAIN) main += ms; else if (r.kinds[k] === KIND_RTT) shadow += ms; else compute += ms;
      }
      const span = Number(last - first) / 1e6;
      r.buf.unmap();
      r.busy = false;
      if (ok && span > 0 && span < 60000) { // software GPUs take seconds per frame
        const i = this.count % HISTORY;
        this.ms[i] = span; this.msMain[i] = main; this.msShadow[i] = shadow; this.msCompute[i] = compute;
        this.count++;
        this.lastMs = span;
        this.lastPasses = r.passes;
      }
    }, () => { r.busy = false; });
  },

  /** Clear recorded samples (start of a measured phase). */
  reset() { this.count = 0; },

  /** Summaries of the recorded samples: { frame, main, shadow, compute } via summarize(arr, n). */
  summaries(summarize) {
    const n = Math.min(this.count, HISTORY);
    return { frame: summarize(this.ms, n), main: summarize(this.msMain, n), shadow: summarize(this.msShadow, n), compute: summarize(this.msCompute, n), passes: this.lastPasses };
  },
};
