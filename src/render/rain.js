// Rain (weather, Phase 8 M11): the snowfall renderer's sibling. Two static meshes whose motion is
// entirely in the vertex shaders (shaders/rain.wgsl.js): RAIN_COUNT streak quads falling through a
// camera-centred column, and SPLASH_COUNT ground splashes (rings on water, crowns on land) around
// the camera. Drawn after the opaque scene, premultiplied, no depth write. The owner integrates
// fall and wind travel, so speed changes never jump.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { rainVertexWGSL, rainFragmentWGSL, splashVertexWGSL, splashFragmentWGSL, RAIN_COUNT, SPLASH_COUNT, RAIN_HT, RAIN_R } from '../shaders/rain.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

/** Quads of n items: position = (item id, corner x, corner y); optionally a second kind per item. */
function quadMesh(scene, name, n, kinds) {
  const per = kinds * 4, pos = new Float32Array(n * per * 3), uv = new Float32Array(n * per * 2), idx = new Uint32Array(n * kinds * 6);
  const cx = [-1, 1, 1, -1], cy = [-1, -1, 1, 1];
  for (let i = 0; i < n; i++) {
    for (let q = 0; q < kinds; q++) {
      for (let k = 0; k < 4; k++) { const o = (i * per + q * 4 + k); pos[o * 3] = i; pos[o * 3 + 1] = cx[k]; pos[o * 3 + 2] = cy[k]; uv[o * 2] = q; }
      const v = i * per + q * 4, o = (i * kinds + q) * 6;
      idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
    }
  }
  const mesh = new Mesh(name, scene);
  const vd = new VertexData(); vd.positions = pos; vd.indices = idx; if (kinds > 1) vd.uvs = uv;
  vd.applyToMesh(mesh, false);
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.doNotSyncBoundingInfo = true;
  mesh.freezeWorldMatrix();
  return mesh;
}

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {any} clipmap  createClipmap() result
 * @param {any} atmo
 */
export function createRain(scene, clipmap, atmo) {
  ShaderStore.ShadersStoreWGSL.rainVertexShader = rainVertexWGSL;
  ShaderStore.ShadersStoreWGSL.rainFragmentShader = rainFragmentWGSL;
  ShaderStore.ShadersStoreWGSL.splashVertexShader = splashVertexWGSL;
  ShaderStore.ShadersStoreWGSL.splashFragmentShader = splashFragmentWGSL;
  const rain = new Vector4(0, 0, 0, 0), wind = new Vector4(1, 0, 9, 0), splash = new Vector4(0, 0, 0, 0), shelterV = new Vector4(0, 0, 0, 0);
  const make = (name, uniforms, attributes, buffers) => {
    const mat = new ShaderMaterial(name, scene, { vertex: name, fragment: name }, {
      attributes,
      uniforms: ['viewProjection', 'levels', ...uniforms, ...ENV_UNIFORMS],
      samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES],
      storageBuffers: ['levelData', 'biomeA', 'windMap', ...ATMO_MATERIAL_BUFFERS, 'shadowData', 'lightGrid'],
      shaderLanguage: ShaderLanguage.WGSL,
      needAlphaBlending: true,
    });
    bindEnvironment(mat);
    bindAtmosphere(mat, atmo);
    mat.setArray4('levels', clipmap.levels);
    mat.setVector4('rain', rain);
    mat.setStorageBuffer('levelData', clipmap.levelData);
    mat.setStorageBuffer('biomeA', clipmap.buffers.biomeA);
    mat.setStorageBuffer('windMap', clipmap.buffers.wind);
    mat.setStorageBuffer('lightGrid', clipmap.lightGrid);
    mat.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;
    mat.disableDepthWrite = true;
    mat.backFaceCulling = false;
    return mat;
  };
  const streakMat = make('rain', ['rainWind', 'rainShelter'], ['position']);
  streakMat.setVector4('rainWind', wind);
  streakMat.setVector4('rainShelter', shelterV);
  const splashMat = make('splash', ['splash'], ['position', 'uv']);
  splashMat.setVector4('splash', splash);
  const streaks = quadMesh(scene, 'rain', RAIN_COUNT, 1);
  streaks.material = streakMat;
  const splashes = quadMesh(scene, 'rainSplash', SPLASH_COUNT, 2);
  splashes.material = splashMat;
  for (const m of [streakMat, splashMat]) { m.freeze(); fastFrozenIsReady(m); }
  // Drops vary in fall speed by eighths; the travel wraps by whole eighth-columns (no pop).
  const WRAP_FALL = RAIN_HT * 8 * 100, WRAP_WIND = RAIN_R * 2 * 100;
  return {
    mesh: streaks, splashMesh: splashes, material: streakMat, splashMaterial: splashMat,
    /** Owner fields, set before update(): density 0..1, drift speed (m/s) and wind direction
     *  (unit x, z), fall speed (m/s), time (s), dt (s). */
    density: 0.5 - 0.5, windSpeed: 0.5, windX: 1.5 - 0.5, windZ: 0.5 - 0.5, fallSpeed: 9.5 - 0.5, time: 0.5, dt: 0.5 - 0.5,
    /** 0..1: the camera is under a roof — only drops beyond a few metres fall (the rain seen out of a door). */
    shelter: 0.5 - 0.5,
    fallT: 0.5 - 0.5, windTX: 0.5 - 0.5, windTZ: 0.5 - 0.5,
    update() {
      this.fallT += this.fallSpeed * this.dt;
      this.windTX += this.windX * this.windSpeed * this.dt; this.windTZ += this.windZ * this.windSpeed * this.dt;
      if (this.fallT > WRAP_FALL) this.fallT -= WRAP_FALL;
      if (this.windTX > WRAP_WIND) this.windTX -= WRAP_WIND; else if (this.windTX < -WRAP_WIND) this.windTX += WRAP_WIND;
      if (this.windTZ > WRAP_WIND) this.windTZ -= WRAP_WIND; else if (this.windTZ < -WRAP_WIND) this.windTZ += WRAP_WIND;
      rain.x = this.fallT; rain.y = this.density; rain.z = this.windTX; rain.w = this.windTZ;
      wind.x = this.windX; wind.y = this.windZ; wind.z = this.fallSpeed; wind.w = this.windSpeed;
      shelterV.x = this.shelter; splash.x = this.time; splash.y = Math.min(1, this.density * 1.15 * (1 - this.shelter));
    },
  };
}
