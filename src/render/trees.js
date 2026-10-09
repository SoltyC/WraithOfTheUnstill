// Trees in the world (PLAN.md Phase 8 M4): the generator's variants (world/trees/generator.js) as
// thin-instanced meshes — per species VARIANTS seeds, each at two levels of detail — placed
// deterministically in groves around the camera: groves where a slow noise says so, scattered
// trees between, none outside the meadow or on steep ground, pines higher up, oaks and birches
// lower. Per-instance scale, yaw, lean and colour, so no two trees read alike. The placement is
// rebuilt when the camera has moved a few tens of metres, into fixed buffers (no garbage per
// frame). Leaves sample the leaf atlas (render/leafAtlas.js), drawn and mipmapped at load.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { treeVertexWGSL, treeFragmentWGSL, treeShadowFragmentWGSL } from '../shaders/trees.wgsl.js';
import { growTree, SPECIES } from '../world/trees/generator.js';
import { drawLeafAtlas, ATLAS } from './leafAtlas.js';
import { MAT, MAT_SAMPLERS, bindMaterialLibrary } from '../materials/library.js';
import { hashU32, valueNoise } from '../terrain/noise.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

const VARIANTS = 8;
const SPECIES_IDS = ['pine', 'oak', 'birch'];
const CELL = 9, RADIUS = 380, NEAR = 80;
const MAX_NEAR = 90, MAX_FAR = 260;   // per variant
const SEED = 0x7ee5;
const h01 = (x, z, s) => hashU32((Math.imul(x, 0x27d4eb2d) ^ hashU32(Math.imul(z, 0x165667b1) ^ s)) >>> 0) / 4294967296;

/** Upload the leaf atlas as a mipmapped GPU texture (wrapped for Babylon). */
function leafAtlasTexture(engine, scene) {
  const dev = engine._device, size = ATLAS.size, mips = Math.floor(Math.log2(size)) + 1;
  const tex = dev.createTexture({ label: 'leaf-atlas', size: [size, size, 1], format: 'rgba8unorm-srgb', mipLevelCount: mips, usage: 0x04 | 0x02 | 0x10 });
  dev.queue.copyExternalImageToTexture({ source: drawLeafAtlas() }, { texture: tex, premultipliedAlpha: false }, [size, size, 1]);
  engine._textureHelper.generateMipmaps(tex, mips, 0);
  const it = engine.wrapWebGPUTexture(tex);
  it.generateMipMaps = true; it._useSRGBBuffer = true; it.useMipMaps = true;
  it.samplingMode = Constants.TEXTURE_TRILINEAR_SAMPLINGMODE;
  it.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE; it.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
  it._cachedAnisotropicFilteringLevel = 4;
  it._hardwareTexture.setUsage(0, true, false, false, false, size, size, 1);
  return new BaseTexture(scene, it);
}

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {any} clipmap
 * @param {any} atmo
 * @param {any} matLib
 * @param {any} streamer  CPU biome and height data for placement
 */
export function createTrees(scene, clipmap, atmo, matLib, streamer) {
  const engine = scene.getEngine();
  const S = ShaderStore.ShadersStoreWGSL;
  S.treeVertexShader = treeVertexWGSL; S.treeFragmentShader = treeFragmentWGSL; S.treeShadowFragmentShader = treeShadowFragmentWGSL;
  const atlas = leafAtlasTexture(engine, scene);
  const params = new Vector4(0, 1, 1, 0);
  const sets = [], mats = [];
  SPECIES_IDS.forEach((sid, si) => {
    const barkLayer = MAT[SPECIES[sid].bark];
    for (let v = 0; v < VARIANTS; v++) for (const lod of [0, 1]) {
      const t = growTree(sid, 1000 + si * 131 + v * 17, lod);
      const mesh = new Mesh(`tree-${sid}-${v}-${lod}`, scene);
      const vd = new VertexData(); vd.positions = t.positions; vd.normals = t.normals; vd.uvs = t.uvs; vd.indices = t.indices;
      vd.applyToMesh(mesh, false);
      mesh.setVerticesData('info', t.info, false, 4);
      const max = lod ? MAX_FAR : MAX_NEAR, buf = new Float32Array(max * 16);
      mesh.thinInstanceSetBuffer('matrix', buf, 16, false);
      mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true;
      const mat = new ShaderMaterial(mesh.name, scene, { vertex: 'tree', fragment: 'tree' }, {
        attributes: ['position', 'normal', 'uv', 'info'],
        uniforms: ['viewProjection', 'levels', 'treeParams', 'treeMat', 'spellLights', ...ENV_UNIFORMS],
        samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES, ...MAT_SAMPLERS, 'leafAtlas'],
        storageBuffers: ['levelData', ...ATMO_MATERIAL_BUFFERS, 'shadowData'],
        shaderLanguage: ShaderLanguage.WGSL,
      });
      bindEnvironment(mat); bindAtmosphere(mat, atmo); bindMaterialLibrary(mat, matLib);
      mat.setArray4('levels', clipmap.levels); mat.setStorageBuffer('levelData', clipmap.levelData);
      mat.setVector4('treeParams', params); mat.setVector4('treeMat', new Vector4(barkLayer, si, 0, 0));
      mat.setTexture('leafAtlas', atlas); mat.setArray4('spellLights', clipmap.spellLights);
      mat.backFaceCulling = false;
      mesh.material = mat;
      sets.push({ sid, si, v, lod, mesh, buf, max, n: 0 }); mats.push(mat);
    }
  });
  const byKey = (si, v, lod) => sets[(si * VARIANTS + v) * 2 + lod];

  // ── Placement ──────────────────────────────────────────────────────────────────────────────
  let lastX = 1e9, lastZ = 1e9;
  /** Places with no trees ([x, z, r]): built sites, paths. */
  let exclude = [];
  function meadowAt(x, z) { streamer.mqx = x; streamer.mqz = z; streamer.sampleBiome(); return streamer.bw1; }
  function heightAt(x, z) {
    const ov = streamer.overview, n = streamer.overviewN; if (!ov) return 0;
    const i = Math.max(0, Math.min(n - 1, Math.floor((x + 4096) / 8))), j = Math.max(0, Math.min(n - 1, Math.floor((4096 - z) / 8)));
    return ov[j * n + i] / 32 - 128;
  }
  function rebuild(cx, cz) {
    for (const s of sets) s.n = 0;
    const c0x = Math.floor((cx - RADIUS) / CELL), c1x = Math.floor((cx + RADIUS) / CELL);
    const c0z = Math.floor((cz - RADIUS) / CELL), c1z = Math.floor((cz + RADIUS) / CELL);
    for (let gz = c0z; gz <= c1z; gz++) for (let gx = c0x; gx <= c1x; gx++) {
      const x = (gx + 0.15 + 0.7 * h01(gx, gz, SEED + 1)) * CELL, z = (gz + 0.15 + 0.7 * h01(gx, gz, SEED + 2)) * CELL;
      const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
      if (d2 > RADIUS * RADIUS) continue;
      // Groves (slow noise), sparse singles between.
      const grove = valueNoise(x / 170, z / 170, SEED + 3) * 0.65 + valueNoise(x / 55, z / 55, SEED + 4) * 0.35;
      const p = grove > 0.12 ? 0.25 + 0.6 * Math.min(1, (grove - 0.12) / 0.3) : 0.012;
      if (h01(gx, gz, SEED + 5) > p) continue;
      if (meadowAt(x, z) < 0.6) continue;
      const h = heightAt(x, z), sl = Math.abs(heightAt(x + 8, z) - h) + Math.abs(heightAt(x, z + 8) - h);
      if (sl > 5) continue;
      let skip = false;
      for (const e of exclude) { const ex = x - e[0], ez = z - e[1]; if (ex * ex + ez * ez < e[2] * e[2]) { skip = true; break; } }
      if (skip) continue;
      // Species: pines above ~330 m and on rises; oaks in the low groves; birches at edges.
      const hs = h01(gx, gz, SEED + 6), alt = Math.max(0, Math.min(1, (h - 280) / 120));
      const si = hs < alt * 0.85 ? 0 : grove > 0.3 ? (hs < 0.65 ? 1 : 2) : (hs < 0.5 ? 2 : 1);
      const v = Math.floor(h01(gx, gz, SEED + 7) * VARIANTS);
      const lod = d2 < NEAR * NEAR ? 0 : 1;
      const set = byKey(si, v, lod);
      if (set.n >= set.max) continue;
      const o = set.n++ * 16, b = set.buf;
      b[o] = x; b[o + 1] = z; b[o + 2] = 0.75 + 0.5 * h01(gx, gz, SEED + 8); b[o + 3] = h01(gx, gz, SEED + 9) * 6.283;
      b[o + 4] = h01(gx, gz, SEED + 10); b[o + 5] = h01(gx, gz, SEED + 11); b[o + 6] = (h01(gx, gz, SEED + 12) - 0.5) * 2; b[o + 7] = (h01(gx, gz, SEED + 13) - 0.5) * 2;
    }
    // Draw only what was placed: an unused slot still ran the whole tree's vertices (×cascades).
    for (const s of sets) {
      for (let k = s.n; k < s.max; k++) s.buf[k * 16 + 2] = 0;
      s.mesh.thinInstanceBufferUpdated('matrix');
      s.mesh.thinInstanceCount = Math.max(1, s.n); // never 0: a mesh with no instances loses its instance attributes (and pipelines)
    }
    engine.snapshotRenderingReset();
  }

  return {
    meshes: sets.map((s) => s.mesh), materials: mats,
    /** Owner fields: camera x, z, time, wind strength and direction. */
    camX: 0.5, camZ: 0.5, time: 0.5, wind: 1.5 - 0.5, windX: 1.5 - 0.5, windZ: 0.5 - 0.5,
    update() {
      params.x = this.time; params.y = this.wind; params.z = this.windX; params.w = this.windZ;
      const dx = this.camX - lastX, dz = this.camZ - lastZ;
      if (dx * dx + dz * dz > 30 * 30) { lastX = this.camX; lastZ = this.camZ; rebuild(lastX, lastZ); }
    },
    setExclusions(list) { exclude = list; lastX = 1e9; },
    makeShadowMaterial(name, light, origin) {
      const m = new ShaderMaterial(name, scene, { vertex: 'tree', fragment: 'treeShadow' }, {
        attributes: ['position', 'normal', 'uv', 'info'],
        uniforms: ['viewProjection', 'levels', 'treeParams', 'shadowLight', 'shadowOrigin'],
        samplers: ['leafAtlas'], storageBuffers: ['levelData'], shaderLanguage: ShaderLanguage.WGSL,
      });
      m.setArray4('levels', clipmap.levels); m.setStorageBuffer('levelData', clipmap.levelData);
      m.setVector4('treeParams', params); m.setTexture('leafAtlas', atlas);
      m.setVector4('shadowLight', light); m.setVector4('shadowOrigin', origin);
      m.backFaceCulling = false;
      return m;
    },
    freeze() { for (const m of mats) { m.freeze(); fastFrozenIsReady(m); } },
  };
}
