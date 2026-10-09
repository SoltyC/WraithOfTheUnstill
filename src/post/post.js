// Post-processing chain (BRIEF §5.8). The camera renders the scene into an HDR target
// (rgba16float, pre-exposed linear) with a sampleable reverse-Z depth texture; compute passes
// then work on it in order, and one fragment pass draws the result to the swapchain:
//
//   scene → [post passes, see post/passes.js] → display (tonemap → LUT grade → grain → sRGB)
//
// Every pass has fixed bindings (two pass instances where a target ping-pongs), so snapshot
// rendering replays the display bundle and no bind group is created per frame. Passes that are
// toggled off are skipped by flag; their pipelines are still built during loading.
//
// Texture convention: row 0 is the bottom of the view (Babylon's render-target convention, and
// the same y-up pixel coordinates materials see in fragmentInputs.position).

import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { ComputeShader } from '@babylonjs/core/Compute/computeShader.js';
import { EffectRenderer, EffectWrapper } from '@babylonjs/core/Materials/effectRenderer.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Matrix, Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import '@babylonjs/core/Engines/WebGPU/Extensions/engine.computeShader.js';
import { displayVertexWGSL, displayFragmentWGSL } from '../shaders/post/display.wgsl.js';
import { lutCS } from '../shaders/post/lut.wgsl.js';
import { POST_PARAM_FLOATS } from '../shaders/post/common.wgsl.js';

/** TAA jitter: Halton (2, 3), centred on the pixel (internal px). 32 phases: when upscaling,
 *  every output pixel needs samples from many sub-positions (≈ 8 / scale² phases, FSR2's rule). */
const JITTER_N = 32;
const JITTER = new Float32Array(JITTER_N * 2);
for (let k = 0; k < JITTER_N; k++) {
  for (let d = 0; d < 2; d++) {
    const b = d === 0 ? 2 : 3;
    let f = 1, r = 0, i = k + 1;
    while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); }
    JITTER[k * 2 + d] = r - 0.5;
  }
}

/** A storage-capable half-float texture (compute output, sampled by later passes). */
export function storageTexture(scene, w, h, name, sampling = Constants.TEXTURE_BILINEAR_SAMPLINGMODE) {
  const t = new RawTexture(null, w, h, Constants.TEXTUREFORMAT_RGBA, scene, false, false,
    sampling, Constants.TEXTURETYPE_HALF_FLOAT, Constants.TEXTURE_CREATIONFLAG_STORAGE);
  t.name = name;
  t.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE; t.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
  return t;
}

/** A compute shader with an explicit binding list: [name, kind, value]; kinds: buffer | storageTex | tex | sampler.
 *  Bindings are numbered in list order (they must match @binding indices in the WGSL). */
export function computePass(engine, name, code, bind) {
  const mapping = {};
  bind.forEach(([n], k) => { mapping[n] = { group: 0, binding: k }; });
  const s = new ComputeShader(name, engine, { computeSource: code }, { bindingsMapping: mapping });
  for (const [n, kind, value] of bind) {
    if (kind === 'buffer') s.setStorageBuffer(n, value);
    else if (kind === 'storageTex') s.setStorageTexture(n, value);
    else if (kind === 'tex') s.setTexture(n, value, false);
    else if (kind === 'stex') s.setTexture(n, value, true); // binds `${n}Sampler` at the binding before it
  }
  return s;
}

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {import('@babylonjs/core').TargetCamera} camera
 */
export function createPost(scene, camera) {
  const engine = scene.getEngine();
  // Two sizes (temporal upscaling, PLAN.md Q6): the output (the swapchain, OW × OH) and the
  // internal size the scene and the passes before TAA run at (W × H = output × renderScale). TAA
  // rebuilds the output from the jittered internal frames; bloom and display run at the output.
  let OW = engine.getRenderWidth(), OH = engine.getRenderHeight();
  let scale = 1;
  let W = Math.max(16, Math.round(OW * scale)), H = Math.max(16, Math.round(OH * scale));

  // --- Scene target: HDR colour + reverse-Z depth (sampleable). -----------------------------------
  const sceneRT = new RenderTargetTexture('sceneHDR', { width: W, height: H }, scene, {
    generateMipMaps: false, type: Constants.TEXTURETYPE_HALF_FLOAT, format: Constants.TEXTUREFORMAT_RGBA,
    samplingMode: Constants.TEXTURE_NEAREST_SAMPLINGMODE, generateDepthBuffer: false, generateStencilBuffer: false,
  });
  sceneRT.clearColor = new Color4(0, 0, 0, 0);
  const depthTex = new BaseTexture(scene);
  depthTex.name = 'sceneDepth';
  function attachDepth() {
    depthTex._texture = sceneRT.renderTarget.createDepthStencilTexture(0, false, false, 1, Constants.TEXTUREFORMAT_DEPTH32_FLOAT, 'sceneDepth');
  }
  attachDepth();
  camera.outputRenderTarget = sceneRT;

  // --- Grading LUT: 32³ as a 1024×32 strip, rebuilt when the grade changes. -----------------------
  const lutTex = storageTexture(scene, 1024, 32, 'gradeLut');
  const gradeData = new Float32Array(16);
  const gradeBuf = new StorageBuffer(engine, gradeData.byteLength, undefined, 'grade-params');
  const csLut = computePass(engine, 'gradeLut', lutCS, [['G_', 'buffer', gradeBuf], ['outLut', 'storageTex', lutTex]]);
  let lutBuilt = false;

  // --- Display: tonemap + grade + grain → swapchain. ----------------------------------------------
  const effectRenderer = new EffectRenderer(engine);
  const display = new EffectWrapper({
    engine, name: 'display', vertexShader: displayVertexWGSL, fragmentShader: displayFragmentWGSL,
    attributeNames: ['position'], uniformNames: ['params', 'viewport', 'params2'], samplerNames: ['src', 'lut', 'bloom'],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  const displayParams = new Vector4(1, 0.035, 0, 1);
  const viewport = new Vector4(OW, OH, 1 / OW, 1 / OH);
  const displayParams2 = new Vector4(0.35, 0, 0, 0);
  /** The texture the display pass shows (the last post output; the scene target until passes exist). */
  let finalTex = sceneRT, bloomTex = lutTex;
  display.onApplyObservable.add(() => {
    const e = display.effect;
    e.setTexture('src', finalTex);
    e.setTexture('lut', lutTex);
    e.setTexture('bloom', bloomTex);
    e.setVector4('params', displayParams);
    e.setVector4('viewport', viewport);
    e.setVector4('params2', displayParams2);
  });

  // --- Shared per-frame parameters (one upload per frame; layout in shaders/post/common.wgsl.js). -
  const P = new Float32Array(POST_PARAM_FLOATS);
  const paramsBuf = new StorageBuffer(engine, P.byteLength, undefined, 'post-params');
  const vp = new Matrix(), invVP = new Matrix(), prevVP = new Matrix();
  let havePrev = false, resetFrame = 0;

  let frame = 0;
  const post = {
    sceneRT, depthTex, lutTex,
    /** Tonemapper: 0 ACES, 1 AgX. */
    tonemapper: new URLSearchParams(location.search).get('tonemap') === 'agx' ? 1 : 0,
    grain: 0.035,
    /** Bloom mix (set by post/bloom.js's owner). */
    bloomIntensity: 0, bloomOn: false,
    /** Post-TAA sharpening (0..1). */
    sharpen: 0.35,
    lutOn: true,
    /** Grade parameters (see shaders/post/lut.wgsl.js), written by the owner; set gradeDirty. */
    grade: gradeData,
    gradeDirty: true,
    params: P, paramsBuf,
    /** Sub-pixel projection jitter for TAA (Halton 2,3; off when TAA is off). */
    jitter: true,
    /** Debug view (?postDebug=1): flag non-finite pass inputs by colour (compose). */
    // 2 = show the raw scene target, 3 = the composed frame (pre-TAA): bisecting the chain.
    debug: Number(new URLSearchParams(location.search).get('postDebug') || 0),
    /** Set to drop the temporal history (teleports, cuts, captures). */
    resetHistory: true,
    /** Internal (scene, pre-TAA passes) size. */
    get width() { return W; },
    get height() { return H; },
    /** Output (TAA history, bloom, display) size. */
    get outWidth() { return OW; },
    get outHeight() { return OH; },
    /** Internal resolution as a fraction of the output (Quality: render scale). */
    renderScale: 1,
    get frame() { return frame; },
    /** Per frame, after the camera has moved and before scene.render. */
    update() {
      const ow = engine.getRenderWidth(), oh = engine.getRenderHeight();
      const sc = post.renderScale;
      const w = Math.max(16, Math.round(ow * sc)), h = Math.max(16, Math.round(oh * sc));
      const outChanged = ow !== OW || oh !== OH, inChanged = w !== W || h !== H;
      if (outChanged) { OW = ow; OH = oh; viewport.x = OW; viewport.y = OH; viewport.z = 1 / OW; viewport.w = 1 / OH; }
      if (inChanged) {
        W = w; H = h; scale = sc;
        sceneRT.resize({ width: W, height: H });
        attachDepth();
        for (const f of resizers) f(W, H);
      }
      if (outChanged || inChanged) {
        for (const f of outResizers) f(OW, OH);
        post.resetHistory = true;
        engine.snapshotRenderingReset();
      }
      // Matrices: this frame's unjittered view-projection and its inverse, last frame's, then the
      // jitter goes into the camera's projection (clip.xy += j·w) for the scene to render with.
      // The jittered projection is frozen into the camera for the frame (Babylon recomputes an
      // unfrozen one whenever its render target differs in size from the engine — at render
      // scale < 1 the jitter written into it was lost, and the upscaler saw the same frame every
      // time): unfreeze, recompute unjittered, jitter, freeze.
      camera.unfreezeProjectionMatrix();
      const pm = camera.getProjectionMatrix(true);
      camera.getViewMatrix(true).multiplyToRef(pm, vp);
      vp.invertToRef(invVP);
      const a = invVP.m, b = (havePrev ? prevVP : vp).m;
      const v = vp.m;
      for (let i = 0; i < 16; i++) { P[i] = a[i]; P[16 + i] = b[i]; P[88 + i] = v[i]; }
      prevVP.copyFrom(vp); havePrev = true;
      P[32] = W; P[33] = H; P[34] = 1 / W; P[35] = 1 / H;
      if (post.resetHistory) resetFrame = frame;
      // Phases used: 8 at native resolution, all 32 when upscaling (relative to the reset: captures repeat).
      const nPh = post.renderScale < 0.99 ? JITTER_N : 8;
      const k = ((frame - resetFrame) % nPh) * 2;
      const jx = post.jitter ? JITTER[k] : 0, jy = post.jitter ? JITTER[k + 1] : 0;
      P[36] = jx; P[37] = jy; P[38] = frame - resetFrame; P[39] = post.resetHistory ? 1 : 0; // frame relative to the last reset: captures repeat exactly
      post.resetHistory = false;
      const c = camera.position;
      P[40] = c.x; P[41] = c.y; P[42] = c.z; P[43] = camera.minZ;
      P[104] = post.debug === 1 ? 1 : 0; P[105] = post.debug === 4 ? 1 : 0;
      P[112] = OW; P[113] = OH; P[114] = 1 / OW; P[115] = 1 / OH; // output size (pad[2])
      for (let i = 0; i < pre.length; i++) pre[i](P);
      paramsBuf.update(P);
      {
        const m = pm._m;
        m[8] += jx * 2 / W; m[9] += jy * 2 / H;
        pm.markAsUpdated();
        camera.freezeProjectionMatrix(pm);
      }
      if (post.gradeDirty || !lutBuilt) {
        gradeBuf.update(gradeData);
        if (csLut.dispatch(128, 4, 1)) { lutBuilt = true; post.gradeDirty = false; }
      }
    },
    /** Called after the scene is drawn: the passes, then the display pass to the swapchain. */
    render() {
      for (let i = 0; i < passes.length; i++) passes[i]();
      frame++;
      displayParams.x = post.tonemapper; displayParams.y = post.grain; displayParams.z = frame % 1024; displayParams.w = post.lutOn ? 1 : 0;
      displayParams2.x = post.sharpen; displayParams2.y = post.bloomIntensity; displayParams2.z = post.bloomOn ? 1 : 0;
      engine.restoreDefaultFramebuffer();
      effectRenderer.render(display);
    },
    /** Register a pass (runs in registration order after the scene). */
    addPass(fn) { passes.push(fn); },
    /** Register a parameter writer (P) run each frame before the upload. */
    onParams(fn) { pre.push(fn); },
    /** Register a resize hook for the internal size (w, h). */
    onResize(fn) { resizers.push(fn); },
    /** Register a resize hook for the output size (w, h); also called after an internal resize. */
    onResizeOut(fn) { outResizers.push(fn); },
    /** Set the texture the display pass shows. */
    setFinal(t) { finalTex = t; },
    /** Set the bloom texture the display pass mixes in. */
    setBloom(t) { bloomTex = t; },
  };
  const passes = [], resizers = [], outResizers = [], pre = [];
  scene.onAfterRenderObservable.add(() => post.render());
  return post;
}
