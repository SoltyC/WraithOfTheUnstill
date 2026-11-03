// Under the water (Phase 10 U1, shaders/underwaterFx.wgsl.js): marine snow round the camera and
// the bubbles the robe sheds. One static mesh of quads, moved in the vertex shader; always drawn (a
// degenerate quad out of the water), so its pipeline is made at load.
// Bubbles: a ring of slots (x, y, z, birth; radius, drift x, drift z). Going under, the robe lets go
// of the air caught in it: a burst, then a trickle that dies away over a few seconds; a fast stroke
// shakes a few more loose. Owner fields per frame: time, the water level at the camera, tannin,
// the Wraith's position, velocity and whether it is under.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { uwFxVertexWGSL, uwFxFragmentWGSL, UW_COUNT, UW_BUBBLES } from '../shaders/underwaterFx.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

export function createUnderwaterFx(scene, atmo) {
  const engine = scene.getEngine();
  ShaderStore.ShadersStoreWGSL.uwFxVertexShader = uwFxVertexWGSL;
  ShaderStore.ShadersStoreWGSL.uwFxFragmentShader = uwFxFragmentWGSL;
  const n = UW_COUNT;
  const pos = new Float32Array(n * 4 * 3), idx = new Uint32Array(n * 6);
  const cx = [-1, 1, 1, -1], cy = [-1, -1, 1, 1];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) { const o = (i * 4 + k) * 3; pos[o] = i; pos[o + 1] = cx[k]; pos[o + 2] = cy[k]; }
    const v = i * 4, o = i * 6;
    idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
  }
  const mesh = new Mesh('underwaterFx', scene);
  const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.applyToMesh(mesh, false);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
  const bub = new Float32Array(UW_BUBBLES * 8);
  const bubBuf = new StorageBuffer(engine, bub.byteLength, undefined, 'underwater-bubbles');
  bubBuf.update(bub);
  const params = new Vector4(0, -1e4, 0, 0), column = new Vector4(0, -100, 0, -56), column2 = new Vector4(0, 0, 6, 0);
  const mat = new ShaderMaterial('underwaterFx', scene, { vertex: 'uwFx', fragment: 'uwFx' }, {
    attributes: ['position'],
    uniforms: ['viewProjection', 'uwParams', 'uwColumn', 'uwColumn2', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES],
    storageBuffers: ['bubbles', ...ATMO_MATERIAL_BUFFERS],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo);
  mat.setVector4('uwParams', params); mat.setStorageBuffer('bubbles', bubBuf);
  mat.setVector4('uwColumn', column); mat.setVector4('uwColumn2', column2);
  mat.backFaceCulling = false;
  mesh.material = mat;

  let head = 0, dirty = false, wasUnder = false, burst = 0, lastT = 0, seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  function bubble(x, y, z, t, r) {
    const o = head * 8; head = (head + 1) % UW_BUBBLES;
    bub[o] = x; bub[o + 1] = y; bub[o + 2] = z; bub[o + 3] = t;
    bub[o + 4] = r; bub[o + 5] = (rnd() - 0.5) * 0.05; bub[o + 6] = (rnd() - 0.5) * 0.05;
    dirty = true;
  }
  const api = {
    mesh, material: mat,
    /** Owner fields: time (s); water level at the camera (−1e4: none); tannin 0..1; the Wraith. */
    time: 0.5, level: -1e4 + 0.5, tannin: 0.5 - 0.5,
    px: 0.5, py: 0.5, pz: 0.5, vx: 0.5, vy: 0.5, vz: 0.5, under: false,
    /** The intake's column (Phase 10 U2): shown, its axis, vent and top heights, radius, and the whirlpool's spin 0..1. */
    column(shown, x, z, vent, top, r, spin) { column.x = x; column.y = vent; column.z = z; column.w = top; column2.x = shown ? 1 : 0; column2.y = spin; column2.z = r; },
    /** Bubbles let go at a point (the Lung's breath and its tear, the cut's flood): n of them, radius r0..r1 (m), spread (m). */
    emit(x, y, z, n, r0, r1, spread) {
      const t = this.time;
      for (let k = 0; k < n; k++) bubble(x + (rnd() - 0.5) * spread, y + (rnd() - 0.5) * spread, z + (rnd() - 0.5) * spread, t + rnd() * 0.05, r0 + (r1 - r0) * rnd() * rnd());
    },
    update() {
      const t = this.time, dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
      const camUnder = this.level > -1e3;
      params.x = t; params.y = this.level; params.z = camUnder ? 1 : 0; params.w = this.tannin;
      // Going under: the air caught in the robe comes out in a burst, then a trickle.
      if (this.under && !wasUnder) {
        for (let k = 0; k < 64; k++) bubble(this.px + (rnd() - 0.5) * 0.8, this.py + 0.3 + rnd() * 1.5, this.pz + (rnd() - 0.5) * 0.8, t + rnd() * 0.6, 0.0015 + 0.0075 * rnd() * rnd());
        burst = 1;
      }
      wasUnder = this.under;
      if (this.under) {
        const sp = Math.sqrt(this.vx * this.vx + this.vy * this.vy + this.vz * this.vz);
        burst *= Math.exp(-dt / 2.5);
        const rate = 14 * burst + 0.8 * Math.min(sp, 3);      // bubbles per second
        let k = rate * dt;
        while (k > 0) { if (rnd() < k) bubble(this.px + (rnd() - 0.5) * 0.5, this.py + 0.4 + rnd() * 1.2, this.pz + (rnd() - 0.5) * 0.5, t, 0.0012 + 0.004 * rnd() * rnd()); k -= 1; }
      }
      if (dirty) { bubBuf.update(bub); dirty = false; }
    },
    freeze() { mat.freeze(); fastFrozenIsReady(mat); },
  };
  return api;
}
