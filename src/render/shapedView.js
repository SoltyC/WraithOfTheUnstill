// The Shaped's renderer: one mesh holding every chunk slot of the pool (an icosphere per chunk,
// chunk index in uv.x), records from the Shaped system uploaded once per frame. Opaque,
// shadow-casting. Empty slots collapse in the vertex shader (fixed draw: snapshot rendering).

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { CreateIcoSphereVertexData } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder.js';
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { shapedVertexWGSL, shapedFragmentWGSL } from '../shaders/shaped.wgsl.js';
import { wardenVertexWGSL, wardenFragmentWGSL } from '../shaders/warden.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {any} atmo
 * @param {Float32Array} chunks  records (16 floats each) owned by the Shaped system
 */
export function createShapedView(scene, atmo, chunks, opts = {}) {
  ShaderStore.ShadersStoreWGSL.shapedVertexShader = shapedVertexWGSL;
  ShaderStore.ShadersStoreWGSL.shapedFragmentShader = shapedFragmentWGSL;
  ShaderStore.ShadersStoreWGSL.wardenVertexShader = wardenVertexWGSL;
  ShaderStore.ShadersStoreWGSL.wardenFragmentShader = wardenFragmentWGSL;
  const shader = opts.shader || 'shaped';
  const engine = scene.getEngine();
  const count = chunks.length / 16;
  const ico = CreateIcoSphereVertexData({ radius: 1, subdivisions: opts.subdivisions ?? 1, flat: false });
  const nv = ico.positions.length / 3, ni = ico.indices.length;
  const pos = new Float32Array(count * nv * 3), uv = new Float32Array(count * nv * 2), idx = new Uint32Array(count * ni);
  for (let c = 0; c < count; c++) {
    pos.set(ico.positions, c * nv * 3);
    for (let v = 0; v < nv; v++) uv[(c * nv + v) * 2] = c;
    for (let k = 0; k < ni; k++) idx[c * ni + k] = ico.indices[k] + c * nv;
  }
  const name = opts.name || 'shaped';
  const mesh = new Mesh(name, scene);
  const vd = new VertexData(); vd.positions = pos; vd.uvs = uv; vd.indices = idx; vd.applyToMesh(mesh, false);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
  const buf = new StorageBuffer(engine, chunks.byteLength, undefined, name + '-chunks');
  buf.update(chunks);
  // Optional neighbour lists (the Warden's smooth-mass shading).
  const nbr = opts.neighbours || null;
  const nbrBuf = nbr ? new StorageBuffer(engine, nbr.byteLength, undefined, name + '-nbr') : null;
  if (nbrBuf) nbrBuf.update(nbr);
  const sbufs = nbr ? ['chunkData', 'chunkNbr'] : ['chunkData'];
  const mat = new ShaderMaterial(name, scene, { vertex: shader, fragment: shader }, {
    attributes: ['position', 'uv'],
    uniforms: ['viewProjection', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES],
    storageBuffers: [...sbufs, ...ATMO_MATERIAL_BUFFERS, 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo);
  mat.setStorageBuffer('chunkData', buf);
  if (nbrBuf) mat.setStorageBuffer('chunkNbr', nbrBuf);
  mesh.material = mat;
  return {
    mesh, material: mat,
    makeShadowMaterial(name, light, origin) {
      const m = new ShaderMaterial(name, scene, { vertex: shader, fragment: 'shadowDepth' }, {
        attributes: ['position', 'uv'], uniforms: ['viewProjection', 'shadowLight', 'shadowOrigin'],
        storageBuffers: sbufs, shaderLanguage: ShaderLanguage.WGSL,
      });
      m.setStorageBuffer('chunkData', buf);
      if (nbrBuf) m.setStorageBuffer('chunkNbr', nbrBuf);
      m.setVector4('shadowLight', light); m.setVector4('shadowOrigin', origin);
      return m;
    },
    freeze() { mat.freeze(); fastFrozenIsReady(mat); },
    update() { buf.update(chunks); },
    /** Re-upload the neighbour lists (they change only when the rig is re-measured). */
    updateNeighbours() { if (nbrBuf) nbrBuf.update(nbr); },
  };
}
