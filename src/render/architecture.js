// The architecture's meshes and material (shaders/architecture.wgsl.js): one static mesh per chunk
// (world/architecture.js chunkArchitecture: a spatial cell of sites, plus one chunk of NPC-held
// props), all sharing ONE material and ONE shared site block (anchor, seat, shown; glow; char),
// uploaded once a frame: as uniform arrays they were copied for every draw, 23 KB each. Which chunks draw and cast is decided by systems/architecture.js (distance).

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { archVertexWGSL, archFragmentWGSL, ARCH_SITES } from '../shaders/architecture.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';
import { createSharedBlock } from './sharedBlock.js';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { MAT_SAMPLERS, bindMaterialLibrary } from '../materials/library.js';

/** @param {ReturnType<typeof import('../world/architecture.js').chunkArchitecture>} chunks */
export function createArchitectureView(scene, atmo, chunks, matLib) {
  const S = ShaderStore.ShadersStoreWGSL;
  S.archVertexShader = archVertexWGSL; S.archFragmentShader = archFragmentWGSL;
  /** Per site: x, seat y, z, shown (0/1); glow: glyph light, fire, hearth x, hearth z. Written in
   *  place by the owner (materials keep the array references and read them every bind). */
  const block = new Float32Array(ARCH_SITES * 9);
  const sites = block.subarray(0, ARCH_SITES * 4), glow = block.subarray(ARCH_SITES * 4, ARCH_SITES * 8);
  /** Per site char 0..1 (4 sites per vec4), written by systems/villageFire.js. */
  const char = block.subarray(ARCH_SITES * 8);
  const siteBlock = createSharedBlock(scene.getEngine(), block, 'arch-sites');
  scene.onBeforeRenderObservable.add(() => siteBlock.update());
  const params = new Vector4(0, 0, 0, 0);
  /** The turning site (the mill's sails): x = site index (-1 none), y = angle, zw = axis x, z. */
  const spin = new Vector4(-1, 0, 1, 0);
  const mat = new ShaderMaterial('arch', scene, { vertex: 'arch', fragment: 'arch' }, {
    attributes: ['position', 'normal', 'uv', 'info'],
    uniforms: ['viewProjection', 'siteSpin', 'archParams', 'spellLights', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES, ...MAT_SAMPLERS],
    storageBuffers: [...ATMO_MATERIAL_BUFFERS, 'shadowData', 'lightGrid'],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo); bindMaterialLibrary(mat, matLib);
  mat.setUniformBuffer('archSites', siteBlock); mat.setVector4('siteSpin', spin); mat.setVector4('archParams', params);
  mat.backFaceCulling = false;
  // Y is unknown at build time (seats arrive later): generous bounds. The meshes stay
  // alwaysSelectAsActiveMesh: with snapshot rendering the recorded bundle is replayed, so Babylon's
  // per-frame frustum test would never run; the owner enables/disables chunks by distance instead.
  const views = chunks.map((c) => {
    const mesh = new Mesh(c.id, scene);
    const vd = new VertexData();
    vd.positions = c.positions; vd.normals = c.normals; vd.uvs = c.uvs; vd.indices = c.indices;
    vd.applyToMesh(mesh, false);
    mesh.setVerticesData('info', c.info, false, 4);
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.setBoundingInfo(new BoundingInfo(new Vector3(c.cx - c.radius, -50, c.cz - c.radius), new Vector3(c.cx + c.radius, 300, c.cz + c.radius)));
    mesh.freezeWorldMatrix();
    mesh.doNotSyncBoundingInfo = true;
    mesh.material = mat;
    return { id: c.id, mesh, prop: c.prop, sites: c.sites, cx: c.cx, cz: c.cz, radius: c.radius, vertexCount: c.vertexCount };
  });
  // One depth material per shadow cascade, shared by every chunk (keyed by the cascade's light vector).
  const shadowMats = new Map();
  return {
    /** Chunk views: { id, mesh, prop, sites, cx, cz, radius, vertexCount } (debugging: view.chunks). */
    chunks: views, material: mat, sites, glow, char, params, spin,
    makeShadowMaterial(name, light, origin) {
      if (shadowMats.has(light)) return shadowMats.get(light);
      const m = new ShaderMaterial(name, scene, { vertex: 'arch', fragment: 'shadowDepth' }, {
        attributes: ['position', 'normal', 'uv', 'info'], uniforms: ['viewProjection', 'siteSpin', 'shadowLight', 'shadowOrigin'],
        shaderLanguage: ShaderLanguage.WGSL,
      });
      m.setUniformBuffer('archSites', siteBlock); m.setVector4('siteSpin', spin);
      m.setVector4('shadowLight', light); m.setVector4('shadowOrigin', origin);
      m.backFaceCulling = false;
      shadowMats.set(light, m);
      return m;
    },
    freeze() { mat.freeze(); fastFrozenIsReady(mat); },
  };
}
