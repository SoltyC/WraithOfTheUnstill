// GPU grass (shaders/grass.wgsl.js): one static mesh per ring of (clump, blade, vertex) indices;
// the vertex shader builds every blade from its world cell. Opaque, double-sided, receives the
// shadow cascades. Owner fields per frame: time, wind (0 stilled … 1), density.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { STATE_SAMPLE_BUFFERS, STATE_COMPACTION_BUFFERS } from '../shaders/terrainState.wgsl.js';
import { grassVertexWGSL, grassFragmentWGSL, GRASS_RINGS, vertsPerBlade } from '../shaders/grass.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {any} clipmap
 * @param {any} atmo
 */
export function createGrass(scene, clipmap, atmo) {
  ShaderStore.ShadersStoreWGSL.grassVertexShader = grassVertexWGSL;
  ShaderStore.ShadersStoreWGSL.grassFragmentShader = grassFragmentWGSL;
  const params = new Vector4(0, 1, 1, 0);
  const rings = [], mats = [];
  GRASS_RINGS.forEach(([cell, n, blades, seg], ri) => {
    const vb = vertsPerBlade(seg), clumps = n * n, nv = clumps * blades * vb;
    const pos = new Float32Array(nv * 3), idx = new Uint32Array(clumps * blades * seg * 6);
    let v = 0, o = 0;
    for (let c = 0; c < clumps; c++) for (let b = 0; b < blades; b++) {
      const base = v;
      for (let k = 0; k < vb; k++) { pos[v * 3] = c; pos[v * 3 + 1] = b; pos[v * 3 + 2] = k; v++; }
      for (let r = 0; r < seg; r++) {
        const a = base + r * 2;
        idx[o++] = a; idx[o++] = a + 2; idx[o++] = a + 1; idx[o++] = a + 1; idx[o++] = a + 2; idx[o++] = a + 3;
      }
    }
    const mesh = new Mesh('grass' + ri, scene);
    const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.applyToMesh(mesh, false);
    mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
    // Skip what the finer ring covers up to where it starts thinning (0.72 of its half): the bands overlap.
    const ring = new Vector4(cell, n, ri === 0 ? 0 : GRASS_RINGS[ri - 1][0] * GRASS_RINGS[ri - 1][1] * 0.5 * 0.72, seg);
    const rp = new Vector4(0, 1, 1, ri);
    const mat = new ShaderMaterial('grass' + ri, scene, { vertex: 'grass', fragment: 'grass' }, {
      attributes: ['position'],
      uniforms: ['viewProjection', 'levels', 'grassRing', 'grassParams', 'spellLights', ...ENV_UNIFORMS],
      samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES],
      storageBuffers: ['levelData', 'biomeA', 'windMap', ...STATE_SAMPLE_BUFFERS, ...STATE_COMPACTION_BUFFERS, ...ATMO_MATERIAL_BUFFERS, 'shadowData'],
      shaderLanguage: ShaderLanguage.WGSL,
    });
    bindEnvironment(mat); bindAtmosphere(mat, atmo);
    mat.setArray4('levels', clipmap.levels);
    mat.setStorageBuffer('levelData', clipmap.levelData);
    mat.setStorageBuffer('biomeA', clipmap.buffers.biomeA);
    mat.setStorageBuffer('windMap', clipmap.buffers.wind);
    mat.setVector4('grassRing', ring); mat.setVector4('grassParams', rp);
    mat.setArray4('spellLights', clipmap.spellLights);
    mat.backFaceCulling = false;
    mesh.material = mat;
    rings.push({ mesh, mat, rp }); mats.push(mat);
  });
  return {
    meshes: rings.map((r) => r.mesh), materials: mats,
    /** Owner fields, set before update(). */
    time: 0.5, wind: 1.5 - 0.5, density: 1.5 - 0.5,
    update() { for (const r of rings) { r.rp.x = this.time; r.rp.y = this.wind; r.rp.z = this.density; } },
    bindState(ts) { for (const m of mats) { m.setStorageBuffer('stateFine0', ts.fine[0]); m.setStorageBuffer('stateAtlas0', ts.atlas[0]); m.setStorageBuffer('stateParams', ts.params); m.setStorageBuffer('stateFine1', ts.fine[1]); } },
    freeze() { for (const m of mats) { m.freeze(); fastFrozenIsReady(m); } },
  };
}
