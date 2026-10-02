// Scene content for the streamed world (Phase 1): sky dome, clipmap terrain, player capsule.
// Replaces Phase 0's test scene. Single rendering group, drawn unsorted in creation order (sky
// first, far-plane depth, no depth write).

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';

import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { skyVertexWGSL, skyFragmentWGSL } from '../shaders/sky.wgsl.js';
import { capsuleVertexWGSL, capsuleFragmentWGSL } from '../shaders/capsule.wgsl.js';
import { bindEnvironment, env } from './environment.js';
import { createClipmap } from './clipmap.js';
import { renderOpaqueUnsorted, fastFrozenIsReady } from './babylonTweaks.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';

function register(name, vs, fs) {
  ShaderStore.ShadersStoreWGSL[name + 'VertexShader'] = vs;
  ShaderStore.ShadersStoreWGSL[name + 'FragmentShader'] = fs;
}

export function wgslMaterial(scene, name, attributes, extraUniforms, atmo, receivesShadows = false) {
  const mat = new ShaderMaterial(name, scene, { vertex: name, fragment: name }, {
    attributes,
    uniforms: ['world', 'viewProjection', ...ENV_UNIFORMS, ...extraUniforms],
    samplers: receivesShadows ? [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES] : ATMO_MATERIAL_TEXTURES,
    storageBuffers: receivesShadows ? [...ATMO_MATERIAL_BUFFERS, 'shadowData'] : ATMO_MATERIAL_BUFFERS,
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat);
  bindAtmosphere(mat, atmo);
  return mat;
}

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {Record<string, any>} worldBuffers  WorldStreamer storage buffers
 * @param {ReturnType<typeof import('./atmosphere.js').createAtmosphere>} atmo
 */
export function createWorldScene(scene, worldBuffers, atmo) {
  register('sky', skyVertexWGSL, skyFragmentWGSL);
  register('capsule', capsuleVertexWGSL, capsuleFragmentWGSL);

  // Sky dome first (creation order = draw order in the unsorted group).
  const sky = CreateSphere('sky', { diameter: 2, segments: 48, sideOrientation: Mesh.BACKSIDE }, scene);
  sky.scaling.setAll(1000);
  sky.infiniteDistance = true;
  const skyMat = wgslMaterial(scene, 'sky', ['position'], ['moonDir'], atmo);
  skyMat.setVector3('moonDir', env.moonDir);
  skyMat.disableDepthWrite = true;
  skyMat.backFaceCulling = false;
  sky.material = skyMat;

  const clipmap = createClipmap(scene, worldBuffers, atmo);

  const capsuleHalfHeight = 0.9;
  const capsule = CreateCapsule('player', { height: capsuleHalfHeight * 2, radius: 0.32, tessellation: 48, subdivisions: 8, capSubdivisions: 12 }, scene);
  const bodyParams = new Vector4(capsuleHalfHeight, 1, 0, 0);
  const capsuleMat = wgslMaterial(scene, 'capsule', ['position', 'normal'], ['bodyParams'], atmo, true);
  capsuleMat.setVector4('bodyParams', bodyParams);
  capsule.material = capsuleMat;

  sky.alwaysSelectAsActiveMesh = true;
  capsule.alwaysSelectAsActiveMesh = true;
  for (const m of [skyMat, clipmap.material, capsuleMat]) { m.freeze(); fastFrozenIsReady(m); }
  renderOpaqueUnsorted(scene, [0]);

  return { sky, clipmap, terrain: clipmap.mesh, capsule, capsuleMat, playerPos: clipmap.playerPos, bodyParams, capsuleHalfHeight };
}
