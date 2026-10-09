// Ground cover (shaders/groundcover.wgsl.js): one static mesh of (item, card, vertex) indices; the
// vertex shader decides what grows in each item's world cell and builds it from the ground-cover
// atlas (render/groundAtlas.js). Opaque (alpha-tested), double-sided, receives the shadow cascades.
// Owner fields per frame: time, wind; the push trail is the grass's (render/grass.js).

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { gcVertexWGSL, gcFragmentWGSL, GC_RING, gcVertsPerCard } from '../shaders/groundcover.wgsl.js';
import { drawGroundAtlas } from './groundAtlas.js';
import { canvasAtlasTexture } from './atlasTexture.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {any} clipmap
 * @param {any} atmo
 * @param {number[]} push  the grass's push trail (8 × x, y, z, strength), shared by reference
 */
export function createGroundCover(scene, clipmap, atmo, push) {
  ShaderStore.ShadersStoreWGSL.groundCoverVertexShader = gcVertexWGSL;
  ShaderStore.ShadersStoreWGSL.groundCoverFragmentShader = gcFragmentWGSL;
  const { cell, n, cards, seg } = GC_RING;
  const vc = gcVertsPerCard(seg), items = n * n, nv = items * cards * vc;
  const pos = new Float32Array(nv * 3), idx = new Uint32Array(items * cards * seg * 6);
  let v = 0, o = 0;
  for (let it = 0; it < items; it++) for (let c = 0; c < cards; c++) {
    const base = v;
    for (let k = 0; k < vc; k++) { pos[v * 3] = it; pos[v * 3 + 1] = c; pos[v * 3 + 2] = k; v++; }
    for (let r = 0; r < seg; r++) {
      const a = base + r * 2;
      idx[o++] = a; idx[o++] = a + 2; idx[o++] = a + 1; idx[o++] = a + 1; idx[o++] = a + 2; idx[o++] = a + 3;
    }
  }
  const mesh = new Mesh('groundCover', scene);
  const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.applyToMesh(mesh, false);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
  const params = new Vector4(0, 1, cell, n);
  const mat = new ShaderMaterial('groundCover', scene, { vertex: 'groundCover', fragment: 'groundCover' }, {
    attributes: ['position'],
    uniforms: ['viewProjection', 'levels', 'gcParams', 'grassPush', 'spellLights', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES, 'gcAtlas'],
    storageBuffers: ['levelData', 'biomeA', 'windMap', ...ATMO_MATERIAL_BUFFERS, 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo);
  mat.setArray4('levels', clipmap.levels);
  mat.setStorageBuffer('levelData', clipmap.levelData);
  mat.setStorageBuffer('biomeA', clipmap.buffers.biomeA);
  mat.setStorageBuffer('windMap', clipmap.buffers.wind);
  mat.setVector4('gcParams', params); mat.setArray4('grassPush', push);
  mat.setArray4('spellLights', clipmap.spellLights);
  mat.setTexture('gcAtlas', canvasAtlasTexture(scene.getEngine(), scene, drawGroundAtlas(), 'ground-atlas'));
  mat.backFaceCulling = false;
  mesh.material = mat;
  return {
    mesh, materials: [mat],
    /** Owner fields, set before update(). */
    time: 0.5, wind: 1.5 - 0.5,
    update() { params.x = this.time; params.y = this.wind; },
    freeze() { mat.freeze(); fastFrozenIsReady(mat); },
  };
}
