// Fire (shaders/fire.wgsl.js): one static mesh of FIRE_COUNT particle quads, animated entirely in
// the vertex shader; the owner writes up to eight fires (base position, size; 0 = out), the time
// and the wind. Drawn in the transparent pass after the falling snow; premultiplied, no depth write.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { fireVertexWGSL, fireFragmentWGSL, FIRE_COUNT, FIRES } from '../shaders/fire.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

export { FIRES };

export function createFire(scene, atmo) {
  ShaderStore.ShadersStoreWGSL.fireVertexShader = fireVertexWGSL;
  ShaderStore.ShadersStoreWGSL.fireFragmentShader = fireFragmentWGSL;
  const n = FIRE_COUNT;
  const pos = new Float32Array(n * 4 * 3), idx = new Uint32Array(n * 6);
  const cx = [-1, 1, 1, -1], cy = [-1, -1, 1, 1];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) { const o = (i * 4 + k) * 3; pos[o] = i; pos[o + 1] = cx[k]; pos[o + 2] = cy[k]; }
    const v = i * 4, o = i * 6;
    idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
  }
  const mesh = new Mesh('fire', scene);
  const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.applyToMesh(mesh, false);
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.doNotSyncBoundingInfo = true;
  mesh.freezeWorldMatrix();
  /** Per fire: x, y, z (base, world), size (0 = out). Written in place by the owner. */
  const fires = new Float32Array(FIRES * 4);
  const fireT = new Vector4(0, 1, 0, 0);
  const mat = new ShaderMaterial('fire', scene, { vertex: 'fire', fragment: 'fire' }, {
    attributes: ['position'],
    uniforms: ['viewProjection', 'fires', 'fireT', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES],
    storageBuffers: [...ATMO_MATERIAL_BUFFERS],
    shaderLanguage: ShaderLanguage.WGSL,
    needAlphaBlending: true,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo);
  mat.setArray4('fires', fires); mat.setVector4('fireT', fireT);
  mat.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;
  mat.disableDepthWrite = true;
  mat.backFaceCulling = false;
  mesh.material = mat;
  mat.freeze(); fastFrozenIsReady(mat);
  return { mesh, material: mat, fires, fireT };
}
