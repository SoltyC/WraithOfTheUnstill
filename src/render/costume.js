// Costume parts on the Veiled (docs/people-and-cutscenes.md §1.2): the stiff things people wear and carry — a
// straw hat over the hood, a basket on the arm — as rigid meshes (render/costumeGeo.js) instanced per figure.
// Each kind is one mesh drawn `forcedInstanceCount` times; the instance's 3×4 transform, visibility and seed
// sit in a storage buffer written every frame (systems/npcs.js puts them on the head or the hand), so
// nothing here records a new draw unless a slot is added (then the snapshot is reset).

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { costumeVertexWGSL, costumeFragmentWGSL } from '../shaders/costume.wgsl.js';
import { buildStrawHat, buildBasket } from './costumeGeo.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

const BUILD = { hat: buildStrawHat, basket: buildBasket };
const CAP = 32;

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {any} atmo
 * @param {any} clipmap  for the spell and grid light
 * @param {{ addCaster: Function }} shadows
 * @param {(m: any) => void} bindShadows
 */
export function createCostumeView(scene, atmo, clipmap, shadows, bindShadows) {
  const S = ShaderStore.ShadersStoreWGSL;
  S.costumeVertexShader = costumeVertexWGSL; S.costumeFragmentShader = costumeFragmentWGSL;
  const engine = scene.getEngine();
  const huge = new BoundingInfo(new Vector3(-9000, -500, -9000), new Vector3(9000, 3000, 9000));
  const kinds = {};

  function kind(name) {
    if (kinds[name]) return kinds[name];
    const d = BUILD[name](1);
    const mesh = new Mesh('costume-' + name, scene);
    mesh.alwaysSelectAsActiveMesh = true; mesh.setBoundingInfo(huge); mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
    const vd = new VertexData(); vd.positions = d.positions; vd.normals = d.normals; vd.uvs = d.uvs; vd.indices = d.indices; vd.applyToMesh(mesh, false);
    mesh.setVerticesData('tangent', d.tangents, false, 4);
    mesh.setVerticesData('info', d.info, false, 4);
    const xf = new Float32Array(CAP * 16);
    const buf = new StorageBuffer(engine, xf.byteLength, undefined, 'costume-' + name);
    buf.update(xf);
    const mat = new ShaderMaterial('costume-' + name, scene, { vertex: 'costume', fragment: 'costume' }, {
      attributes: ['position', 'normal', 'uv', 'tangent', 'info'],
      uniforms: ['viewProjection', 'spellLights', ...ENV_UNIFORMS],
      samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES],
      storageBuffers: [...ATMO_MATERIAL_BUFFERS, 'shadowData', 'lightGrid', 'costumeXf'],
      shaderLanguage: ShaderLanguage.WGSL,
    });
    bindEnvironment(mat); bindAtmosphere(mat, atmo); bindShadows(mat, shadows);
    mat.setArray4('spellLights', clipmap.spellLights); mat.setStorageBuffer('lightGrid', clipmap.lightGrid);
    mat.setStorageBuffer('costumeXf', buf);
    mat.backFaceCulling = false;
    mesh.material = mat;
    mesh.setEnabled(false);
    const k = { name, mesh, mat, xf, buf, n: 0, tris: d.indices.length / 3, dirty: false };
    shadows.addCaster(mesh, (nm, light, origin) => {
      const m = new ShaderMaterial(nm, scene, { vertex: 'costume', fragment: 'shadowDepth' }, {
        attributes: ['position', 'normal', 'uv', 'tangent', 'info'], uniforms: ['viewProjection', 'shadowLight', 'shadowOrigin'],
        storageBuffers: ['costumeXf'], shaderLanguage: ShaderLanguage.WGSL,
      });
      m.setStorageBuffer('costumeXf', buf); m.setVector4('shadowLight', light); m.setVector4('shadowOrigin', origin);
      m.backFaceCulling = false;
      return m;
    }, 1);
    mat.freeze(); fastFrozenIsReady(mat);
    return (kinds[name] = k);
  }

  return {
    kinds,
    /** A slot for one figure's part of this kind ('hat' | 'basket'): { kind, i }. */
    alloc(name) {
      const k = kind(name);
      if (k.n >= CAP) { console.warn('costume: no room for another ' + name); return null; }
      const i = k.n++;
      k.mesh.forcedInstanceCount = k.n; k.mesh.setEnabled(true);
      engine.snapshotRenderingReset?.();
      return { k, i };
    },
    /** Place slot h: basis columns a (x), b (y), c (z) (scaled), position p, shown, seed. */
    place(h, ax, ay, az, bx, by, bz, cx, cy, cz, px, py, pz, show, seed) {
      const o = h.i * 16, x = h.k.xf;
      x[o] = ax; x[o + 1] = bx; x[o + 2] = cx; x[o + 3] = px;
      x[o + 4] = ay; x[o + 5] = by; x[o + 6] = cy; x[o + 7] = py;
      x[o + 8] = az; x[o + 9] = bz; x[o + 10] = cz; x[o + 11] = pz;
      x[o + 12] = show ? 1 : 0; x[o + 13] = seed; x[o + 14] = 0; x[o + 15] = 0;
      h.k.dirty = true;
    },
    hide(h) { if (h.k.xf[h.i * 16 + 12] !== 0) { h.k.xf[h.i * 16 + 12] = 0; h.k.dirty = true; } },
    /** Upload what changed (once a frame, after the figures). */
    update() { for (const n in kinds) { const k = kinds[n]; if (k.dirty) { k.buf.update(k.xf); k.dirty = false; } } },
  };
}
