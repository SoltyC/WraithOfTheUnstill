// Sand ground blow and rising disturbance puffs: one bounded static draw, no per-particle CPU updates.
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { sandDustVertexWGSL, sandDustFragmentWGSL, SAND_DUST_COUNT } from '../shaders/sandDust.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { createSandDustEvents } from '../world/sandDust.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {any} clipmap  createClipmap() result (levels uniform array, level data, world buffers)
 * @param {any} atmo
 */
export function createSandDust(scene, clipmap, atmo, wind, ts) {
  ShaderStore.ShadersStoreWGSL.sandDustVertexShader = sandDustVertexWGSL;
  ShaderStore.ShadersStoreWGSL.sandDustFragmentShader = sandDustFragmentWGSL;
  const n = SAND_DUST_COUNT;
  const pos = new Float32Array(n * 4 * 3), idx = new Uint32Array(n * 6);
  const cx = [-1, 1, 1, -1], cy = [-1, -1, 1, 1];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) { const o = (i * 4 + k) * 3; pos[o] = i; pos[o + 1] = cx[k]; pos[o + 2] = cy[k]; }
    const v = i * 4, o = i * 6;
    idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
  }
  const mesh = new Mesh('sandDust', scene);
  const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.applyToMesh(mesh, false);
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.doNotSyncBoundingInfo = true;
  mesh.freezeWorldMatrix();
  const dustParams = new Vector4(0, 0, 1, 0);
  const bursts = createSandDustEvents();
  const dustWind = new Float32Array(wind.block);
  const mat = new ShaderMaterial('sandDust', scene, { vertex: 'sandDust', fragment: 'sandDust' }, {
    attributes: ['position'],
    uniforms: ['viewProjection', 'levels', 'dustParams', 'dustEvents', 'windField', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES],
    storageBuffers: ['levelData', 'surface', 'stateFine0', 'stateFine1', 'stateParams', ...ATMO_MATERIAL_BUFFERS, 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
    needAlphaBlending: true,
  });
  bindEnvironment(mat);
  bindAtmosphere(mat, atmo);
  mat.setArray4('levels', clipmap.levels);
  mat.setVector4('dustParams', dustParams);
  mat.setArray4('dustEvents', bursts.events);
  mat.setArray4('windField', wind.block);
  mat.setStorageBuffer('levelData', clipmap.levelData);
  mat.setStorageBuffer('surface', clipmap.buffers.surface);
  mat.setStorageBuffer('stateFine0', ts.fine[0]);
  mat.setStorageBuffer('stateFine1', ts.fine[1]);
  mat.setStorageBuffer('stateParams', ts.params);
  mat.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;
  mat.disableDepthWrite = true;
  mat.backFaceCulling = false;
  mesh.material = mat;
  mat.freeze(); fastFrozenIsReady(mat);
  return {
    mesh, material: mat, dustParams, bursts,
    time: 0.5, wet: 0.0, restored: 0.0, strength: 1.0, windStrength: 0.0,
    update() {
      dustParams.x = this.time; dustParams.y = this.wet;
      dustParams.z = this.strength; dustParams.w = this.restored;
      mat.setVector4('dustParams', dustParams);
      mat.setArray4('dustEvents', bursts.events);
      dustWind.set(wind.block); dustWind[2] = this.windStrength;
      mat.setArray4('windField', dustWind);
    },
  };
}
