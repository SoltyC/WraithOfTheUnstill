// Distant mountain ring (BRIEF §2.3): requests the mesh from ring.worker.js, then builds one static
// mesh with the ring material. Call before the warm-up so its pipeline exists before the
// late-pipeline detector arms and before snapshot rendering records.

import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ringVertexWGSL, ringFragmentWGSL } from '../shaders/ring.wgsl.js';
import { wgslMaterial } from './worldScene.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

/** Starts the worker immediately; the returned promise resolves to the mesh arrays. */
export function requestRing(seed) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../world/ring.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { worker.terminate(); resolve(e.data); };
    worker.onerror = (e) => { worker.terminate(); reject(e); };
    worker.postMessage({ seed });
  });
}

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {any} atmo
 * @param {{ positions: Float32Array, normals: Float32Array, indices: Uint32Array }} data
 */
export function createMountainRing(scene, atmo, data) {
  ShaderStore.ShadersStoreWGSL.ringVertexShader = ringVertexWGSL;
  ShaderStore.ShadersStoreWGSL.ringFragmentShader = ringFragmentWGSL;
  const mesh = new Mesh('mountainRing', scene);
  const vd = new VertexData();
  vd.positions = data.positions; vd.normals = data.normals; vd.indices = data.indices;
  vd.applyToMesh(mesh, false);
  const mat = wgslMaterial(scene, 'ring', ['position', 'normal'], [], atmo);
  mesh.material = mat;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.doNotSyncBoundingInfo = true;
  mesh.freezeWorldMatrix();
  mat.freeze(); fastFrozenIsReady(mat);
  return mesh;
}
