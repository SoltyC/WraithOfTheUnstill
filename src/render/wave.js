// The wave that came through the sea-doors (Phase 10 U7; shaders/wave.wgsl.js): one sheet across the Tide Hall and its spray,
// drawn only while a cutscene shows it (made at load, so no pipeline is built late). The director moves its front and its time,
// and holds the time when the Listener stops everything.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { waveVertexWGSL, waveFragmentWGSL, sprayVertexWGSL, sprayFragmentWGSL } from '../shaders/wave.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';
import { HALL } from '../world/ebbhold.js';

/** The sheet's grid: along the profile × across the hall (wall to wall). */
export const WAVE_S = 150, WAVE_Z = 200;
/** Spray: drops off the lip, mist at the toe, mist off the crest. */
export const SPRAY = { drops: 9000, toe: 700, crest: 500 };

export function waveGeometry() {
  const nv = (WAVE_S + 1) * (WAVE_Z + 1), pos = new Float32Array(nv * 3), idx = new Uint32Array(WAVE_S * WAVE_Z * 6);
  const z0 = -HALL.HW - 1, z1 = HALL.HW + 1;
  let o = 0;
  for (let j = 0; j <= WAVE_Z; j++) for (let i = 0; i <= WAVE_S; i++) { pos[o++] = i / WAVE_S; pos[o++] = z0 + (z1 - z0) * j / WAVE_Z; pos[o++] = 0; }
  o = 0;
  for (let j = 0; j < WAVE_Z; j++) for (let i = 0; i < WAVE_S; i++) {
    const a = j * (WAVE_S + 1) + i, b = a + WAVE_S + 1;
    idx[o++] = a; idx[o++] = b; idx[o++] = a + 1; idx[o++] = a + 1; idx[o++] = b; idx[o++] = b + 1;
  }
  return { pos, idx };
}

export function sprayGeometry() {
  const n = SPRAY.drops + SPRAY.toe + SPRAY.crest, pos = new Float32Array(n * 12), sp = new Float32Array(n * 16), idx = new Uint32Array(n * 6);
  let s = 12345;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let k = 0; k < n; k++) {
    const kind = k < SPRAY.drops ? 0 : k < SPRAY.drops + SPRAY.toe ? 1 : 2;
    const z = -HALL.HW + rnd() * HALL.HW * 2, a = rnd(), b = rnd();
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([u, v], c) => {
      pos.set([u, v, 0], k * 12 + c * 3); sp.set([z, a, kind, b], k * 16 + c * 4);
    });
    idx.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6);
  }
  return { pos, sp, idx };
}

export function createWave(scene, atmo, clipmap, ebbParams) {
  const S = ShaderStore.ShadersStoreWGSL;
  S.waveVertexShader = waveVertexWGSL; S.waveFragmentShader = waveFragmentWGSL;
  S.sprayVertexShader = sprayVertexWGSL; S.sprayFragmentShader = sprayFragmentWGSL;
  const params = new Vector4(0, 0, 0, 0);
  const mk = (name, geo, extra) => {
    const mesh = new Mesh(name, scene);
    const vd = new VertexData(); vd.positions = geo.pos; vd.indices = geo.idx; vd.applyToMesh(mesh, false);
    if (geo.sp) mesh.setVerticesData('spray', geo.sp, false, 4);
    mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
    const mat = new ShaderMaterial(name, scene, { vertex: name, fragment: name }, {
      attributes: geo.sp ? ['position', 'spray'] : ['position'],
      uniforms: ['viewProjection', 'waveParams', 'ebbParams', 'spellLights', ...ENV_UNIFORMS],
      samplers: [...ATMO_MATERIAL_TEXTURES], storageBuffers: [...ATMO_MATERIAL_BUFFERS, 'lightGrid'],
      shaderLanguage: ShaderLanguage.WGSL, ...extra,
    });
    bindEnvironment(mat); bindAtmosphere(mat, atmo);
    mat.setArray4('spellLights', clipmap.spellLights); mat.setStorageBuffer('lightGrid', clipmap.lightGrid);
    mat.setVector4('waveParams', params); mat.setVector4('ebbParams', ebbParams);
    mat.backFaceCulling = false;
    mesh.material = mat;
    return { mesh, mat };
  };
  const sheet = mk('wave', waveGeometry(), {});
  const spray = mk('spray', sprayGeometry(), { needAlphaBlending: true });
  spray.mat.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF; spray.mat.disableDepthWrite = true;
  for (const m of [sheet.mat, spray.mat]) { m.freeze(); fastFrozenIsReady(m); }
  return {
    meshes: [sheet.mesh, spray.mesh], params,
    /** Where its front is (local x: it travels towards −x) and its own time (s); shown or not. */
    set(front, t, shown) { params.x = front; params.y = t; params.z = shown ? 1 : 0; },
    get shown() { return params.z > 0.5; },
  };
}
