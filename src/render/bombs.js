// Volcanic bombs (shaders/bombs.wgsl.js): one mesh holding BOMB_MAX rocks, each its own lumpy shape (an icosphere pushed
// out and in by noise, flattened a little, chipped), placed by a record each (written by the owner: systems/eruption.js).

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { bombVertexWGSL, bombFragmentWGSL, BOMB_MAX } from '../shaders/bombs.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

export { BOMB_MAX };

/** An icosphere (subdivided twice): unit radius, positions and faces. */
function icosphere() {
  const t = (1 + Math.sqrt(5)) / 2;
  let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((p) => { const l = Math.hypot(...p); return p.map((c) => c / l); });
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < 2; s++) {
    const mid = new Map(), nf = [];
    const m = (a, b) => { const k = a < b ? a + ',' + b : b + ',' + a; if (!mid.has(k)) { const p = v[a].map((c, i) => (c + v[b][i]) / 2), l = Math.hypot(...p); v.push(p.map((c) => c / l)); mid.set(k, v.length - 1); } return mid.get(k); };
    for (const [a, b, c] of f) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    f = nf;
  }
  return { v, f };
}

/** The rocks' geometry (deterministic): every bomb its own shape; flat-shaded (each face its own vertices: a broken rock). */
export function bombGeometry(n = BOMB_MAX) {
  const { v, f } = icosphere(), pos = [], nrm = [], att = [], idx = [];
  const h = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
  const nz = (p, k) => { let s = 0; for (let o = 0; o < 3; o++) { const fq = 1.6 * (o + 1); s += Math.sin(p[0] * fq * 2.1 + k + o) * Math.sin(p[1] * fq * 1.7 + k * 1.3) * Math.sin(p[2] * fq * 2.3 + k * 0.7) / (o + 1); } return s; };
  for (let k = 0; k < n; k++) {
    const sq = [0.8 + 0.4 * h(k, 1), 0.6 + 0.4 * h(k, 2), 0.8 + 0.4 * h(k, 3)];
    // Chips: a few flat cuts across it (a block broken off the crater's wall), or none (a lava clot, round and lumpy).
    const cuts = h(k, 4) < 0.6 ? [0, 1, 2].map((c) => { const a = h(k, 10 + c) * 6.28, b = Math.acos(2 * h(k, 20 + c) - 1); return [Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a), 0.55 + 0.3 * h(k, 30 + c)]; }) : [];
    const shaped = v.map((p) => {
      let r = 1 + 0.28 * nz(p, k * 3.7);
      let q = [p[0] * r * sq[0], p[1] * r * sq[1], p[2] * r * sq[2]];
      for (const [cx, cy, cz, d] of cuts) { const s = q[0] * cx + q[1] * cy + q[2] * cz; if (s > d) q = [q[0] - cx * (s - d), q[1] - cy * (s - d), q[2] - cz * (s - d)]; }
      return q;
    });
    for (const [a, b, c] of f) {
      const A = shaped[a], B = shaped[b], C = shaped[c];
      const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      let N = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; const l = Math.hypot(...N) || 1; N = N.map((x) => x / l);
      for (const [P, O] of [[A, v[a]], [B, v[b]], [C, v[c]]]) { pos.push(...P); nrm.push(...N); att.push(k, ...O); }
      const base = pos.length / 3 - 3; idx.push(base, base + 1, base + 2);
    }
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), att: new Float32Array(att), idx: new Uint32Array(idx) };
}

export function createBombs(scene, atmo) {
  ShaderStore.ShadersStoreWGSL.bombVertexShader = bombVertexWGSL;
  ShaderStore.ShadersStoreWGSL.bombFragmentShader = bombFragmentWGSL;
  const geo = bombGeometry();
  const mesh = new Mesh('bombs', scene);
  const vd = new VertexData(); vd.positions = geo.pos; vd.normals = geo.nrm; vd.indices = geo.idx; vd.applyToMesh(mesh, false);
  mesh.setVerticesData('bomb', geo.att, false, 4);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
  const rec = new Float32Array(BOMB_MAX * 12);
  const buf = new StorageBuffer(scene.getEngine(), rec.byteLength, undefined, 'bombs');
  buf.update(rec);
  const mat = new ShaderMaterial('bombs', scene, { vertex: 'bomb', fragment: 'bomb' }, {
    attributes: ['position', 'normal', 'bomb'], uniforms: ['viewProjection', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES], storageBuffers: ['bombRec', ...ATMO_MATERIAL_BUFFERS, 'shadowData'], shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo);
  mat.setStorageBuffer('bombRec', buf);
  mesh.material = mat;
  mesh.setEnabled(false);
  return { mesh, material: mat, rec, upload() { buf.update(rec); }, freeze() { mat.freeze(); fastFrozenIsReady(mat); } };
}
