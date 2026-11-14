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

/** The families drawn by one piece field each (the same limestone, the same shader). */
const OUTCROPS = { set: 'outcrop-pieces', prefix: 'limestone', name: 'outcrop', cell: 40, seed: 0x0c7a, lodR: [220, 800], farR: 3000, farLow: 1500, move: 40, maxPer: 96 };
// Boulders (docs/realism-plan.md A1/A4): scree below the scarps, a few on the slopes, rare erratics on
// the flat; 0.4–2.8 m, in clusters. They replace the meadow's procedural icospheres (render/rocks.js).
const BOULDERS = { set: 'boulder-pieces', prefix: 'boulder', name: 'boulder', cell: 20, seed: 0xb01d, lodR: [45, 160], farR: 450, farLow: 260, move: 12, maxPer: 256 };
const h01 = (x, z, s) => hashU32((Math.imul(x, 0x27d4eb2d) ^ hashU32(Math.imul(z, 0x165667b1) ^ s)) >>> 0) / 4294967296;

/**
 * @param {any} scene @param {any} atmo @param {any} matLib @param {any} streamer
 * @param {{ keepOut?: (x: number, z: number, extra: number) => boolean, waterAt?: (x: number, z: number) => boolean, exclusions?: () => number[][] }} o
 */
export function createOutcrops(scene, atmo, matLib, streamer, o = {}) { return createPieceField(scene, atmo, matLib, streamer, o, OUTCROPS); }
/** @param {{ keepOut?: Function, waterAt?: Function, exclusions?: Function, outcrops?: any }} o  outcrops: the scarps the scree falls from */
export function createBoulders(scene, atmo, matLib, streamer, o = {}) { return createPieceField(scene, atmo, matLib, streamer, o, BOULDERS); }

async function createPieceField(scene, atmo, matLib, streamer, o, F) {
  const engine = scene.getEngine();
  const { cell: CELL, seed: SEED, lodR: LOD_R, farR: FAR_R, move: MOVE, maxPer: MAX_PER } = F;
  const base = import.meta.env.BASE_URL + 'models/';
  const meshes = parseGlb(await (await fetch(base + F.set + '.glb')).arrayBuffer());
  const low = graphics.preset === 'low';
  const atlas = await new Promise((res, rej) => {
    const t = new Texture(base + F.set + (low || graphics.preset === 'medium' ? '-2k' : '') + '.webp', scene, {
      noMipmap: false, invertY: false, samplingMode: Constants.TEXTURE_TRILINEAR_SAMPLINGMODE, onLoad: () => res(t), onError: (m, e) => rej(e || new Error(m)),
    });
  });
  atlas.wrapU = atlas.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE; atlas.anisotropicFilteringLevel = 8;
  // The weathering masks (tools/models/assetkit.py): convexity, cavity, the sculpt's joints and seams.
  const mask = await new Promise((res, rej) => {
    const t = new Texture(base + F.set + '-mask' + (low || graphics.preset === 'medium' ? '-2k' : '') + '.webp', scene, {
      noMipmap: false, invertY: false, samplingMode: Constants.TEXTURE_TRILINEAR_SAMPLINGMODE, onLoad: () => res(t), onError: (m, e) => rej(e || new Error(m)),
    });
  });
  mask.wrapU = mask.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE; mask.anisotropicFilteringLevel = 8;
  ShaderStore.ShadersStoreWGSL.outcropVertexShader = outcropVertexWGSL;
  ShaderStore.ShadersStoreWGSL.outcropFragmentShader = outcropFragmentWGSL;
  const variants = [];
  for (let v = 0; ; v++) { if (!meshes.has(`${F.prefix}_${v}_lod0`)) break; variants.push([0, 1, 2].map((l) => meshes.get(`${F.prefix}_${v}_lod${l}`) || meshes.get(`${F.prefix}_${v}_lod0`))); }
  const NV = variants.length;
  const mat = new ShaderMaterial(F.name + 's', scene, { vertex: 'outcrop', fragment: 'outcrop' }, {
    attributes: ['position', 'uv'], uniforms: ['viewProjection', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES, 'pieceAtlas', 'pieceMask', ...MAT_SAMPLERS],
    storageBuffers: [...ATMO_MATERIAL_BUFFERS, 'shadowData'], shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo); bindMaterialLibrary(mat, matLib); mat.setTexture('pieceAtlas', atlas); mat.setTexture('pieceMask', mask);
  // One mesh per variant × LOD, thin-instanced (world0 = x, y, z, yaw; world1 = size xyz, seed).
  const sets = [];
  for (let v = 0; v < NV; v++) for (let l = 0; l < 3; l++) {
    const g = variants[v][l];
    const m = new Mesh(`${F.name}-${v}-${l}`, scene);
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
  const push = (x, y, z, yaw, sx, sy, sz, seed, v) => {
    P.x.push(x); P.y.push(y); P.z.push(z); P.yaw.push(yaw); P.sx.push(sx); P.sy.push(sy); P.sz.push(sz); P.seed.push(seed); P.v.push(v);
  };
  const ctx = { heightAt, meadowAt, h01, o, NV, CELL, SEED, push };
  function place() {
    (F === OUTCROPS ? placeOutcrops : placeBoulders)(ctx, o.exclusions ? o.exclusions() : []);
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
  /** True if any piece's footprint comes within r of (x, z) (the boulders ask the scarps). */
  function nearAny(x, z, r) {
    for (let i = Math.floor((x - r) / 32); i <= Math.floor((x + r) / 32); i++) for (let j = Math.floor((z - r) / 32); j <= Math.floor((z + r) / 32); j++) {
      const a = grid.get(i * 4096 + j); if (!a) continue;
      for (const k of a) { const dx = x - P.x[k], dz = z - P.z[k], rr = r + P.sx[k] * 0.5; if (dx * dx + dz * dz < rr * rr) return true; }
    }
    return false;
  }
  let placed = false, lastX = 1e9, lastZ = 1e9;
  function sort(cx, cz) {
    for (const s of sets) s.n = 0;
    for (let k = 0; k < P.x.length; k++) {
      const dx = P.x[k] - cx, dz = P.z[k] - cz, d = Math.sqrt(dx * dx + dz * dz) - P.sx[k] * 0.5;
      if (d > (low ? F.farLow : FAR_R)) continue;
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
    material: mat, meshes: sets.map((s) => s.m), count: 0, covers, nearAny, placed: () => placed,
    /** Called once the placement exists (world.js: the trees step aside). */
    onPlaced: null,
    camX: 0.5, camZ: 0.5,
    update() {
      if (!placed) { if (!streamer.overview || (o.outcrops && !o.outcrops.placed())) return; place(); placed = true; }
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

/** The scarps: a few big exposures on the steep meadow and its crowns (docs/meadow-overhaul.md M6). */
function placeOutcrops({ heightAt, meadowAt, o, NV, CELL, SEED, push }, ex) {
    const g0 = Math.floor(-4000 / CELL), g1 = Math.ceil(4000 / CELL);
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
      push(x, h + sy * 0.02 - slope * sz * 0.2, z, yaw, sx, sy, sz, h01(gx, gz, SEED + 8) * 97, Math.floor(h01(gx, gz, SEED + 9) * NV));
    }
}

/** Boulders: clusters of fallen blocks below and beside the scarps, a scatter on the slopes, a rare
 *  erratic on the flat. Each cluster: one big block and a few smaller ones within a few metres. */
function placeBoulders({ heightAt, meadowAt, o, NV, CELL, SEED, push }, ex) {
  const g0 = Math.floor(-4000 / CELL), g1 = Math.ceil(4000 / CELL);
  const scarp = o.outcrops ? o.outcrops.nearAny : null;
  for (let gz = g0; gz <= g1; gz++) for (let gx = g0; gx <= g1; gx++) {
    const roll = h01(gx, gz, SEED + 3);
    if (roll > 0.5) continue;                                                   // the most any cell gets
    const x = (gx + 0.15 + 0.7 * h01(gx, gz, SEED + 1)) * CELL, z = (gz + 0.15 + 0.7 * h01(gx, gz, SEED + 2)) * CELL;
    const nearScarp = scarp ? scarp(x, z, 28) : false;
    if (roll > (nearScarp ? 0.5 : 0.16)) continue;
    if (meadowAt(x, z) < 0.7) continue;
    const hx = heightAt(x + 8, z) - heightAt(x - 8, z), hz = heightAt(x, z + 8) - heightAt(x, z - 8);
    const slope = Math.hypot(hx, hz) / 16;
    const p = nearScarp ? 0.5 : 0.012 + 0.14 * Math.min(1, Math.max(0, (slope - 0.2) / 0.5));
    if (roll > p) continue;
    if (o.waterAt && o.waterAt(x, z)) continue;
    const n = 1 + Math.floor(h01(gx, gz, SEED + 4) * (nearScarp ? 6 : 3.2));
    for (let k = 0; k < n; k++) {
      const a = h01(gx, gz, SEED + 10 + k) * 6.283, rr = k === 0 ? 0 : 1.2 + 3.5 * h01(gx, gz, SEED + 20 + k);
      // Downhill of the cluster's head (blocks roll), a little.
      const bx = x + Math.cos(a) * rr + hx * 0.15 * rr, bz = z + Math.sin(a) * rr + hz * 0.15 * rr;
      // One big block, the rest smaller (a power law: most scree is small).
      const t = h01(gx, gz, SEED + 30 + k);
      const size = k === 0 ? 1.0 + 1.8 * t * (nearScarp ? 1 : 0.7) : 0.4 + 1.1 * t * t;
      if (o.keepOut && o.keepOut(bx, bz, size * 0.6)) continue;
      let blocked = false; for (const e of ex) { const dx = bx - e[0], dz = bz - e[1], r = e[2] + size; if (dx * dx + dz * dz < r * r) { blocked = true; break; } }
      if (blocked) continue;
      const h = Math.min(heightAt(bx, bz), heightAt(bx + size * 0.4, bz), heightAt(bx - size * 0.4, bz), heightAt(bx, bz + size * 0.4), heightAt(bx, bz - size * 0.4));
      const sx = size * (0.9 + 0.3 * h01(gx, gz, SEED + 40 + k)), sy = size * (0.8 + 0.35 * h01(gx, gz, SEED + 50 + k)), sz = size * (0.8 + 0.3 * h01(gx, gz, SEED + 60 + k));
      // Bedded: the bottom fifth to a third below the ground (the sculpt's underside sits near −0.45).
      const embed = 0.7 + 0.5 * h01(gx, gz, SEED + 70 + k);
      push(bx, h + sy * 0.5 * (0.45 - 0.4 * embed) - slope * size * 0.1, bz, h01(gx, gz, SEED + 80 + k) * 6.283, sx, sy, sz,
        h01(gx, gz, SEED + 90 + k) * 97, Math.floor(h01(gx, gz, SEED + 100 + k) * NV));
    }
  }
}
