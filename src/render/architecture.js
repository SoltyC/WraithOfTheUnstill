// The architecture's mesh and material (shaders/architecture.wgsl.js): one static draw for every
// site, placed per site by a uniform array (anchor, seat, shown) so nothing is ever re-uploaded;
// casts into the first two shadow cascades.

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
import { MAT_SAMPLERS, bindMaterialLibrary } from '../materials/library.js';

export function createArchitectureView(scene, atmo, built, matLib) {
  const S = ShaderStore.ShadersStoreWGSL;
  S.archVertexShader = archVertexWGSL; S.archFragmentShader = archFragmentWGSL;
  const mesh = new Mesh('architecture', scene);
  const vd = new VertexData();
  vd.positions = built.positions; vd.normals = built.normals; vd.uvs = built.uvs; vd.indices = built.indices;
  vd.applyToMesh(mesh, false);
  mesh.setVerticesData('info', built.info, false, 4);
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.doNotSyncBoundingInfo = true;
  mesh.freezeWorldMatrix();
  /** Per site: x, seat y, z, shown (0/1); glow: glyph light, fire, hearth x, hearth z. Written in
   *  place by the owner (materials keep the array references and read them every bind). */
  const sites = new Float32Array(ARCH_SITES * 4), glow = new Float32Array(ARCH_SITES * 4);
  const params = new Vector4(0, 0, 0, 0);
  const mat = new ShaderMaterial('arch', scene, { vertex: 'arch', fragment: 'arch' }, {
    attributes: ['position', 'normal', 'uv', 'info'],
    uniforms: ['viewProjection', 'sites', 'siteGlow', 'archParams', 'spellLights', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES, ...MAT_SAMPLERS],
    storageBuffers: [...ATMO_MATERIAL_BUFFERS, 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo); bindMaterialLibrary(mat, matLib);
  mat.setArray4('sites', sites); mat.setArray4('siteGlow', glow); mat.setVector4('archParams', params);
  mat.backFaceCulling = false;
  mesh.material = mat;
  return {
    mesh, material: mat, sites, glow, params,
    makeShadowMaterial(name, light, origin) {
      const m = new ShaderMaterial(name, scene, { vertex: 'arch', fragment: 'shadowDepth' }, {
        attributes: ['position', 'normal', 'uv', 'info'], uniforms: ['viewProjection', 'sites', 'shadowLight', 'shadowOrigin'],
        shaderLanguage: ShaderLanguage.WGSL,
      });
      m.setArray4('sites', sites);
      m.setVector4('shadowLight', light); m.setVector4('shadowOrigin', origin);
      m.backFaceCulling = false;
      return m;
    },
    freeze() { mat.freeze(); fastFrozenIsReady(mat); },
  };
}
