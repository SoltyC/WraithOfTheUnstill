// The far forest (docs/meadow-overhaul.md M2): octahedral impostors of the meadow's trees, from the
// near trees' edge (LOD_OUT) to the horizon ring. Baked at load on the GPU (raw WebGPU, one pass per
// variant, IMP_N² views over the upper hemisphere) from the very variants the near trees draw, with
// their leaf atlas, bark scans, colour variation and crown depth — so a tree hands over at LOD_OUT
// without changing. Drawn as one thin-instanced quad per tree (shaders/impostor.wgsl.js).

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js';
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { impostorVertexWGSL, impostorFragmentWGSL, impostorBakeWGSL, impostorShadowVertexWGSL, impostorShadowFragmentWGSL, impostorDepthFragmentWGSL } from '../shaders/impostor.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

const gpuTex = (t) => t.getInternalTexture()._hardwareTexture.underlyingResource;

/** Wrap a raw 2D-array GPUTexture for Babylon (as materials/library.js does). */
function wrapArray(engine, scene, tex, size, layers, srgb, name) {
  const it = engine.wrapWebGPUTexture(tex);
  it.is2DArray = true; it.depth = layers; it.baseDepth = layers; it.generateMipMaps = true; it.type = 0; it.format = 5;
  it._useSRGBBuffer = srgb;
  it._hardwareTexture.setUsage(0, true, true, false, false, size, size, layers);
  it.samplingMode = Constants.TEXTURE_TRILINEAR_SAMPLINGMODE; it.useMipMaps = true;
  it.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE; it.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
  it._cachedAnisotropicFilteringLevel = 4;
  const t = new BaseTexture(scene, it);
  t.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE; t.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE; t.anisotropicFilteringLevel = 4;
  t.name = name;
  return t;
}

/**
 * Bake the impostors and make their draw.
 * @param {any} scene @param {any} atmo
 * @param {{ trees: { geom: any, barkLayer: number }[], leafColor: any, leafSurface: any, barkAlb: any, n: number, px: number, max: number }} o
 */
export function createImpostors(scene, atmo, o) {
  const engine = scene.getEngine(), dev = engine._device;
  const N = o.n, PX = o.px, S = N * PX, L = o.trees.length, mips = Math.floor(Math.log2(S)) + 1;
  const t0 = performance.now();
  const USAGE = 0x04 | 0x02 | 0x10;
  const alb = dev.createTexture({ label: 'imp-alb', size: [S, S, L], format: 'rgba8unorm-srgb', mipLevelCount: mips, usage: USAGE, dimension: '2d' });
  const nrm = dev.createTexture({ label: 'imp-nrm', size: [S, S, L], format: 'rgba8unorm', mipLevelCount: mips, usage: USAGE, dimension: '2d' });
  const depth = dev.createTexture({ label: 'imp-depth', size: [S, S, 1], format: 'depth24plus', usage: 0x10 });
  const module = dev.createShaderModule({ label: 'imp-bake', code: impostorBakeWGSL(N) });
  const bgl = dev.createBindGroupLayout({ entries: [
    { binding: 0, visibility: 3, buffer: { type: 'uniform', hasDynamicOffset: true } },
    { binding: 1, visibility: 2, texture: { sampleType: 'float' } },
    { binding: 2, visibility: 2, texture: { sampleType: 'float' } },
    { binding: 3, visibility: 2, texture: { sampleType: 'float', viewDimension: '2d-array' } },
    { binding: 4, visibility: 2, sampler: { type: 'filtering' } },
  ] });
  const pipe = dev.createRenderPipeline({
    label: 'imp-bake', layout: dev.createPipelineLayout({ bindGroupLayouts: [bgl] }),
    vertex: { module, entryPoint: 'vs', buffers: [
      { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
      { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] },
      { arrayStride: 8, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x2' }] },
      { arrayStride: 16, attributes: [{ shaderLocation: 3, offset: 0, format: 'float32x4' }] },
    ] },
    fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm-srgb' }, { format: 'rgba8unorm' }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });
  const SLOT = 256, frames = N * N;
  const ubuf = dev.createBuffer({ size: SLOT * frames * L, usage: 0x40 | 0x08 });
  const sampler = dev.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', maxAnisotropy: 4 });
  const bg = dev.createBindGroup({ layout: bgl, entries: [
    { binding: 0, resource: { buffer: ubuf, size: 64 } },
    { binding: 1, resource: gpuTex(o.leafColor).createView() },
    { binding: 2, resource: gpuTex(o.leafSurface).createView() },
    { binding: 3, resource: gpuTex(o.barkAlb).createView({ dimension: '2d-array' }) },
    { binding: 4, resource: sampler },
  ] });
  const layerInfo = new Float32Array(L * 4);
  const U = new Float32Array(SLOT / 4 * frames * L);
  const bufs = [];
  o.trees.forEach((t, l) => {
    const g = t.geom, P = g.positions;
    let y0 = 1e9, y1 = -1e9;
    for (let i = 1; i < P.length; i += 3) { y0 = Math.min(y0, P[i]); y1 = Math.max(y1, P[i]); }
    const cy = (y0 + y1) / 2;
    let R = 0;
    for (let i = 0; i < P.length; i += 3) R = Math.max(R, Math.hypot(P[i], P[i + 1] - cy, P[i + 2]));
    R *= 1.02;
    layerInfo[l * 4] = cy; layerInfo[l * 4 + 1] = R;
    for (let f = 0; f < frames; f++) {
      const b = (l * frames + f) * SLOT / 4;
      U[b + 4] = 0; U[b + 5] = cy; U[b + 6] = 0; U[b + 7] = R;
      U[b + 8] = f % N; U[b + 9] = Math.floor(f / N); U[b + 10] = t.barkLayer;
    }
    const mk = (arr, usage) => { const bf = dev.createBuffer({ size: Math.ceil(arr.byteLength / 4) * 4, usage: usage | 0x08 }); dev.queue.writeBuffer(bf, 0, arr); return bf; };
    bufs.push({ p: mk(g.positions, 0x20), n: mk(g.normals, 0x20), u: mk(g.uvs, 0x20), i4: mk(g.info, 0x20), idx: mk(g.indices, 0x10), count: g.indices.length });
  });
  dev.queue.writeBuffer(ubuf, 0, U);
  const enc = dev.createCommandEncoder({ label: 'imp-bake' });
  for (let l = 0; l < L; l++) {
    const b = bufs[l];
    const pass = enc.beginRenderPass({
      colorAttachments: [
        { view: alb.createView({ dimension: '2d', baseArrayLayer: l, arrayLayerCount: 1, baseMipLevel: 0, mipLevelCount: 1 }), clearValue: { r: 0.05, g: 0.08, b: 0.03, a: 0 }, loadOp: 'clear', storeOp: 'store' },
        { view: nrm.createView({ dimension: '2d', baseArrayLayer: l, arrayLayerCount: 1, baseMipLevel: 0, mipLevelCount: 1 }), clearValue: { r: 0.5, g: 1.0, b: 0.5, a: 0.5 }, loadOp: 'clear', storeOp: 'store' },
      ],
      depthStencilAttachment: { view: depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
    });
    pass.setPipeline(pipe);
    pass.setVertexBuffer(0, b.p); pass.setVertexBuffer(1, b.n); pass.setVertexBuffer(2, b.u); pass.setVertexBuffer(3, b.i4);
    pass.setIndexBuffer(b.idx, 'uint32');
    for (let f = 0; f < frames; f++) {
      pass.setViewport((f % N) * PX, Math.floor(f / N) * PX, PX, PX, 0, 1);
      pass.setBindGroup(0, bg, [(l * frames + f) * SLOT]);
      pass.drawIndexed(b.count);
    }
    pass.end();
  }
  dev.queue.submit([enc.finish()]);
  for (let l = 0; l < L; l++) { engine._textureHelper.generateMipmaps(alb, mips, l); engine._textureHelper.generateMipmaps(nrm, mips, l); }
  for (const b of bufs) for (const k of ['p', 'n', 'u', 'i4', 'idx']) b[k].destroy();
  depth.destroy();
  const bakeMs = performance.now() - t0;

  // ── The draw ──────────────────────────────────────────────────────────────────────────────────
  ShaderStore.ShadersStoreWGSL.impostorVertexShader = impostorVertexWGSL(N);
  ShaderStore.ShadersStoreWGSL.impostorFragmentShader = impostorFragmentWGSL;
  ShaderStore.ShadersStoreWGSL.impostorShadowVertexShader = impostorShadowVertexWGSL(N);
  ShaderStore.ShadersStoreWGSL.impostorShadowFragmentShader = impostorShadowFragmentWGSL;
  ShaderStore.ShadersStoreWGSL.impostorDepthFragmentShader = impostorDepthFragmentWGSL;
  const mesh = new Mesh('treeImpostors', scene);
  const vd = new VertexData();
  vd.positions = [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]; vd.indices = [0, 2, 1, 0, 3, 2];
  vd.applyToMesh(mesh, false);
  const buf = new Float32Array(o.max * 16);
  mesh.thinInstanceSetBuffer('matrix', buf, 16, false);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true;
  const layers = new StorageBuffer(engine, layerInfo.byteLength, undefined, 'imp-layers');
  layers.update(layerInfo);
  const params = new Vector4(0, 1, 1e6, 1e6);
  const mat = new ShaderMaterial('treeImpostors', scene, { vertex: 'impostor', fragment: 'impostor' }, {
    attributes: ['position'],
    uniforms: ['viewProjection', 'impParams', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES, 'impAlb', 'impNrm'],
    storageBuffers: ['impLayers', ...ATMO_MATERIAL_BUFFERS, 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo);
  const albT = wrapArray(engine, scene, alb, S, L, true, 'imp-alb');
  mat.setTexture('impAlb', albT);
  mat.setTexture('impNrm', wrapArray(engine, scene, nrm, S, L, false, 'imp-nrm'));
  mat.setStorageBuffer('impLayers', layers);
  mat.setVector4('impParams', params);
  mat.backFaceCulling = false;
  mesh.material = mat;
  mesh.thinInstanceCount = 1;
  // Depth prepass ('treeZ' meshes draw first: render/trees.js): coverage only, then colour at depth EQUAL.
  const zMesh = new Mesh('treeZ-impostors', scene);
  vd.applyToMesh(zMesh, false);
  zMesh.thinInstanceSetBuffer('matrix', buf, 16, false);
  zMesh.alwaysSelectAsActiveMesh = true; zMesh.doNotSyncBoundingInfo = true;
  const zMat = new ShaderMaterial('treeZ-impostors', scene, { vertex: 'impostor', fragment: 'impostorDepth' }, {
    attributes: ['position'], uniforms: ['viewProjection', 'impParams', 'cameraPosition', 'artParams'],
    samplers: ['impAlb'], storageBuffers: ['impLayers'], shaderLanguage: ShaderLanguage.WGSL,
  });
  zMat.setTexture('impAlb', albT); zMat.setStorageBuffer('impLayers', layers); zMat.setVector4('impParams', params);
  bindEnvironment(zMat);
  zMat.disableColorWrite = true; zMat.backFaceCulling = false;
  zMesh.material = zMat; zMesh.thinInstanceCount = 1;
  mat.depthFunction = Constants.EQUAL; mat.disableDepthWrite = true;
  return {
    mesh, zMesh, material: mat, buf, max: o.max, bakeMs, params, layerInfo,
    /** n instances written to buf (16 floats each: world0..world3, see the vertex shader). */
    commit(n) {
      const cap = Math.min(o.max, Math.max(2048, Math.ceil(n / 2048) * 2048));
      for (let k = n; k < cap; k++) buf[k * 16 + 2] = 0;
      mesh.thinInstanceBufferUpdated('matrix'); zMesh.thinInstanceBufferUpdated('matrix');
      const changed = mesh.thinInstanceCount !== cap;
      mesh.thinInstanceCount = cap; zMesh.thinInstanceCount = cap;
      return changed;
    },
    /** The far cascades' caster material (render/shadows.js addCaster). */
    makeShadowMaterial(name, light, origin) {
      const m = new ShaderMaterial(name, scene, { vertex: 'impostorShadow', fragment: 'impostorShadow' }, {
        attributes: ['position'], uniforms: ['viewProjection', 'shadowLight', 'shadowOrigin'],
        samplers: ['impAlb'], storageBuffers: ['impLayers'], shaderLanguage: ShaderLanguage.WGSL,
      });
      m.setTexture('impAlb', albT); m.setStorageBuffer('impLayers', layers);
      m.setVector4('shadowLight', light); m.setVector4('shadowOrigin', origin);
      m.backFaceCulling = false;
      return m;
    },
    /** Show or hide the far forest (with its prepass). */
    setEnabled(on) { mesh.setEnabled(on); zMesh.setEnabled(on); },
    freeze() { mat.freeze(); fastFrozenIsReady(mat); zMat.freeze(); fastFrozenIsReady(zMat); },
  };
}
