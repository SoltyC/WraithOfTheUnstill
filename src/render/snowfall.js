// Falling snow (weather): one static mesh of SNOW_COUNT flake quads whose motion is entirely in
// the vertex shader (shaders/snowfall.wgsl.js). Drawn after the opaque terrain, premultiplied,
// no depth write. The owner integrates fall and wind travel, so speed changes never jump.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { snowVertexWGSL, snowFragmentWGSL, SNOW_COUNT } from '../shaders/snowfall.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {any} clipmap  createClipmap() result (levels uniform array, level data, world buffers)
 * @param {any} atmo
 */
export function createSnowfall(scene, clipmap, atmo) {
  ShaderStore.ShadersStoreWGSL.snowfallVertexShader = snowVertexWGSL;
  ShaderStore.ShadersStoreWGSL.snowfallFragmentShader = snowFragmentWGSL;
  const n = SNOW_COUNT;
  const pos = new Float32Array(n * 4 * 3), idx = new Uint32Array(n * 6);
  const cx = [-1, 1, 1, -1], cy = [-1, -1, 1, 1];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) { const o = (i * 4 + k) * 3; pos[o] = i; pos[o + 1] = cx[k]; pos[o + 2] = cy[k]; }
    const v = i * 4, o = i * 6;
    idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
  }
  const mesh = new Mesh('snowfall', scene);
  const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.applyToMesh(mesh, false);
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.doNotSyncBoundingInfo = true;
  mesh.freezeWorldMatrix();
  const snow = new Vector4(0, 0, 0, 0), wind = new Vector4(1, 0, 1, 0);
  const mat = new ShaderMaterial('snowfall', scene, { vertex: 'snowfall', fragment: 'snowfall' }, {
    attributes: ['position'],
    uniforms: ['viewProjection', 'levels', 'snow', 'snowWind', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES],
    storageBuffers: ['levelData', 'biomeA', 'windMap', ...ATMO_MATERIAL_BUFFERS, 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
    needAlphaBlending: true,
  });
  bindEnvironment(mat);
  bindAtmosphere(mat, atmo);
  mat.setArray4('levels', clipmap.levels);
  mat.setVector4('snow', snow);
  mat.setVector4('snowWind', wind);
  mat.setStorageBuffer('levelData', clipmap.levelData);
  mat.setStorageBuffer('biomeA', clipmap.buffers.biomeA);
  mat.setStorageBuffer('windMap', clipmap.buffers.wind);
  mat.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;
  mat.disableDepthWrite = true;
  mat.backFaceCulling = false;
  mesh.material = mat;
  mat.freeze(); fastFrozenIsReady(mat);
  return {
    mesh, material: mat,
    /** Owner fields, set before update(): density 0..1, wind speed (m/s) and direction (unit
     *  x, z), fall speed (m/s), dt (s). */
    density: 0.5 - 0.5, windSpeed: 0.5, windX: 1.5 - 0.5, windZ: 0.5 - 0.5, fallSpeed: 1.5 - 0.5, dt: 0.5 - 0.5,
    fallT: 0.5 - 0.5, windTX: 0.5 - 0.5, windTZ: 0.5 - 0.5,
    update() {
      // Travel is integrated as a vector, so turning wind never jumps; wrapped by whole columns.
      this.fallT += this.fallSpeed * this.dt;
      this.windTX += this.windX * this.windSpeed * this.dt; this.windTZ += this.windZ * this.windSpeed * this.dt;
      if (this.fallT > 18 * 500) this.fallT -= 18 * 500;
      if (this.windTX > 52 * 100) this.windTX -= 52 * 100; else if (this.windTX < -52 * 100) this.windTX += 52 * 100;
      if (this.windTZ > 52 * 100) this.windTZ -= 52 * 100; else if (this.windTZ < -52 * 100) this.windTZ += 52 * 100;
      snow.x = this.fallT; snow.y = this.density; snow.z = this.windTX; snow.w = this.windTZ;
      wind.x = this.windX; wind.y = this.windZ; wind.z = this.fallSpeed; wind.w = this.windSpeed;
    },
  };
}
