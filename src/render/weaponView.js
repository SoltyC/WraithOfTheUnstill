// The weapons' renderer (docs §11.2): one mesh (render/weaponGeo.js) whose six slots are moved by a
// transform table written every frame — the weapon in the hands, the finds lying in the world — and
// a ribbon for the swing's trail (two edge points per node, shaders/weapon.wgsl.js). The weapon
// shaders are warmed with the rest at load; nothing here allocates per frame.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo.js';
import { Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { MAT_SAMPLERS, bindMaterialLibrary } from '../materials/library.js';
import { weaponVertexWGSL, weaponFragmentWGSL, trailVertexWGSL, trailFragmentWGSL, WEAPON_SLOTS, TRAIL_NODES, TRAIL_COUNT } from '../shaders/weapon.wgsl.js';
import { buildWeaponMesh } from './weaponGeo.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {any} atmo
 * @param {any} matLib  the scanned material library (materials/library.js)
 * @param {any} clipmap  for the spell and grid light
 */
export function createWeaponView(scene, atmo, matLib, clipmap) {
  const S = ShaderStore.ShadersStoreWGSL;
  S.weaponVertexShader = weaponVertexWGSL; S.weaponFragmentShader = weaponFragmentWGSL;
  S.weaponTrailVertexShader = trailVertexWGSL; S.weaponTrailFragmentShader = trailFragmentWGSL;
  const engine = scene.getEngine();
  const huge = new BoundingInfo(new Vector3(-9000, -500, -9000), new Vector3(9000, 3000, 9000));
  const staticMesh = (m) => { m.alwaysSelectAsActiveMesh = true; m.setBoundingInfo(huge); m.doNotSyncBoundingInfo = true; m.freezeWorldMatrix(); return m; };

  // ---- The weapons: one mesh, a transform table.
  const d = buildWeaponMesh();
  const mesh = staticMesh(new Mesh('weapons', scene));
  const vd = new VertexData(); vd.positions = d.positions; vd.normals = d.normals; vd.uvs = d.uvs; vd.indices = d.indices; vd.applyToMesh(mesh, false);
  mesh.setVerticesData('info', d.info, false, 4);
  /** 4 vec4 per slot: three rows of a 3×4 transform, then (visible, tint rgb). Written in place. */
  const xf = new Float32Array(WEAPON_SLOTS * 16);
  const mat = new ShaderMaterial('weapon', scene, { vertex: 'weapon', fragment: 'weapon' }, {
    attributes: ['position', 'normal', 'uv', 'info'],
    uniforms: ['viewProjection', 'weaponXf', 'spellLights', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES, ...MAT_SAMPLERS],
    storageBuffers: [...ATMO_MATERIAL_BUFFERS, 'shadowData', 'lightGrid'],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo); bindMaterialLibrary(mat, matLib);
  mat.setArray4('weaponXf', xf);
  mat.setArray4('spellLights', clipmap.spellLights); mat.setStorageBuffer('lightGrid', clipmap.lightGrid);
  mat.backFaceCulling = false;
  mesh.material = mat;

  // ---- The trail: per-quad vertices (position.x = trail * N + quad, y = corner).
  const N = TRAIL_NODES, NODES = TRAIL_COUNT * N;
  const tpos = new Float32Array(NODES * 4 * 3), tidx = new Uint32Array(NODES * 6);
  for (let q = 0; q < NODES; q++) {
    for (let c = 0; c < 4; c++) { const o = (q * 4 + c) * 3; tpos[o] = q; tpos[o + 1] = c; }
    const v = q * 4, o = q * 6;
    tidx[o] = v; tidx[o + 1] = v + 1; tidx[o + 2] = v + 3; tidx[o + 3] = v; tidx[o + 4] = v + 3; tidx[o + 5] = v + 2;
  }
  const trail = staticMesh(new Mesh('weaponTrail', scene));
  const tvd = new VertexData(); tvd.positions = tpos; tvd.indices = tidx; tvd.applyToMesh(trail, false);
  /** Per node: a (xyz, time), b (xyz, start flag). */
  const nodes = new Float32Array(NODES * 8);
  for (let i = 0; i < NODES; i++) nodes[i * 8 + 3] = -1;
  const nodeBuf = new StorageBuffer(engine, nodes.byteLength, undefined, 'weapon-trail');
  const params = new Vector4(0, 0.28, 0.55, 0), head = new Vector4(0, 0, 0, 0), tint = new Vector4(0.9, 0.95, 1, 1);
  const tmat = new ShaderMaterial('weaponTrail', scene, { vertex: 'weaponTrail', fragment: 'weaponTrail' }, {
    attributes: ['position'],
    uniforms: ['viewProjection', 'trailParams', 'trailHead', 'trailTint', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES], storageBuffers: ['trailNodes', ...ATMO_MATERIAL_BUFFERS],
    shaderLanguage: ShaderLanguage.WGSL, needAlphaBlending: true,
  });
  bindEnvironment(tmat); bindAtmosphere(tmat, atmo);
  tmat.setStorageBuffer('trailNodes', nodeBuf);
  tmat.setVector4('trailParams', params); tmat.setVector4('trailHead', head); tmat.setVector4('trailTint', tint);
  tmat.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;
  tmat.disableDepthWrite = true; tmat.backFaceCulling = false;
  trail.material = tmat;
  const heads = [N - 1, N - 1];
  const fresh = [true, true];

  return {
    mesh, trail, material: mat, trailMaterial: tmat, xf, slots: WEAPON_SLOTS,
    /** Set slot k's transform: columns (xx, xy, xz), (yx, yy, yz), (zx, zy, zz) of the basis, position, visibility and element tint (fields below). */
    ax: 1, ay: 0, az: 0, bx: 0, by: 1, bz: 0, cx: 0, cy: 0, cz: 1, px: 0, py: 0, pz: 0, show: true, tr: 0, tg: 0, tb: 0,
    place(k) {
      const o = k * 16;
      xf[o] = this.ax; xf[o + 1] = this.bx; xf[o + 2] = this.cx; xf[o + 3] = this.px;
      xf[o + 4] = this.ay; xf[o + 5] = this.by; xf[o + 6] = this.cy; xf[o + 7] = this.py;
      xf[o + 8] = this.az; xf[o + 9] = this.bz; xf[o + 10] = this.cz; xf[o + 11] = this.pz;
      xf[o + 12] = this.show ? 1 : 0; xf[o + 13] = this.tr; xf[o + 14] = this.tg; xf[o + 15] = this.tb;
    },
    /** Start a new swing on trail t: the next point is not joined to the last. */
    breakTrail(t) { fresh[t] = true; },
    /** Add a point pair to trail t: edge points (ax…, bx…) at sim time `time` (fields: ax,ay,az inner, bx,by,bz outer via tipA/tipB). */
    ta: [0, 0, 0], tb2: [0, 0, 0],
    pushTrail(t, time) {
      const n = (heads[t] + 1) % N, o = (t * N + n) * 8;
      nodes[o] = this.ta[0]; nodes[o + 1] = this.ta[1]; nodes[o + 2] = this.ta[2]; nodes[o + 3] = time;
      nodes[o + 4] = this.tb2[0]; nodes[o + 5] = this.tb2[1]; nodes[o + 6] = this.tb2[2]; nodes[o + 7] = fresh[t] ? 1 : 0;
      fresh[t] = false; heads[t] = n;
    },
    /** Element light on the trail (rgb, scene-referred) and its strength. */
    setTrailLook(r, g, b, intensity) { tint.set(r, g, b, 1); params.z = intensity; },
    /** Upload the trail and the clock (the table is read in place by the materials). */
    update(time) {
      nodeBuf.update(nodes);
      params.x = time; head.x = heads[0]; head.y = heads[1];
    },
    /** Shadow casting: the same table through the depth pass. */
    makeShadowMaterial(name, light, origin) {
      const m = new ShaderMaterial(name, scene, { vertex: 'weapon', fragment: 'shadowDepth' }, {
        attributes: ['position', 'normal', 'uv', 'info'], uniforms: ['viewProjection', 'weaponXf', 'shadowLight', 'shadowOrigin'],
        shaderLanguage: ShaderLanguage.WGSL,
      });
      m.setArray4('weaponXf', xf); m.setVector4('shadowLight', light); m.setVector4('shadowOrigin', origin);
      m.backFaceCulling = false;
      return m;
    },
    freeze() { for (const m of [mat, tmat]) { m.freeze(); fastFrozenIsReady(m); } },
  };
}
