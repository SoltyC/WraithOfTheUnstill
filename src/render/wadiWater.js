// The wadis' evening water (Phase 9 D7b; dunes-design.md §7.1, "Restored: water at dusk";
// p9r-braids-restored): once the Dunes are restored, rain in the meadow sends a thin seasonal flow
// down the Dry Braids toward evening — broken sheets of water in the lowest part of each braid,
// catching the sky, with a band of wet, darker sand either side. Visual only (nothing wades in it).
// One draw: a ribbon along each braid's bed (world/ravines.json `wadis`), its vertices dropped onto
// the clipmap's own rendered ground in the vertex shader (shaders/grass.wgsl.js gGround), so the
// sheet lies on the dunes the terrain draws.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { wadiVertexWGSL, wadiFragmentWGSL } from '../shaders/wadiWater.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

const STEP = 3;          // m between rows along a braid
const ACROSS = 6;        // quads across the ribbon
const SPAN = 0.42;       // the ribbon's half-width, as a fraction of the braid's (water in the middle, wet sand at its edges)

/**
 * The ribbons' geometry (deterministic): rows every STEP m along each braid, ACROSS + 1 vertices
 * across. position = (x, braid seed, z) — the height comes from the ground on the GPU; wadi =
 * (across −1..1, metres along, the half-width, the bed's end fade 0..1).
 * @param {{ id: string, pts: number[][] }[]} wadis  [x, z, half-width, bed height] every 20 m
 */
export function wadiRibbons(wadis) {
  const pos = [], attr = [], idx = [];
  wadis.forEach((w, wi) => {
    const P = w.pts; if (P.length < 2) return;
    let along = 0;
    const total = P.slice(1).reduce((a, p, k) => a + Math.hypot(p[0] - P[k][0], p[1] - P[k][1]), 0);
    let prevRow = -1;
    for (let k = 0; k < P.length - 1; k++) {
      const [ax, az, aw] = P[k], [bx, bz, bw] = P[k + 1], len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-3) continue;
      // The normal: averaged with the neighbouring segments' so rows don't fan apart at bends.
      const nAt = (i) => { const p0 = P[Math.max(0, i - 1)], p1 = P[Math.min(P.length - 1, i + 1)], dx = p1[0] - p0[0], dz = p1[1] - p0[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; };
      const na = nAt(k), nb = nAt(k + 1);
      for (let s = k === 0 ? 0 : STEP; s <= len + 1e-6; s += STEP) {
        const t = Math.min(1, s / len), x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        let nx = na[0] + (nb[0] - na[0]) * t, nz = na[1] + (nb[1] - na[1]) * t; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
        const hw = (aw + (bw - aw) * t) * SPAN, a = along + s, fade = Math.min(1, a / 60, (total - a) / 60);
        const row = pos.length / 3;
        for (let i = 0; i <= ACROSS; i++) {
          const u = (i / ACROSS) * 2 - 1;
          pos.push(x + nx * u * hw, wi + 0.5, z + nz * u * hw);
          attr.push(u, a, hw, Math.max(0, fade));
        }
        if (prevRow >= 0) for (let i = 0; i < ACROSS; i++) { const p = prevRow + i, q = row + i; idx.push(p, q, p + 1, p + 1, q, q + 1); }
        prevRow = row;
      }
      along += len;
    }
  });
  return { pos, attr, idx };
}

export function createWadiWater(scene, clipmap, atmo, shadows, bindShadows, wadis) {
  ShaderStore.ShadersStoreWGSL.wadiVertexShader = wadiVertexWGSL;
  ShaderStore.ShadersStoreWGSL.wadiFragmentShader = wadiFragmentWGSL;
  const { pos, attr, idx } = wadiRibbons(wadis || []);
  const mesh = new Mesh('wadiWater', scene);
  const vd = new VertexData();
  vd.positions = new Float32Array(pos.length ? pos : [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  vd.indices = new Uint32Array(idx.length ? idx : [0, 1, 2]); vd.applyToMesh(mesh, false);
  mesh.setVerticesData('wadi', new Float32Array(attr.length ? attr : new Array(12).fill(0)), false, 4);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
  const params = new Vector4(0, 0, 0, 0);
  const mat = new ShaderMaterial('wadiWater', scene, { vertex: 'wadi', fragment: 'wadi' }, {
    attributes: ['position', 'wadi'],
    uniforms: ['viewProjection', 'levels', 'wadiParams', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES],
    storageBuffers: ['levelData', 'biomeA', 'windMap', ...ATMO_MATERIAL_BUFFERS, 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
    needAlphaBlending: true,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo); bindShadows(mat, shadows);
  mat.setArray4('levels', clipmap.levels);
  mat.setStorageBuffer('levelData', clipmap.levelData);
  mat.setStorageBuffer('biomeA', clipmap.buffers.biomeA);
  mat.setStorageBuffer('windMap', clipmap.buffers.wind);
  mat.setVector4('wadiParams', params);
  mat.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;
  mat.disableDepthWrite = true;
  mat.backFaceCulling = false;
  mesh.material = mat;
  mat.freeze(); fastFrozenIsReady(mat);
  return {
    mesh, material: mat, rows: pos.length / 3 / (ACROSS + 1),
    /** Owner fields: time (s), restored 0..1 (the Dunes), hour (0..24). */
    time: 0.5, restored: 0.5 - 0.5, hour: 12.5 - 0.5,
    update() {
      // The flow comes down toward evening and is gone by the small hours (a seasonal stream, daily
      // in the game): rising from 16:30, full 18:00–22:00, drying out by 1:00.
      const h = this.hour, rise = Math.min(1, Math.max(0, (h - 16.5) / 1.5)), fall = h >= 12 ? 1 : Math.max(0, 1 - h);
      params.x = this.time; params.y = this.restored * (h >= 12 ? rise : fall);
    },
  };
}
