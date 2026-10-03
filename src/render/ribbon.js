// Ribbon (BRIEF §9.2, §9.4): a coherent water body — a tube swept along the stream's spine on the
// GPU. The spine (pos.xyz + alpha per node, newest first) is written by the frost bending system;
// one storage-buffer write per frame. Drawn after the opaque pass, premultiplied alpha.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { ribbonVertexWGSL, ribbonFragmentWGSL, RIBBON_SIDES } from '../shaders/ribbon.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {any} atmo
 * @param {Float32Array} nodes  spine (N × 4), owned by the bending system
 * @param {number} radius  tube radius at full body (m)
 */
export function createRibbon(scene, atmo, nodes, radius) {
  ShaderStore.ShadersStoreWGSL.ribbonVertexShader = ribbonVertexWGSL;
  ShaderStore.ShadersStoreWGSL.ribbonFragmentShader = ribbonFragmentWGSL;
  const engine = scene.getEngine();
  const N = nodes.length / 4, S = RIBBON_SIDES;
  // Vertex: (node, side, 0); a ring of S around each node, quads between rings.
  const pos = new Float32Array(N * S * 3), idx = [];
  for (let n = 0; n < N; n++) for (let k = 0; k < S; k++) { const o = (n * S + k) * 3; pos[o] = n; pos[o + 1] = k; }
  for (let n = 0; n + 1 < N; n++) for (let k = 0; k < S; k++) {
    const a = n * S + k, b = n * S + ((k + 1) % S), c = (n + 1) * S + k, d = (n + 1) * S + ((k + 1) % S);
    idx.push(a, c, b, b, c, d);
  }
  const mesh = new Mesh('ribbon', scene);
  const vd = new VertexData(); vd.positions = pos; vd.indices = new Uint32Array(idx); vd.applyToMesh(mesh, false);
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.doNotSyncBoundingInfo = true;
  mesh.freezeWorldMatrix();
  const buf = new StorageBuffer(engine, nodes.byteLength, undefined, 'ribbon-nodes');
  const params = new Vector4(radius, 0, N, 0); // radius, time, node count
  const mat = new ShaderMaterial('ribbon', scene, { vertex: 'ribbon', fragment: 'ribbon' }, {
    attributes: ['position'],
    uniforms: ['viewProjection', 'ribbonParams', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES],
    storageBuffers: ['ribbonNodes', ...ATMO_MATERIAL_BUFFERS, 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
    needAlphaBlending: true,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo);
  mat.setStorageBuffer('ribbonNodes', buf);
  mat.setVector4('ribbonParams', params);
  mat.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;
  mat.disableDepthWrite = true;
  mat.backFaceCulling = false;
  mesh.material = mat;
  return {
    mesh, material: mat,
    freeze() { mat.freeze(); fastFrozenIsReady(mat); },
    /** Owner field: sim time (s). Uploads the spine. */
    time: 0.5,
    update() { params.y = this.time; buf.update(nodes); },
  };
}
