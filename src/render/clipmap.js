// Clipmap terrain renderer (BRIEF §4.2). One static grid patch drawn as CLIPMAP_LEVELS thin
// instances (fixed count: snapshot-rendering safe, one draw call). Level l has spacing S0·2^l and
// its origin snapped to multiples of 2·spacing, so every level's vertices sit on its parent's grid.
//
// Heights and normals live in a storage buffer (levelData) written by compute only for levels
// whose snapped origin moved, or that read 2 m detail when tile residency changed. The vertex
// shader just reads it (and the parent level at its morph target). See clipmap(.Compute).wgsl.js.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js'; // side effect: adds thin-instance methods to Mesh
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { ComputeShader } from '@babylonjs/core/Compute/computeShader.js';
import '@babylonjs/core/Engines/WebGPU/Extensions/engine.computeShader.js'; // side effect: compute on WebGPUEngine
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { clipmapVertexWGSL, clipmapFragmentWGSL, CLIPMAP_N, CLIPMAP_LEVELS } from '../shaders/clipmap.wgsl.js';
import { clipmapHeightsWGSL, clipmapNormalsWGSL, CLIPMAP_V } from '../shaders/clipmapCompute.wgsl.js';
import { bindEnvironment } from './environment.js';
import { MAT_SAMPLERS, bindMaterialLibrary } from '../materials/library.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { STATE_SAMPLE_BUFFERS, STATE_COMPACTION_BUFFERS } from '../shaders/terrainState.wgsl.js';

export const CLIPMAP_S0 = 0.0625; // finest spacing (m): BRIEF wants < 10 cm near the player
const DETAIL_MAX_SPACING = 8;     // levels below this read 2 m tiles (see terrainH)

const BINDINGS = ['heights', 'overviewH', 'biomeA', 'biomeB', 'windMap', 'resident', 'levelData', 'params'];

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {Record<string, any>} buffers  storage buffers from WorldStreamer
 */
export function createClipmap(scene, buffers, atmo, matLib) {
  const engine = scene.getEngine();
  ShaderStore.ShadersStoreWGSL.clipmapVertexShader = clipmapVertexWGSL;
  ShaderStore.ShadersStoreWGSL.clipmapFragmentShader = clipmapFragmentWGSL;

  // Grid in integer cell coordinates centred on 0: (i − N/2, 0, j − N/2), vertex index j·V + i.
  const n = CLIPMAP_N, v = n + 1;
  const positions = new Float32Array(v * v * 3);
  for (let j = 0; j < v; j++) for (let i = 0; i < v; i++) {
    const k = (j * v + i) * 3;
    positions[k] = i - n / 2; positions[k + 1] = 0; positions[k + 2] = j - n / 2;
  }
  // Uniform diagonal: required for the odd→even morph collapse to stay consistent.
  const indices = new Uint32Array(n * n * 6);
  let p = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * v + i, b = a + 1, c = a + v, d = c + 1;
    indices[p++] = a; indices[p++] = d; indices[p++] = c;
    indices[p++] = a; indices[p++] = b; indices[p++] = d;
  }
  const mesh = new Mesh('clipmap', scene);
  const vd = new VertexData();
  vd.positions = positions; vd.indices = indices;
  vd.applyToMesh(mesh, false);
  // One instance per level; the level index rides in the matrix translation x (world3.x).
  const mats = new Float32Array(16 * CLIPMAP_LEVELS);
  for (let l = 0; l < CLIPMAP_LEVELS; l++) {
    const o = l * 16;
    mats[o] = 1; mats[o + 5] = 1; mats[o + 10] = 1; mats[o + 15] = 1;
    mats[o + 12] = l;
  }
  mesh.thinInstanceSetBuffer('matrix', mats, 16, true);
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.doNotSyncBoundingInfo = true;

  // Per-level heights + normals, written by compute.
  const levelData = new StorageBuffer(engine, CLIPMAP_LEVELS * CLIPMAP_V * CLIPMAP_V * 16, undefined, 'clipmap-levels');
  const paramsData = new Float32Array(CLIPMAP_LEVELS * 4);
  const params = new StorageBuffer(engine, paramsData.byteLength, undefined, 'clipmap-params');
  const all = { heights: buffers.heights, overviewH: buffers.overview, biomeA: buffers.biomeA, biomeB: buffers.biomeB, windMap: buffers.wind, resident: buffers.resident, levelData, params };
  // Bind only what each shader uses: unused bindings are absent from its auto layout.
  const mkCompute = (name, code, used) => {
    const mapping = {};
    for (const b of used) mapping[b] = { group: 0, binding: BINDINGS.indexOf(b) };
    const cs = new ComputeShader(name, engine, { computeSource: code }, { bindingsMapping: mapping });
    for (const b of used) cs.setStorageBuffer(b, all[b]);
    return cs;
  };
  const csHeights = mkCompute('clipmapHeights', clipmapHeightsWGSL, BINDINGS);
  const csNormals = mkCompute('clipmapNormals', clipmapNormalsWGSL, ['levelData', 'params']);
  const groups = Math.ceil(CLIPMAP_V / 8);

  const levels = new Array(16 * 4).fill(0.5);
  const camGrid = new Vector4(0, 0, 0, 0);
  const playerPos = new Vector4(0, 0, 0, 0.6);
  const mat = new ShaderMaterial('clipmap', scene, { vertex: 'clipmap', fragment: 'clipmap' }, {
    attributes: ['position'], // world0..3 are added by Babylon for thin instances
    uniforms: ['viewProjection', 'levels', 'camGrid', 'playerPos', 'spellLights', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES, ...MAT_SAMPLERS],
    storageBuffers: ['levelData', 'biomeA', 'biomeB', 'windMap', 'hydro', ...ATMO_MATERIAL_BUFFERS, 'shadowData', ...STATE_SAMPLE_BUFFERS, ...STATE_COMPACTION_BUFFERS],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat);
  bindAtmosphere(mat, atmo);
  mat.setArray4('levels', levels);
  mat.setVector4('camGrid', camGrid);
  mat.setVector4('playerPos', playerPos);
  // Spell lights (written in place by the bending systems each frame).
  bindMaterialLibrary(mat, matLib); // scanned rock on the cliffs
  const spellLights = new Float32Array(32);
  mat.setArray4('spellLights', spellLights);
  mat.setStorageBuffer('levelData', levelData);
  mat.setStorageBuffer('biomeA', buffers.biomeA);
  mat.setStorageBuffer('biomeB', buffers.biomeB);
  mat.setStorageBuffer('windMap', buffers.wind);
  mat.setStorageBuffer('hydro', buffers.hydro);
  mesh.material = mat;

  // Last computed origin per level (NaN = never) and the residency version levels were built at.
  const builtX = new Float64Array(CLIPMAP_LEVELS).fill(NaN), builtZ = new Float64Array(CLIPMAP_LEVELS).fill(NaN);
  let builtResidency = -1;

  return {
    mesh, material: mat, playerPos, levelData, levels, camGrid, buffers, spellLights,
    /** Binds the terrain state (fine window, atlas plane 0, page table, params) for the fragment read. */
    /** Other materials using the clipmap vertex shader (shadow casters) that need the state too. */
    stateBound: [],
    bindState(ts) {
      mat.setStorageBuffer('stateFine0', ts.fine[0]);
      mat.setStorageBuffer('stateAtlas0', ts.atlas[0]);
      mat.setStorageBuffer('stateParams', ts.params);
      mat.setStorageBuffer('stateFine1', ts.fine[1]);
      // The shadow casters share the vertex shader: they displace too (trails self-shadow).
      for (const m of this.stateBound) {
        m.setStorageBuffer('stateFine0', ts.fine[0]); m.setStorageBuffer('stateAtlas0', ts.atlas[0]); m.setStorageBuffer('stateParams', ts.params);
      }
    },
    /** Fields set by the owner before update() (no double arguments). */
    camX: 0.5, camZ: 0.5, residencyVersion: 0,
    /** Levels recomputed by the last update (dev overlay / profiling). */
    dirtyLevels: 0,
    /** Snap level origins around the camera and recompute dirty levels. */
    update() {
      const residencyChanged = this.residencyVersion !== builtResidency;
      let dirty = 0;
      for (let l = 0; l < CLIPMAP_LEVELS; l++) {
        const s = CLIPMAP_S0 * (1 << l), two = 2 * s;
        const ox = Math.floor(this.camX / two + 0.5) * two, oz = Math.floor(this.camZ / two + 0.5) * two;
        levels[l * 4] = ox; levels[l * 4 + 1] = oz; levels[l * 4 + 2] = s; levels[l * 4 + 3] = l;
        const moved = ox !== builtX[l] || oz !== builtZ[l];
        const d = moved || (residencyChanged && s < DETAIL_MAX_SPACING);
        paramsData[l * 4] = ox; paramsData[l * 4 + 1] = oz; paramsData[l * 4 + 2] = s; paramsData[l * 4 + 3] = d ? 1 : 0;
        if (d) dirty++;
      }
      camGrid.x = this.camX; camGrid.z = this.camZ;
      this.dirtyLevels = dirty;
      if (dirty === 0) return;
      params.update(paramsData);
      // Only mark levels built if the dispatch actually ran (the pipeline may still be compiling).
      if (!csHeights.dispatch(groups, groups, CLIPMAP_LEVELS)) return;
      if (!csNormals.dispatch(groups, groups, CLIPMAP_LEVELS)) return;
      for (let l = 0; l < CLIPMAP_LEVELS; l++) if (paramsData[l * 4 + 3] > 0) { builtX[l] = paramsData[l * 4]; builtZ[l] = paramsData[l * 4 + 1]; }
      builtResidency = this.residencyVersion;
    },
  };
}
