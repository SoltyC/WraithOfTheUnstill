// Dust (shaders/dust.wgsl.js): one mesh of DUST_COUNT puff quads; records in a ring (a storage buffer, written only when
// puffs are spawned). spawn(x, y, z, vx, vy, vz, size, r, g, b, life) adds one; burst(...) a cloud of them.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { dustVertexWGSL, dustFragmentWGSL, DUST_COUNT } from '../shaders/dust.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

/** What a building's stuff gives off when it breaks (rgb albedo of its dust), by architecture material (world/architecture.js MAT). */
export const DUST_OF = {
  0: [0.31, 0.30, 0.27], 1: [0.31, 0.30, 0.27], 5: [0.12, 0.12, 0.11], 8: [0.38, 0.37, 0.34], 9: [0.26, 0.22, 0.15], 10: [0.19, 0.19, 0.19],
  11: [0.31, 0.22, 0.17], 13: [0.24, 0.19, 0.14], 14: [0.28, 0.27, 0.25], 16: [0.26, 0.21, 0.16], 20: [0.15, 0.14, 0.14],
};

export function createDust(scene, atmo) {
  ShaderStore.ShadersStoreWGSL.ruinDustVertexShader = dustVertexWGSL;
  ShaderStore.ShadersStoreWGSL.ruinDustFragmentShader = dustFragmentWGSL;
  const n = DUST_COUNT, pos = new Float32Array(n * 12), idx = new Uint32Array(n * 6);
  const cx = [-1, 1, 1, -1], cy = [-1, -1, 1, 1];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) { const o = (i * 4 + k) * 3; pos[o] = i; pos[o + 1] = cx[k]; pos[o + 2] = cy[k]; }
    const v = i * 4, o = i * 6;
    idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
  }
  const mesh = new Mesh('ruinDust', scene);
  const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.applyToMesh(mesh, false);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
  const rec = new Float32Array(n * 12);
  for (let i = 0; i < n; i++) rec[i * 12 + 3] = -1e9;   // (born an age ago: dead)
  const buf = new StorageBuffer(scene.getEngine(), rec.byteLength, undefined, 'ruin-dust');
  buf.update(rec);
  const T = new Vector4(0, 0, 0, 0);
  const mat = new ShaderMaterial('ruinDust', scene, { vertex: 'ruinDust', fragment: 'ruinDust' }, {
    attributes: ['position'],
    uniforms: ['viewProjection', 'dustT', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES], storageBuffers: ['dustRec', ...ATMO_MATERIAL_BUFFERS],
    shaderLanguage: ShaderLanguage.WGSL, needAlphaBlending: true,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo);
  mat.setStorageBuffer('dustRec', buf); mat.setVector4('dustT', T);
  mat.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;
  mat.disableDepthWrite = true; mat.backFaceCulling = false;
  mesh.material = mat;
  mesh.setEnabled(false);
  let next = 0, dirty = false, lastSpawn = -1e9, lo = Infinity, hi = -1;
  const R = (() => { let s = 0x9e3779b9; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; })();
  const api = {
    mesh, material: mat, time: 0, glow: 0,
    spawn(x, y, z, vx, vy, vz, size, r, g, b, life) {
      const o = next * 12; lo = Math.min(lo, next); hi = Math.max(hi, next); next = (next + 1) % n;
      rec[o] = x; rec[o + 1] = y; rec[o + 2] = z; rec[o + 3] = this.time;
      rec[o + 4] = vx; rec[o + 5] = vy; rec[o + 6] = vz; rec[o + 7] = size;
      rec[o + 8] = r; rec[o + 9] = g; rec[o + 10] = b; rec[o + 11] = life;
      dirty = true; lastSpawn = this.time;
    },
    /** A cloud: k puffs round (x, y, z) of about `size` m, bursting out at `speed`, the colour `col`, a little varied. */
    burst(x, y, z, k, size, speed, col, life = 14, up = 0.4) {
      for (let i = 0; i < k; i++) {
        const a = R() * Math.PI * 2, s = speed * (0.3 + 0.7 * R()), sh = 0.85 + 0.3 * R();
        this.spawn(x + (R() - 0.5) * size, y + R() * size * 0.5, z + (R() - 0.5) * size, Math.cos(a) * s, s * up * R(), Math.sin(a) * s,
          size * (0.5 + 0.6 * R()), col[0] * sh, col[1] * sh, col[2] * sh, life * (0.6 + 0.8 * R()));
      }
    },
    update() {
      T.x = this.time; T.y = this.glow;
      // (Only the records written since the last frame go up: one span, or the whole ring once it has wrapped round.)
      if (dirty) { buf.update(rec.subarray(lo * 12, (hi + 1) * 12), lo * 48, (hi - lo + 1) * 48); dirty = false; lo = Infinity; hi = -1; }
      // (Drawn only while something is in the air: the longest life is a minute.)
      const on = this.time - lastSpawn < 60;
      if (mesh.isEnabled() !== on) { mesh.setEnabled(on); scene.getEngine().snapshotRenderingReset?.(); }
    },
    freeze() { mat.freeze(); fastFrozenIsReady(mat); },
  };
  return api;
}
