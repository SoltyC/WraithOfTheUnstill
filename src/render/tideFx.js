// Tide FX (shaders/tideFx.wgsl.js): one static mesh of TIDE_COUNT particle quads, animated entirely in the vertex shader; the owner
// (bending/tide.js writeFx) writes ten vec4 (three surges, the draw, the undertow; strength 0 = out) and the time. Drawn in the
// transparent pass; premultiplied, no depth write.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { tideFxVertexWGSL, tideFxFragmentWGSL, TIDE_COUNT, TIDE_FX_VEC4 } from '../shaders/tideFx.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

export { TIDE_COUNT };

export function createTideFx(scene, atmo) {
  ShaderStore.ShadersStoreWGSL.tideFxVertexShader = tideFxVertexWGSL;
  ShaderStore.ShadersStoreWGSL.tideFxFragmentShader = tideFxFragmentWGSL;
  const n = TIDE_COUNT;
  const pos = new Float32Array(n * 4 * 3), idx = new Uint32Array(n * 6);
  const cx = [-1, 1, 1, -1], cy = [-1, -1, 1, 1];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) { const o = (i * 4 + k) * 3; pos[o] = i; pos[o + 1] = cx[k]; pos[o + 2] = cy[k]; }
    const v = i * 4, o = i * 6;
    idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
  }
  const mesh = new Mesh('tideFx', scene);
  const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.applyToMesh(mesh, false);
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.doNotSyncBoundingInfo = true;
  mesh.freezeWorldMatrix();
  /** The bending's block (tide.js writeFx, TIDE_FX_VEC4 vec4). Written in place by the owner. */
  const tide = new Float32Array(TIDE_FX_VEC4 * 4);
  /** x = time (s). */
  const tideT = new Vector4(0, 0, 0, 0);
  const mat = new ShaderMaterial('tideFx', scene, { vertex: 'tideFx', fragment: 'tideFx' }, {
    attributes: ['position'],
    uniforms: ['viewProjection', 'tide', 'tideT', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES],
    storageBuffers: [...ATMO_MATERIAL_BUFFERS],
    shaderLanguage: ShaderLanguage.WGSL,
    needAlphaBlending: true,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo);
  mat.setArray4('tide', tide); mat.setVector4('tideT', tideT);
  mat.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;
  mat.disableDepthWrite = true;
  mat.backFaceCulling = false;
  mesh.material = mat;
  mat.freeze(); fastFrozenIsReady(mat);
  return {
    mesh, material: mat, tide, tideT,
    /** Push the arrays to the material (no allocation: the same array and vector every frame). */
    update() { mat.setArray4('tide', tide); mat.setVector4('tideT', tideT); },
  };
}
