// The WebGPU engine (BRIEF §3): created with WGSL only, reverse-Z, Babylon's per-frame
// instrumentation off and the constant-label frame path installed (render/babylonTweaks.js), plus
// the render-size policy: follow the window, or lock it with ?res=WxH (bench and captures on a
// high-DPI monitor), with the Quality slider's render scale on top. This is the only place that
// sizes the backbuffer: setHardwareScalingLevel() would itself resize to the window.

import { gpuStats } from '../core/gpuInstrument.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {URLSearchParams} qs
 */
export async function createEngine(canvas, qs) {
  const [{ WebGPUEngine }, { AbstractEngine }] = await Promise.all([
    import('@babylonjs/core/Engines/webgpuEngine.js'),
    import('@babylonjs/core/Engines/abstractEngine.js'),
  ]);
  // Empty glslang paths: every shader is WGSL, and any GLSL compile must fail loudly rather
  // than fetch a compiler from a CDN (BRIEF §3: no runtime CDN fetches).
  const engine = new WebGPUEngine(canvas, {
    // No MSAA: the post chain's TAA anti-aliases (and resolves shading aliasing MSAA cannot).
    antialias: false,
    powerPreference: 'high-performance',
    adaptToDeviceRatio: false,
    glslangOptions: { jsPath: '', wasmPath: '' },
    twgslOptions: { jsPath: '', wasmPath: '' },
    // Babylon keeps only features the adapter supports.
    deviceDescriptor: { requiredFeatures: ['timestamp-query'] },
  });
  await engine.initAsync({ jsPath: '', wasmPath: '' }, { jsPath: '', wasmPath: '' });
  // Reverse-Z: a 30 km far plane with a 10 cm near plane needs it to avoid z-fighting at range.
  engine.useReverseDepthBuffer = true;

  const { installFastStages, disableBabylonInstrumentation, installConstantLabelFramePath } = await import('../render/babylonTweaks.js');
  installFastStages(); // before the Scene exists: its stages are created in the constructor
  disableBabylonInstrumentation(engine);
  installConstantLabelFramePath(engine, AbstractEngine.Version);
  const { gpuTimer } = await import('../core/gpuTimer.js');
  gpuTimer.init(gpuStats.device);

  const resMatch = /^(\d+)x(\d+)$/.exec(qs.get('res') || '');
  // The backbuffer is always the full output size (the window, or the locked ?res); render scale
  // is applied inside the post chain (temporal upscaling), not by shrinking the canvas.
  const applySize = () => {
    if (resMatch) engine.setSize(Number(resMatch[1]), Number(resMatch[2]));
    else engine.setHardwareScalingLevel(1);
  };
  applySize();
  window.addEventListener('resize', applySize);

  return {
    engine, gpuTimer,
    /** Kept for callers; render scale now lives in the post chain (post.renderScale). */
    setRenderScale() {},
  };
}
