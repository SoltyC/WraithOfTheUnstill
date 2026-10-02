// Spindrift ground blow (BRIEF §5.6): one static mesh of SPINDRIFT_COUNT streak quads whose
// motion is entirely in the vertex shader (shaders/spindrift.wgsl.js). Drawn after the opaque
// terrain with premultiplied alpha and no depth write.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { spindriftVertexWGSL, spindriftFragmentWGSL, SPINDRIFT_COUNT } from '../shaders/spindrift.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {any} clipmap  createClipmap() result (levels uniform array, level data, world buffers)
 * @param {any} atmo
 */
export function createSpindrift(scene, clipmap, atmo) {
  ShaderStore.ShadersStoreWGSL.spindriftVertexShader = spindriftVertexWGSL;
  ShaderStore.ShadersStoreWGSL.spindriftFragmentShader = spindriftFragmentWGSL;
  const n = SPINDRIFT_COUNT;
  const pos = new Float32Array(n * 4 * 3), idx = new Uint32Array(n * 6);
  const cx = [-1, 1, 1, -1], cy = [-1, -1, 1, 1];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) { const o = (i * 4 + k) * 3; pos[o] = i; pos[o + 1] = cx[k]; pos[o + 2] = cy[k]; }
    const v = i * 4, o = i * 6;
    idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
  }
  const mesh = new Mesh('spindrift', scene);
  const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.applyToMesh(mesh, false);
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.doNotSyncBoundingInfo = true;
  mesh.freezeWorldMatrix();
  const drift = new Vector4(0, 1, 1, 0);
  const mat = new ShaderMaterial('spindrift', scene, { vertex: 'spindrift', fragment: 'spindrift' }, {
    attributes: ['position'],
    uniforms: ['viewProjection', 'levels', 'drift', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES],
    storageBuffers: ['levelData', 'biomeA', 'windMap', ...ATMO_MATERIAL_BUFFERS, 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
    needAlphaBlending: true,
  });
  bindEnvironment(mat);
  bindAtmosphere(mat, atmo);
  mat.setArray4('levels', clipmap.levels);
  mat.setVector4('drift', drift);
  mat.setStorageBuffer('levelData', clipmap.levelData);
  mat.setStorageBuffer('biomeA', clipmap.buffers.biomeA);
  mat.setStorageBuffer('windMap', clipmap.buffers.wind);
  mat.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;
  mat.disableDepthWrite = true;
  mat.backFaceCulling = false;
  mesh.material = mat;
  mat.freeze(); fastFrozenIsReady(mat);
  return {
    mesh, drift, material: mat,
    /** Owner fields: time (s) and strength (0..1), set before update(). */
    time: 0.5, strength: 1.5 - 0.5,
    update() { drift.x = this.time; drift.y = this.strength; },
  };
}
