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
import { rocksVertexWGSL, rocksShadowVertexWGSL, rocksFragmentWGSL } from '../shaders/rocks.wgsl.js';
import { STATE_SAMPLE_BUFFERS } from '../shaders/terrainState.wgsl.js';
import { hashU32, valueNoise } from '../terrain/noise.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';
import { MAT_SAMPLERS, bindMaterialLibrary } from '../materials/library.js';

const MAX_NEAR = 700, MAX_FAR = 1700, MAX_BIG = 160;
const BIG_R = 420; // m: outcrops nearer than this use the dense (2562-vertex) mesh
const NEAR_R = 140; // m: closer rocks use the 642-vertex mesh, farther the 162-vertex one
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
  // Wound for Babylon's front faces (clockwise seen from outside): the counter-clockwise order
  // above had every outward face culled, so each rock showed the inside of its far half.
  return { positions: new Float32Array(v.flat()), indices: new Uint32Array(f.flatMap(([a, b, c]) => [a, c, b])) };
}

const h01 = (x, z, s) => hashU32((Math.imul(x, 0x27d4eb2d) ^ hashU32(Math.imul(z, 0x165667b1) ^ s)) >>> 0) / 4294967296;

/** One rock's placement (the same on the GPU path and the CPU collision path). */
const R = { x: 0.5, z: 0.5, size: 0.5, yaw: 0.5, seed: 0.5, aspect: 0.5, burial: 0.5, kind: 0 };
/** Outcrop in cell (gx, gz) into R, or false. */
function outcropAt(gx, gz) {
  if (h01(gx, gz, SEED + 1) > 0.24) return false;
  R.x = (gx + 0.15 + 0.7 * h01(gx, gz, SEED + 2)) * OUTCROP_CELL; R.z = (gz + 0.15 + 0.7 * h01(gx, gz, SEED + 3)) * OUTCROP_CELL;
  R.size = 3.5 + 8 * Math.pow(h01(gx, gz, SEED + 4), 2); R.yaw = h01(gx, gz, SEED + 5) * 6.283; R.seed = h01(gx, gz, SEED + 6) * 97;
  R.aspect = 0.3 + 0.5 * h01(gx, gz, SEED + 7); R.burial = 0.35 + 0.25 * h01(gx, gz, SEED + 8); R.kind = 1;
  return true;
}
/** Boulder in cell (gx, gz) into R, or false. */
function boulderAt(gx, gz) {
  const dens = 0.04 + 0.34 * Math.max(0, valueNoise(gx / 22, gz / 22, SEED + 9) * 0.5 + 0.5 - 0.3) / 0.7;
  if (h01(gx, gz, SEED + 10) > dens) return false;
  R.x = (gx + h01(gx, gz, SEED + 11)) * BOULDER_CELL; R.z = (gz + h01(gx, gz, SEED + 12)) * BOULDER_CELL;
  R.size = 0.45 + 2.4 * Math.pow(h01(gx, gz, SEED + 13), 2); R.yaw = h01(gx, gz, SEED + 14) * 6.283; R.seed = h01(gx, gz, SEED + 15) * 97;
  R.aspect = 0.4 + 0.6 * h01(gx, gz, SEED + 16); R.burial = 0.2 + 0.25 * h01(gx, gz, SEED + 17); R.kind = 0;
  return true;
}
const fract = (v) => v - Math.floor(v);
/**
 * Rocks for collision (CPU): every rock whose centre lies within `radius` of (px, pz), outside the
 * exclusions, called back with the shape the vertex shader gives it — an ellipse of half-extents
 * (rx, rz) in its yawed frame, and its height above the ground it is seated on (`up`, after burial).
 */
let qx = 0, qz = 0, qr = 0, qex = [], qcb = null;
function nearOk() {
  for (let k = 0; k < qex.length; k++) { const e = qex[k], ex = R.x - e[0], ez = R.z - e[1], r = e[2] + R.size; if (ex * ex + ez * ez < r * r) return false; }
  const dx = R.x - qx, dz = R.z - qz, r = qr + R.size * 1.5;
  return dx * dx + dz * dz < r * r;
}
function nearEmit() {
  // shaders/rocks.wgsl.js: aspect = (1 + 0.35 fract(seed·3.1), 0.55 + 0.35 a, 1 − 0.2 fract(seed·5.3)), mean radius ≈ 0.9 of size
  const ax = 1 + 0.35 * fract(R.seed * 3.1), ay = 0.55 + 0.35 * R.aspect, az = 1 - 0.2 * fract(R.seed * 5.3);
  qcb(R.x, R.z, R.yaw, R.size * 0.88 * ax, R.size * 0.88 * az, R.size * ay * (0.95 - R.burial), R.size);
}
export function rocksNear(px, pz, radius, exclude, cb) {
  qx = px; qz = pz; qr = radius; qex = exclude; qcb = cb;
  const ox0 = Math.floor((px - radius - 12) / OUTCROP_CELL), ox1 = Math.floor((px + radius + 12) / OUTCROP_CELL);
  const oz0 = Math.floor((pz - radius - 12) / OUTCROP_CELL), oz1 = Math.floor((pz + radius + 12) / OUTCROP_CELL);
  for (let gz = oz0; gz <= oz1; gz++) for (let gx = ox0; gx <= ox1; gx++) if (outcropAt(gx, gz) && nearOk()) nearEmit();
  const bx0 = Math.floor((px - radius - 3) / BOULDER_CELL), bx1 = Math.floor((px + radius + 3) / BOULDER_CELL);
  const bz0 = Math.floor((pz - radius - 3) / BOULDER_CELL), bz1 = Math.floor((pz + radius + 3) / BOULDER_CELL);
  for (let gz = bz0; gz <= bz1; gz++) for (let gx = bx0; gx <= bx1; gx++) if (boulderAt(gx, gz) && nearOk()) nearEmit();
  qcb = null;
}

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {any} clipmap
 * @param {any} atmo
 */
export function createRocks(scene, clipmap, atmo, matLib) {
  ShaderStore.ShadersStoreWGSL.rocksVertexShader = rocksVertexWGSL;
  ShaderStore.ShadersStoreWGSL.rocksShadowVertexShader = rocksShadowVertexWGSL;
  ShaderStore.ShadersStoreWGSL.rocksFragmentShader = rocksFragmentWGSL;
  const makeMesh = (name, level, max) => {
    const ico = icosphere(level);
    const m = new Mesh(name, scene);
    const vd = new VertexData(); vd.positions = ico.positions; vd.indices = ico.indices; vd.applyToMesh(m, false);
    const b = new Float32Array(max * 16);
    m.thinInstanceSetBuffer('matrix', b, 16, false);
    m.alwaysSelectAsActiveMesh = true;
    m.doNotSyncBoundingInfo = true;
    return { mesh: m, buf: b, max, n: 0 };
  };
  const near = makeMesh('rocksNear', 3, MAX_NEAR), far = makeMesh('rocksFar', 2, MAX_FAR), big = makeMesh('rocksBig', 4, MAX_BIG);

  const common = {
    attributes: ['position'],
    storageBuffers: ['levelData', 'biomeA', ...STATE_SAMPLE_BUFFERS],
    shaderLanguage: ShaderLanguage.WGSL,
  };
  /** Every material using the rock vertex shader (it reads the terrain state). */
  const vertexMats = [];
  const bindVertex = (m) => {
    m.setArray4('levels', clipmap.levels);
    m.setStorageBuffer('levelData', clipmap.levelData);
    m.setStorageBuffer('biomeA', clipmap.buffers.biomeA);
  };
  const mat = new ShaderMaterial('rocks', scene, { vertex: 'rocks', fragment: 'rocks' }, {
    ...common,
    uniforms: ['viewProjection', 'levels', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES, ...MAT_SAMPLERS],
    storageBuffers: ['levelData', 'biomeA', ...STATE_SAMPLE_BUFFERS, ...ATMO_MATERIAL_BUFFERS, 'shadowData'],
  });
  vertexMats.push(mat);
  bindEnvironment(mat);
  bindAtmosphere(mat, atmo);
  bindMaterialLibrary(mat, matLib);
  bindVertex(mat);
  near.mesh.material = mat; far.mesh.material = mat; big.mesh.material = mat;

  let stateBound = null;
  function bindStateTo(m, ts) { m.setStorageBuffer('stateFine0', ts.fine[0]); m.setStorageBuffer('stateAtlas0', ts.atlas[0]); m.setStorageBuffer('stateParams', ts.params); }
  let cellX = NaN, cellZ = NaN;
  let camCX = 0, camCZ = 0;
  /** Places kept clear of rocks (built sites): [x, z, radius] each. */
  let exclude = [];
  function put(n, x, z, size, yaw, seed, aspect, burial, kind) {
    for (let k = 0; k < exclude.length; k++) {
      const e = exclude[k], ex = x - e[0], ez = z - e[1], r = e[2] + size;
      if (ex * ex + ez * ez < r * r) return;
    }
    // Near or far mesh by distance from the camera cell (n counts all rocks, unused here).
    const dx = x - camCX, dz = z - camCZ;
    const d2 = dx * dx + dz * dz;
    const t = kind === 1 && d2 < BIG_R * BIG_R && big.n < big.max ? big : d2 < NEAR_R * NEAR_R && near.n < near.max ? near : far;
    if (t.n >= t.max) return;
    const buf = t.buf, o = t.n++ * 16;
    buf[o] = x; buf[o + 1] = z; buf[o + 2] = size; buf[o + 3] = yaw;
    buf[o + 4] = seed; buf[o + 5] = aspect; buf[o + 6] = burial; buf[o + 7] = kind;
  }
  function rebuild(cx, cz) {
    let n = 0;
    near.n = 0; far.n = 0; big.n = 0;
    camCX = (cx + 0.5) * BOULDER_CELL; camCZ = (cz + 0.5) * BOULDER_CELL;
    // Outcrops: large, half buried, sparse.
    const ox = Math.floor(cx * BOULDER_CELL / OUTCROP_CELL), oz = Math.floor(cz * BOULDER_CELL / OUTCROP_CELL);
    for (let j = -OUTCROP_R; j <= OUTCROP_R; j++) for (let i = -OUTCROP_R; i <= OUTCROP_R; i++) {
      if (outcropAt(ox + i, oz + j)) put(n++, R.x, R.z, R.size, R.yaw, R.seed, R.aspect, R.burial, 1);
    }
    // Boulders: clustered fields (a low-frequency density), a power law of sizes.
    for (let j = -BOULDER_R; j <= BOULDER_R; j++) for (let i = -BOULDER_R; i <= BOULDER_R; i++) {
      if (boulderAt(cx + i, cz + j)) put(n++, R.x, R.z, R.size, R.yaw, R.seed, R.aspect, R.burial, 0);
    }
    // Unused slots: size 0 (discarded in the vertex shader; the draw count never changes).
    for (const t of [near, far, big]) {
      for (let k = t.n; k < t.max; k++) t.buf[k * 16 + 2] = 0;
      t.mesh.thinInstanceBufferUpdated('matrix');
    }
    return near.n + far.n + big.n;
  }

  return {
    meshes: [near.mesh, far.mesh, big.mesh], material: mat, count: 0,
    /** Builds a depth material for a shadow cascade (vertex shader without normals). */
    makeShadowMaterial(name, light, origin) {
      const m = new ShaderMaterial(name, scene, { vertex: 'rocksShadow', fragment: 'shadowDepth' }, {
        ...common, uniforms: ['viewProjection', 'levels', 'shadowLight', 'shadowOrigin'],
      });
      bindVertex(m);
      m.setVector4('shadowLight', light); m.setVector4('shadowOrigin', origin);
      vertexMats.push(m);
      if (stateBound) bindStateTo(m, stateBound);
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
    /** Keep rocks out of these circles ([x, z, r]: the camp, the monastery, shrines…). */
    setExclusions(list) { exclude = list; cellX = NaN; },
    /** The exclusions (the CPU collision path keeps the same clear circles). */
    get exclusions() { return exclude; },
    /** The terrain state the rocks sit on (deformed snow); shadow casters made later bind it too. */
    bindState(ts) { stateBound = ts; for (const m of vertexMats) bindStateTo(m, ts); },
  };
}
