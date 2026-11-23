// The volcano's plume (shaders/plume.wgsl.js): one static mesh of PLUME_COUNT puff quads, its motion all in the vertex
// shader. Owner fields: the crater (x, y, z), time, wind (x, z), height, strength; glow (night 0..1) and darkness; scale (a steam
// vent: a few hundredths) and steam (0..1, white).

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { plumeVertexWGSL, plumeFragmentWGSL, PLUME_COUNT } from '../shaders/plume.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

/** @param {{ count?: number, name?: string }} [opt]  count: puffs (default PLUME_COUNT); a small steam vent wants a few dozen. */
export function createPlume(scene, atmo, opt = {}) {
  ShaderStore.ShadersStoreWGSL.plumeVertexShader = plumeVertexWGSL;
  ShaderStore.ShadersStoreWGSL.plumeFragmentShader = plumeFragmentWGSL;
  const n = opt.count || PLUME_COUNT, pos = new Float32Array(n * 4 * 3), idx = new Uint32Array(n * 6);
  const cx = [-1, 1, 1, -1], cy = [-1, -1, 1, 1];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) { const o = (i * 4 + k) * 3; pos[o] = i; pos[o + 1] = cx[k]; pos[o + 2] = cy[k]; }
    const v = i * 4, o = i * 6;
    idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
  }
  const mesh = new Mesh(opt.name || 'plume', scene);
  const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.applyToMesh(mesh, false);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
  const A = new Vector4(0, 0, 0, 0), B = new Vector4(1, 0, 650, 1), C = new Vector4(0, 0, 0, 0);
  const mat = new ShaderMaterial('plume', scene, { vertex: 'plume', fragment: 'plume' }, {
    attributes: ['position'],
    uniforms: ['viewProjection', 'plumeA', 'plumeB', 'plumeC', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES], storageBuffers: [...ATMO_MATERIAL_BUFFERS],
    shaderLanguage: ShaderLanguage.WGSL, needAlphaBlending: true,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo);
  mat.setVector4('plumeA', A); mat.setVector4('plumeB', B); mat.setVector4('plumeC', C);
  mat.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;
  mat.disableDepthWrite = true; mat.backFaceCulling = false;
  mesh.material = mat;
  return {
    mesh, material: mat,
    x: 0, y: 0, z: 0, time: 0, windX: 1, windZ: 0, height: 650, strength: 1, glow: 0, dark: 0, scale: 1, steam: 0,
    update() {
      A.set(this.x, this.y, this.z, this.time); B.set(this.windX, this.windZ, this.height, this.strength); C.set(this.glow, this.dark, this.scale, this.steam);
      mat.setVector4('plumeA', A); mat.setVector4('plumeB', B); mat.setVector4('plumeC', C);
    },
    freeze() { mat.freeze(); fastFrozenIsReady(mat); },
  };
}
