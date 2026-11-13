// Limestone outcrops on the meadow (docs/meadow-overhaul.md M6): the pale rock that breaks through the
// forest on the reference's hill (screenshots/reference/meadow-target.jpg). Sculpted in Blender
// (tools/models/outcrop_pieces.py: 10 variants, LOD0/1/2, one baked normal + AO atlas), placed once
// over the whole world where the meadow is steep (scarps along the contour, where the forest thins)
// or on its crowns, and drawn thin-instanced per variant and LOD (LOD0 near, LOD1 mid, LOD2 far),
// re-sorted when the camera has moved 40 m. Solid: rockSolids gives them to the controller.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { outcropVertexWGSL, outcropFragmentWGSL } from '../shaders/outcrop.wgsl.js';
import { MAT_SAMPLERS, bindMaterialLibrary } from '../materials/library.js';
import { parseGlb } from './glb.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';
import { hashU32 } from '../terrain/noise.js';
import { graphics } from '../core/graphics.js';

const CELL = 40, SEED = 0x0c7a;
const LOD_R = [220, 800], FAR_R = 3000, MOVE = 40, MAX_PER = 96;
const h01 = (x, z, s) => hashU32((Math.imul(x, 0x27d4eb2d) ^ hashU32(Math.imul(z, 0x165667b1) ^ s)) >>> 0) / 4294967296;

/**
 * @param {any} scene @param {any} atmo @param {any} matLib @param {any} streamer
 * @param {{ keepOut?: (x: number, z: number, extra: number) => boolean, waterAt?: (x: number, z: number) => boolean, exclusions?: () => number[][] }} o
 */
export async function createOutcrops(scene, atmo, matLib, streamer, o = {}) {
  const engine = scene.getEngine();
  const base = import.meta.env.BASE_URL + 'models/';
  const meshes = parseGlb(await (await fetch(base + 'outcrop-pieces.glb')).arrayBuffer());
  const low = graphics.preset === 'low';
  const atlas = await new Promise((res, rej) => {
    const t = new Texture(base + 'outcrop-pieces' + (low || graphics.preset === 'medium' ? '-2k' : '') + '.webp', scene, {
      noMipmap: false, invertY: false, samplingMode: Constants.TEXTURE_TRILINEAR_SAMPLINGMODE, onLoad: () => res(t), onError: (m, e) => rej(e || new Error(m)),
    });
  });
  atlas.wrapU = atlas.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE; atlas.anisotropicFilteringLevel = 8;
  ShaderStore.ShadersStoreWGSL.outcropVertexShader = outcropVertexWGSL;
  ShaderStore.ShadersStoreWGSL.outcropFragmentShader = outcropFragmentWGSL;
  const variants = [];
  for (let v = 0; ; v++) { if (!meshes.has(`limestone_${v}_lod0`)) break; variants.push([0, 1, 2].map((l) => meshes.get(`limestone_${v}_lod${l}`) || meshes.get(`limestone_${v}_lod0`))); }
  const NV = variants.length;
  const mat = new ShaderMaterial('outcrops', scene, { vertex: 'outcrop', fragment: 'outcrop' }, {
    attributes: ['position', 'uv'], uniforms: ['viewProjection', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES, 'pieceAtlas', ...MAT_SAMPLERS],
    storageBuffers: [...ATMO_MATERIAL_BUFFERS, 'shadowData'], shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo); bindMaterialLibrary(mat, matLib); mat.setTexture('pieceAtlas', atlas);
  // One mesh per variant × LOD, thin-instanced (world0 = x, y, z, yaw; world1 = size xyz, seed).
  const sets = [];
  for (let v = 0; v < NV; v++) for (let l = 0; l < 3; l++) {
    const g = variants[v][l];
    const m = new Mesh(`outcrop-${v}-${l}`, scene);
    const vd = new VertexData(); vd.positions = g.positions; vd.uvs = g.uvs; vd.indices = g.indices; vd.applyToMesh(m, false);
    const buf = new Float32Array(MAX_PER * 16);
    m.thinInstanceSetBuffer('matrix', buf, 16, false);
    m.thinInstanceCount = 1;
    m.alwaysSelectAsActiveMesh = true; m.doNotSyncBoundingInfo = true;
    m.material = mat;
    sets.push({ v, l, m, buf, n: 0, drawn: 1 });
  }

  // ── Placement (once, the whole world) ───────────────────────────────────────────────────────────
  const P = { x: [], y: [], z: [], yaw: [], sx: [], sy: [], sz: [], seed: [], v: [] };
  const heightAt = (x, z) => {
    const ov = streamer.overview, n = streamer.overviewN;
    const i = Math.max(0, Math.min(n - 1, Math.floor((x + 4096) / 8))), j = Math.max(0, Math.min(n - 1, Math.floor((4096 - z) / 8)));
    return ov[j * n + i] / 32 - 128;
  };
  const meadowAt = (x, z) => { streamer.mqx = x; streamer.mqz = z; streamer.sampleBiome(); return streamer.bw1; };
  function place() {
    const g0 = Math.floor(-4000 / CELL), g1 = Math.ceil(4000 / CELL);
    const ex = o.exclusions ? o.exclusions() : [];
    for (let gz = g0; gz <= g1; gz++) for (let gx = g0; gx <= g1; gx++) {
      const x = (gx + 0.2 + 0.6 * h01(gx, gz, SEED + 1)) * CELL, z = (gz + 0.2 + 0.6 * h01(gx, gz, SEED + 2)) * CELL;
      if (meadowAt(x, z) < 0.75) continue;
      const h = heightAt(x, z), hx = heightAt(x + 12, z) - heightAt(x - 12, z), hz = heightAt(x, z + 12) - heightAt(x, z - 12);
      const slope = Math.hypot(hx, hz) / 24;                                    // rise per metre
      // Crowns: higher than the ring 120 m round.
      let ring = 0; for (let k = 0; k < 8; k++) { const a = k * 0.785; ring += heightAt(x + Math.cos(a) * 120, z + Math.sin(a) * 120); }
      const crown = h - ring / 8;
      // A few big exposures, not a field of blocks (the reference shows two or three on a hillside).
      const pSteep = slope > 0.75 ? 0.28 : slope > 0.55 ? 0.07 : 0;
      const pCrown = crown > 25 ? 0.2 : 0;
      if (h01(gx, gz, SEED + 3) > Math.max(pSteep, pCrown)) continue;
      if (o.waterAt && o.waterAt(x, z)) continue;
      const big = 12 + 28 * Math.pow(h01(gx, gz, SEED + 4), 1.5);
      if (o.keepOut && o.keepOut(x, z, big * 0.6)) continue;
      let blocked = false; for (const e of ex) { const dx = x - e[0], dz = z - e[1], r = e[2] + big * 0.6; if (dx * dx + dz * dz < r * r) { blocked = true; break; } }
      if (blocked) continue;
      // Along the contour (scarps follow it); a crown's block faces where it likes.
      const yaw = slope > 0.4 ? Math.atan2(hx, -hz) + (h01(gx, gz, SEED + 5) - 0.5) * 0.5 : h01(gx, gz, SEED + 5) * 6.283;
      const sx = big, sy = big * (0.45 + 0.3 * h01(gx, gz, SEED + 6)), sz = big * (0.4 + 0.2 * h01(gx, gz, SEED + 7));
      // Seated so ~60 % stands proud at the centre (the sculpt spans ±1 in y), deeper into a steep slope.
      P.x.push(x); P.z.push(z); P.y.push(h + sy * 0.02 - slope * sz * 0.2); P.yaw.push(yaw);
      P.sx.push(sx); P.sy.push(sy); P.sz.push(sz); P.seed.push(h01(gx, gz, SEED + 8) * 97); P.v.push(Math.floor(h01(gx, gz, SEED + 9) * NV));
    }
    api.count = P.x.length;
    // A 32 m grid of the outcrops for covers() (the trees ask it per cell).
    grid.clear();
    for (let k = 0; k < P.x.length; k++) {
      const r = P.sx[k] * 0.5 + 3;
      for (let i = Math.floor((P.x[k] - r) / 32); i <= Math.floor((P.x[k] + r) / 32); i++) for (let j = Math.floor((P.z[k] - r) / 32); j <= Math.floor((P.z[k] + r) / 32); j++) {
        const key = i * 4096 + j; let a = grid.get(key); if (!a) grid.set(key, (a = [])); a.push(k);
      }
    }
    if (api.onPlaced) api.onPlaced();
  }
  const grid = new Map();
  /** True if (x, z) lies on an outcrop's footprint (+3 m): its ellipse in the rock's yawed frame. */
  function covers(x, z) {
    const a = grid.get(Math.floor(x / 32) * 4096 + Math.floor(z / 32)); if (!a) return false;
    for (const k of a) {
      const dx = x - P.x[k], dz = z - P.z[k], c = Math.cos(P.yaw[k]), s = Math.sin(P.yaw[k]);
      const lx = (dx * c + dz * s) / (P.sx[k] * 0.5 + 3), lz = (-dx * s + dz * c) / (P.sz[k] * 0.5 + 3);
      if (lx * lx + lz * lz < 1) return true;
    }
    return false;
  }
  let placed = false, lastX = 1e9, lastZ = 1e9;
  function sort(cx, cz) {
    for (const s of sets) s.n = 0;
    for (let k = 0; k < P.x.length; k++) {
      const dx = P.x[k] - cx, dz = P.z[k] - cz, d = Math.sqrt(dx * dx + dz * dz) - P.sx[k] * 0.5;
      if (d > (low ? 1500 : FAR_R)) continue;
      const l = d < LOD_R[0] ? 0 : d < LOD_R[1] ? 1 : 2;
      const s = sets[P.v[k] * 3 + l];
      if (s.n >= MAX_PER) continue;
      const b = s.buf, q = s.n++ * 16;
      b[q] = P.x[k]; b[q + 1] = P.y[k]; b[q + 2] = P.z[k]; b[q + 3] = P.yaw[k];
      b[q + 4] = P.sx[k]; b[q + 5] = P.sy[k]; b[q + 6] = P.sz[k]; b[q + 7] = P.seed[k];
    }
    let changed = false;
    for (const s of sets) {
      // Buckets of 8 (a changed count re-records the snapshot): unused slots have size 0.
      const cap = Math.min(MAX_PER, Math.max(1, Math.ceil(s.n / 8) * 8));
      for (let k = s.n; k < cap; k++) s.buf[k * 16 + 4] = 0;
      s.m.thinInstanceBufferUpdated('matrix');
      if (cap !== s.drawn) { s.drawn = cap; s.m.thinInstanceCount = cap; changed = true; }
    }
    if (changed) engine.snapshotRenderingReset();
  }
  const api = {
    material: mat, meshes: sets.map((s) => s.m), count: 0, covers,
    /** Called once the placement exists (world.js: the trees step aside). */
    onPlaced: null,
    camX: 0.5, camZ: 0.5,
    update() {
      if (!placed) { if (!streamer.overview) return; place(); placed = true; }
      const dx = this.camX - lastX, dz = this.camZ - lastZ;
      if (dx * dx + dz * dz > MOVE * MOVE) { lastX = this.camX; lastZ = this.camZ; sort(lastX, lastZ); }
    },
    /** Shadow casters: [mesh, first cascade, last cascade] by LOD. */
    // Low: only the near rocks cast (the far LODs' shadows cost ~0.25 ms on the 3060 there).
    casters() { return sets.filter((s) => !low || s.l === 0).map((s) => [s.m, s.l === 0 ? 0 : s.l === 1 ? 1 : 2, s.l === 0 ? 1 : s.l === 1 ? 2 : 3]); },
    makeShadowMaterial(name, light, origin) {
      const m = new ShaderMaterial(name, scene, { vertex: 'outcrop', fragment: 'shadowDepth' }, {
        attributes: ['position', 'uv'], uniforms: ['viewProjection', 'shadowLight', 'shadowOrigin'], shaderLanguage: ShaderLanguage.WGSL,
      });
      m.setVector4('shadowLight', light); m.setVector4('shadowOrigin', origin);
      return m;
    },
    /** Dev: an outcrop at (x, z) of length `size` (variant v), seated on the ground height h (look-dev shots). */
    addTest(x, z, h, size = 24, v = 0, yaw = 0) {
      P.x.push(x); P.z.push(z); P.y.push(h + size * 0.6 * 0.1); P.yaw.push(yaw); P.sx.push(size); P.sy.push(size * 0.6); P.sz.push(size * 0.5);
      P.seed.push(13.7 + v); P.v.push(v % NV); lastX = 1e9; this.update();
    },
    /** Outcrops within r of (x, z) for collision: cb(x, z, rx, rz, yaw, y0, y1). */
    near(x, z, r, cb) {
      for (let k = 0; k < P.x.length; k++) {
        const dx = P.x[k] - x, dz = P.z[k] - z, rr = r + P.sx[k] * 0.5;
        if (dx * dx + dz * dz > rr * rr) continue;
        cb(P.x[k], P.z[k], P.sx[k] * 0.42, P.sz[k] * 0.4, P.yaw[k], P.y[k] - P.sy[k] * 0.5, P.y[k] + P.sy[k] * 0.47);
      }
    },
    freeze() { mat.freeze(); fastFrozenIsReady(mat); },
  };
  return api;
}
