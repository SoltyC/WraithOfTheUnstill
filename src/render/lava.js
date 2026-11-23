// The crater's lava lake (shaders/lava.wgsl.js): one disc of rings out to the pit's walls (tools/bake-world/crater.mjs), at
// the lake's level; the walls cut it where they rise through it. Owner fields: x, y (the level), z, time, heat 0..1,
// bursts 0..1, radius, swell (m).

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { lavaLakeVertexWGSL, lavaLakeFragmentWGSL, lavaFlowVertexWGSL, lavaFlowFragmentWGSL, lavaRaftVertexWGSL, lavaRaftFragmentWGSL, lavaSpatterVertexWGSL, lavaSpatterFragmentWGSL } from '../shaders/lava.wgsl.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
const LAVA_FLOW = { lavaFlowVertexWGSL, lavaFlowFragmentWGSL };
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';
import { PIT, craterTarget } from '../world/crater.js';

/** The shore's radius at 32 angles at a level: where the pit's walls (world/crater.js) rise through it. */
export function shoreRadii(level, out = new Array(32)) {
  for (let k = 0; k < 32; k++) {
    const a = (k / 32 - 0.5) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
    let r = 20; while (r < 200 && craterTarget(PIT.x + c * r, PIT.z + sn * r) < level) r += 0.5;
    out[k] = r;
  }
  return out;
}

/** The lake's mesh: a square grid half `R` m across at `step` m — dense enough to carry the lava's own relief (the crust's
 *  pillows and tears, the domes) as real geometry; the pit's walls cut it at the shore. */
export function lakeDisc(R = 92, step = 0.5) {
  const n = Math.round(2 * R / step) + 1, pos = new Float32Array(n * n * 3), idx = new Uint32Array((n - 1) * (n - 1) * 6);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const o = (j * n + i) * 3; pos[o] = -R + i * step; pos[o + 1] = 0; pos[o + 2] = -R + j * step; }
  let o = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i; idx[o++] = a; idx[o++] = a + n; idx[o++] = a + 1; idx[o++] = a + 1; idx[o++] = a + n; idx[o++] = a + n + 1; }
  return { pos, idx };
}

export function createLavaLake(scene, atmo) {
  ShaderStore.ShadersStoreWGSL.lavaLakeVertexShader = lavaLakeVertexWGSL;
  ShaderStore.ShadersStoreWGSL.lavaLakeFragmentShader = lavaLakeFragmentWGSL;
  const { pos, idx } = lakeDisc();
  const mesh = new Mesh('lavaLake', scene);
  const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.applyToMesh(mesh, false);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
  const A = new Vector4(0, 0, 0, 0), B = new Vector4(0.5, 0, 80, 0.3);
  const mat = new ShaderMaterial('lavaLake', scene, { vertex: 'lavaLake', fragment: 'lavaLake' }, {
    attributes: ['position'],
    uniforms: ['viewProjection', 'lavaA', 'lavaB', 'lavaShore', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES],
    storageBuffers: [...ATMO_MATERIAL_BUFFERS, 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo);
  mat.setVector4('lavaA', A); mat.setVector4('lavaB', B);
  const shore = shoreRadii(PIT.floor + 3); let shoreAt = PIT.floor + 3;
  mat.setArray4('lavaShore', shore);
  mat.backFaceCulling = false;
  mesh.material = mat;
  return {
    mesh, material: mat, A, B,
    x: 0, y: 0, z: 0, time: 0, heat: 0.5, bursts: 0, radius: 80, swell: 0.3,
    update() {
      A.set(this.x, this.y, this.z, this.time); B.set(this.heat, this.bursts, this.radius, this.swell);
      mat.setVector4('lavaA', A); mat.setVector4('lavaB', B);
      // (The shore moves out as the lake rises: re-found every half metre.)
      if (Math.abs(this.y - shoreAt) > 0.5) { shoreAt = this.y; shoreRadii(this.y, shore); mat.setArray4('lavaShore', shore); }
    },
    freeze() { mat.freeze(); fastFrozenIsReady(mat); },
  };
}

/** The eruption's flows (shaders/lava.wgsl.js): one ribbon mesh for every flow in data/world/lavaFlows.json. Owner fields:
 *  fronts[4] (m along), holds[4] (0/1 Frost glass), time, eruptT (s since the eruption), cooling 0..1, shown. */
export function lavaRibbons(data) {
  const pos = [], fa = [], fb = [], idx = [], A = data.across;
  data.flows.forEach((f, fi) => {
    let along = 0, prev = null;
    f.pts.forEach((p, k) => {
      if (prev) along += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      const nx = f.pts[Math.min(k + 1, f.pts.length - 1)], pv = f.pts[Math.max(k - 1, 0)];
      let dx = nx[0] - pv[0], dz = nx[1] - pv[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const row = pos.length / 3;
      for (let j = 0; j < A; j++) {
        const u = (j / (A - 1)) * 2 - 1, hw = p[3];
        pos.push(p[0] - dz * u * hw, p[5][j], p[1] + dx * u * hw);
        fa.push(along, u, fi, p[4]); fb.push(dx, dz, hw, 0);
      }
      if (k > 0) for (let j = 0; j < A - 1; j++) { const a = row - A + j, b = row + j; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      prev = p;
    });
  });
  return { pos, fa, fb, idx };
}

export function createLavaFlows(scene, atmo, data) {
  const { lavaFlowVertexWGSL, lavaFlowFragmentWGSL } = LAVA_FLOW;
  ShaderStore.ShadersStoreWGSL.lavaFlowVertexShader = lavaFlowVertexWGSL;
  ShaderStore.ShadersStoreWGSL.lavaFlowFragmentShader = lavaFlowFragmentWGSL;
  const { pos, fa, fb, idx } = lavaRibbons(data);
  const mesh = new Mesh('lavaFlows', scene);
  const vd = new VertexData(); vd.positions = new Float32Array(pos); vd.indices = new Uint32Array(idx); vd.applyToMesh(mesh, false);
  mesh.setVerticesData('flowA', new Float32Array(fa), false, 4); mesh.setVerticesData('flowB', new Float32Array(fb), false, 4);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
  const F = new Vector4(0, 0, 0, 0), T = new Vector4(0, 0, 0, 0), Hd = new Vector4(0, 0, 0, 0);
  const mat = new ShaderMaterial('lavaFlows', scene, { vertex: 'lavaFlow', fragment: 'lavaFlow' }, {
    attributes: ['position', 'flowA', 'flowB'],
    uniforms: ['viewProjection', 'flowFront', 'flowT', 'flowHold', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES],
    storageBuffers: [...ATMO_MATERIAL_BUFFERS, 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo);
  mat.setVector4('flowFront', F); mat.setVector4('flowT', T); mat.setVector4('flowHold', Hd);
  mat.backFaceCulling = false;
  mesh.material = mat;
  return {
    mesh, material: mat, fronts: [0, 0, 0, 0], holds: [0, 0, 0, 0], time: 0, eruptT: 0, cooling: 0, shown: 0,
    update() {
      F.set(...this.fronts); Hd.set(...this.holds); T.set(this.time, this.eruptT, this.cooling, this.shown);
      mat.setVector4('flowFront', F); mat.setVector4('flowT', T); mat.setVector4('flowHold', Hd);
    },
    freeze() { mat.freeze(); fastFrozenIsReady(mat); },
  };
}

/** The rafts' geometry (deterministic): N slabs of crust, irregular outlines (two scales of jitter round the rim), 2–9 m
 *  across, a span thick, their tops a little domed; position = metres in the raft's own frame (y 0 at the waterline). */
export function raftGeometry(N = 44) {
  const pos = [], att = [], idx = [];
  const h = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
  for (let k = 0; k < N; k++) {
    const M = 12, r0 = 1.0 + 3.6 * Math.pow(h(k, 1), 1.5), th = 0.3 + 0.35 * h(k, 2), seed = h(k, 3);
    const rim = [];
    for (let m = 0; m < M; m++) { const a = m / M * Math.PI * 2, r = r0 * (0.7 + 0.45 * h(k * 13 + m, 4)) * (1 + 0.12 * Math.sin(a * 3 + k)); rim.push([Math.cos(a) * r, Math.sin(a) * r]); }
    const top = th * 0.45, bot = -th * 0.55;
    const v = (x, y, z, side, edge) => { pos.push(x, y, z); att.push(k, side, edge, seed); return pos.length / 3 - 1; };
    // Top: a fan from a slightly raised middle, through a ring halfway out (the pillowing).
    const c = v(0, top + 0.12 * r0 * 0.2, 0, 0, 0);
    const mid = rim.map(([x, z]) => v(x * 0.55, top + 0.05, z * 0.55, 0, 0.5));
    const edge = rim.map(([x, z]) => v(x, top - 0.04, z, 0, 1));
    for (let m = 0; m < M; m++) { const n = (m + 1) % M; idx.push(c, mid[n], mid[m], mid[m], mid[n], edge[n], mid[m], edge[n], edge[m]); }
    // Sides: the broken edge, straight down to the underside (each face its own vertices: flat shaded).
    for (let m = 0; m < M; m++) {
      const n = (m + 1) % M, [ax, az] = rim[m], [bx, bz] = rim[n];
      const a0 = v(ax, top - 0.04, az, 1, 1), b0 = v(bx, top - 0.04, bz, 1, 1), a1 = v(ax * 0.92, bot, az * 0.92, 1, 1), b1 = v(bx * 0.92, bot, bz * 0.92, 1, 1);
      idx.push(a0, b0, a1, a1, b0, b1);
    }
    // Underside (in the melt).
    const cb = v(0, bot - 0.05, 0, 1, 0), ub = rim.map(([x, z]) => v(x * 0.92, bot, z * 0.92, 1, 1));
    for (let m = 0; m < M; m++) idx.push(cb, ub[m], ub[(m + 1) % M]);
  }
  return { pos: new Float32Array(pos), att: new Float32Array(att), idx: new Uint32Array(idx) };
}

/** The lake's rafts and spatter, sharing the lake's uniforms (its centre, level, time, heat, bursts). */
export function createLakeExtras(scene, atmo, lake) {
  const S = ShaderStore.ShadersStoreWGSL;
  S.lavaRaftVertexShader = lavaRaftVertexWGSL; S.lavaRaftFragmentShader = lavaRaftFragmentWGSL;
  S.lavaSpatterVertexShader = lavaSpatterVertexWGSL; S.lavaSpatterFragmentShader = lavaSpatterFragmentWGSL;
  // Rafts.
  const g = raftGeometry();
  const rafts = new Mesh('lavaRafts', scene);
  const vd = new VertexData(); vd.positions = g.pos; vd.indices = g.idx; vd.applyToMesh(rafts, false);
  rafts.setVerticesData('raftA', g.att, false, 4);
  rafts.alwaysSelectAsActiveMesh = true; rafts.doNotSyncBoundingInfo = true; rafts.freezeWorldMatrix();
  const rm = new ShaderMaterial('lavaRafts', scene, { vertex: 'lavaRaft', fragment: 'lavaRaft' }, {
    attributes: ['position', 'raftA'], uniforms: ['viewProjection', 'lavaA', 'lavaB', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES], storageBuffers: [...ATMO_MATERIAL_BUFFERS, 'shadowData'], shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(rm); bindAtmosphere(rm, atmo);
  rm.setVector4('lavaA', lake.A); rm.setVector4('lavaB', lake.B); rm.backFaceCulling = false;
  rafts.material = rm;
  // Spatter.
  const n = 320, sp = new Float32Array(n * 12), si = new Uint32Array(n * 6), cx = [-1, 1, 1, -1], cy = [-1, -1, 1, 1];
  for (let i = 0; i < n; i++) { for (let k = 0; k < 4; k++) { const o = (i * 4 + k) * 3; sp[o] = i; sp[o + 1] = cx[k]; sp[o + 2] = cy[k]; } const v = i * 4, o = i * 6; si.set([v, v + 1, v + 2, v, v + 2, v + 3], o); }
  const spatter = new Mesh('lavaSpatter', scene);
  const sd = new VertexData(); sd.positions = sp; sd.indices = si; sd.applyToMesh(spatter, false);
  spatter.alwaysSelectAsActiveMesh = true; spatter.doNotSyncBoundingInfo = true; spatter.freezeWorldMatrix();
  const smat = new ShaderMaterial('lavaSpatter', scene, { vertex: 'lavaSpatter', fragment: 'lavaSpatter' }, {
    attributes: ['position'], uniforms: ['viewProjection', 'lavaA', 'lavaB', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES], storageBuffers: [...ATMO_MATERIAL_BUFFERS], shaderLanguage: ShaderLanguage.WGSL, needAlphaBlending: true,
  });
  bindEnvironment(smat); bindAtmosphere(smat, atmo);
  smat.setVector4('lavaA', lake.A); smat.setVector4('lavaB', lake.B);
  smat.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF; smat.disableDepthWrite = true; smat.backFaceCulling = false;
  spatter.material = smat;
  return { rafts, spatter, raftMaterial: rm, spatterMaterial: smat,
    setEnabled(on) { rafts.setEnabled(on); spatter.setEnabled(on); },
    freeze() { rm.freeze(); fastFrozenIsReady(rm); smat.freeze(); fastFrozenIsReady(smat); } };
}
