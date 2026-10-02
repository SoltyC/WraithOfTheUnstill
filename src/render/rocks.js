// Rock outcrops (BRIEF §5.1, §6.1): deterministic placement on camera-centred grids (small
// boulders every few metres in clustered fields, sparse half-buried outcrops), drawn as one
// thin-instanced displaced icosphere (shaders/rocks.wgsl.js). The instance count is fixed so the
// snapshot-rendered draw never needs re-recording: unused slots have size 0 and are discarded in
// the vertex shader. Placement is rebuilt only when the camera crosses a grid cell, into a
// preallocated buffer (no garbage). Rocks cast shadows into every cascade.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { rocksVertexWGSL, rocksFragmentWGSL } from '../shaders/rocks.wgsl.js';
import { hashU32, valueNoise } from '../terrain/noise.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

const MAX = 2400;
const BOULDER_CELL = 8, BOULDER_R = 52;    // cells: ±52 → 840 m square
const OUTCROP_CELL = 48, OUTCROP_R = 12;   // ±12 → 1.2 km square
const SEED = 0x726f;

/** Unit icosphere subdivided `level` times (shared vertices, smooth). */
function icosphere(level) {
  const t = (1 + Math.sqrt(5)) / 2;
  let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const norm = (p) => { const l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; };
  v = v.map(norm);
  for (let s = 0; s < level; s++) {
    const cache = new Map(), nf = [];
    const mid = (a, b) => {
      const k = a < b ? a + ',' + b : b + ',' + a;
      if (!cache.has(k)) { cache.set(k, v.length); v.push(norm([(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2])); }
      return cache.get(k);
    };
    for (const [a, b, c] of f) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    f = nf;
  }
  return { positions: new Float32Array(v.flat()), indices: new Uint32Array(f.flat()) };
}

const h01 = (x, z, s) => hashU32((Math.imul(x, 0x27d4eb2d) ^ hashU32(Math.imul(z, 0x165667b1) ^ s)) >>> 0) / 4294967296;

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {any} clipmap
 * @param {any} atmo
 */
export function createRocks(scene, clipmap, atmo) {
  ShaderStore.ShadersStoreWGSL.rocksVertexShader = rocksVertexWGSL;
  ShaderStore.ShadersStoreWGSL.rocksFragmentShader = rocksFragmentWGSL;
  const ico = icosphere(3);
  const mesh = new Mesh('rocks', scene);
  const vd = new VertexData(); vd.positions = ico.positions; vd.indices = ico.indices; vd.applyToMesh(mesh, false);
  const buf = new Float32Array(MAX * 16);
  mesh.thinInstanceSetBuffer('matrix', buf, 16, false);
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.doNotSyncBoundingInfo = true;

  const common = {
    attributes: ['position'],
    storageBuffers: ['levelData', 'biomeA'],
    shaderLanguage: ShaderLanguage.WGSL,
  };
  const bindVertex = (m) => {
    m.setArray4('levels', clipmap.levels);
    m.setStorageBuffer('levelData', clipmap.levelData);
    m.setStorageBuffer('biomeA', clipmap.buffers.biomeA);
  };
  const mat = new ShaderMaterial('rocks', scene, { vertex: 'rocks', fragment: 'rocks' }, {
    ...common,
    uniforms: ['viewProjection', 'levels', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES],
    storageBuffers: ['levelData', 'biomeA', ...ATMO_MATERIAL_BUFFERS, 'shadowData'],
  });
  bindEnvironment(mat);
  bindAtmosphere(mat, atmo);
  bindVertex(mat);
  mesh.material = mat;

  let cellX = NaN, cellZ = NaN;
  function put(n, x, z, size, yaw, seed, aspect, burial, kind) {
    const o = n * 16;
    buf[o] = x; buf[o + 1] = z; buf[o + 2] = size; buf[o + 3] = yaw;
    buf[o + 4] = seed; buf[o + 5] = aspect; buf[o + 6] = burial; buf[o + 7] = kind;
  }
  function rebuild(cx, cz) {
    let n = 0;
    // Outcrops: large, half buried, sparse.
    const ox = Math.floor(cx * BOULDER_CELL / OUTCROP_CELL), oz = Math.floor(cz * BOULDER_CELL / OUTCROP_CELL);
    for (let j = -OUTCROP_R; j <= OUTCROP_R && n < MAX; j++) for (let i = -OUTCROP_R; i <= OUTCROP_R && n < MAX; i++) {
      const gx = ox + i, gz = oz + j;
      if (h01(gx, gz, SEED + 1) > 0.16) continue;
      const x = (gx + 0.15 + 0.7 * h01(gx, gz, SEED + 2)) * OUTCROP_CELL, z = (gz + 0.15 + 0.7 * h01(gx, gz, SEED + 3)) * OUTCROP_CELL;
      const s = 3.5 + 8 * Math.pow(h01(gx, gz, SEED + 4), 2);
      put(n++, x, z, s, h01(gx, gz, SEED + 5) * 6.283, h01(gx, gz, SEED + 6) * 97, 0.3 + 0.5 * h01(gx, gz, SEED + 7), 0.35 + 0.25 * h01(gx, gz, SEED + 8), 1);
    }
    // Boulders: clustered fields (a low-frequency density), a power law of sizes.
    for (let j = -BOULDER_R; j <= BOULDER_R && n < MAX; j++) for (let i = -BOULDER_R; i <= BOULDER_R && n < MAX; i++) {
      const gx = cx + i, gz = cz + j;
      const dens = 0.02 + 0.22 * Math.max(0, valueNoise(gx / 22, gz / 22, SEED + 9) * 0.5 + 0.5 - 0.35) / 0.65;
      if (h01(gx, gz, SEED + 10) > dens) continue;
      const x = (gx + h01(gx, gz, SEED + 11)) * BOULDER_CELL, z = (gz + h01(gx, gz, SEED + 12)) * BOULDER_CELL;
      const s = 0.45 + 2.4 * Math.pow(h01(gx, gz, SEED + 13), 2);
      put(n++, x, z, s, h01(gx, gz, SEED + 14) * 6.283, h01(gx, gz, SEED + 15) * 97, 0.4 + 0.6 * h01(gx, gz, SEED + 16), 0.2 + 0.25 * h01(gx, gz, SEED + 17), 0);
    }
    for (let k = n; k < MAX; k++) buf[k * 16 + 2] = 0; // unused slots: size 0 (discarded)
    mesh.thinInstanceBufferUpdated('matrix');
    return n;
  }

  return {
    mesh, material: mat, count: 0,
    /** Builds a depth material for a shadow cascade (same vertex shader). */
    makeShadowMaterial(name, light, origin) {
      const m = new ShaderMaterial(name, scene, { vertex: 'rocks', fragment: 'shadowDepth' }, {
        ...common, uniforms: ['viewProjection', 'levels', 'shadowLight', 'shadowOrigin'],
      });
      bindVertex(m);
      m.setVector4('shadowLight', light); m.setVector4('shadowOrigin', origin);
      return m;
    },
    /** Owner fields: camera x, z; set before update(). */
    camX: 0.5, camZ: 0.5,
    update() {
      const cx = Math.floor(this.camX / BOULDER_CELL), cz = Math.floor(this.camZ / BOULDER_CELL);
      if (cx === cellX && cz === cellZ) return;
      cellX = cx; cellZ = cz;
      this.count = rebuild(cx, cz);
    },
    freeze() { mat.freeze(); fastFrozenIsReady(mat); },
  };
}
