// The robes on the water (Phase 10 U7; game/drift.js, shaders/drift.wgsl.js): about 4,000 empty robes on the Sounding at dawn,
// the near ones in detail, the rest in a few triangles each; one static mesh (every robe's cloth written out once, its place
// in an attribute), drawn only while a shot shows it (made at load: no pipeline built late).

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { robesVertexWGSL, robesFragmentWGSL } from '../shaders/drift.wgsl.js';
import { placeRobes, robeTemplate } from '../game/drift.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

/** Every robe's cloth, written out: { pos, nrm, robe, robe2, idx }. */
export function robesGeometry(list = placeRobes()) {
  const T = [robeTemplate(0), robeTemplate(1)];
  let nv = 0, ni = 0;
  for (const p of list) { const t = T[p.near ? 1 : 0]; nv += t.pos.length / 3; ni += t.idx.length; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), robe = new Float32Array(nv * 4), robe2 = new Float32Array(nv * 4), idx = new Uint32Array(ni);
  let v = 0, i = 0;
  for (const p of list) {
    const t = T[p.near ? 1 : 0], n = t.pos.length / 3;
    pos.set(t.pos, v * 3); nrm.set(t.nrm, v * 3);
    for (let k = 0; k < n; k++) { robe.set([p.x, p.z, p.yaw, p.scale], (v + k) * 4); robe2.set([p.dye, p.seed, 0, 0], (v + k) * 4); }
    for (let k = 0; k < t.idx.length; k++) idx[i + k] = t.idx[k] + v;
    v += n; i += t.idx.length;
  }
  return { pos, nrm, robe, robe2, idx, count: list.length };
}

export function createRobes(scene, atmo) {
  const S = ShaderStore.ShadersStoreWGSL;
  S.robesVertexShader = robesVertexWGSL; S.robesFragmentShader = robesFragmentWGSL;
  const geo = robesGeometry();
  const mesh = new Mesh('robes', scene);
  const vd = new VertexData(); vd.positions = geo.pos; vd.normals = geo.nrm; vd.indices = geo.idx; vd.applyToMesh(mesh, false);
  mesh.setVerticesData('robe', geo.robe, false, 4); mesh.setVerticesData('robe2', geo.robe2, false, 4);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
  const params = new Vector4(0, 1.41, 0, 0), rise = new Vector4(0, 0, 0, 0);
  const mat = new ShaderMaterial('robes', scene, { vertex: 'robes', fragment: 'robes' }, {
    attributes: ['position', 'normal', 'robe', 'robe2'],
    uniforms: ['viewProjection', 'robesParams', 'robesRise', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES], storageBuffers: [...ATMO_MATERIAL_BUFFERS, 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo);
  mat.setVector4('robesParams', params); mat.setVector4('robesRise', rise);
  mat.backFaceCulling = false;
  mesh.material = mat;
  return {
    mesh, material: mat, count: geo.count, triangles: geo.idx.length / 3,
    /** Shown or not, the water's level (world y), their clock (s), and rising (shot 16: s into the rise) or afloat (null). */
    set(shown, level, time, riseT = null) { params.z = shown ? 1 : 0; params.y = level; params.x = time; params.w = riseT === null ? 0 : 1; rise.x = riseT ?? 0; },
    freeze() { mat.freeze(); fastFrozenIsReady(mat); },
  };
}
