// A building's pieces (world/fracture.js) as they fall and as they lie (game/collapse.js moves them): one mesh per
// collapsed site, drawn with the architecture's own material code (shaders/architecture.wgsl.js archDebrisVertexWGSL +
// the architecture's fragment shader, its site block, lights and material library), so stone is the same stone, plaster
// the same plaster and the char the same char as the building it was. Each fragment's transform: debrisXf (storage).

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { archDebrisVertexWGSL, archFragmentWGSL } from '../shaders/architecture.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { MAT_SAMPLERS, bindMaterialLibrary } from '../materials/library.js';

/**
 * @param {any} debris  world/fracture.js buildDebris()
 * @param {any} arch  render/architecture.js view (its site block, params, material library)
 * @param {{ clipmap: any, shadows: any, bindShadows: Function, matLib: any }} ctx
 */
export function createDebrisView(scene, atmo, debris, arch, ctx, name) {
  const S = ShaderStore.ShadersStoreWGSL;
  S.archDebrisVertexShader = archDebrisVertexWGSL; S.archFragmentShader ??= archFragmentWGSL;
  const engine = scene.getEngine();
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = debris.positions; vd.normals = debris.normals; vd.uvs = debris.uvs; vd.indices = debris.indices;
  vd.applyToMesh(mesh, false);
  mesh.setVerticesData('info', debris.info, false, 4);
  mesh.setVerticesData('frag', debris.frag, false, 4);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
  const n = debris.frags.length, xf = new Float32Array(n * 8);
  const buf = new StorageBuffer(engine, xf.byteLength, undefined, name + '-xf');
  const mat = new ShaderMaterial(name, scene, { vertex: 'archDebris', fragment: 'arch' }, {
    attributes: ['position', 'normal', 'uv', 'info', 'frag'],
    uniforms: ['viewProjection', 'archParams', 'spellLights', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES, ...MAT_SAMPLERS],
    storageBuffers: [...ATMO_MATERIAL_BUFFERS, 'shadowData', 'lightGrid', 'debrisXf'],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo); bindMaterialLibrary(mat, ctx.matLib);
  mat.setUniformBuffer('archSites', arch.siteBlock); mat.setVector4('archParams', arch.params);
  mat.setArray4('spellLights', ctx.clipmap.spellLights); mat.setStorageBuffer('lightGrid', ctx.clipmap.lightGrid);
  mat.setStorageBuffer('debrisXf', buf);
  ctx.bindShadows(mat, ctx.shadows);
  mat.backFaceCulling = false;
  mesh.material = mat;
  const shadowMats = new Map();
  const makeShadowMaterial = (sname, light, origin) => {
    if (shadowMats.has(light)) return shadowMats.get(light);
    const m = new ShaderMaterial(sname, scene, { vertex: 'archDebris', fragment: 'shadowDepth' }, {
      attributes: ['position', 'normal', 'uv', 'info', 'frag'], uniforms: ['viewProjection', 'shadowLight', 'shadowOrigin'],
      storageBuffers: ['debrisXf'], shaderLanguage: ShaderLanguage.WGSL,
    });
    m.setStorageBuffer('debrisXf', buf); m.setVector4('shadowLight', light); m.setVector4('shadowOrigin', origin);
    m.backFaceCulling = false;
    shadowMats.set(light, m);
    return m;
  };
  ctx.shadows.addCaster(mesh, makeShadowMaterial, 1);
  return {
    mesh, material: mat, xf,
    /** Upload the fragments' transforms (game/collapse.js layout: position xyz + spare, quaternion xyzw). */
    upload(src) { if (src) xf.set(src); buf.update(xf); },
    dispose() { ctx.shadows.removeCaster?.(mesh); mesh.dispose(); mat.dispose(); buf.dispose(); },
  };
}

/**
 * The heap's own body: under and between the fallen blocks, a mound of small stone, grit and mortar where the collapse
 * piled up (game/collapse.js heap(): how high the rubble stands over the ground, per cell). Smoothed, sunk under the
 * blocks' tops (they lie on it, half buried), broken by a jitter of stones, skirted down into the ground at its edge.
 * Returns debris-shaped geometry (one fragment at `origin`) for createDebrisView.
 */
export function rubbleMound(heap, grid, origin, site, mat, seed = 1) {
  const { h, n, cell, x0, z0 } = heap;
  const gAt = (x, z) => {
    const u = Math.max(0, Math.min(grid.n - 1.001, (x - grid.x0) / grid.cell)), v = Math.max(0, Math.min(grid.n - 1.001, (z - grid.z0) / grid.cell));
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, H = grid.h, N = grid.n;
    return (H[j * N + i] * (1 - fu) + H[j * N + i + 1] * fu) * (1 - fv) + (H[(j + 1) * N + i] * (1 - fu) + H[(j + 1) * N + i + 1] * fu) * fv;
  };
  const hh = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453; return x - Math.floor(x); };
  // Smoothed (two passes of 3×3), so the mound slopes rather than steps.
  let s = h;
  for (let pass = 0; pass < 2; pass++) {
    const o = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let a = 0, w = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue; const k = (di || dj) ? 1 : 2; a += s[jj * n + ii] * k; w += k; }
      o[j * n + i] = a / w;
    }
    s = o;
  }
  const on = (i, j) => i >= 0 && j >= 0 && i < n && j < n && s[j * n + i] > 0.14;
  const vid = new Int32Array((n + 1) * (n + 1)).fill(-1);
  const pos = [], nrm = [], uv = [], info = [], frag = [], idx = [];
  const Y = (i, j) => {
    // A corner of cells: the mean of the cells round it; sunk to 70 %, a stone's jitter.
    let a = 0, c = 0, any = false;
    for (const [di, dj] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < n && jj < n) { a += s[jj * n + ii]; c++; if (on(ii, jj)) any = true; } }
    const x = x0 + i * cell, z = z0 + j * cell, m = c ? a / c : 0;
    const y = gAt(x, z) + (any ? 0.72 * m + Math.min(0.22, m * 0.3) * (hh(i, j) - 0.35) : -0.1);
    return [x, y, z];
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (!on(i, j) && !on(i - 1, j) && !on(i + 1, j) && !on(i, j - 1) && !on(i, j + 1)) continue;
    const q = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, b]) => {
      const k = b * (n + 1) + a;
      if (vid[k] < 0) {
        const p = Y(a, b), e = cell, px = Y(a + 1, b), mx = Y(a - 1, b), pz = Y(a, b + 1), mz = Y(a, b - 1);
        const gx = (px[1] - mx[1]) / (2 * e), gz = (pz[1] - mz[1]) / (2 * e), l = Math.hypot(gx, 1, gz);
        vid[k] = pos.length / 3;
        pos.push(p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]); nrm.push(-gx / l, 1 / l, -gz / l); uv.push(p[0], p[2]);
        info.push(site, 16, seed, 0); frag.push(0, p[1] - origin[1], 0, 0);
      }
      return vid[k];
    });
    idx.push(q[0], q[2], q[1], q[0], q[3], q[2]);
  }
  // Stones on it: broken pieces of the walls, a few a cell where it is deep, lying every way, half sunk.
  const stone = (cx, cy, cz, a, b, c, yaw, tilt, sd) => {
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
    const R = (x, y, z) => { const y2 = y * ct - z * st, z2 = y * st + z * ct; return [cx + x * cyw + z2 * syw, cy + y2, cz - x * syw + z2 * cyw]; };
    const F = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]];
    const H = [a, b, c];
    for (const [nn, uu, vv] of F) {
      const base = pos.length / 3, o = nn.map((v, k) => v * H[k]);
      const nw = R(nn[0], nn[1], nn[2]), n0 = R(0, 0, 0), N = [nw[0] - n0[0], nw[1] - n0[1], nw[2] - n0[2]];
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const lp = [o[0] + uu[0] * su * H[0] + vv[0] * sv * H[0], o[1] + uu[1] * su * H[1] + vv[1] * sv * H[1], o[2] + uu[2] * su * H[2] + vv[2] * sv * H[2]];
        const w = R(lp[0], lp[1], lp[2]);
        pos.push(w[0] - origin[0], w[1] - origin[1], w[2] - origin[2]); nrm.push(...N); uv.push(su * 0.3 + sd, sv * 0.3); info.push(site, mat, sd, 0); frag.push(0, w[1] - origin[1], 0, 0);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  };
  let stones = 0;
  for (let j = 0; j < n && stones < 1600; j++) for (let i = 0; i < n; i++) {
    const d = s[j * n + i]; if (d < 0.2) continue;
    const k = Math.floor(hh(i * 3, j) * (1 + Math.min(3, d * 2.5)));
    for (let q = 0; q < k; q++) {
      const x = x0 + (i + hh(i, j * 7 + q)) * cell, z = z0 + (j + hh(i * 5 + q, j)) * cell, sz = 0.1 + 0.3 * Math.pow(hh(i + q * 13, j * 3), 2);
      const y = gAt(x, z) + 0.72 * d;
      stone(x, y + sz * 0.2, z, sz * (0.8 + 0.6 * hh(q, i)), sz * (0.5 + 0.5 * hh(j, q)), sz * (0.7 + 0.6 * hh(i, q * 5)), hh(i, j + q) * 6.28, (hh(j, i + q) - 0.5) * 1.6, 100 + q);
      stones++;
    }
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), uvs: new Float32Array(uv), info: new Float32Array(info), frag: new Float32Array(frag), indices: new Uint32Array(idx),
    frags: [{ pivot: [0, 0, 0], half: [1, 1, 1], vol: 1, group: 0, top: 0, fixed: true }] };
}
