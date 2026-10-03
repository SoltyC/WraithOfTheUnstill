// Crystallize formations (BRIEF §9.2): one mesh holding every crystal of the pool (fixed vertex
// count; unborn crystals collapse in the vertex shader), records in a storage buffer written only
// when a formation is cast. Opaque, shadow-casting.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { crystalVertexWGSL, crystalFragmentWGSL, CRYSTAL_SIDES } from '../shaders/crystals.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {any} atmo
 * @param {Float32Array} data  crystal records (12 floats each), owned by the bending system
 */
export function createCrystals(scene, atmo, data) {
  ShaderStore.ShadersStoreWGSL.crystalVertexShader = crystalVertexWGSL;
  ShaderStore.ShadersStoreWGSL.crystalFragmentShader = crystalFragmentWGSL;
  const engine = scene.getEngine();
  const count = data.length / 12, S = CRYSTAL_SIDES;
  const pos = [], idx = [];
  for (let c = 0; c < count; c++) {
    for (let f = 0; f < S; f++) {          // side quads
      const v = pos.length / 3;
      for (let k = 0; k < 4; k++) pos.push(c, f, k);
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
    for (let f = 0; f < S; f++) {          // tip triangles
      const v = pos.length / 3;
      for (let k = 0; k < 3; k++) pos.push(c, S + f, k);
      idx.push(v, v + 2, v + 1);
    }
  }
  const mesh = new Mesh('crystals', scene);
  const vd = new VertexData(); vd.positions = new Float32Array(pos); vd.indices = new Uint32Array(idx); vd.applyToMesh(mesh, false);
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.doNotSyncBoundingInfo = true;
  mesh.freezeWorldMatrix();
  const buf = new StorageBuffer(engine, data.byteLength, undefined, 'crystals');
  // Unborn: birth time far in the future.
  for (let c = 0; c < count; c++) data[c * 12 + 3] = 1e9;
  buf.update(data);
  const params = new Vector4(0, 0, 0, 0);
  const mat = new ShaderMaterial('crystal', scene, { vertex: 'crystal', fragment: 'crystal' }, {
    attributes: ['position'],
    uniforms: ['viewProjection', 'crystalParams', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES],
    storageBuffers: ['crystalData', ...ATMO_MATERIAL_BUFFERS, 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo);
  mat.setStorageBuffer('crystalData', buf);
  mat.setVector4('crystalParams', params);
  mat.backFaceCulling = false;
  mesh.material = mat;
  return {
    mesh, material: mat,
    makeShadowMaterial(name, light, origin) {
      const m = new ShaderMaterial(name, scene, { vertex: 'crystal', fragment: 'shadowDepth' }, {
        attributes: ['position'], uniforms: ['viewProjection', 'shadowLight', 'shadowOrigin', 'crystalParams'],
        storageBuffers: ['crystalData'], shaderLanguage: ShaderLanguage.WGSL,
      });
      m.setStorageBuffer('crystalData', buf);
      m.setVector4('shadowLight', light); m.setVector4('shadowOrigin', origin); m.setVector4('crystalParams', params);
      m.backFaceCulling = false;
      return m;
    },
    freeze() { mat.freeze(); fastFrozenIsReady(mat); },
    /** Owner fields: sim time; dirty when records changed. */
    time: 0.5, dirty: false,
    update() {
      params.x = this.time;
      if (this.dirty) { buf.update(data); this.dirty = false; }
    },
  };
}
