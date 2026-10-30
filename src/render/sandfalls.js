// Sandfalls (Phase 9 D7b; dunes-design.md §7.1 "Restored: sandfalls stream from the rims and catch
// light"): curtains of sand pouring ledge to ledge down the canyon's tallest walls, a dust cloud
// boiling at each foot. Visual only — real sand flow (D2) will feed them later; until then they
// show once the Dunes are restored and fade with it. **Frozen** (§7.1 "sandfalls frozen into
// columns"): a Crystallize at a cascade stops it, and each fall's sand freezes where it piled into
// a stepped ramp of ice-sand from the tread up to the lip — a way up the wall (world/solids.js ramps). Placed from the wall kit's own lines
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
import { sandfallVertexWGSL, sandfallFragmentWGSL, sandfallRampVertexWGSL, sandfallRampFragmentWGSL } from '../shaders/sandfalls.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

const SITES = 9, SPACING = 110, SEGS = 10;
const LANDING = 6;   // m: a frozen ramp's landing, back over the lip onto the tread

/**
 * The falls (deterministic): tiered cascades — at each site, every ledge's lip within a few metres
 * pours onto the tread below it (a wall's top to its foot), so sand runs ledge to ledge down the
 * wall. Each: [lip x, y, z, out nx, nz, foot y, seed, site]. Sites: the Galleries' tallest walls, spaced.
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
    for (const { q } of byLevel.values()) out.push([q[0], q[1], q[2], q[3], q[4], q[5], ((k * 0.618) % 1), k]);
  });
  return out;
}

export const SANDFALL_SITES = SITES;
const hr = (a, b) => { let x = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1); x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d); return ((x ^ (x >>> 13)) >>> 0) / 4294967296; };

/**
 * The frozen ramps (deterministic), one per fall: the sand that poured over the lip frozen where it
 * piled, a rounded fan from the tread up to just over the lip (so the feet clear the wall) — wide at
 * its foot, narrowing as it climbs, with low ragged terraces where the pour stepped. Run ≈ 0.85 ×
 * the drop (3–9 m). ramps (two per fall: the ramp, then its flat landing): [x0, z0, x1, z1, y0, y1, hw, steps, site] — the collision's stepped floor
 * (≤ 0.45 m steps) under the fan's surface; geometry: position and ramp (foot y, lip y, site) per
 * vertex, a grid over the fan skirted down below the tread.
 */
export function rampGeometry(falls) {
  const ramps = [], pos = [], attr = [], idx = [];
  const AL = 18, AC = 8;   // rows along, columns across
  falls.forEach(([x, y, z, nx, nz, ff, , site], fi) => {
    // The tread under the fall (its recorded foot is the contour, ~1.5 m up the riser below).
    const f = ff - 1.6;
    const drop = y - f, run = Math.min(9, Math.max(3, drop * 0.85)), n = Math.max(4, Math.ceil(drop / 0.42)), hw = 1.8 + 0.5 * hr(fi, 1);
    const y1 = y + 0.8, x1 = x + nx * 0.3, z1 = z + nz * 0.3, x0 = x1 + nx * run, z0 = z1 + nz * run;
    ramps.push([x0, z0, x1, z1, f, y1, hw, n, site]);
    // The landing: the cliff leans back, its real lip a few metres behind the line; a flat tongue of
    // frozen sand runs back from the ramp's top over it onto the tread (above the wall's top, so the
    // wall lets the feet by).
    const xb = x1 - nx * LANDING, zb = z1 - nz * LANDING;
    ramps.push([x1, z1, xb, zb, y1, y1, hw * 1.1, 1, site]);
    const tx = -nz, tz = nx, base = f - 1.0;
    const o = pos.length / 3;
    for (let i = 0; i <= AL; i++) {
      const t = i / AL;
      // The surface: the stepped floor's line, terraced a little (a smoothed sawtooth), ragged.
      const terr = 0.12 * Math.sin(t * n * Math.PI * 0.5 + fi) + 0.08 * (hr(fi * 41 + i, 4) - 0.5);
      const hc = f + (y1 - f) * t + (i === 0 ? -0.6 : i === AL ? 0 : terr);
      const w = hw * (1.55 - 0.75 * t) * (0.92 + 0.16 * hr(fi * 41 + i, 5));
      for (let j = 0; j <= AC; j++) {
        const u = (j / AC) * 2 - 1, edge = j === 0 || j === AC;
        // Rounded across (a mound), the skirt at the edges down into the sand.
        const hy = edge ? base : hc - 0.45 * u * u * (1.2 - t);
        const px = x0 + (x1 - x0) * t + tx * u * w, pz = z0 + (z1 - z0) * t + tz * u * w;
        pos.push(px, hy, pz); attr.push(f, y1, site);
      }
    }
    // The landing's rows, on past the lip: flat, narrowing, thinning to nothing at its far end.
    const LR = 4;
    for (let i = 1; i <= LR; i++) {
      const t = i / LR, w = hw * (1.1 - 0.3 * t);
      for (let j = 0; j <= AC; j++) {
        const u = (j / AC) * 2 - 1, edge = j === 0 || j === AC;
        const hy = edge ? y1 - 1.2 : y1 + 0.05 - 0.25 * u * u - 0.3 * t * t;
        pos.push(x1 - nx * LANDING * t + tx * u * w, hy, z1 - nz * LANDING * t + tz * u * w); attr.push(f, y1, site);
      }
    }
    for (let i = 0; i < AL + LR; i++) for (let j = 0; j < AC; j++) {
      const a = o + i * (AC + 1) + j, b = a + AC + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  });
  return { ramps, pos, attr, idx };
}

export function createSandfalls(scene, atmo, shadows, bindShadows, spines, chunks) {
  ShaderStore.ShadersStoreWGSL.sandfallVertexShader = sandfallVertexWGSL;
  ShaderStore.ShadersStoreWGSL.sandfallFragmentShader = sandfallFragmentWGSL;
  const falls = placeSandfalls(spines, chunks);
  const pos = [], fall = [], tan = [], idx = [], siteOf = [];
  for (const [x, y, z, nx, nz, f, seed, site] of falls) {
    const drop = y - f, out = 0.6 + 0.4 * seed, base = pos.length / 3;
    // The path: off the lip, out a little and down (a stream poured over an edge).
    for (let i = 0; i <= SEGS; i++) {
      const t = i / SEGS, fy = y + 0.3 - drop * t * t, d = out + 1.2 * t;   // t² by height: it accelerates
      const px = x + nx * d, pz = z + nz * d;
      const tx = nx * 1.2, ty = -drop * 2 * t - 0.5, tz = nz * 1.2, tl = Math.hypot(tx, ty, tz);
      for (const side of [-1, 1]) { pos.push(px, fy, pz); fall.push(side, t, seed, 0); tan.push(tx / tl, ty / tl, tz / tl); siteOf.push(site); }
    }
    for (let i = 0; i < SEGS; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    // The dust at the foot: a billboard (fall.w = 1), corners in side and t.
    const fb = pos.length / 3, fx = x + nx * (out + 1.2), fz = z + nz * (out + 1.2);
    for (const [u, v] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) { pos.push(fx, f, fz); fall.push(u, v, seed, 1); tan.push(0, 1, 0); siteOf.push(site); }
    idx.push(fb, fb + 1, fb + 2, fb, fb + 2, fb + 3);
  }
  const mesh = new Mesh('sandfalls', scene);
  const vd = new VertexData(); vd.positions = new Float32Array(pos.length ? pos : [0, -5000, 0, 0, -5000, 0, 0, -5000, 0]);
  vd.indices = new Uint32Array(idx.length ? idx : [0, 1, 2]); vd.applyToMesh(mesh, false);
  mesh.setVerticesData('fall', new Float32Array(fall.length ? fall : new Array(12).fill(0)), false, 4);
  mesh.setVerticesData('fallTan', new Float32Array(tan.length ? tan : new Array(9).fill(0)), false, 3);
  mesh.setVerticesData('fallSite', new Float32Array(siteOf.length ? siteOf : new Array(3).fill(0)), false, 1);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
  const params = new Vector4(0, 0, 0, 0);
  const mat = new ShaderMaterial('sandfalls', scene, { vertex: 'sandfall', fragment: 'sandfall' }, {
    attributes: ['position', 'fall', 'fallTan', 'fallSite'],
    uniforms: ['viewProjection', 'fallParams', 'fallFrozen', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES],
    storageBuffers: [...ATMO_MATERIAL_BUFFERS, 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
    needAlphaBlending: true,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo); bindShadows(mat, shadows);
  mat.setVector4('fallParams', params);
  const frozen = new Array(12).fill(0);   // per site, 0 running … 1 frozen (eased by the owner's update)
  mat.setArray4('fallFrozen', frozen);
  mat.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;
  mat.disableDepthWrite = true;
  mat.backFaceCulling = false;
  mesh.material = mat;
  mat.freeze(); fastFrozenIsReady(mat);
  // The frozen ramps: one opaque draw, each ramp shown (rising from its foot) while its site is frozen.
  ShaderStore.ShadersStoreWGSL.sandfallRampVertexShader = sandfallRampVertexWGSL;
  ShaderStore.ShadersStoreWGSL.sandfallRampFragmentShader = sandfallRampFragmentWGSL;
  const rg = rampGeometry(falls);
  const rMesh = new Mesh('sandfallRamps', scene);
  const rvd = new VertexData(); rvd.positions = new Float32Array(rg.pos.length ? rg.pos : [0, -5000, 0, 0, -5000, 0, 0, -5000, 0]);
  rvd.indices = new Uint32Array(rg.idx.length ? rg.idx : [0, 1, 2]); rvd.applyToMesh(rMesh, false);
  rMesh.setVerticesData('ramp', new Float32Array(rg.attr.length ? rg.attr : new Array(9).fill(0)), false, 3);
  rMesh.alwaysSelectAsActiveMesh = true; rMesh.doNotSyncBoundingInfo = true; rMesh.freezeWorldMatrix();
  const rMat = new ShaderMaterial('sandfallRamps', scene, { vertex: 'sandfallRamp', fragment: 'sandfallRamp' }, {
    attributes: ['position', 'ramp'],
    uniforms: ['viewProjection', 'fallFrozen', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES],
    storageBuffers: [...ATMO_MATERIAL_BUFFERS, 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(rMat); bindAtmosphere(rMat, atmo); bindShadows(rMat, shadows);
  rMat.setArray4('fallFrozen', frozen);
  rMat.backFaceCulling = false;
  rMesh.material = rMat;
  rMat.freeze(); fastFrozenIsReady(rMat);
  const target = new Float32Array(SITES);
  return {
    mesh, material: mat, rampMesh: rMesh, rampMaterial: rMat, falls, ramps: rg.ramps,
    /** Per site: eased 0 running … 1 frozen (read: the solids' ramps switch on near 1). */
    frozen,
    /** Owner fields: time (s), flow 0 (none: stilled) … 1 (the Dunes restored), dt (s); freeze(site, on) sets a target. */
    time: 0.5, flow: 0.5 - 0.5, dt: 0.5 - 0.5,
    freeze(site, on) { target[site] = on ? 1 : 0; },
    /** Snap the frozen state to its targets (a load, a spot). */
    snap() { for (let k = 0; k < SITES; k++) frozen[k] = target[k]; },
    update() {
      params.x = this.time; params.y = this.flow;
      // Freezing takes a few seconds (the ice climbing the fall); a thaw is quicker.
      for (let k = 0; k < SITES; k++) { const d = target[k] - frozen[k]; frozen[k] += Math.sign(d) * Math.min(Math.abs(d), this.dt * (d > 0 ? 0.4 : 0.8)); }
    },
    /** Fill the solids' ramp list (world/solids.js ramps): every fall's ramp, on while its site is frozen. */
    fillRamps(rp) {
      rp.n = Math.min(rg.ramps.length, rp.on.length);
      for (let k = 0; k < rp.n; k++) {
        const r = rg.ramps[k];
        rp.x0[k] = r[0]; rp.z0[k] = r[1]; rp.x1[k] = r[2]; rp.z1[k] = r[3]; rp.y0[k] = r[4]; rp.y1[k] = r[5]; rp.hw[k] = r[6]; rp.steps[k] = r[7];
        rp.on[k] = frozen[r[8]] > 0.95 ? 1 : 0;
      }
    },
  };
}
