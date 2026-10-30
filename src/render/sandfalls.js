// Sandfalls (Phase 9 D7b; dunes-design.md §7.1 "Restored: sandfalls stream from the rims and catch
// light"): curtains of sand pouring ledge to ledge down the canyon's tallest walls, a dust cloud
// boiling at each foot. Visual only — real sand flow (D2) will feed them later; until then they
// show once the Dunes are restored and fade with it. Placed from the wall kit's own lines
// (render/canyonWalls.js collision: a wall's lip, its outward side, its top and foot). One draw: each fall a strip turned to the camera
// round its path, its foot a billboard.

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
import { sandfallVertexWGSL, sandfallFragmentWGSL } from '../shaders/sandfalls.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

const SITES = 9, SPACING = 110, SEGS = 10;

/**
 * The falls (deterministic): tiered cascades — at each site, every ledge's lip within a few metres
 * pours onto the tread below it (a wall's top to its foot), so sand runs ledge to ledge down the
 * wall. Each: [lip x, y, z, out nx, nz, foot y, seed]. Sites: the Galleries' tallest walls, spaced.
 */
export function placeSandfalls(spines, chunks) {
  // The Galleries' walls only: near a canyon spine, not the Stride's or a slot's.
  const dist = (kinds, x, z) => { let best = Infinity; for (const sp of spines) if (kinds.includes(sp.kind)) for (const p of sp.pts) best = Math.min(best, Math.hypot(p[0] - x, p[1] - z) - p[2]); return best; };
  const pts = [];
  for (const c of chunks) {
    const L = c.collision;
    for (let o = 0; o < L.length; o += 7 * 3) {
      if (L[o + 5] - (L[o + 4] + 1.7) <= 6) continue;
      if (dist(['canyon'], L[o], L[o + 1]) > 90 || dist(['rift', 'slot'], L[o], L[o + 1]) < 40) continue;
      pts.push([L[o], L[o + 5], L[o + 1], L[o + 2], L[o + 3], L[o + 4] + 1.7]);
    }
  }
  // A site's worth: how many ledges stack within 16 m of it, and how high it climbs.
  const near = (p, r) => pts.filter((q) => (q[0] - p[0]) ** 2 + (q[2] - p[2]) ** 2 < r * r);
  const scored = pts.filter((_, i) => i % 4 === 0).map((p) => { const n = near(p, 16); return { p, s: n.length + Math.max(...n.map((q) => q[1])) * 0.02 }; });
  scored.sort((a, b) => b.s - a.s || a.p[0] - b.p[0]);
  const sites = [];
  for (const { p } of scored) { if (sites.length >= SITES) break; if (!sites.some((q) => Math.hypot(q[0] - p[0], q[2] - p[2]) < SPACING)) sites.push(p); }
  const out = [];
  sites.forEach((site, k) => {
    // One lip per ledge level (bands of 6 m), the nearest to the site's line.
    const byLevel = new Map();
    for (const q of near(site, 14)) { const lv = Math.round(q[1] / 6); const cur = byLevel.get(lv); const d = (q[0] - site[0]) ** 2 + (q[2] - site[2]) ** 2; if (!cur || d < cur.d) byLevel.set(lv, { q, d }); }
    for (const { q } of byLevel.values()) out.push([q[0], q[1], q[2], q[3], q[4], q[5], ((k * 0.618) % 1)]);
  });
  return out;
}

export function createSandfalls(scene, atmo, shadows, bindShadows, spines, chunks) {
  ShaderStore.ShadersStoreWGSL.sandfallVertexShader = sandfallVertexWGSL;
  ShaderStore.ShadersStoreWGSL.sandfallFragmentShader = sandfallFragmentWGSL;
  const falls = placeSandfalls(spines, chunks);
  const pos = [], fall = [], tan = [], idx = [];
  for (const [x, y, z, nx, nz, f, seed] of falls) {
    const drop = y - f, out = 0.6 + 0.4 * seed, base = pos.length / 3;
    // The path: off the lip, out a little and down (a stream poured over an edge).
    for (let i = 0; i <= SEGS; i++) {
      const t = i / SEGS, fy = y + 0.3 - drop * t * t, d = out + 1.2 * t;   // t² by height: it accelerates
      const px = x + nx * d, pz = z + nz * d;
      const tx = nx * 1.2, ty = -drop * 2 * t - 0.5, tz = nz * 1.2, tl = Math.hypot(tx, ty, tz);
      for (const side of [-1, 1]) { pos.push(px, fy, pz); fall.push(side, t, seed, 0); tan.push(tx / tl, ty / tl, tz / tl); }
    }
    for (let i = 0; i < SEGS; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    // The dust at the foot: a billboard (fall.w = 1), corners in side and t.
    const fb = pos.length / 3, fx = x + nx * (out + 1.2), fz = z + nz * (out + 1.2);
    for (const [u, v] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) { pos.push(fx, f, fz); fall.push(u, v, seed, 1); tan.push(0, 1, 0); }
    idx.push(fb, fb + 1, fb + 2, fb, fb + 2, fb + 3);
  }
  const mesh = new Mesh('sandfalls', scene);
  const vd = new VertexData(); vd.positions = new Float32Array(pos.length ? pos : [0, -5000, 0, 0, -5000, 0, 0, -5000, 0]);
  vd.indices = new Uint32Array(idx.length ? idx : [0, 1, 2]); vd.applyToMesh(mesh, false);
  mesh.setVerticesData('fall', new Float32Array(fall.length ? fall : new Array(12).fill(0)), false, 4);
  mesh.setVerticesData('fallTan', new Float32Array(tan.length ? tan : new Array(9).fill(0)), false, 3);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
  const params = new Vector4(0, 0, 0, 0);
  const mat = new ShaderMaterial('sandfalls', scene, { vertex: 'sandfall', fragment: 'sandfall' }, {
    attributes: ['position', 'fall', 'fallTan'],
    uniforms: ['viewProjection', 'fallParams', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES],
    storageBuffers: [...ATMO_MATERIAL_BUFFERS, 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
    needAlphaBlending: true,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo); bindShadows(mat, shadows);
  mat.setVector4('fallParams', params);
  mat.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;
  mat.disableDepthWrite = true;
  mat.backFaceCulling = false;
  mesh.material = mat;
  mat.freeze(); fastFrozenIsReady(mat);
  return {
    mesh, material: mat, falls,
    /** Owner fields: time (s), flow 0 (none: stilled) … 1 (the Dunes restored). */
    time: 0.5, flow: 0.5 - 0.5,
    update() { params.x = this.time; params.y = this.flow; },
  };
}
