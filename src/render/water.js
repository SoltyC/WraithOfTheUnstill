// Water bodies (shaders/water.wgsl.js). Lakes come from the bake (hydro lake mask, lake_level at
// 4 m): every unfrozen lake becomes flat geometry at its level, row-merged quads over its texels and
// a two-texel border (the plane runs under the shore; the terrain hides it), drawn twice — the
// absorb pass (multiply) and the surface pass (add, depth write, the SSR water mark). The Wraith's
// ripples live in a small storage buffer shared with the post chain's SSR (post.waterRipples).
// CPU side: levelAt(x, z) for wading and swimming. Owner fields per frame: time, the Wraith's
// position and speed.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { waterVertexWGSL, waterAbsorbFragmentWGSL, waterSurfaceFragmentWGSL, WATER_RIPPLES } from '../shaders/water.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

const N = 2048, C = 4, HALF = 4096;

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {any} clipmap
 * @param {any} atmo
 * @param {any} wind     world/wind.js
 * @param {any} streamer CPU biome weights (frozen lakes stay the frost's ice)
 * @param {any} ripples  StorageBuffer of WATER_RIPPLES vec4s (post.waterRipples)
 * @param {string} base  world data URL
 */
export async function createWater(scene, clipmap, atmo, wind, streamer, ripples, base) {
  const S = ShaderStore.ShadersStoreWGSL;
  S.waterVertexShader = waterVertexWGSL; S.waterAbsorbFragmentShader = waterAbsorbFragmentWGSL; S.waterSurfaceFragmentShader = waterSurfaceFragmentWGSL;
  const [hy, llb] = await Promise.all([
    fetch(base + 'hydro.rgba8').then((r) => r.arrayBuffer()), fetch(base + 'lake_level.u16').then((r) => r.arrayBuffer())]);
  const hydro = new Uint8Array(hy), raw = new Uint16Array(llb);
  // Water level per texel (NaN: dry): unfrozen lakes, then a two-texel border carrying the level.
  const level = new Float32Array(N * N).fill(NaN);
  const frost = (i, j) => { const A = streamer.biomeA; if (!A) return 0; const o = ((j >> 1) * 1024 + (i >> 1)) * 4; return A[o] / Math.max(A[o] + A[o + 1] + A[o + 2] + A[o + 3], 13); };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const o = j * N + i;
    if (hydro[o * 4 + 1] >= 128 && raw[o] > 0 && frost(i, j) < 0.5) level[o] = raw[o] / 32 - 128;
  }
  const wet = level.slice();
  for (let pass = 0; pass < 2; pass++) {
    const src = wet.slice();
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const o = j * N + i; if (!Number.isNaN(src[o])) continue;
      let v = NaN;
      for (let k = 0; k < 4 && Number.isNaN(v); k++) v = src[o + (k === 0 ? 1 : k === 1 ? -1 : k === 2 ? N : -N)];
      if (!Number.isNaN(v)) wet[o] = v;
    }
  }
  // The world water-level map every material can read (plants, rocks and trees keep out of it).
  const wl = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) wl[k] = Number.isNaN(wet[k]) ? -1e4 : wet[k];
  atmo.waterTex.update(wl);
  // Geometry: per row, runs of texels at one level become one quad.
  const pos = [], idx = [];
  for (let j = 0; j < N; j++) {
    let i = 0;
    while (i < N) {
      const v = wet[j * N + i];
      if (Number.isNaN(v)) { i++; continue; }
      let e = i + 1;
      while (e < N && wet[j * N + e] === v) e++;
      const x0 = -HALF + i * C, x1 = -HALF + e * C, z0 = HALF - j * C, z1 = HALF - (j + 1) * C, b = pos.length / 3;
      pos.push(x0, v, z0, x1, v, z0, x1, v, z1, x0, v, z1);
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
      i = e;
    }
  }
  const make = (name, fragment, absorb) => {
    const mesh = new Mesh(name, scene);
    const vd = new VertexData(); vd.positions = new Float32Array(pos); vd.indices = new Uint32Array(idx); vd.applyToMesh(mesh, false);
    mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
    mesh.alphaIndex = absorb ? 0 : 1;
    const mat = new ShaderMaterial(name, scene, { vertex: 'water', fragment }, {
      attributes: ['position'],
      uniforms: ['viewProjection', 'levels', 'waterParams', 'windField', ...ENV_UNIFORMS],
      samplers: [...ATMO_MATERIAL_TEXTURES, ...(absorb ? [] : SHADOW_TEXTURES)],
      storageBuffers: ['levelData', 'waterRipples', ...ATMO_MATERIAL_BUFFERS, ...(absorb ? [] : ['shadowData'])],
      shaderLanguage: ShaderLanguage.WGSL,
      needAlphaBlending: true,
    });
    bindEnvironment(mat); bindAtmosphere(mat, atmo);
    mat.setArray4('levels', clipmap.levels); mat.setStorageBuffer('levelData', clipmap.levelData);
    mat.setStorageBuffer('waterRipples', ripples);
    mat.setArray4('windField', wind.block); mat.setVector4('waterParams', params);
    mat.backFaceCulling = false;
    // Absorb: dst × transmittance (alpha kept). Surface: dst + light, alpha replaced (the SSR mark).
    mat.alphaMode = absorb ? Constants.ALPHA_MULTIPLY : Constants.ALPHA_ONEONE_ONEZERO;
    mat.disableDepthWrite = absorb;
    if (!absorb) mat.forceDepthWrite = true;
    mesh.material = mat;
    return { mesh, mat };
  };
  const params = new Vector4(0, 1, 0, 0);
  const absorb = make('waterAbsorb', 'waterAbsorb', true), surface = make('waterSurface', 'waterSurface', false);

  // Ripples: a ring of slots (x, z, start time, strength).
  const rip = new Float32Array(WATER_RIPPLES * 4);
  let head = 0, lastEmit = -1e9, wasIn = false, dirty = true;
  function emit(x, z, t, s) {
    const o = head * 4; head = (head + 1) % WATER_RIPPLES;
    rip[o] = x; rip[o + 1] = z; rip[o + 2] = t; rip[o + 3] = s; dirty = true;
  }

  const water = {
    meshes: [absorb.mesh, surface.mesh], materials: [absorb.mat, surface.mat], quads: idx.length / 6,
    /** Water surface level at (x, z) (m), or NaN where there is none (the border texels excluded). */
    levelAt(x, z) {
      const i = Math.floor((x + HALF) / C), j = Math.floor((HALF - z) / C);
      if (i < 0 || j < 0 || i >= N || j >= N) return NaN;
      return level[j * N + i];
    },
    /** A ripple now (or at a past time t): the scripted walks of photo spots lay their wake with it. */
    ripple(x, z, t, s) { emit(x, z, t, s); },
    /** Owner fields: time (s); the Wraith's position, horizontal speed (m/s). */
    time: 0.5, px: 0.5, py: 0.5, pz: 0.5, speed: 0.5 - 0.5,
    /** True while the Wraith stands in water; its depth there (m). */
    inWater: false, depth: 0.5 - 0.5,
    update() {
      params.x = this.time;
      const lv = this.levelAt(this.px, this.pz);
      this.inWater = lv === lv && this.py < lv + 0.02;
      this.depth = this.inWater ? lv - this.py : 0;
      if (this.inWater) {
        const t = this.time, sp = this.speed;
        // Entering: a splash. Moving: rings every 0.25 s (a wake forms behind). Still: a slow pulse.
        if (!wasIn) { emit(this.px, this.pz, t, 1.6); lastEmit = t; }
        else if (sp > 0.25 && t - lastEmit > 0.25) { emit(this.px, this.pz, t, Math.min(1.2, 0.35 + 0.35 * sp)); lastEmit = t; }
        else if (sp <= 0.25 && t - lastEmit > 1.6) { emit(this.px, this.pz, t, 0.22); lastEmit = t; }
      }
      wasIn = this.inWater;
      if (dirty) { ripples.update(rip); dirty = false; }
    },
    freeze() { for (const m of water.materials) { m.freeze(); fastFrozenIsReady(m); } },
  };
  return water;
}
