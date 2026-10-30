// The wadis' evening water (Phase 9 D7b; dunes-design.md §7.1, "Restored: water at dusk";
// p9r-braids-restored): once the Dunes are restored, rain in the meadow sends a thin seasonal flow
// down the Dry Braids toward evening — broken sheets of water in the lowest part of each braid,
// catching the sky, with a band of wet, darker sand either side. Visual only (nothing wades in it).
// One draw: a ribbon along each braid's bed (world/ravines.json `wadis`), its vertices dropped onto
// the clipmap's own rendered ground in the vertex shader (shaders/grass.wgsl.js gGround), so the
// sheet lies on the dunes the terrain draws. After the water, flowers: clumps of desert annuals
// (primrose, sand verbena, globemallow, desert marigold) along the braids' damp banks, blooming
// while the Dunes are restored (dunes-design.md §7.1 "water at dusk, flowers after"; D8).

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
import { wadiVertexWGSL, wadiFragmentWGSL, wadiFlowerVertexWGSL, wadiFlowerFragmentWGSL } from '../shaders/wadiWater.wgsl.js';
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

const hf = (a, b) => { let x = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1); x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d); return ((x ^ (x >>> 13)) >>> 0) / 4294967296; };

/**
 * The flowers (deterministic): every 1.5 m along each braid, on either bank, a clump of 4–9 cards
 * where a slow noise along the bank says the seed took. position = the card's root (x, 0, z) — the
 * height comes from the ground on the GPU; flower = (corner x −1..1, corner y 0..1, size m, kind 0..3
 * + seed fraction).
 */
export function wadiFlowers(wadis) {
  const pos = [], attr = [], idx = [];
  // A slow 1D value noise along a bank (clumps and bare stretches).
  const vn = (t, k) => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return hf(i, k) * (1 - u) + hf(i + 1, k) * u; };
  wadis.forEach((w, wi) => {
    const P = w.pts; let along = 0;
    for (let k = 0; k < P.length - 1; k++) {
      const [ax, az, aw] = P[k], [bx, bz, bw] = P[k + 1], len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-3) continue;
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      for (let s = 0; s < len; s += 1.5) {
        const t = s / len, x = ax + (bx - ax) * t, z = az + (bz - az) * t, hw = (aw + (bw - aw) * t) * SPAN, a = along + s;
        for (const side of [-1, 1]) {
          const key = Math.round(a / 1.5) * 2 + (side > 0 ? 1 : 0);
          if (hf(key, wi * 31 + 7) > 0.9 * Math.max(0, (vn(a / 22, wi * 13 + side) - 0.3) / 0.7)) continue;
          // On the bank: past the water's middle, inside the wet band's edge.
          const off = side * hw * (0.5 + 0.45 * hf(key, wi * 31 + 8)), kind = Math.floor(vn(a / 60, wi * 5 + side + 99) * 3.999);
          const n = 4 + Math.floor(hf(key, wi * 31 + 9) * 6);
          for (let c = 0; c < n; c++) {
            const r = 0.9 * Math.sqrt(hf(key * 8 + c, wi + 11)), ang = hf(key * 8 + c, wi + 12) * 6.283;
            const px = x + nx * off + Math.cos(ang) * r, pz = z + nz * off + Math.sin(ang) * r;
            const size = 0.3 + 0.25 * hf(key * 8 + c, wi + 13), seed = hf(key * 8 + c, wi + 14) * 0.98;
            const b = pos.length / 3;
            for (const [cu, cv] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) { pos.push(px, 0, pz); attr.push(cu, cv, size, kind + seed); }
            idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
          }
        }
      }
      along += len;
    }
  });
  return { pos, attr, idx };
}

// The shader's noise (shaders/common.wgsl.js hash12 / noised: value only), for the CPU's water mask.
const fract = (v) => v - Math.floor(v);
function hash12(x, y) {
  let qx = fract(x * 0.1031), qy = fract(y * 0.103);
  const d = qx * (qy + 33.33) + qy * (qx + 33.33); qx += d; qy += d;
  return fract((qx + qy) * qx);
}
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash12(ix, iy), b = hash12(ix + 1, iy), c = hash12(ix, iy + 1), d = hash12(ix + 1, iy + 1);
  return (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy) * 2 - 1;
}
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/**
 * The water in a braid at the ribbon's (across −1..1, metres along, half-width, end fade), braid
 * seed and flow: the shader's mask (shaders/wadiWater.wgsl.js), 0..1.
 */
export function wadiWaterMask(u, a, hw, fade, seed, flow) {
  const x = u * hw + 0.3 * hw * noise(a * 0.013, seed * 3.1), ax = Math.abs(x) / hw;
  const core = (0.2 + 0.35 * flow) * (0.8 + 0.4 * noise(a * 0.03, seed * 1.7));
  const gaps = smooth(-0.45, 0, noise(a * 0.011, seed * 7.3) + 0.4 * flow);
  const bars = smooth(0.25, 0.45, noise(x * 0.22, a * 0.045 + seed) * 0.5 + 0.5 + 0.2 * flow);
  return (1 - smooth(core * 0.75, core, ax)) * gaps * (1 + (bars - 1) * 0.85) * fade;
}

export function createWadiWater(scene, clipmap, atmo, shadows, bindShadows, wadis, ripples = null, ground = null) {
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
    storageBuffers: ['levelData', 'biomeA', 'windMap', 'waterRipples', ...ATMO_MATERIAL_BUFFERS, 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
    needAlphaBlending: true,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo); bindShadows(mat, shadows);
  mat.setArray4('levels', clipmap.levels);
  mat.setStorageBuffer('levelData', clipmap.levelData);
  mat.setStorageBuffer('biomeA', clipmap.buffers.biomeA);
  mat.setStorageBuffer('windMap', clipmap.buffers.wind);
  mat.setVector4('wadiParams', params);
  if (ripples) mat.setStorageBuffer('waterRipples', ripples);
  mat.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;
  mat.disableDepthWrite = true;
  mat.backFaceCulling = false;
  mesh.material = mat;
  mat.freeze(); fastFrozenIsReady(mat);
  // The flowers: one draw of camera-facing cards, off beyond ~150 m.
  ShaderStore.ShadersStoreWGSL.wadiFlowerVertexShader = wadiFlowerVertexWGSL;
  ShaderStore.ShadersStoreWGSL.wadiFlowerFragmentShader = wadiFlowerFragmentWGSL;
  const fl = wadiFlowers(wadis || []);
  const fMesh = new Mesh('wadiFlowers', scene);
  const fvd = new VertexData();
  fvd.positions = new Float32Array(fl.pos.length ? fl.pos : [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  fvd.indices = new Uint32Array(fl.idx.length ? fl.idx : [0, 1, 2]); fvd.applyToMesh(fMesh, false);
  fMesh.setVerticesData('flower', new Float32Array(fl.attr.length ? fl.attr : new Array(12).fill(0)), false, 4);
  fMesh.alwaysSelectAsActiveMesh = true; fMesh.doNotSyncBoundingInfo = true; fMesh.freezeWorldMatrix();
  const fMat = new ShaderMaterial('wadiFlowers', scene, { vertex: 'wadiFlower', fragment: 'wadiFlower' }, {
    attributes: ['position', 'flower'],
    uniforms: ['viewProjection', 'levels', 'wadiParams', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES],
    storageBuffers: ['levelData', 'biomeA', 'windMap', ...ATMO_MATERIAL_BUFFERS, 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(fMat); bindAtmosphere(fMat, atmo); bindShadows(fMat, shadows);
  fMat.setArray4('levels', clipmap.levels);
  fMat.setStorageBuffer('levelData', clipmap.levelData);
  fMat.setStorageBuffer('biomeA', clipmap.buffers.biomeA);
  fMat.setStorageBuffer('windMap', clipmap.buffers.wind);
  fMat.setVector4('wadiParams', params);
  fMat.backFaceCulling = false;
  fMesh.material = fMat;
  fMat.freeze(); fastFrozenIsReady(fMat);
  // The CPU's braids (wading): their segments in 32 m cells — [ax, az, bx, bz, along at a, hw at a, hw at b, braid].
  const SEG = [], CELLS = new Map(), CC = 32, ckey = (i, j) => i * 65536 + j;
  (wadis || []).forEach((w, wi) => {
    let along = 0;
    for (let k = 0; k < w.pts.length - 1; k++) {
      const [ax, az, aw] = w.pts[k], [bx, bz, bw] = w.pts[k + 1], len = Math.hypot(bx - ax, bz - az), si = SEG.length;
      SEG.push([ax, az, bx, bz, along, aw * SPAN, bw * SPAN, wi, len, along + len]);
      const r = Math.max(aw, bw) * SPAN + 2;
      for (let i = Math.floor((Math.min(ax, bx) - r) / CC); i <= Math.floor((Math.max(ax, bx) + r) / CC); i++)
        for (let j = Math.floor((Math.min(az, bz) - r) / CC); j <= Math.floor((Math.max(az, bz) + r) / CC); j++) {
          const kk = ckey(i, j); if (!CELLS.has(kk)) CELLS.set(kk, []); CELLS.get(kk).push(si);
        }
      along += len;
    }
  });
  const totals = (wadis || []).map((w) => w.pts.slice(1).reduce((a, p, k) => a + Math.hypot(p[0] - w.pts[k][0], p[1] - w.pts[k][1]), 0));
  return {
    /** Water in the braids (render/water.js asks when it has none): fields qx, qz → levelQ() → lv (NaN: dry). */
    qx: 0.5, qz: 0.5, lv: 0.5,
    levelQ() {
      this.lv = NaN;
      const flow = params.y; if (flow < 0.05 || ground === null) return;
      const list = CELLS.get(ckey(Math.floor(this.qx / CC), Math.floor(this.qz / CC))); if (!list) return;
      for (let n = 0; n < list.length; n++) {
        const sg = SEG[list[n]], ex = sg[2] - sg[0], ez = sg[3] - sg[1];
        const t = ((this.qx - sg[0]) * ex + (this.qz - sg[1]) * ez) / (sg[8] * sg[8]);
        if (t < 0 || t > 1) continue;
        const hw = sg[5] + (sg[6] - sg[5]) * t, lat = ((this.qx - sg[0]) * -ez + (this.qz - sg[1]) * ex) / sg[8];
        if (Math.abs(lat) > hw) continue;
        const a = sg[4] + sg[8] * t, fade = Math.max(0, Math.min(1, a / 60, (totals[sg[7]] - a) / 60));
        if (wadiWaterMask(lat / hw, a, hw, fade, sg[7] + 0.5, flow) < 0.5) continue;
        ground.qx = this.qx; ground.qz = this.qz; ground.sample(); this.lv = ground.h + 0.06; return;
      }
    },
    mesh, material: mat, flowerMesh: fMesh, flowerMaterial: fMat, flowers: fl.pos.length / 12, rows: pos.length / 3 / (ACROSS + 1),
    /** Owner fields: time (s), restored 0..1 (the Dunes), hour (0..24). */
    time: 0.5, restored: 0.5 - 0.5, hour: 12.5 - 0.5,
    update() {
      // The flow comes down toward evening and is gone by the small hours (a seasonal stream, daily
      // in the game): rising from 16:30, full 18:00–22:00, drying out by 1:00.
      const h = this.hour, rise = Math.min(1, Math.max(0, (h - 16.5) / 1.5)), fall = h >= 12 ? 1 : Math.max(0, 1 - h);
      params.x = this.time; params.y = this.restored * (h >= 12 ? rise : fall); params.z = this.restored;   // the flowers bloom while restored
    },
  };
}
