// The kelp of the Sounding (Phase 10 U2; shaders/kelp.wgsl.js draws it, world/kelp.js says where it grows). One static mesh of
// SLOTS stipes, each written out once (the stipe's rings and its blades); the slots are filled on the CPU with the stipes in a
// window of grid cells round the camera whenever it crosses a cell (and once a second, for ground that streamed in late). Drawn
// only while the camera is under the Sounding's water (and for the first frames, so its pipeline is built at load).

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { kelpVertexWGSL, kelpFragmentWGSL, KELP_RINGS, KELP_SIDES, KELP_BLADES, KELP_BSEG } from '../shaders/kelp.wgsl.js';
import { kelpAt, kelpCell, KELP } from '../world/kelp.js';
import { SOUNDING } from '../world/sounding.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

/** Stipes drawn at once, and the window of cells round the camera they are taken from (WIN × WIN). */
export const KELP_SLOTS = 720, KELP_WIN = 30;

/** One stipe's template: positions (slot, s, kind) and kelpV; indices. */
export function kelpTemplate() {
  const pos = [], kv = [], idx = [];
  // The stipe: KELP_RINGS rings of KELP_SIDES, closer at the foot (the holdfast's flare).
  for (let r = 0; r <= KELP_RINGS; r++) {
    const s = (r / KELP_RINGS) ** 1.15;
    for (let k = 0; k < KELP_SIDES; k++) { pos.push(0, s, 0); kv.push(k / KELP_SIDES * Math.PI * 2, 0, 0, 0); }
  }
  for (let r = 0; r < KELP_RINGS; r++) for (let k = 0; k < KELP_SIDES; k++) {
    const a = r * KELP_SIDES + k, b = r * KELP_SIDES + (k + 1) % KELP_SIDES, c = a + KELP_SIDES, d = b + KELP_SIDES;
    idx.push(a, c, b, b, c, d);
  }
  // The blades: in two ranks up the stipe (each a quarter turn on from the last), from a few metres up to its top.
  for (let i = 0; i < KELP_BLADES; i++) {
    const s = 0.06 + 0.94 * ((i + 0.5) / KELP_BLADES) ** 0.9, ang = i * 2.39996;
    const base = pos.length / 3;
    for (let q = 0; q <= KELP_BSEG; q++) for (const w of [-1, 1]) { pos.push(0, s, 1); kv.push(ang, q / KELP_BSEG, w, i); }
    for (let q = 0; q < KELP_BSEG; q++) { const a = base + q * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  return { pos, kv, idx };
}

export function createKelp(scene, atmo, clipmap, ground) {
  const engine = scene.getEngine();
  ShaderStore.ShadersStoreWGSL.kelpVertexShader = kelpVertexWGSL;
  ShaderStore.ShadersStoreWGSL.kelpFragmentShader = kelpFragmentWGSL;
  const T = kelpTemplate(), nv = T.pos.length / 3, ni = T.idx.length;
  const pos = new Float32Array(KELP_SLOTS * nv * 3), kv = new Float32Array(KELP_SLOTS * nv * 4), idx = new Uint32Array(KELP_SLOTS * ni);
  for (let i = 0; i < KELP_SLOTS; i++) {
    for (let v = 0; v < nv; v++) {
      const o = (i * nv + v) * 3; pos[o] = i; pos[o + 1] = T.pos[v * 3 + 1]; pos[o + 2] = T.pos[v * 3 + 2];
      kv.set(T.kv.slice(v * 4, v * 4 + 4), (i * nv + v) * 4);
    }
    for (let k = 0; k < ni; k++) idx[i * ni + k] = T.idx[k] + i * nv;
  }
  const mesh = new Mesh('kelp', scene);
  const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.applyToMesh(mesh, false);
  mesh.setVerticesData('kelpV', kv, false, 4);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
  const inst = new Float32Array(KELP_SLOTS * 8);
  const instBuf = new StorageBuffer(engine, inst.byteLength, undefined, 'kelp-instances');
  instBuf.update(inst);
  const params = new Vector4(0, SOUNDING.water ?? 1.41, 0, 0), body = new Vector4(0, -1e4, 0, 2.4), snag = new Vector4(0, 0, 0, 0);
  const mat = new ShaderMaterial('kelp', scene, { vertex: 'kelp', fragment: 'kelp' }, {
    attributes: ['position', 'kelpV'],
    uniforms: ['viewProjection', 'kelpParams', 'kelpBody', 'kelpSnag', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES],
    storageBuffers: ['kelpInst', 'lightGrid', ...ATMO_MATERIAL_BUFFERS],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo);
  mat.setVector4('kelpParams', params); mat.setVector4('kelpBody', body); mat.setVector4('kelpSnag', snag);
  mat.setStorageBuffer('kelpInst', instBuf); mat.setStorageBuffer('lightGrid', clipmap.lightGrid);
  mat.backFaceCulling = false;
  mesh.material = mat;

  const groundAt = (x, z) => { ground.qx = x; ground.qz = z; ground.sample(); return ground.h; };
  const tmp = new Array(7);
  let ci = 1e9, cj = 1e9, refill = 0, shown = 0;
  /** Fill the slots with the stipes in the window round cell (i0, j0), nearest the middle first (a spiral would be exact; rings
   *  by Chebyshev distance are near enough, and the window holds more cells than slots only at its corners). */
  function place(i0, j0) {
    let n = 0;
    const H = KELP_WIN >> 1;
    for (let r = 0; r <= H && n < KELP_SLOTS; r++) {
      for (let j = -r; j <= r && n < KELP_SLOTS; j++) for (let i = -r; i <= r && n < KELP_SLOTS; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        if (!kelpAt(i0 + i, j0 + j, groundAt, tmp)) continue;
        const o = n * 8;
        inst[o] = tmp[0]; inst[o + 1] = tmp[1]; inst[o + 2] = tmp[2]; inst[o + 3] = tmp[3];
        inst[o + 4] = tmp[4]; inst[o + 5] = tmp[5]; inst[o + 6] = tmp[6]; inst[o + 7] = 1;
        n++;
      }
    }
    for (let k = n; k < KELP_SLOTS; k++) inst[k * 8 + 7] = 0;
    instBuf.update(inst);
    shown = n;
  }
  const api = {
    mesh, material: mat, triangles: idx.length / 3,
    /** Owner fields: time, whether the camera is under the Sounding (drawn), the Wraith, a snag (strength 0: none). */
    time: 0.5, on: false, cx: 0.5, cz: 0.5,
    get shown() { return shown; },
    update(dt) {
      params.x = this.time; params.z = this.on ? 1 : 0;
      if (!this.on) return;
      const i = kelpCell(this.cx, SOUNDING.x), j = kelpCell(this.cz, SOUNDING.z);
      refill -= dt;
      if (i !== ci || j !== cj || refill <= 0) { ci = i; cj = j; refill = 1; place(i, j); }
    },
    body(x, y, z) { body.x = x; body.y = y; body.z = z; },
    snag(x, y, z, s) { snag.x = x; snag.y = y; snag.z = z; snag.w = s; },
    freeze() { mat.freeze(); fastFrozenIsReady(mat); },
  };
  return api;
}

export { KELP };
