// Small, documented adjustments to Babylon internals for the zero-allocation frame loop.
// Each touches a private field; re-verify on Babylon upgrades (tools/capture/heap-profile.mjs
// will show the allocation return if one breaks).

import { Stage } from '@babylonjs/core/sceneComponent.js';
import { PerfCounter } from '@babylonjs/core/Misc/perfCounter.js';
import { gpuTimer } from '../core/gpuTimer.js';

/**
 * Make Babylon's scene "stages" real arrays.
 * `Stage.Create()` returns `Object.create(Stage.prototype)`, an ordinary object that only
 * inherits from Array.prototype, so every `for (const step of stage)` in Babylon's frame path
 * goes through V8's generic iterator and allocates ~88–168 B per loop even when empty (dozens of
 * loops per frame). A genuine Array carrying the two Stage methods as own properties iterates on
 * V8's fast path with zero allocation (measured in Node). Must run before any Scene is created.
 * Nothing in Babylon 9 checks `instanceof Stage`.
 */
export function installFastStages() {
  if (Stage.Create.__wraith) return;
  const { registerStep, clear } = Stage.prototype;
  const create = function () {
    const a = [];
    a.registerStep = registerStep;
    a.clear = clear;
    return a;
  };
  create.__wraith = true;
  Stage.Create = create;
}

/**
 * Render opaque meshes of the given groups in creation order, without sorting or copying.
 * Babylon 9 always sorts opaque sub-meshes (a null comparator falls back to painter sort; sort
 * with a comparator allocates), and `_RenderSorted` slices its SmartArray whenever length differs
 * from capacity (every frame). Walk the SmartArray's backing store directly instead.
 * @param {import('@babylonjs/core').Scene} scene
 * @param {number[]} groupIds
 */
export function renderOpaqueUnsorted(scene, groupIds) {
  for (const id of groupIds) {
    const group = scene.renderingManager.getRenderingGroup(id);
    group._renderOpaque = function (subMeshes) {
      const data = subMeshes.data, n = subMeshes.length;
      for (let i = 0; i < n; i++) data[i].render(false);
    };
  }
}

/**
 * Allocation-free readiness check for a frozen ShaderMaterial.
 * Babylon's `ShaderMaterial.isReady` contains an arrow callback capturing function-level locals,
 * so V8 allocates a closure context on every call — even when the frozen early-return fires
 * (~15 B per draw per frame). This instance-level wrapper performs the same early-return test
 * itself and only falls through to Babylon's method when the material is not frozen-and-ready.
 * @param {import('@babylonjs/core').ShaderMaterial} mat
 */
export function fastFrozenIsReady(mat) {
  const slow = Object.getPrototypeOf(mat).isReady;
  mat.isReady = function (mesh, useInstances, subMesh) {
    if (this.isFrozen) {
      const dw = subMesh && this._storeEffectOnSubMeshes ? subMesh._drawWrapper : this._drawWrapper;
      if (dw.effect && dw._wasPreviouslyReady && dw._wasPreviouslyUsingInstances === useInstances) return true;
    }
    return slow.call(this, mesh, useInstances, subMesh);
  };
}

/**
 * Turn off Babylon's built-in instrumentation; the dev overlay has its own.
 * PerfCounters sample PrecisionDate.Now every frame (boxed doubles) and the engine's
 * PerformanceMonitor keeps a rolling frame-time window.
 * @param {import('@babylonjs/core').AbstractEngine} engine
 */
export function disableBabylonInstrumentation(engine) {
  PerfCounter.Enabled = false;
  engine.performanceMonitor?.disable();
  // beginFrame still calls _measureFps, which samples the (disabled) monitor and reads a boxed
  // frame time from its rolling history. The game never reads engine.getFps()/getDeltaTime()
  // (frame timing lives in core/frameStats.js and core/clock.js), so make it a no-op.
  engine._measureFps = function () {};
}

// Babylon version the frame-path overrides below were copied from. On any other version they are
// skipped (with a console warning) rather than risk running stale copies of private methods.
const FRAME_PATH_VERSION = '9.29.0';

const viewDescSwapChainAA = { label: 'TextureView_SwapChain_ResolveTarget', dimension: '2d', format: undefined, mipLevelCount: 1, arrayLayerCount: 1 };
const viewDescSwapChain = { label: 'TextureView_SwapChain', dimension: '2d', format: undefined, mipLevelCount: 1, arrayLayerCount: 1 };

/**
 * Replace two WebGPUEngine frame-path methods with copies that use constant debug labels.
 * They also host the GPU timer hooks (core/gpuTimer.js).
 * Babylon builds three template-string labels per frame (`[frameId|counter] - …`) for the main
 * render pass and the two command encoders — pure per-frame string garbage. Bodies are verbatim
 * copies of Babylon 9.29.0 `_startMainRenderPass` and `flushFramebuffer` except the labels.
 * @param {any} engine WebGPUEngine
 * @param {string} version AbstractEngine.Version
 * @returns {boolean} whether the overrides were installed
 */
export function installConstantLabelFramePath(engine, version) {
  if (version !== FRAME_PATH_VERSION) {
    console.warn(`[babylonTweaks] Babylon ${version} ≠ ${FRAME_PATH_VERSION}: frame-path label overrides skipped (re-copy them).`);
    return false;
  }
  engine._mainRenderPassWrapper.renderPassDescriptor.label = 'MainRenderPass';
  engine._uploadEncoderDescriptor.label = 'UploadEncoder';
  engine._renderEncoderDescriptor.label = 'RenderEncoder';

  engine._startMainRenderPass = function (setClearStates, clearColor, clearDepth, clearStencil) {
    this._endCurrentRenderPass();
    if (this.useReverseDepthBuffer) this.setDepthFunctionToGreaterOrEqual();
    const mustClearColor = setClearStates && clearColor;
    const mustClearDepth = setClearStates && clearDepth;
    const mustClearStencil = setClearStates && clearStencil;
    this._internalFrameCounter++;
    const desc = this._mainRenderPassWrapper.renderPassDescriptor;
    desc.colorAttachments[0].clearValue = mustClearColor ? clearColor : undefined;
    desc.colorAttachments[0].loadOp = mustClearColor ? 'clear' : 'load';
    desc.depthStencilAttachment.depthClearValue = mustClearDepth ? (this.useReverseDepthBuffer ? this._clearReverseDepthValue : this._clearDepthValue) : undefined;
    desc.depthStencilAttachment.depthLoadOp = mustClearDepth ? 'clear' : 'load';
    desc.depthStencilAttachment.stencilClearValue = mustClearStencil ? this._clearStencilValue : undefined;
    desc.depthStencilAttachment.stencilLoadOp = !this.isStencilEnable ? undefined : mustClearStencil ? 'clear' : 'load';
    desc.occlusionQuerySet = this._occlusionQuery?.hasQueries ? this._occlusionQuery.querySet : undefined;
    const swapChainTexture = this._context.getCurrentTexture();
    this._mainRenderPassWrapper.colorAttachmentGPUTextures[0].set(swapChainTexture);
    if (this._options.antialias) {
      viewDescSwapChainAA.format = swapChainTexture.format;
      desc.colorAttachments[0].resolveTarget = swapChainTexture.createView(viewDescSwapChainAA);
    } else {
      viewDescSwapChain.format = swapChainTexture.format;
      desc.colorAttachments[0].view = swapChainTexture.createView(viewDescSwapChain);
    }
    this._timestampQuery.startPass(desc, this._timestampIndex);
    gpuTimer.beginPass(desc); // our own GPU timing (no-op unless active)
    this._currentRenderPass = this._renderEncoder.beginRenderPass(desc);
    this._debugPushAfterStartOfEncoder();
    this._setDepthTextureFormat(this._mainRenderPassWrapper);
    this._setColorFormat(this._mainRenderPassWrapper);
    this._resetRenderPassStates();
    if (!this._isStencilEnable) this._stencilStateComposer.enabled = false;
  };

  engine.flushFramebuffer = function (_fromEndFrame = false) {
    this._endCurrentRenderPass();
    this._debugPopBeforeEndOfEncoder();
    gpuTimer.resolve(this._renderEncoder);
    this._commandBuffers[0] = this._uploadEncoder.finish();
    this._commandBuffers[1] = this._renderEncoder.finish();
    this._device.queue.submit(this._commandBuffers);
    gpuTimer.afterSubmit();
    this._internalFrameCounter++;
    this._uploadEncoder = this._device.createCommandEncoder(this._uploadEncoderDescriptor);
    this._renderEncoder = this._device.createCommandEncoder(this._renderEncoderDescriptor);
    if (_fromEndFrame) {
      this._debugMarkersEncoderGroups.length = 0;
      this._debugMarkersPassGroups.length = 0;
    } else {
      this._debugPushAfterStartOfEncoder();
    }
    this._timestampQuery.startFrame(this._uploadEncoder);
    this._textureHelper.setCommandEncoder(this._uploadEncoder);
    this._bundleList.reset();
  };
  return true;
}
