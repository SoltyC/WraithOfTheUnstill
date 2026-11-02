// Ebbhold's grey box (world/ebbhold.js describes it; shaders/ebbhold.wgsl.js shades it). One static mesh in world space: every box
// as six faces (the stairs as treads), a flame at each lamp. It casts into the shadow maps (its ceilings keep the sun out of the
// city) and its rooms' water joins the lakes' (render/water.js addInterior). Always present (drawn whenever in view, which is only
// from inside: the city is sealed), so its pipeline is made at load.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { ebbVertexWGSL, ebbFragmentWGSL } from '../shaders/ebbhold.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';
import { EBB_ORIGIN, ROOMS, FEATURES, LAMPS, GLOWS, buildBoxes } from '../world/ebbhold.js';

const KIND = { cave: 0, sand: 1, prop: 2, bronze: 3, flame: 4, column: 5 };

/** Mesh data for the boxes (world space). */
export function ebbholdGeometry(boxes = buildBoxes()) {
  const O = EBB_ORIGIN;
  const pos = [], nrm = [], info = [], idx = [];
  const quad = (a, b, c, d, n, k, seed) => {
    const v = pos.length / 3;
    for (const p of [a, b, c, d]) { pos.push(p[0] + O.x, p[1] + O.y, p[2] + O.z); nrm.push(n[0], n[1], n[2]); info.push(k, seed, 0, 0); }
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
  };
  const box = (x0, x1, y0, y1, z0, z1, k, seed) => {
    quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], k, seed);
    quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], k, seed);
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], k, seed);
    quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], k, seed);
    quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1], k, seed);
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], k, seed);
  };
  const caveFloor = new Set(ROOMS.filter((r) => r.kind === 'cave').map((r) => r.id));
  boxes.forEach((b, i) => {
    const seed = (i * 0.6180339) % 1;
    let k = KIND.cave;
    if (b.kind === 'column') k = KIND.column;
    else if (['shrine', 'kneader', 'cradle', 'wheel', 'register'].includes(b.kind)) k = KIND.prop;
    else if (b.kind === 'seaDoor') k = KIND.bronze;
    else if ((b.kind === 'floor' || b.kind === 'poolWall') && caveFloor.has(b.room)) k = KIND.sand;
    if (b.ramp) {
      // Stairs as treads (0.3 m rises); a ramp (the intake) in short flat runs.
      const R = b.ramp, n = Math.max(1, Math.round(Math.abs(R.y1 - R.y0) / (R.steps ? 0.3 : 0.15)));
      for (let s = 0; s < n; s++) {
        // Each tread at the ramp's height at its middle (the collision is the ramp: feet within half a rise of it).
        const u0 = R.a + (R.b - R.a) * s / n, u1 = R.a + (R.b - R.a) * (s + 1) / n, top = R.y0 + (R.y1 - R.y0) * (s + 0.5) / n;
        if (R.axis === 'x') box(Math.min(u0, u1), Math.max(u0, u1), b.y0, top, b.z0, b.z1, k, seed);
        else box(b.x0, b.x1, b.y0, top, Math.min(u0, u1), Math.max(u0, u1), k, seed);
      }
      return;
    }
    box(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, k, seed);
  });
  for (const [x, y, z] of LAMPS) box(x - 0.12, x + 0.12, y - 0.2, y + 0.2, z - 0.12, z + 0.12, KIND.flame, 0);
  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), info: new Float32Array(info), indices: new Uint32Array(idx) };
}

/** The rooms' water surfaces (world): one quad per room whose water is below its ceiling, and the pool's. */
export function ebbholdWaterQuads() {
  const O = EBB_ORIGIN, out = [];
  for (const r of ROOMS) if (r.water !== null && r.water < r.y + r.h - 0.05) out.push({ x0: r.x0 + O.x, x1: r.x1 + O.x, z0: r.z0 + O.z, z1: r.z1 + O.z, level: r.water + O.y, depth: r.water - r.y });
  for (const f of FEATURES) if (f.type === 'pool') { const r = ROOMS.find((q) => q.id === f.room); out.push({ x0: f.x0 + O.x, x1: f.x1 + O.x, z0: f.z0 + O.z, z1: f.z1 + O.z, level: r.y + f.water + O.y, depth: f.depth + f.water }); }
  return out;
}

/** @param {any} clipmap  its spell slots and world-light grid (the lamps) */
export function createEbbholdView(scene, atmo, clipmap) {
  const S = ShaderStore.ShadersStoreWGSL;
  S.ebbVertexShader = ebbVertexWGSL; S.ebbFragmentShader = ebbFragmentWGSL;
  const g = ebbholdGeometry();
  const mesh = new Mesh('ebbhold', scene);
  const vd = new VertexData(); vd.positions = g.positions; vd.normals = g.normals; vd.indices = g.indices; vd.applyToMesh(mesh, false);
  mesh.setVerticesData('info', g.info, false, 4);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
  const params = new Vector4(0, 0.03, 0, 0);
  const mat = new ShaderMaterial('ebbhold', scene, { vertex: 'ebb', fragment: 'ebb' }, {
    attributes: ['position', 'normal', 'info'],
    uniforms: ['viewProjection', 'spellLights', 'ebbParams', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES],
    storageBuffers: [...ATMO_MATERIAL_BUFFERS, 'lightGrid'],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo);
  mat.setArray4('spellLights', clipmap.spellLights); mat.setStorageBuffer('lightGrid', clipmap.lightGrid); mat.setVector4('ebbParams', params);
  mesh.material = mat;
  return {
    mesh, material: mat, params, triangles: g.indices.length / 3,
    /** The lamps (world, for systems/lights.js): flames that do not flicker. */
    lamps: [...LAMPS.map(([x, y, z]) => ({ x: x + EBB_ORIGIN.x, y: y + EBB_ORIGIN.y, z: z + EBB_ORIGIN.z, radius: 22, color: [1, 0.62, 0.3], intensity: 7, kind: 'held' })),
      ...GLOWS.map(([x, y, z, color, intensity, radius]) => ({ x: x + EBB_ORIGIN.x, y: y + EBB_ORIGIN.y, z: z + EBB_ORIGIN.z, radius, color, intensity, kind: 'held' }))],
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
