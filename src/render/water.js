// Water bodies (shaders/water.wgsl.js). Lakes come from the bake (hydro lake mask, lake_level at
// 4 m): every unfrozen lake becomes flat geometry at its level, row-merged quads over its texels and
// a two-texel border (the plane runs under the shore; the terrain hides it), drawn twice — the
// absorb pass (multiply) and the surface pass (add, depth write, the SSR water mark). The Wraith's
// ripples live in a small storage buffer shared with the post chain's SSR (post.waterRipples).
// CPU side: levelAt(x, z) for wading and swimming. Owner fields per frame: time, the Wraith's
// position and speed.

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
import { waterVertexWGSL, waterAbsorbFragmentWGSL, waterSurfaceFragmentWGSL, WATER_RIPPLES } from '../shaders/water.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';
import { WorldData } from '../world/worldData.js';
import { OASIS_POOL } from '../world/oasis.js';

const N = 2048, C = 4, HALF = 4096;
/** How far (texels of C m) a lake's level may flood past the bake's mask onto lower real ground. */
const FLOOD = 8;
/** …only where the ground lies at most this far (m) under the level. */
const FLOOD_DEPTH = 0.6;
/** Rivers: how far (m) around a point the bed is sought (the channel's half-width and banks). */
export const RIVER_R = 4;

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {any} clipmap
 * @param {any} atmo
 * @param {any} wind     world/wind.js
 * @param {any} streamer CPU biome weights (frozen lakes stay the frost's ice)
 * @param {any} ripples  StorageBuffer of WATER_RIPPLES vec4s (post.waterRipples)
 * @param {string} base  world data URL
 * @param {any} ground  CPU ground (qx, qz → sample() → h): river surfaces near the Wraith
 */
export async function createWater(scene, clipmap, atmo, wind, streamer, ripples, base, ground) {
  const S = ShaderStore.ShadersStoreWGSL;
  S.waterVertexShader = waterVertexWGSL; S.waterAbsorbFragmentShader = waterAbsorbFragmentWGSL; S.waterSurfaceFragmentShader = waterSurfaceFragmentWGSL;
  const [hy, llb] = await Promise.all([
    fetch(base + 'hydro.rgba8').then((r) => r.arrayBuffer()), fetch(base + 'lake_level.u16').then((r) => r.arrayBuffer())]);
  const hydro = new Uint8Array(hy), raw = new Uint16Array(llb);
  // Water level per texel (NaN: dry): unfrozen lakes as the bake masked them. The mask is coarser
  // than the 2 m terrain, so `wet` (below, once the height tiles are in) floods the level on into
  // the texels whose real ground lies under it, plus a one-texel rim the terrain hides.
  const level = new Float32Array(N * N).fill(NaN);
  const frost = (i, j) => { const A = streamer.biomeA; if (!A) return 0; const o = ((j >> 1) * 1024 + (i >> 1)) * 4; return A[o] / Math.max(A[o] + A[o + 1] + A[o + 2] + A[o + 3], 13); };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const o = j * N + i;
    if (hydro[o * 4 + 1] > 0 && raw[o] > 0 && frost(i, j) < 0.5) level[o] = raw[o] / 32 - 128;
  }
  // Rivers (texels with river strength r, not lakes, not frozen). The bake carved each channel
  // (carve = 1.2 + 3.6 (r − 0.2) m); its surface here is computed once from the real 2 m terrain:
  // the lowest ground across the channel at each texel plus a depth from the strength, smoothed
  // along the stream and never rising downstream of its neighbours. Then a river is just water at
  // a known level per texel — the mesh, the plants, swimming and the camera all read the same.
  const rDepth = new Float32Array(N * N).fill(NaN), rFlow = new Float32Array(N * N * 3), rLevel = new Float32Array(N * N).fill(NaN);
  const tilesNeeded = new Set();
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const o = j * N + i, r = hydro[o * 4] / 255;
    if (r <= 0.05 || !Number.isNaN(level[o]) || frost(i, j) >= 0.5) continue;
    const carve = Math.min(7, Math.max(1.2, 1.2 + 3.6 * (r - 0.2)));
    rDepth[o] = Math.min(1.8, Math.max(0.3, 0.3 * carve));
    rFlow[o * 3] = (hydro[o * 4 + 2] - 128) / 127; rFlow[o * 3 + 1] = (hydro[o * 4 + 3] - 128) / 127; rFlow[o * 3 + 2] = r;
    tilesNeeded.add(((j * 2) >> 8) * 16 + ((i * 2) >> 8));
  }
  // Lakes need the tiles their flood can reach (FLOOD texels past the mask).
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (Number.isNaN(level[j * N + i])) continue;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ti = Math.min(4095, Math.max(0, (i + di * FLOOD) * 2)), tj = Math.min(4095, Math.max(0, (j + dj * FLOOD) * 2));
      tilesNeeded.add((tj >> 8) * 16 + (ti >> 8));
    }
  }
  // The 2 m height tiles under the water (u16: h = v / 32 − 128; tile tx, tz = 512 m squares from the north-west).
  const tiles = new Map();
  await Promise.all([...tilesNeeded].map(async (k) => {
    const tx = k % 16, tz = (k / 16) | 0;
    tiles.set(k, new Uint16Array(await fetch(base + `height/${tx}_${tz}.u16`).then((r) => r.arrayBuffer())));
  }));
  const h2 = (x, z) => {
    const i = Math.floor((x + HALF) / 2), j = Math.floor((HALF - z) / 2);
    const t = tiles.get((j >> 8) * 16 + (i >> 8)); if (!t) return NaN;
    return t[(j & 255) * 256 + (i & 255)] / 32 - 128;
  };
  // Lakes on the real terrain: the level floods into each neighbouring texel whose lowest 2 m
  // sample lies just under it (a gentle bank stays wet past the mask — cut there, the sheet ended
  // on texel edges in deep water: stairs from the air, and the CPU said dry where the mesh was
  // water). Only a shallow margin (FLOOD_DEPTH): ground far below the level is downhill of the
  // lake, not its shore — flooding there spilled terraces of water floating over slopes. Never
  // into a river (it runs at its own level). Then a one-texel rim the terrain hides.
  const wet = level.slice();
  for (let pass = 0; pass < FLOOD; pass++) {
    const src = wet.slice();
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const o = j * N + i; if (!Number.isNaN(src[o])) continue;
      let v = NaN;
      for (let k = 0; k < 4 && Number.isNaN(v); k++) v = src[o + (k === 0 ? 1 : k === 1 ? -1 : k === 2 ? N : -N)];
      if (Number.isNaN(v)) continue;
      const x = -HALF + i * C, z = HALF - j * C;
      const g = Math.min(h2(x + 1, z - 1), h2(x + 3, z - 1), h2(x + 1, z - 3), h2(x + 3, z - 3));
      if (g < v - 0.02 && g > v - FLOOD_DEPTH && Number.isNaN(rDepth[o])) wet[o] = v;
    }
  }
  const rim = new Uint8Array(N * N);
  {
    const src = wet.slice();
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const o = j * N + i; if (!Number.isNaN(src[o]) || !Number.isNaN(rDepth[o])) continue;
      let v = NaN;
      for (let k = 0; k < 4 && Number.isNaN(v); k++) v = src[o + (k === 0 ? 1 : k === 1 ? -1 : k === 2 ? N : -N)];
      if (!Number.isNaN(v)) { wet[o] = v; rim[o] = 1; }
    }
  }
  // The terrain as drawn (macro + meso, world/worldData.js — the collision twin of the GPU's): the
  // bare 2 m bake under a river is not where the meadow's ground is drawn (meso detail lowers it
  // by tens of cm), and a level measured against it floated the stream over the grass.
  const wd = new WorldData(streamer.manifest);
  wd.overview = streamer.overview; wd.biomeA = streamer.biomeA;
  wd.biomeB = new Uint8Array(wd.n8 * wd.n8 * 4); wd.wind = streamer.windData; wd.dunes = streamer.dunesData;
  for (const [k, t] of tiles) wd.setTile(k % 16, (k / 16) | 0, t);
  const hFull = (x, z) => { wd.qx = x; wd.qz = z; wd.sample(); return wd.h; };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const o = j * N + i, d = rDepth[o]; if (Number.isNaN(d)) continue;
    const x = -HALF + (i + 0.5) * C, z = HALF - (j + 0.5) * C, l = Math.hypot(rFlow[o * 3], rFlow[o * 3 + 1]) || 1;
    const px = rFlow[o * 3 + 1] / l, pz = -rFlow[o * 3] / l;
    // The bed (lowest across the channel) and the ground at the sheet's edge: where the bake's
    // channel is shallow (the flat meadow) a depth from the strength alone floated the river over
    // the grass in stepped texel squares.
    let bed = Infinity, edge = Infinity;
    for (let k = -3; k <= 3; k++) {
      const h = hFull(x + px * 2 * k, z + pz * 2 * k); if (h < bed) bed = h;
      if (Math.abs(k) >= 2 && h < edge) edge = h; // the ground 4–6 m out: where the sheet ends
    }
    // Below the ground where the sheet ends, so the terrain always covers its square edge and the
    // shore is the smooth line where water meets the bank (a thin stream where the cut is shallow).
    if (bed !== Infinity) rLevel[o] = Math.max(bed + 0.06, Math.min(bed + d, edge - 0.05));
  }
  // Smooth along the stream (a weighted mean with river neighbours), then make sure no texel stands
  // above the one upstream of it (water does not climb).
  for (let pass = 0; pass < 3; pass++) {
    const src = rLevel.slice();
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const o = j * N + i; if (Number.isNaN(src[o])) continue;
      let sum = src[o] * 2, w = 2;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const v = src[o + dj * N + di]; if ((di || dj) && !Number.isNaN(v)) { sum += v; w++; } }
      rLevel[o] = sum / w;
    }
  }
  for (let pass = 0; pass < 2; pass++) for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    const o = j * N + i; if (Number.isNaN(rLevel[o])) continue;
    const ui = i - Math.round(rFlow[o * 3]), uj = j + Math.round(rFlow[o * 3 + 1]), u = rLevel[uj * N + ui]; // one texel upstream
    if (!Number.isNaN(u) && rLevel[o] > u) rLevel[o] = u;
  }
  // Banks: one texel, carrying the level and the flow (the terrain hides what lies under it).
  {
    const src = rLevel.slice();
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const o = j * N + i; if (!Number.isNaN(src[o]) || !Number.isNaN(wet[o])) continue;
      for (let k = 0; k < 4; k++) {
        const q = o + (k === 0 ? 1 : k === 1 ? -1 : k === 2 ? N : -N);
        if (!Number.isNaN(src[q])) { rLevel[o] = src[q]; rDepth[o] = rDepth[q]; rFlow[o * 3] = rFlow[q * 3]; rFlow[o * 3 + 1] = rFlow[q * 3 + 1]; rFlow[o * 3 + 2] = rFlow[q * 3 + 2]; break; }
      }
    }
  }
  // The world water-level map every material can read (plants, rocks and trees keep out of it):
  // lakes and rivers alike store their level; dry ground −1e4.
  const wl = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) wl[k] = !Number.isNaN(wet[k]) ? wet[k] : !Number.isNaN(rLevel[k]) ? rLevel[k] : -1e4;
  atmo.waterTex.update(wl);
  // The oasis pool (world/oasis.js) has water only once the erg is restored: its texels are drawn
  // by a mesh of their own (shown by setOasis) and read dry on the CPU while it is choked.
  const oasisT = new Uint8Array(N * N);
  {
    const R = OASIS_POOL.r + 8;
    for (let j = Math.floor((HALF - OASIS_POOL.z - R) / C); j <= Math.floor((HALF - OASIS_POOL.z + R) / C); j++) for (let i = Math.floor((OASIS_POOL.x - R + HALF) / C); i <= Math.floor((OASIS_POOL.x + R + HALF) / C); i++) {
      const x = -HALF + (i + 0.5) * C, z = HALF - (j + 0.5) * C;
      if ((x - OASIS_POOL.x) ** 2 + (z - OASIS_POOL.z) ** 2 < R * R) oasisT[j * N + i] = 1;
    }
  }
  let oasisFull = true;
  // Geometry: lakes — per row, runs of texels at one level become one quad.
  const lakeQuads = (pos, idx, flow, oasis) => {
    for (let j = 0; j < N; j++) {
      let i = 0;
      while (i < N) {
        const v = wet[j * N + i];
        if (Number.isNaN(v) || oasisT[j * N + i] !== oasis) { i++; continue; }
        let e = i + 1;
        while (e < N && wet[j * N + e] === v && oasisT[j * N + e] === oasis) e++;
        const x0 = -HALF + i * C, x1 = -HALF + e * C, z0 = HALF - j * C, z1 = HALF - (j + 1) * C, b = pos.length / 3;
        pos.push(x0, v, z0, x1, v, z0, x1, v, z1, x0, v, z1);
        for (let k = 0; k < 4; k++) flow.push(0, 0, 0, -1); // a lake: flat at its level
        idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
        i = e;
      }
    }
  };
  const pos = [], idx = [], flow = [];
  lakeQuads(pos, idx, flow, 0);
  const oPos = [], oIdx = [], oFlow = [];
  lakeQuads(oPos, oIdx, oFlow, 1);
  // Rivers: a grid over their texels with shared corners (the level averaged over the river texels
  // meeting there), so the surface runs on smoothly; flow and rapids (the level's fall along the flow).
  let riverQuads = 0;
  const corner = new Map();
  const cornerIndex = (ci, cj) => {
    const key = cj * (N + 1) + ci;
    let v = corner.get(key);
    if (v !== undefined) return v;
    let sum = 0, w = 0, fx = 0, fz = 0, dep = 0, st = 0, rap = 0;
    for (let dj = -1; dj <= 0; dj++) for (let di = -1; di <= 0; di++) {
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const o = j * N + i, lv = rLevel[o]; if (Number.isNaN(lv)) continue;
      sum += lv; w++; fx += rFlow[o * 3]; fz += rFlow[o * 3 + 1]; dep += rDepth[o]; st += rFlow[o * 3 + 2];
      const ui = i - Math.round(rFlow[o * 3] * 2), uj = j + Math.round(rFlow[o * 3 + 1] * 2), up = rLevel[uj * N + ui];
      if (!Number.isNaN(up)) rap = Math.max(rap, up - lv);
    }
    v = pos.length / 3;
    pos.push(-HALF + ci * C, sum / w, HALF - cj * C);
    flow.push(fx / w, fz / w, Math.min(1, Math.max(0, (rap - 0.35) / 1.2)), st / w);
    corner.set(key, v);
    return v;
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const o = j * N + i; if (Number.isNaN(rLevel[o])) continue;
    const a0 = cornerIndex(i, j), a1 = cornerIndex(i + 1, j), a2 = cornerIndex(i + 1, j + 1), a3 = cornerIndex(i, j + 1);
    idx.push(a0, a2, a1, a0, a3, a2);
    riverQuads++;
  }
  const meshOf = (name, P, I, Fl, absorb) => {
    const mesh = new Mesh(name, scene);
    const vd = new VertexData(); vd.positions = new Float32Array(P); vd.indices = new Uint32Array(I); vd.applyToMesh(mesh, false);
    mesh.setVerticesData('flow', new Float32Array(Fl), false, 4);
    mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
    mesh.alphaIndex = absorb ? 0 : 1;
    return mesh;
  };
  const make = (name, fragment, absorb) => {
    const mesh = meshOf(name, pos, idx, flow, absorb);
    const mat = new ShaderMaterial(name, scene, { vertex: 'water', fragment }, {
      attributes: ['position', 'flow'],
      uniforms: ['viewProjection', 'levels', 'waterParams', 'windField', ...ENV_UNIFORMS],
      samplers: [...ATMO_MATERIAL_TEXTURES, ...(absorb ? [] : SHADOW_TEXTURES)],
      storageBuffers: ['levelData', 'waterRipples', ...ATMO_MATERIAL_BUFFERS, ...(absorb ? [] : ['shadowData'])],
      shaderLanguage: ShaderLanguage.WGSL,
      needAlphaBlending: true,
    });
    bindEnvironment(mat); bindAtmosphere(mat, atmo);
    mat.setArray4('levels', clipmap.levels); mat.setStorageBuffer('levelData', clipmap.levelData);
    mat.setStorageBuffer('waterRipples', ripples);
    mat.setArray4('windField', wind.block); mat.setVector4('waterParams', params);
    mat.backFaceCulling = false;
    // Absorb: dst × transmittance (alpha kept). Surface: dst + light, alpha replaced (the SSR mark).
    mat.alphaMode = absorb ? Constants.ALPHA_MULTIPLY : Constants.ALPHA_ONEONE_ONEZERO;
    mat.disableDepthWrite = absorb;
    if (!absorb) mat.forceDepthWrite = true;
    mesh.material = mat;
    return { mesh, mat };
  };
  const params = new Vector4(0, 1, 0, 0);
  const absorb = make('waterAbsorb', 'waterAbsorb', true), surface = make('waterSurface', 'waterSurface', false);
  // The oasis's own pair, sharing the materials (no new pipelines).
  const oasisMeshes = oIdx.length ? [meshOf('oasisAbsorb', oPos, oIdx, oFlow, true), meshOf('oasisSurface', oPos, oIdx, oFlow, false)] : [];
  if (oasisMeshes.length) { oasisMeshes[0].material = absorb.mat; oasisMeshes[1].material = surface.mat; }
  const dry = (o) => oasisT[o] === 1 && !oasisFull;

  // Ripples: a ring of slots (x, z, start time, strength).
  const rip = new Float32Array(WATER_RIPPLES * 4);
  let head = 0, lastEmit = -1e9, wasIn = false, dirty = true, lastPhase = 0, lastX = 0, lastZ = 0;
  /** A trail point (heading dx, dz; strength s ≤ 4) or, with dx = dz = 0, a splash. */
  function emit(x, z, t, s, dx, dz) {
    const o = head * 4; head = (head + 1) % WATER_RIPPLES;
    let bin = 64;
    if (dx * dx + dz * dz > 1e-6) bin = ((Math.round(Math.atan2(dx, dz) / (Math.PI / 32)) % 64) + 64) % 64;
    rip[o] = x; rip[o + 1] = z; rip[o + 2] = t; rip[o + 3] = 8 * bin + Math.min(3.9, Math.max(0.01, s)); dirty = true;
  }

  const water = {
    meshes: [absorb.mesh, surface.mesh, ...oasisMeshes], materials: [absorb.mat, surface.mat], quads: idx.length / 6, riverQuads,
    /** The oasis pool full (the erg restored) or choked and dry; true when that changed what is drawn. */
    setOasis(full) {
      if (full === oasisFull) return false;
      oasisFull = full;
      for (const m of oasisMeshes) m.setEnabled(full);
      return true;
    },
    /** Lake level at (x, z) (m), or NaN where there is none (the rim under the shore excluded). */
    levelAt(x, z) {
      const i = Math.floor((x + HALF) / C), j = Math.floor((HALF - z) / C);
      if (i < 0 || j < 0 || i >= N || j >= N) return NaN;
      const o = j * N + i;
      return rim[o] || dry(o) ? NaN : wet[o];
    },
    /** Field query (no doubles as arguments: hot paths): qx, qz → levelQ() → lv (NaN: no water). */
    qx: 0.5, qz: 0.5, lv: 0.5, fx: 0.5 - 0.5, fz: 0.5 - 0.5,
    /** Another water source asked where there is none here ({ qx, qz, levelQ() → lv }), or null. */
    extra: null,
    levelQ() {
      const i = Math.floor((this.qx + HALF) / C), j = Math.floor((HALF - this.qz) / C);
      this.fx = 0; this.fz = 0;
      if (i < 0 || j < 0 || i >= N || j >= N) { this.lv = NaN; return; }
      const o = j * N + i;
      if (dry(o)) { this.lv = NaN; return; }
      this.lv = level[o];
      if (this.lv === this.lv) return;
      // Not a lake: the erg's braids when they run (render/wadiWater.js), else rivers and shallows.
      if (this.extra !== null && Number.isNaN(wet[o]) && Number.isNaN(rLevel[o])) { const ex = this.extra; ex.qx = this.qx; ex.qz = this.qz; ex.levelQ(); this.lv = ex.lv; return; }
      // Not the lake's mask: a river, else the flooded shallows and rim (the mesh's own level).
      const rl = rLevel[o]; if (rl !== rl) { this.lv = wet[o]; return; }
      // A river: its computed level; the current along the flow at the strength's speed.
      this.lv = rl;
      const sp = 0.5 + 1.6 * rFlow[o * 3 + 2];
      this.fx = rFlow[o * 3] * sp; this.fz = rFlow[o * 3 + 1] * sp;
    },
    /** Water anywhere in this texel (lake, river or their banks): nothing grows here. */
    wetAt(x, z) {
      const i = Math.floor((x + HALF) / C), j = Math.floor((HALF - z) / C);
      if (i < 0 || j < 0 || i >= N || j >= N) return false;
      const o = j * N + i; return !dry(o) && (!Number.isNaN(wet[o]) || !Number.isNaN(rLevel[o]));
    },
    /** A ripple now (or at a past time t): the scripted walks of photo spots lay their wake with it. */
    ripple(x, z, t, s, dx = 0, dz = 0) { emit(x, z, t, s, dx, dz); },
    /** Owner fields: time (s); the Wraith's position, horizontal speed (m/s). */
    time: 0.5, px: 0.5, py: 0.5, pz: 0.5, speed: 0.5 - 0.5,
    /** Swimming (owner): the stroke phase 0..1 — each stroke's sweep throws a ring and a little foam. */
    swimming: false, strokePhase: 0.5 - 0.5,
    /** True while the Wraith stands in water; its depth there (m). */
    inWater: false, depth: 0.5 - 0.5,
    update() {
      params.x = this.time;
      this.qx = this.px; this.qz = this.pz; this.levelQ(); const lv = this.lv;
      this.inWater = lv === lv && this.py < lv + 0.02;
      this.depth = this.inWater ? lv - this.py : 0;
      if (this.inWater) {
        const t = this.time, sp = this.speed, dx = this.px - lastX, dz = this.pz - lastZ, moved = Math.sqrt(dx * dx + dz * dz);
        // Deeper in the water, a bigger wake (wading shins push less than a swimming body).
        const body = Math.min(1, 0.35 + this.depth * 0.6);
        if (!wasIn) { emit(this.px, this.pz, t, 1.6, 0, 0); lastEmit = t; lastX = this.px; lastZ = this.pz; }
        else if (moved > 0.14 && moved < 3) {
          // The trail: a point every 14 cm along the path (the wake's crests and the churned lane).
          emit(this.px, this.pz, t, body * Math.min(1.6, 0.4 + 0.45 * sp), dx, dz); lastEmit = t; lastX = this.px; lastZ = this.pz;
        } else if (moved >= 3) { lastX = this.px; lastZ = this.pz; }
        else if (sp < 0.2 && t - lastEmit > 1.8) { emit(this.px, this.pz, t, 0.18, 0, 0); lastEmit = t; } // standing: a slow pulse
        if (this.swimming) {
          // Each stroke breaks the surface: a small splash ring at the sweep.
          const ph = this.strokePhase;
          if (lastPhase < 0.38 && ph >= 0.38) emit(this.px, this.pz, t, 0.7, 0, 0);
          lastPhase = ph;
        }
      }
      wasIn = this.inWater;
      if (dirty) { ripples.update(rip); dirty = false; }
    },
    freeze() { for (const m of water.materials) { m.freeze(); fastFrozenIsReady(m); } },
  };
  return water;
}
