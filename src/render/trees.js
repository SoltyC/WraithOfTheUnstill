// Trees in the world (PLAN.md Phase 8 M4): the generator's variants (world/trees/generator.js) as
// thin-instanced meshes — per species VARIANTS seeds, each at two levels of detail — placed
// deterministically in groves around the camera: groves where a slow noise says so, scattered
// trees between, none outside the meadow or on steep ground, pines higher up, oaks and birches
// lower. Per-instance scale, yaw, lean and colour, so no two trees read alike. The placement is
// rebuilt when the camera has moved a few tens of metres, into fixed buffers (no garbage per
// frame). Leaves sample the leaf atlas (render/leafAtlas.js), drawn and mipmapped at load.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { RenderingGroup } from '@babylonjs/core/Rendering/renderingGroup.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { SHADOW_SPLITS } from './shadows.js';
import { CANOPY_N } from './atmosphere.js';
import { LOD_NEAR, LOD_OUT, FADE, treeVertexWGSL, treeLeafFragmentWGSL, treeBarkFragmentWGSL, treeShadowFragmentWGSL, treeBarkShadowFragmentWGSL, treeLeafDepthFragmentWGSL } from '../shaders/trees.wgsl.js';
import { growTree, growLog, SPECIES } from '../world/trees/generator.js';
import { drawLeafAtlas } from './leafAtlas.js';
import { canvasAtlasTexture } from './atlasTexture.js';
import { MAT, MAT_SAMPLERS, bindMaterialLibrary } from '../materials/library.js';
import { hashU32, valueNoise } from '../terrain/noise.js';
import { bindEnvironment, env } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

const VARIANTS = 8;
const SPECIES_IDS = ['pine', 'oak', 'birch', 'shrub', 'log']; // shrubs and logs/stumps fill tree cells left empty
const CELL = 9, REPLACE = 20;       // placement rebuilds after the camera moves REPLACE m
const HYST = 4, JUMP = 120;          // state hysteresis (m); a move beyond JUMP is a fresh placement (no fades)
const MAX_NEAR = 90, MAX_FAR = 260, MAX_MID = 160;   // per variant
const RADIUS = LOD_OUT + HYST + REPLACE + 2;
const MID_REACH = SHADOW_SPLITS[1] + REPLACE;      // shadow-only casters for cascade 1
const CANOPY_R = 45;                                // canopy cover around the camera (forest haze)
const SEED = 0x7ee5;
const h01 = (x, z, s) => hashU32((Math.imul(x, 0x27d4eb2d) ^ hashU32(Math.imul(z, 0x165667b1) ^ s)) >>> 0) / 4294967296;

/** Upload the leaf atlas as a mipmapped GPU texture (wrapped for Babylon). */
const leafAtlasTexture = (engine, scene) => canvasAtlasTexture(engine, scene, drawLeafAtlas(), 'leaf-atlas');

/** The triangles of one kind (0 bark, 1 leaf) from a grown tree, vertices compacted. */
function splitKind(t, kind) {
  const remap = new Int32Array(t.positions.length / 3).fill(-1);
  const pos = [], nrm = [], uv = [], info = [], idx = [];
  for (let i = 0; i < t.indices.length; i += 3) {
    if ((t.info[t.indices[i] * 4] > 0.5 ? 1 : 0) !== kind) continue;
    for (let k = 0; k < 3; k++) {
      const a = t.indices[i + k];
      if (remap[a] < 0) {
        remap[a] = pos.length / 3;
        pos.push(t.positions[a * 3], t.positions[a * 3 + 1], t.positions[a * 3 + 2]);
        nrm.push(t.normals[a * 3], t.normals[a * 3 + 1], t.normals[a * 3 + 2]);
        uv.push(t.uvs[a * 2], t.uvs[a * 2 + 1]);
        info.push(t.info[a * 4], t.info[a * 4 + 1], t.info[a * 4 + 2], t.info[a * 4 + 3]);
      }
      idx.push(remap[a]);
    }
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), uvs: new Float32Array(uv), info: new Float32Array(info), indices: new Uint32Array(idx) };
}

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {any} clipmap
 * @param {any} atmo
 * @param {any} matLib
 * @param {any} streamer  CPU biome and height data for placement
 */
export function createTrees(scene, clipmap, atmo, matLib, streamer, wind) {
  const engine = scene.getEngine();
  const S = ShaderStore.ShadersStoreWGSL;
  S.treeVertexShader = treeVertexWGSL; S.treeLeafFragmentShader = treeLeafFragmentWGSL; S.treeBarkFragmentShader = treeBarkFragmentWGSL;
  S.treeShadowFragmentShader = treeShadowFragmentWGSL; S.treeLeafDepthFragmentShader = treeLeafDepthFragmentWGSL; S.treeBarkShadowFragmentShader = treeBarkShadowFragmentWGSL;
  const atlas = leafAtlasTexture(engine, scene);
  const params = new Vector4(0, 1, 1, 0);
  const lodV = [new Vector4(0, 0, 0, 0), new Vector4(0, 0, 0, 0), new Vector4(0, 0, 1, 0), new Vector4(0, 0, 2, 0)]; // z: 0 view, 1 shadow (no fade), 2 far shadow (edge fades only); w: clock
  const sets = [], mats = [], shadowOnly = [];
  /** Trunk radius at the root per species × variant (m, at scale 1): collision. */
  const trunkR = new Float32Array(SPECIES_IDS.length * VARIANTS), logLen = new Float32Array(SPECIES_IDS.length * VARIANTS);
  const envArt = env.artParams;
  // Opaque order: the leaf depth prepass before everything else, then Babylon's default (by material).
  const zRank = (sm) => (sm.getMesh().name.startsWith('treeZ') ? 0 : 1);
  scene.setRenderingOrder(0, (a, b) => (zRank(a) - zRank(b)) || RenderingGroup.PainterSortCompare(a, b));
  SPECIES_IDS.forEach((sid, si) => {
    const barkLayer = MAT[SPECIES[sid].bark];
    for (let v = 0; v < VARIANTS; v++) for (const lod of [0, 1]) {
      const t = sid === 'log' ? growLog(1000 + v * 7, lod) : growTree(sid, 1000 + si * 131 + v * 17, lod);
      if (lod === 0) { trunkR[si * VARIANTS + v] = t.trunkR; logLen[si * VARIANTS + v] = t.length || 0; }
      const max = lod ? MAX_FAR : MAX_NEAR, buf = new Float32Array(max * 16);
      const meshes = [];
      for (const part of ['bark', 'leaf']) {
        const g = splitKind(t, part === 'leaf' ? 1 : 0);
        if (!g.indices.length) continue; // logs have no leaves
        const mesh = new Mesh(`tree-${part}-${sid}-${v}-${lod}`, scene);
        const vd = new VertexData(); vd.positions = g.positions; vd.normals = g.normals; vd.uvs = g.uvs; vd.indices = g.indices;
        vd.applyToMesh(mesh, false);
        mesh.setVerticesData('info', g.info, false, 4);
        mesh.thinInstanceSetBuffer('matrix', buf, 16, false);
        mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true;
        const leaf = part === 'leaf';
        const mat = new ShaderMaterial(mesh.name, scene, { vertex: 'tree', fragment: leaf ? 'treeLeaf' : 'treeBark' }, {
          attributes: ['position', 'normal', 'uv', 'info'],
          uniforms: ['viewProjection', 'levels', 'treeParams', 'windField', 'treeLod', 'treeMat', 'spellLights', ...ENV_UNIFORMS],
          samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES, ...(leaf ? ['leafAtlas'] : MAT_SAMPLERS)],
          storageBuffers: ['levelData', ...ATMO_MATERIAL_BUFFERS, 'shadowData'],
          shaderLanguage: ShaderLanguage.WGSL,
        });
        bindEnvironment(mat); bindAtmosphere(mat, atmo);
        if (leaf) mat.setTexture('leafAtlas', atlas); else bindMaterialLibrary(mat, matLib);
        mat.setArray4('levels', clipmap.levels); mat.setStorageBuffer('levelData', clipmap.levelData);
        mat.setVector4('treeParams', params); mat.setArray4('windField', wind.block); mat.setVector4('treeLod', lodV[lod]); mat.setVector4('treeMat', new Vector4(barkLayer, si, 0, 0));
        mat.setArray4('spellLights', clipmap.spellLights);
        mat.backFaceCulling = leaf ? false : true;
        mesh.material = mat;
        meshes.push(mesh); mats.push(mat);
        if (!leaf) continue;
        // Leaf depth prepass (drawn first, see the rendering order below): the colour pass then
        // shades each visible leaf pixel once instead of once per overlapping card.
        mat.depthFunction = Constants.EQUAL;
        const zm = new Mesh(`treeZ-${sid}-${v}-${lod}`, scene);
        const zd = new VertexData(); zd.positions = g.positions; zd.normals = g.normals; zd.uvs = g.uvs; zd.indices = g.indices;
        zd.applyToMesh(zm, false);
        zm.setVerticesData('info', g.info, false, 4);
        zm.thinInstanceSetBuffer('matrix', buf, 16, false);
        zm.alwaysSelectAsActiveMesh = true; zm.doNotSyncBoundingInfo = true;
        const zmat = new ShaderMaterial(zm.name, scene, { vertex: 'tree', fragment: 'treeLeafDepth' }, {
          attributes: ['position', 'normal', 'uv', 'info'],
          uniforms: ['viewProjection', 'levels', 'treeParams', 'windField', 'treeLod', 'artParams'],
          samplers: ['leafAtlas'], storageBuffers: ['levelData'], shaderLanguage: ShaderLanguage.WGSL,
        });
        zmat.setArray4('levels', clipmap.levels); zmat.setStorageBuffer('levelData', clipmap.levelData);
        zmat.setVector4('treeParams', params); zmat.setArray4('windField', wind.block); mat.setArray4('windField', wind.block); zmat.setVector4('treeLod', lodV[lod]); zmat.setVector4('artParams', envArt);
        zmat.setTexture('leafAtlas', atlas);
        zmat.backFaceCulling = false; zmat.disableColorWrite = true;
        zm.material = zmat;
        meshes.push(zm); mats.push(zmat);
      }
      sets.push({ sid, si, v, lod, meshes, buf, max, n: 0 });
      // Cascade 1 (to SHADOW_SPLITS[1], 140 m): every tree within its reach casts from the far geometry — a
      // shadow does not need every twig, and the far set (out to the placement radius) would run
      // all its vertices there. Shadow-only meshes with their own instances: a layer outside the
      // view camera's mask (shadow maps draw their own render lists).
      // Not cascade 0: receivers there read cascade 1 for the trees (shadows.wgsl.js shadowTap4) —
      // crowns overhead filled cascade 0's fine map many layers deep (~1.4 ms in a grove).
      if (lod === 1) {
        const sbuf = new Float32Array(MAX_MID * 16), smeshes = [];
        for (const part of ['bark', 'leaf']) {
          const g = splitKind(t, part === 'leaf' ? 1 : 0);
          if (!g.indices.length) continue;
          const mesh = new Mesh(`treeShadow-${part}-${sid}-${v}`, scene);
          const vd = new VertexData(); vd.positions = g.positions; vd.normals = g.normals; vd.uvs = g.uvs; vd.indices = g.indices;
          vd.applyToMesh(mesh, false);
          mesh.setVerticesData('info', g.info, false, 4);
          mesh.thinInstanceSetBuffer('matrix', sbuf, 16, false);
          mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true;
          mesh.layerMask = 0x10000000;
          mesh.material = meshes.find((m) => m.name.startsWith(`tree-${part}-`)).material; // never drawn by the view; avoids a default material
          smeshes.push(mesh); shadowOnly.push(mesh);
        }
        sets.push({ sid, si, v, lod: 2, meshes: smeshes, buf: sbuf, max: MAX_MID, n: 0 });
      }
    }
  });
  const byKey = (si, v, lod) => sets[(si * VARIANTS + v) * 3 + lod];

  // ── Placement ──────────────────────────────────────────────────────────────────────────────
  let lastX = 1e9, lastZ = 1e9, fading = false, cleanAt = 0, canopySum = 0, canopyTarget = 0, lastNow = 0;
  /** Each placed tree's state at the last placement (cell key → 1 near, 2 far); swapped per rebuild. */
  let prev = new Map(), cur = new Map();
  const t0 = performance.now();
  /** Water surface level at (x, z) or NaN (render/water.js, once loaded): nothing grows in it. */
  let waterAt = null;
  /** Places with no trees ([x, z, r]): built sites, paths. */
  let exclude = [];
  function meadowAt(x, z) { streamer.mqx = x; streamer.mqz = z; streamer.sampleBiome(); return streamer.bw1; }
  function heightAt(x, z) {
    const ov = streamer.overview, n = streamer.overviewN; if (!ov) return 0;
    const i = Math.max(0, Math.min(n - 1, Math.floor((x + 4096) / 8))), j = Math.max(0, Math.min(n - 1, Math.floor((4096 - z) / 8)));
    return ov[j * n + i] / 32 - 128;
  }
  /** The tree of cell (gx, gz), if any, into T (deterministic: the same tree whenever asked). */
  const T = { x: 0.5, z: 0.5, si: 0, v: 0, sc: 0.5 };
  function treeAt(gx, gz) {
    const x = (gx + 0.15 + 0.7 * h01(gx, gz, SEED + 1)) * CELL, z = (gz + 0.15 + 0.7 * h01(gx, gz, SEED + 2)) * CELL;
    // Groves (slow noise), sparse singles between.
    const grove = valueNoise(x / 170, z / 170, SEED + 3) * 0.65 + valueNoise(x / 55, z / 55, SEED + 4) * 0.35;
    const p = grove > 0.12 ? 0.25 + 0.6 * Math.min(1, (grove - 0.12) / 0.3) : 0.012;
    let kind = -1;
    if (h01(gx, gz, SEED + 5) > p) {
      // No tree here: perhaps a shrub (in a grove's gaps, along its edge) or a fallen log / stump.
      const hu = h01(gx, gz, SEED + 21);
      const ps = grove > 0.12 ? 0.5 : grove > 0.0 ? 0.14 : 0, pl = grove > 0.2 ? 0.14 : 0;
      if (hu < ps) kind = 3; else if (hu < ps + pl) kind = 4; else return false;
    }
    if (meadowAt(x, z) < 0.6) return false;
    const h = heightAt(x, z), sl = Math.abs(heightAt(x + 8, z) - h) + Math.abs(heightAt(x, z + 8) - h);
    if (sl > 5) return false;
    for (const e of exclude) { const ex = x - e[0], ez = z - e[1]; if (ex * ex + ez * ez < e[2] * e[2]) return false; }
    if (waterAt) { const wl = waterAt(x, z); if (wl === wl && h < wl + 0.5) return false; }
    // Species: pines above ~330 m and on rises; oaks in the low groves; birches at edges.
    const hs = h01(gx, gz, SEED + 6), alt = Math.max(0, Math.min(1, (h - 280) / 120));
    T.si = kind >= 0 ? kind : hs < alt * 0.85 ? 0 : grove > 0.3 ? (hs < 0.65 ? 1 : 2) : (hs < 0.5 ? 2 : 1);
    T.v = Math.floor(h01(gx, gz, SEED + 7) * VARIANTS);
    T.x = x; T.z = z; T.sc = 0.75 + 0.5 * h01(gx, gz, SEED + 8);
    return true;
  }

  // ── Crown cover (the world map shaders read: canopyAt in shaders/atmoMaterial.wgsl.js) ─────
  // Every tree's crown splatted at 4 m over the whole world, once (and again when exclusions
  // change): the forest floor, the understory, the grass under trees and the light under the
  // crowns all follow it.
  const CROWN_R = [3.2, 6.5, 4.2, 1.6, 0], CROWN_A = [0.85, 0.95, 0.6, 0.35, 0]; // pine, oak, birch, shrub, log: radius (m) at scale 1, opacity
  let canopyDirty = true;
  function buildCanopy() {
    const N = CANOPY_N, cs = 8192 / N, a = new Uint8Array(N * N);
    const g0 = Math.floor(-4096 / CELL), g1 = Math.ceil(4096 / CELL);
    for (let gz = g0; gz <= g1; gz++) for (let gx = g0; gx <= g1; gx++) {
      if (!treeAt(gx, gz) || CROWN_A[T.si] === 0) continue;
      const r = CROWN_R[T.si] * T.sc, op = CROWN_A[T.si];
      const i0 = Math.max(0, Math.floor((T.x - r - 2 + 4096) / cs)), i1 = Math.min(N - 1, Math.floor((T.x + r + 2 + 4096) / cs));
      const j0 = Math.max(0, Math.floor((T.z - r - 2 + 4096) / cs)), j1 = Math.min(N - 1, Math.floor((T.z + r + 2 + 4096) / cs));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const dx = (i + 0.5) * cs - 4096 - T.x, dz = (j + 0.5) * cs - 4096 - T.z;
        const k = op * Math.min(1, Math.max(0, (r + 2 - Math.sqrt(dx * dx + dz * dz)) / 4));
        if (k > 0) { const o = j * N + i; a[o] = a[o] + Math.round(k * (255 - a[o])); }
      }
    }
    // A 3×3 blur: crowns merge into a canopy, edges soften.
    const b = new Uint8Array(N * N);
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const o = j * N + i;
      b[o] = (a[o] * 4 + (a[o - 1] + a[o + 1] + a[o - N] + a[o + N]) * 2 + a[o - N - 1] + a[o - N + 1] + a[o + N - 1] + a[o + N + 1]) >> 4;
    }
    atmo.canopyTex.update(b);
    canopyDirty = false;
  }
  function rebuild(cx, cz, fresh, now) {
    for (const s of sets) s.n = 0;
    fading = false; canopySum = 0;
    const c0x = Math.floor((cx - RADIUS) / CELL), c1x = Math.floor((cx + RADIUS) / CELL);
    const c0z = Math.floor((cz - RADIUS) / CELL), c1z = Math.floor((cz + RADIUS) / CELL);
    for (let gz = c0z; gz <= c1z; gz++) for (let gx = c0x; gx <= c1x; gx++) {
      const x = (gx + 0.15 + 0.7 * h01(gx, gz, SEED + 1)) * CELL, z = (gz + 0.15 + 0.7 * h01(gx, gz, SEED + 2)) * CELL;
      const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
      if (d2 > RADIUS * RADIUS) continue;
      if (!treeAt(gx, gz)) continue;
      const si = T.si, v = T.v;
      // Detail and presence by distance (with hysteresis against the last placement). A tree whose
      // state changed since the last placement dissolves across over FADE s (the vertex shader
      // reads the start time and kind from world2), drawn in both sets meanwhile; a tree that keeps
      // its state is drawn plainly. A fresh placement (load, teleport) does not fade.
      const d = Math.sqrt(d2), key = (gx + 32768) * 65536 + (gz + 32768), was = fresh ? 0 : prev.get(key) ?? 0;
      const want = d > LOD_OUT + (was ? HYST : -HYST) ? 0 : d < LOD_NEAR + (was === 1 ? HYST : -HYST) ? 1 : 2;
      if (want) cur.set(key, want);
      if (!want && !was) continue;
      const sc = T.sc, yaw = h01(gx, gz, SEED + 9) * 6.283;
      const w4 = h01(gx, gz, SEED + 10), w5 = h01(gx, gz, SEED + 11), w6 = (h01(gx, gz, SEED + 12) - 0.5) * 2, w7 = (h01(gx, gz, SEED + 13) - 0.5) * 2;
      // Per set: 0 not drawn, else the fade kind (FADE_* in shaders/trees.wgsl.js).
      let kNear = 0, kFar = 0;
      if (was === want || fresh) { if (want === 1) kNear = 1; else if (want === 2) kFar = 1; }
      else {
        fading = true;
        if (was === 1) kNear = want === 2 ? 3 : 5; else if (was === 2) kFar = want === 1 ? 3 : 5;
        if (want === 1) kNear = was === 2 ? 2 : 4; else if (want === 2) kFar = was === 1 ? 2 : 4;
      }
      if (want && si < 3 && d < CANOPY_R) canopySum += 1 - d / CANOPY_R; // trees only (not shrubs, logs)
      for (let lod = 0; lod < 3; lod++) {
        const kind = lod === 0 ? kNear : lod === 1 ? kFar : (want && d < MID_REACH ? 1 : 0);
        if (!kind) continue;
        const set = byKey(si, v, lod);
        if (set.n >= set.max) continue;
        const o = set.n++ * 16, b = set.buf;
        b[o] = T.x; b[o + 1] = T.z; b[o + 2] = sc; b[o + 3] = yaw;
        b[o + 4] = w4; b[o + 5] = w5; b[o + 6] = w6; b[o + 7] = w7;
        b[o + 8] = now; b[o + 9] = kind; b[o + 10] = si === 4 ? 1 : 0; // logs lie on the ground under every vertex
      }
    }
    const t = prev; prev = cur; cur = t; cur.clear();
    // Weighted tree count within CANOPY_R: ~0–5 in the open and at grove edges, 10–22 inside groves.
    const ck = Math.min(1, Math.max(0, (canopySum - 3) / 11));
    canopyTarget = ck * ck * (3 - 2 * ck); api.cover = canopyTarget;
    // Draw only what was placed: an unused slot still ran the whole tree's vertices (×cascades).
    for (const s of sets) {
      for (let k = s.n; k < s.max; k++) s.buf[k * 16 + 2] = 0;
      for (const m of s.meshes) {
        m.thinInstanceBufferUpdated('matrix');
        m.thinInstanceCount = Math.max(1, s.n); // never 0: a mesh with no instances loses its instance attributes (and pipelines)
      }
    }
    engine.snapshotRenderingReset();
  }

  const api = {
    /** Drawn meshes (bark and leaves, near -0 and far -1). */
    meshes: sets.flatMap((s) => s.meshes).filter((m) => !shadowOnly.includes(m)),
    /** Shadow casters: [mesh, minCascade, maxCascade] — cascade 1 from the shadow-only set (cascade 0 receivers read it too), 2–3 from the far trees. */
    casters: sets.flatMap((s) => s.meshes).map((m) => shadowOnly.includes(m) ? [m, 1, 1] : m.name.startsWith('tree-') && m.name.endsWith('-1') ? [m, 2, 3] : null).filter(Boolean), materials: mats,
    /** Owner fields: camera x, z, time, wind strength and direction. */
    camX: 0.5, camZ: 0.5, time: 0.5,
    /** Canopy cover around the camera, 0..1, eased (out: the forest haze). */
    canopy: 0.5 - 0.5,
    /** Canopy cover at the last placement (unsmoothed). */
    cover: 0.5 - 0.5, wind: 1.5 - 0.5, windX: 1.5 - 0.5, windZ: 0.5 - 0.5,
    update() {
      params.x = this.time; params.y = this.wind; params.z = this.windX; params.w = this.windZ;
      const now = (performance.now() - t0) * 0.001;
      for (const l of lodV) l.w = now;
      this.canopy += (canopyTarget - this.canopy) * Math.min(1, (now - lastNow) * 0.7); lastNow = now;
      if (canopyDirty && streamer.overview) { const tc = performance.now(); buildCanopy(); api.canopyMs = performance.now() - tc; }
      const dx = this.camX - lastX, dz = this.camZ - lastZ, m2 = dx * dx + dz * dz;
      if (m2 > REPLACE * REPLACE) {
        lastX = this.camX; lastZ = this.camZ;
        const jump = m2 > JUMP * JUMP;
        rebuild(lastX, lastZ, jump, now);
        if (jump) this.canopy = canopyTarget; // a load or teleport: no easing in from where we were
        cleanAt = fading ? now + FADE + 0.1 : 0;
      } else if (cleanAt && now > cleanAt) {
        // Fades done: place again from the same spot so the faded-out copies stop drawing.
        cleanAt = 0; rebuild(lastX, lastZ, false, now);
      }
    },
    /** Every trunk, stump and log within r of (x, z): cb(x, z, radius, yaw, log length or 0) — the same deterministic
     *  placement the renderer draws (systems/rockSolids.js gives them to the controller). */
    trunksNear(x, z, r, cb) {
      const g0x = Math.floor((x - r) / CELL), g1x = Math.floor((x + r) / CELL), g0z = Math.floor((z - r) / CELL), g1z = Math.floor((z + r) / CELL);
      for (let gz = g0z; gz <= g1z; gz++) for (let gx = g0x; gx <= g1x; gx++) {
        if (!treeAt(gx, gz)) continue;
        const dx = T.x - x, dz = T.z - z;
        if (dx * dx + dz * dz > r * r || T.si === 3) continue; // shrubs are walked through
        const k = T.si * VARIANTS + T.v;
        if (logLen[k] > 0) cb(T.x, T.z, trunkR[k] * T.sc, h01(gx, gz, SEED + 9) * 6.283, logLen[k] * T.sc);
        else cb(T.x, T.z, trunkR[k] * T.sc * 1.1, 0, 0);
      }
    },
    /** Keep out of the water (render/water.js levelAt): re-places the trees and the canopy map. */
    setWater(fn) { waterAt = fn; lastX = 1e9; canopyDirty = true; },
    setExclusions(list) { exclude = list; lastX = 1e9; canopyDirty = true; },
    makeShadowMaterial(name, light, origin) {
      const leaf = name.includes('-leaf-');
      const m = new ShaderMaterial(name, scene, { vertex: 'tree', fragment: leaf ? 'treeShadow' : 'treeBarkShadow' }, {
        attributes: ['position', 'normal', 'uv', 'info'],
        uniforms: ['viewProjection', 'levels', 'treeParams', 'windField', 'treeLod', 'shadowLight', 'shadowOrigin'],
        samplers: leaf ? ['leafAtlas'] : [], storageBuffers: ['levelData'], shaderLanguage: ShaderLanguage.WGSL,
      });
      m.setArray4('levels', clipmap.levels); m.setStorageBuffer('levelData', clipmap.levelData);
      m.setVector4('treeParams', params); m.setArray4('windField', wind.block); m.setVector4('treeLod', lodV[name.includes('treeShadow') ? 2 : 3]); if (leaf) m.setTexture('leafAtlas', atlas);
      m.setVector4('shadowLight', light); m.setVector4('shadowOrigin', origin);
      m.backFaceCulling = !leaf;
      return m;
    },
    freeze() { for (const m of mats) { m.freeze(); fastFrozenIsReady(m); } },
  };
  return api;
}
