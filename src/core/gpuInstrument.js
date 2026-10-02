// GPU instrumentation, installed before the engine requests its device.
//
// - Late-pipeline detector (BRIEF §12.1, §15): every render/compute pipeline created after
//   `armLatePipelineDetector()` is recorded as a defect and logged in red.
// - Draw-call counter: wraps GPURenderPassEncoder/GPURenderBundleEncoder draw methods.
// - GPU memory tally: sums sizes of live GPUBuffers and GPUTextures (an estimate; WebGPU has
//   no memory query). Destroyed resources are subtracted.
//
// All wrappers are fixed-arity so the hot draw path never allocates (no rest/spread).

/** @typedef {{ kind: string, label: string, t: number, stack: string }} LatePipeline */

export const gpuStats = {
  pipelinesTotal: 0,
  pipelinesAtArm: 0,
  /** @type {LatePipeline[]} */
  late: [],
  armed: false,
  drawCalls: 0,
  drawCallsLastFrame: 0,
  bufferBytes: 0,
  textureBytes: 0,
  /** @type {GPUDevice|null} */
  device: null,
  adapterInfo: '',
  /** Set when the device is lost; boot treats this as fatal. */
  deviceLost: '',
  gpuErrors: 0,
};

const sizes = new WeakMap();
const listeners = [];

/** @param {(p: LatePipeline) => void} fn */
export function onLatePipeline(fn) { listeners.push(fn); }

export function armLatePipelineDetector() {
  gpuStats.armed = true;
  gpuStats.pipelinesAtArm = gpuStats.pipelinesTotal;
}

/** Called once per frame by the loop, after rendering. */
export function endGpuFrame() {
  gpuStats.drawCallsLastFrame = gpuStats.drawCalls;
  gpuStats.drawCalls = 0;
}

function notePipeline(kind, desc) {
  gpuStats.pipelinesTotal++;
  if (!gpuStats.armed) return;
  const label = (desc && (desc.label || (desc.vertex && desc.vertex.entryPoint) || (desc.compute && desc.compute.entryPoint))) || '(unlabelled)';
  const entry = { kind, label, t: performance.now(), stack: new Error().stack || '' };
  gpuStats.late.push(entry);
  console.error('%c[late-pipeline] ' + kind + ' created after loading: ' + label, 'color:#ff5a4f;font-weight:bold');
  for (let i = 0; i < listeners.length; i++) listeners[i](entry);
}

const BYTES_PER_TEXEL = {
  r8unorm: 1, r8snorm: 1, r8uint: 1, r8sint: 1,
  r16float: 2, r16uint: 2, r16sint: 2, rg8unorm: 2, rg8snorm: 2, rg8uint: 2, rg8sint: 2, depth16unorm: 2,
  r32float: 4, r32uint: 4, r32sint: 4, rg16float: 4, rg16uint: 4, rg16sint: 4, rgba8unorm: 4, 'rgba8unorm-srgb': 4,
  rgba8snorm: 4, rgba8uint: 4, rgba8sint: 4, bgra8unorm: 4, 'bgra8unorm-srgb': 4, rgb10a2unorm: 4, rg11b10ufloat: 4,
  depth24plus: 4, 'depth24plus-stencil8': 4, depth32float: 4, 'depth32float-stencil8': 5,
  rg32float: 8, rg32uint: 8, rg32sint: 8, rgba16float: 8, rgba16uint: 8, rgba16sint: 8,
  rgba32float: 16, rgba32uint: 16, rgba32sint: 16,
};

function textureBytes(desc) {
  const s = desc.size;
  const w = Array.isArray(s) ? s[0] : s.width;
  const h = Array.isArray(s) ? (s[1] ?? 1) : (s.height ?? 1);
  const d = Array.isArray(s) ? (s[2] ?? 1) : (s.depthOrArrayLayers ?? 1);
  const bpp = BYTES_PER_TEXEL[desc.format] ?? 4;
  const mips = desc.mipLevelCount ?? 1;
  const samples = desc.sampleCount ?? 1;
  // A full mip chain adds ~1/3.
  const mipFactor = mips > 1 ? 4 / 3 : 1;
  return Math.round(w * h * d * bpp * samples * mipFactor);
}

function instrumentDevice(device) {
  gpuStats.device = device;
  device.lost.then((info) => {
    gpuStats.deviceLost = (info.reason || 'unknown') + ': ' + info.message;
    console.error('[gpu] device lost — ' + gpuStats.deviceLost);
  });
  device.addEventListener('uncapturederror', (e) => {
    gpuStats.gpuErrors++;
    if (gpuStats.gpuErrors <= 10) console.error('[gpu] uncaptured error: ' + e.error.message);
  });
  const crp = device.createRenderPipeline.bind(device);
  const crpa = device.createRenderPipelineAsync.bind(device);
  const ccp = device.createComputePipeline.bind(device);
  const ccpa = device.createComputePipelineAsync.bind(device);
  const cb = device.createBuffer.bind(device);
  const ct = device.createTexture.bind(device);
  device.createRenderPipeline = (d) => { notePipeline('render', d); return crp(d); };
  device.createRenderPipelineAsync = (d) => { notePipeline('render-async', d); return crpa(d); };
  device.createComputePipeline = (d) => { notePipeline('compute', d); return ccp(d); };
  device.createComputePipelineAsync = (d) => { notePipeline('compute-async', d); return ccpa(d); };
  device.createBuffer = (d) => {
    const b = cb(d);
    sizes.set(b, d.size);
    gpuStats.bufferBytes += d.size;
    return b;
  };
  device.createTexture = (d) => {
    const t = ct(d);
    const n = textureBytes(d);
    sizes.set(t, n);
    gpuStats.textureBytes += n;
    return t;
  };
}

function wrapDestroy(proto, field) {
  const orig = proto.destroy;
  proto.destroy = function () {
    const n = sizes.get(this);
    if (n !== undefined) { gpuStats[field] -= n; sizes.delete(this); }
    return orig.call(this);
  };
}

// Draws recorded into the render bundle currently being encoded (Babylon encodes one at a time).
let bundleDraws = 0;
const bundleDrawCounts = new WeakMap();

function wrapDraws(proto, inBundle) {
  const d = proto.draw, di = proto.drawIndexed, dI = proto.drawIndirect, dII = proto.drawIndexedIndirect;
  if (inBundle) {
    proto.draw = function (a, b, c, e) { bundleDraws++; return d.call(this, a, b, c, e); };
    proto.drawIndexed = function (a, b, c, e, f) { bundleDraws++; return di.call(this, a, b, c, e, f); };
    proto.drawIndirect = function (a, b) { bundleDraws++; return dI.call(this, a, b); };
    proto.drawIndexedIndirect = function (a, b) { bundleDraws++; return dII.call(this, a, b); };
    const fin = proto.finish;
    proto.finish = function (desc) { const bundle = fin.call(this, desc); bundleDrawCounts.set(bundle, bundleDraws); bundleDraws = 0; return bundle; };
    return;
  }
  proto.draw = function (a, b, c, e) { gpuStats.drawCalls++; return d.call(this, a, b, c, e); };
  proto.drawIndexed = function (a, b, c, e, f) { gpuStats.drawCalls++; return di.call(this, a, b, c, e, f); };
  proto.drawIndirect = function (a, b) { gpuStats.drawCalls++; return dI.call(this, a, b); };
  proto.drawIndexedIndirect = function (a, b) { gpuStats.drawCalls++; return dII.call(this, a, b); };
  // Snapshot rendering replays render bundles: count their recorded draws on execution.
  const eb = proto.executeBundles;
  proto.executeBundles = function (bundles) {
    for (let i = 0; i < bundles.length; i++) gpuStats.drawCalls += bundleDrawCounts.get(bundles[i]) || 0;
    return eb.call(this, bundles);
  };
}

let installed = false;

/** Install hooks. Must run before the engine calls `requestDevice`. */
export function installGpuInstrumentation() {
  if (installed || !globalThis.GPUAdapter) return;
  installed = true;
  const rd = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (desc) {
    const info = this.info;
    if (info) gpuStats.adapterInfo = [info.vendor, info.architecture, info.description].filter(Boolean).join(' / ') || 'unknown adapter';
    const device = await rd.call(this, desc);
    instrumentDevice(device);
    return device;
  };
  wrapDestroy(GPUBuffer.prototype, 'bufferBytes');
  wrapDestroy(GPUTexture.prototype, 'textureBytes');
  wrapDraws(GPURenderPassEncoder.prototype, false);
  wrapDraws(GPURenderBundleEncoder.prototype, true);
}
