// Ebbhold's mesh (world/ebbhold.js describes the city; shaders/ebbhold.wgsl.js shades it): the collision boxes as faces (flights as
// treads), and the decoration they stand for — chamfered pillars with stepped bands and capitals, pilasters up the long walls,
// veiled Shaper statues with staves, the sea-windows, a brazier at each lamp. One static mesh in world space; it casts into the
// shadow maps (the roof keeps the sun out except through its slits) and its waters join the lakes' (render/water.js addInterior).
// Always drawn (only ever in view from inside: the city is sealed), so its pipelines are made at load.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { ebbVertexWGSL, ebbFragmentWGSL, EBB_KIND as K } from '../shaders/ebbhold.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';
import { EBB_ORIGIN, HALL, buildCity } from '../world/ebbhold.js';

/** Mesh data for the city (world space). */
export function ebbholdGeometry(city = buildCity()) {
  const O = EBB_ORIGIN;
  const pos = [], nrm = [], info = [], idx = [];
  const vert = (x, y, z, n, k, seed) => { pos.push(x + O.x, y + O.y, z + O.z); nrm.push(n[0], n[1], n[2]); info.push(k, seed, 0, 0); };
  const quad = (a, b, c, d, n, k, seed) => {
    const v = pos.length / 3;
    vert(...a, n, k, seed); vert(...b, n, k, seed); vert(...c, n, k, seed); vert(...d, n, k, seed);
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
  };
  const box = (x0, x1, y0, y1, z0, z1, k, seed = 0) => {
    quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], k, seed);
    quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], k, seed);
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], k, seed);
    quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], k, seed);
    quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1], k, seed);
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], k, seed);
  };
  /** A frustum on a regular polygon (radius r0 at y0 to r1 at y1, `sides`, turned by rot): faceted sides and caps. */
  const frustum = (cx, cz, y0, y1, r0, r1, sides, rot, k, seed = 0, caps = true) => {
    const ang = (i) => rot + (i / sides) * Math.PI * 2;
    for (let i = 0; i < sides; i++) {
      const a = ang(i), b = ang(i + 1), m = (a + b) / 2;
      const slope = (r0 - r1) / Math.max(y1 - y0, 1e-3), nl = Math.hypot(1, slope);
      const n = [Math.cos(m) / nl, slope / nl, Math.sin(m) / nl];
      quad([cx + Math.cos(a) * r0, y0, cz + Math.sin(a) * r0], [cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1],
        [cx + Math.cos(b) * r1, y1, cz + Math.sin(b) * r1], [cx + Math.cos(b) * r0, y0, cz + Math.sin(b) * r0], n, k, seed);
    }
    if (!caps) return;
    for (const [y, r, up] of [[y1, r1, 1], [y0, r0, -1]]) {
      const c = pos.length / 3;
      vert(cx, y, cz, [0, up, 0], k, seed);
      for (let i = 0; i <= sides; i++) { const a = ang(i); vert(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, [0, up, 0], k, seed); }
      for (let i = 0; i < sides; i++) idx.push(c, c + 1 + (up > 0 ? i + 1 : i), c + 1 + (up > 0 ? i : i + 1));
    }
  };
  /** Radius to the corners of an octagon whose flats are s apart. */
  const octR = (s) => s / 2 / Math.cos(Math.PI / 8);

  city.boxes.forEach((b, i) => {
    const seed = (i * 0.6180339) % 1;
    if (b.kind === 'column' || b.kind === 'statue') return;   // drawn as their decoration
    let k = K.wall;
    if (b.kind === 'floor' || b.kind === 'plinth') k = b.sand ? K.sand : K.floor;
    else if (b.kind === 'poolWall') k = K.sand;
    else if (b.kind === 'ceiling') k = K.ceiling;
    else if (b.kind === 'prop') k = K.prop;
    else if (b.kind === 'door') k = K.bronze;
    if (b.ramp) {
      // A flight as treads of 0.3 m, each 1.2 m deep under its top (the collision's line runs through their middles).
      const R = b.ramp, n = Math.max(1, Math.round(Math.abs(R.y1 - R.y0) / 0.3));
      for (let s = 0; s < n; s++) {
        const u0 = R.a + (R.b - R.a) * s / n, u1 = R.a + (R.b - R.a) * (s + 1) / n, top = R.y0 + (R.y1 - R.y0) * (s + 0.5) / n;
        if (R.axis === 'x') box(Math.min(u0, u1), Math.max(u0, u1), top - 1.2, top, b.z0, b.z1, K.floor, seed);
        else box(b.x0, b.x1, top - 1.2, top, Math.min(u0, u1), Math.max(u0, u1), K.floor, seed);
      }
      return;
    }
    if (b.kind === 'rail') {
      // A balustrade: a plinth course, a coping, posts every 4 m and balusters between.
      const along = b.x1 - b.x0 > b.z1 - b.z0;
      box(b.x0, b.x1, b.y0, b.y0 + 0.25, b.z0, b.z1, K.trim, seed);
      box(b.x0 - (along ? 0 : 0.1), b.x1 + (along ? 0 : 0.1), b.y1 - 0.2, b.y1, b.z0 - (along ? 0.1 : 0), b.z1 + (along ? 0.1 : 0), K.trim, seed);
      const len = along ? b.x1 - b.x0 : b.z1 - b.z0, n = Math.max(1, Math.round(len / 4));
      for (let j = 0; j <= n; j++) {
        const t = j / n;
        if (along) { const x = b.x0 + (b.x1 - b.x0) * t; box(x - 0.18, x + 0.18, b.y0, b.y1, b.z0 - 0.05, b.z1 + 0.05, K.trim, seed); }
        else { const z = b.z0 + (b.z1 - b.z0) * t; box(b.x0 - 0.05, b.x1 + 0.05, b.y0, b.y1, z - 0.18, z + 0.18, K.trim, seed); }
        if (j < n) for (let q = 1; q < 6; q++) {
          const tt = (j + q / 6) / n;
          if (along) { const x = b.x0 + (b.x1 - b.x0) * tt; box(x - 0.05, x + 0.05, b.y0 + 0.25, b.y1 - 0.2, b.z0 + 0.1, b.z1 - 0.1, K.trim, seed); }
          else { const z = b.z0 + (b.z1 - b.z0) * tt; box(b.x0 + 0.1, b.x1 - 0.1, b.y0 + 0.25, b.y1 - 0.2, z - 0.05, z + 0.05, K.trim, seed); }
        }
      }
      return;
    }
    box(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, k, seed);
    // A floor over the void gets a deep stepped fascia under it: the causeway and galleries read as built, not as boards.
    if (b.kind === 'floor' && !b.sand && b.y1 > HALL.floor + 1 && b.x1 - b.x0 > 3 && b.z1 - b.z0 > 3) {
      box(b.x0 + 0.6, b.x1 - 0.6, b.y0 - 1.6, b.y0, b.z0 + 0.6, b.z1 - 0.6, K.wall, seed);
      box(b.x0 + 1.6, b.x1 - 1.6, b.y0 - 3.4, b.y0 - 1.6, b.z0 + 1.6, b.z1 - 1.6, K.wall, seed);
    }
  });

  for (const d of city.decor) {
    if (d.type === 'pillar') {
      // A chamfered shaft, banded every 24 m; a stepped base where it leaves the water; three tiers of capital under the roof.
      const r = octR(d.s), rot = Math.PI / 8;
      frustum(d.x, d.z, d.y0, d.y1 - 9, r, r, 8, rot, K.pillar, 0.3, false);
      for (let y = HALL.water + 6; y < d.y1 - 14; y += 24) frustum(d.x, d.z, y, y + 2.2, r * 1.12, r * 1.12, 8, rot, K.trim, 0.5);
      frustum(d.x, d.z, HALL.water - 2, HALL.water + 3, r * 1.35, r * 1.18, 8, rot, K.wall, 0.7);
      frustum(d.x, d.z, d.y1 - 9, d.y1 - 6, r * 1.1, r * 1.25, 8, rot, K.trim, 0.2);
      frustum(d.x, d.z, d.y1 - 6, d.y1 - 3, r * 1.4, r * 1.55, 8, rot, K.pillar, 0.4);
      frustum(d.x, d.z, d.y1 - 3, d.y1, r * 1.8, r * 1.9, 8, rot, K.trim, 0.6);
    } else if (d.type === 'pilaster') {
      const s = Math.sign(d.z), zs = (a) => [Math.min(d.z, d.z - s * a), Math.max(d.z, d.z - s * a)];
      const [a0, a1] = zs(1.6), [b0, b1] = zs(2.6), [c0, c1] = zs(2.2);
      box(d.x - d.s / 2, d.x + d.s / 2, d.y0, d.y1, a0, a1, K.pillar, 0.15);
      box(d.x - d.s / 2 - 0.8, d.x + d.s / 2 + 0.8, d.y1 - 6, d.y1, b0, b1, K.trim, 0.25);
      for (const y of [HALL.walk - 2, HALL.g1 - 2, HALL.g2 - 2]) box(d.x - d.s / 2 - 0.4, d.x + d.s / 2 + 0.4, y - 1.4, y, c0, c1, K.trim, 0.35);
    } else if (d.type === 'statue') {
      // A veiled Shaper: robe falling from the shoulders, the hood drawn down, hands folded on a staff, facing the causeway.
      const h = d.h, x = d.x, z = d.z, y = d.y, f = d.face, rot = Math.PI / 8;
      frustum(x, z, y, y + 0.06 * h, 0.17 * h, 0.16 * h, 8, rot, K.trim, 0.9);
      frustum(x, z, y + 0.06 * h, y + 0.66 * h, 0.15 * h, 0.105 * h, 8, rot, K.statue, 0.1);
      frustum(x, z, y + 0.66 * h, y + 0.72 * h, 0.11 * h, 0.125 * h, 8, rot, K.statue, 0.2);
      frustum(x, z, y + 0.72 * h, y + 0.78 * h, 0.125 * h, 0.07 * h, 8, rot, K.statue, 0.25);
      frustum(x, z + f * 0.004 * h, y + 0.77 * h, y + 0.93 * h, 0.075 * h, 0.055 * h, 6, rot, K.statue, 0.3);
      frustum(x, z + f * 0.006 * h, y + 0.93 * h, y + 0.985 * h, 0.055 * h, 0.012 * h, 6, rot, K.statue, 0.35);
      box(x - 0.03 * h, x + 0.03 * h, y + 0.8 * h, y + 0.88 * h, z + f * 0.05 * h - 0.01 * h, z + f * 0.05 * h + 0.01 * h, K.shadow, 0);
      box(x - 0.05 * h, x + 0.05 * h, y + 0.5 * h, y + 0.58 * h, z + f * 0.09 * h - 0.04 * h, z + f * 0.09 * h + 0.04 * h, K.statue, 0.4);
      box(x - 0.012 * h, x + 0.012 * h, y, y + 1.06 * h, z + f * 0.13 * h - 0.012 * h, z + f * 0.13 * h + 0.012 * h, K.trim, 0.45);
      frustum(x, z + f * 0.13 * h, y + 1.03 * h, y + 1.09 * h, 0.03 * h, 0.0, 4, 0, K.trim, 0.5);
    } else if (d.type === 'window') {
      const w = d.w;
      if (d.end) {
        const x = d.x - 0.2;
        box(x - 0.2, x, d.y0, d.y1, d.z - w / 2, d.z + w / 2, K.window, 0);
        box(x - 1.4, x - 0.2, d.y0 - 1.2, d.y0, d.z - w / 2 - 1.2, d.z + w / 2 + 1.2, K.trim, 0);
        box(x - 1.4, x - 0.2, d.y1, d.y1 + 1.2, d.z - w / 2 - 1.2, d.z + w / 2 + 1.2, K.trim, 0);
      } else {
        const s = d.side, z = d.z - s * 0.2;
        const zz = [Math.min(z, z - s * 0.2), Math.max(z, z - s * 0.2)], fz = [Math.min(z, z - s * 1.4), Math.max(z, z - s * 1.4)];
        box(d.x - w / 2, d.x + w / 2, d.y0, d.y1, zz[0], zz[1], K.window, 0);
        box(d.x - w / 2 - 1.2, d.x + w / 2 + 1.2, d.y0 - 1.2, d.y0, fz[0], fz[1], K.trim, 0);
        box(d.x - w / 2 - 1.2, d.x + w / 2 + 1.2, d.y1, d.y1 + 3, fz[0], fz[1], K.trim, 0);
        box(d.x - w / 2 - 1.2, d.x - w / 2, d.y0, d.y1, fz[0], fz[1], K.trim, 0);
        box(d.x + w / 2, d.x + w / 2 + 1.2, d.y0, d.y1, fz[0], fz[1], K.trim, 0);
      }
    }
  }
  for (const [x, y, z] of city.lamps) {
    // A brazier: a bowl on a stem, the flame in it.
    box(x - 0.08, x + 0.08, y - 2.2, y - 0.4, z - 0.08, z + 0.08, K.trim, 0);
    frustum(x, z, y - 0.45, y - 0.15, 0.12, 0.32, 8, 0, K.bronze, 0);
    box(x - 0.14, x + 0.14, y - 0.2, y + 0.3, z - 0.14, z + 0.14, K.flame, 0);
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), info: new Float32Array(info), indices: new Uint32Array(idx) };
}

/** The waters' surfaces (world): the hall's drowned floor, the nursery, the undercroft's pool. */
export function ebbholdWaterQuads(city = buildCity()) {
  const O = EBB_ORIGIN, out = [];
  for (const a of city.airs) if (a.water !== null && a.water < a.y1 - 0.05) out.push({ x0: a.x0 + O.x, x1: a.x1 + O.x, z0: a.z0 + O.z, z1: a.z1 + O.z, level: a.water + O.y, depth: a.water - a.y0 });
  for (const p of city.pools) out.push({ x0: p.x0 + O.x, x1: p.x1 + O.x, z0: p.z0 + O.z, z1: p.z1 + O.z, level: p.water + O.y, depth: 2.7 });
  return out;
}

/** @param {any} clipmap  its spell slots and world-light grid (the lamps) */
export function createEbbholdView(scene, atmo, clipmap) {
  const S = ShaderStore.ShadersStoreWGSL;
  S.ebbVertexShader = ebbVertexWGSL; S.ebbFragmentShader = ebbFragmentWGSL;
  const city = buildCity();
  const g = ebbholdGeometry(city);
  const mesh = new Mesh('ebbhold', scene);
  const vd = new VertexData(); vd.positions = g.positions; vd.normals = g.normals; vd.indices = g.indices; vd.applyToMesh(mesh, false);
  mesh.setVerticesData('info', g.info, false, 4);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
  /** y = fill (display-referred), z = the sea-light's strength (the sun through the slits). */
  const params = new Vector4(0, 0.035, 3.2, 0);   // z: the sea-light's strength on the stone (display-referred)
  const mat = new ShaderMaterial('ebbhold', scene, { vertex: 'ebb', fragment: 'ebb' }, {
    attributes: ['position', 'normal', 'info'],
    uniforms: ['viewProjection', 'spellLights', 'ebbParams', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES],
    storageBuffers: [...ATMO_MATERIAL_BUFFERS, 'lightGrid', 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo);
  mat.setArray4('spellLights', clipmap.spellLights); mat.setStorageBuffer('lightGrid', clipmap.lightGrid); mat.setVector4('ebbParams', params);
  mesh.material = mat;
  const O = EBB_ORIGIN;
  return {
    mesh, material: mat, params, city, triangles: g.indices.length / 3,
    /** The lamps and glows (world, for systems/lights.js): flames that do not flicker, the cold light of the sea and the well. */
    lamps: [...city.lamps.map(([x, y, z]) => ({ x: x + O.x, y: y + O.y, z: z + O.z, radius: 20, color: [1, 0.62, 0.3], intensity: 7, kind: 'held' })),
      ...city.glows.map(([x, y, z, color, intensity, radius]) => ({ x: x + O.x, y: y + O.y, z: z + O.z, radius, color, intensity, kind: 'held' }))],
    /** The shadow casters' depth material (shadows.addCaster): its world matrix is the identity. */
    makeShadowMaterial(name, light, origin) {
      const m = new ShaderMaterial(name, scene, { vertex: 'capsule', fragment: 'shadowDepth' }, {
        attributes: ['position', 'normal'], uniforms: ['world', 'viewProjection', 'shadowLight', 'shadowOrigin'], shaderLanguage: ShaderLanguage.WGSL,
      });
      m.setVector4('shadowLight', light); m.setVector4('shadowOrigin', origin);
      m.backFaceCulling = false;
      return m;
    },
    freeze() { mat.freeze(); fastFrozenIsReady(mat); },
  };
}
