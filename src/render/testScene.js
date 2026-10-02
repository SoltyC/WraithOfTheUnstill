// Phase 0 scene content: sky dome, test terrain (built on a worker), player capsule.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';

import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { terrainVertexWGSL, terrainFragmentWGSL } from '../shaders/terrain.wgsl.js';
import { skyVertexWGSL, skyFragmentWGSL } from '../shaders/sky.wgsl.js';
import { capsuleVertexWGSL, capsuleFragmentWGSL } from '../shaders/capsule.wgsl.js';
import { bindEnvironment, env } from './environment.js';
import { renderOpaqueUnsorted, fastFrozenIsReady } from './babylonTweaks.js';

function register(name, vs, fs) {
  ShaderStore.ShadersStoreWGSL[name + 'VertexShader'] = vs;
  ShaderStore.ShadersStoreWGSL[name + 'FragmentShader'] = fs;
}

function wgslMaterial(scene, name, attributes, extraUniforms) {
  const mat = new ShaderMaterial(name, scene, { vertex: name, fragment: name }, {
    attributes,
    uniforms: ['world', 'viewProjection', ...ENV_UNIFORMS, ...extraUniforms],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat);
  return mat;
}

/** Build the terrain mesh data on a worker; resolves with typed arrays. */
function buildTerrainOnWorker(cells) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('../terrain/testTerrain.worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { resolve(e.data); w.terminate(); };
    w.onerror = (e) => { reject(e); w.terminate(); };
    w.postMessage({ cells });
  });
}

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @returns {Promise<{ terrainData: { positions: Float32Array, normals: Float32Array }, terrain: Mesh, sky: Mesh, capsule: Mesh, capsuleMat: ShaderMaterial, playerPos: Vector4, bodyParams: Vector4, capsuleHalfHeight: number }>}
 */
export async function createTestScene(scene, { gridCells } = {}) {
  register('terrain', terrainVertexWGSL, terrainFragmentWGSL);
  register('sky', skyVertexWGSL, skyFragmentWGSL);
  register('capsule', capsuleVertexWGSL, capsuleFragmentWGSL);

  // Sky dome: created first so it draws first (unsorted group); never writes depth.
  const sky = CreateSphere('sky', { diameter: 2, segments: 48, sideOrientation: Mesh.BACKSIDE }, scene);
  sky.scaling.setAll(4000);
  sky.infiniteDistance = true;
  const skyMat = wgslMaterial(scene, 'sky', ['position'], ['moonDir']);
  skyMat.setVector3('moonDir', env.moonDir);
  skyMat.disableDepthWrite = true;
  skyMat.backFaceCulling = false;
  sky.material = skyMat;

  // Terrain.
  const data = await buildTerrainOnWorker(gridCells);
  const terrain = new Mesh('testTerrain', scene);
  const vd = new VertexData();
  vd.positions = data.positions;
  vd.normals = data.normals;
  vd.indices = data.indices;
  vd.applyToMesh(terrain, false);
  terrain.setVerticesData('cavity', data.cavity, false, 1);
  const playerPos = new Vector4(0, 0, 0, 0.6);
  const terrainMat = wgslMaterial(scene, 'terrain', ['position', 'normal', 'cavity'], ['playerPos']);
  terrainMat.setVector4('playerPos', playerPos);
  terrain.material = terrainMat;

  // Player capsule (Phase 3 replaces it with the Wraith).
  const capsuleHalfHeight = 0.9;
  const capsule = CreateCapsule('player', { height: capsuleHalfHeight * 2, radius: 0.32, tessellation: 48, subdivisions: 8, capSubdivisions: 12 }, scene);
  const bodyParams = new Vector4(capsuleHalfHeight, 1, 0, 0);
  const capsuleMat = wgslMaterial(scene, 'capsule', ['position', 'normal'], ['bodyParams']);
  capsuleMat.setVector4('bodyParams', bodyParams);
  capsule.material = capsuleMat;

  // Static content: freeze everything that never changes (BRIEF §14).
  terrain.freezeWorldMatrix();
  terrain.doNotSyncBoundingInfo = true;
  terrain.alwaysSelectAsActiveMesh = true;
  sky.alwaysSelectAsActiveMesh = true;
  capsule.alwaysSelectAsActiveMesh = true;
  skyMat.depthFunction = Constants.LEQUAL;
  // Frozen materials skip Babylon's per-frame isReady (which rebuilds a defines string).
  // Uniforms still update: each material rebinds whenever the cached material changes.
  skyMat.freeze();
  terrainMat.freeze();
  capsuleMat.freeze();
  fastFrozenIsReady(skyMat);
  fastFrozenIsReady(terrainMat);
  fastFrozenIsReady(capsuleMat);
  // One rendering group, drawn unsorted in creation order: sky (far-plane depth, no depth
  // write) first, then terrain and player. Avoids a second render pass for a group depth clear,
  // and Array.sort with a comparator allocates.
  renderOpaqueUnsorted(scene, [0]);

  return { terrainData: { positions: data.positions, normals: data.normals }, terrain, sky, capsule, capsuleMat, playerPos, bodyParams, capsuleHalfHeight };
}
