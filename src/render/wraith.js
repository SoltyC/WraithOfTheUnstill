// The Wraith's rendering (BRIEF §8.1): one mesh for every garment (robe, mantle, sleeves, cowl,
// cord, sash, wrapped hands and feet), positions from the CPU cloth via one storage-buffer upload
// per frame, the cloth material and shadow casting; the shell-fur mesh (hood rim, cuffs) over the
// same buffer; and the effects mesh (footfall spray, the cowl and fingertip glows). The
// simulation lives in src/character/wraith/.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { clothVertexWGSL, clothFragmentWGSL, furVertexWGSL, furFragmentWGSL, FUR_SHELLS } from '../shaders/cloth.wgsl.js';
import { fxVertexWGSL, fxFragmentWGSL, FX_GLOWS, FX_SPRAY, FX_COUNT } from '../shaders/wraithFx.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';
import { Wraith } from '../character/wraith/wraith.js';

/** The cowl light's breath: period (s) and depth. */
const BREATH_PERIOD = 5.5, BREATH_DEPTH = 0.3;

function quadMesh(name, scene, n) {
  const pos = new Float32Array(n * 4 * 3), idx = new Uint32Array(n * 6);
  const cx = [-1, 1, 1, -1], cy = [-1, -1, 1, 1];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) { const o = (i * 4 + k) * 3; pos[o] = i; pos[o + 1] = cx[k]; pos[o + 2] = cy[k]; }
    const v = i * 4, o = i * 6;
    idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
  }
  const mesh = new Mesh(name, scene);
  const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.applyToMesh(mesh, false);
  return mesh;
}
/** Write glow sprite i (position from v, colour, size, shown 0..1) into the effects data. */
function glow(d, i, v, r, g, b, size, on) {
  const o = i * 8; d[o] = v.x; d[o + 1] = v.y; d[o + 2] = v.z; d[o + 3] = on;
  d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = size;
}
function staticMesh(mesh) {
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.doNotSyncBoundingInfo = true;
  mesh.freezeWorldMatrix();
  return mesh;
}

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {any} atmo
 * @param {{ qx: number, qz: number, h: number, sample: () => void }} ground
 * @param {{ buffers: { biomeA: any } }} clipmap  biome weights (spray: snow on snow, dust elsewhere)
 */
export function createWraithView(scene, atmo, ground, clipmap) {
  const S = ShaderStore.ShadersStoreWGSL;
  S.clothVertexShader = clothVertexWGSL; S.clothFragmentShader = clothFragmentWGSL;
  S.wraithFurVertexShader = furVertexWGSL; S.wraithFurFragmentShader = furFragmentWGSL;
  S.wraithFxVertexShader = fxVertexWGSL; S.wraithFxFragmentShader = fxFragmentWGSL;
  const engine = scene.getEngine();
  const wraith = new Wraith(ground);
  const n = wraith.cloth.n;
  if (n > 4096) throw new Error('Wraith: fur encoding needs particle ids < 4096');

  // ---- Cloth: position = (particle id, u, v); indices from the garment grids.
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = i; pos[i * 3 + 1] = wraith.uv[i * 2]; pos[i * 3 + 2] = wraith.uv[i * 2 + 1]; }
  const mesh = staticMesh(new Mesh('wraith', scene));
  const vd = new VertexData(); vd.positions = pos; vd.indices = wraith.indices; vd.applyToMesh(mesh, false);
  const verts = new StorageBuffer(engine, wraith.packed.byteLength, undefined, 'wraith-cloth');
  const clothParams = new Vector4(1, 0, 1, 0.6);
  const head = new Vector4(0, 0, 0, 1), handL = new Vector4(0, 0, 0, 0), handR = new Vector4(0, 0, 0, 0);
  const lit = { samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES], storage: [...ATMO_MATERIAL_BUFFERS, 'shadowData'] };
  const mat = new ShaderMaterial('cloth', scene, { vertex: 'cloth', fragment: 'cloth' }, {
    attributes: ['position'],
    uniforms: ['viewProjection', 'clothParams', 'clothHead', 'clothHandL', 'clothHandR', ...ENV_UNIFORMS],
    samplers: lit.samplers, storageBuffers: ['clothVerts', ...lit.storage],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo);
  mat.setStorageBuffer('clothVerts', verts);
  mat.setVector4('clothParams', clothParams);
  mat.setVector4('clothHead', head); mat.setVector4('clothHandL', handL); mat.setVector4('clothHandR', handR);
  mat.backFaceCulling = false;
  mesh.material = mat;

  // ---- Fur: the fur regions' particles, one copy per shell; x = particle id + 4096·shell.
  const fi = wraith.furIndices, local = new Map(), ids = [];
  for (const i of fi) if (!local.has(i)) { local.set(i, ids.length); ids.push(i); }
  const U = ids.length;
  const fpos = new Float32Array(U * FUR_SHELLS * 3), fidx = new Uint32Array(fi.length * FUR_SHELLS);
  for (let s = 0; s < FUR_SHELLS; s++) {
    for (let k = 0; k < U; k++) {
      const i = ids[k], o = (s * U + k) * 3;
      fpos[o] = i + 4096 * s; fpos[o + 1] = wraith.uv[i * 2]; fpos[o + 2] = wraith.uv[i * 2 + 1];
    }
    for (let t = 0; t < fi.length; t++) fidx[s * fi.length + t] = s * U + local.get(fi[t]);
  }
  const fur = staticMesh(new Mesh('wraith-fur', scene));
  const fvd = new VertexData(); fvd.positions = fpos; fvd.indices = fidx; fvd.applyToMesh(fur, false);
  const furParams = new Vector4(0, 0, 0, 0);
  const furMat = new ShaderMaterial('wraithFur', scene, { vertex: 'wraithFur', fragment: 'wraithFur' }, {
    attributes: ['position'],
    uniforms: ['viewProjection', 'furParams', ...ENV_UNIFORMS],
    samplers: lit.samplers, storageBuffers: ['clothVerts', ...lit.storage],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(furMat); bindAtmosphere(furMat, atmo);
  furMat.setStorageBuffer('clothVerts', verts);
  furMat.setVector4('furParams', furParams);
  furMat.backFaceCulling = false;
  fur.material = furMat;

  // ---- Effects: glows (cowl, fingertips) then the spray ring.
  const fx = staticMesh(quadMesh('wraith-fx', scene, FX_COUNT));
  const fxData = new Float32Array(FX_COUNT * 8);
  for (let i = FX_GLOWS; i < FX_COUNT; i++) fxData[i * 8 + 3] = -1e9; // no spray yet
  const fxBuf = new StorageBuffer(engine, fxData.byteLength, undefined, 'wraith-fx');
  const fxParams = new Vector4(0, 0, 0, 0);
  const fxMat = new ShaderMaterial('wraithFx', scene, { vertex: 'wraithFx', fragment: 'wraithFx' }, {
    attributes: ['position'],
    uniforms: ['viewProjection', 'fxParams', ...ENV_UNIFORMS],
    samplers: lit.samplers, storageBuffers: ['fxData', 'biomeA', ...lit.storage],
    shaderLanguage: ShaderLanguage.WGSL,
    needAlphaBlending: true,
  });
  bindEnvironment(fxMat); bindAtmosphere(fxMat, atmo);
  fxMat.setStorageBuffer('fxData', fxBuf);
  fxMat.setStorageBuffer('biomeA', clipmap.buffers.biomeA);
  fxMat.setVector4('fxParams', fxParams);
  fxMat.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;
  fxMat.disableDepthWrite = true;
  fxMat.backFaceCulling = false;
  fx.material = fxMat;

  let sprayNext = 0, seed = 1;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const meshes = [mesh, fur, fx];

  return {
    wraith, mesh, fur, fx, material: mat, clothParams,
    /** Element light at the fingertips (0 = none) and the cowl light (1 = full health). */
    handLight: 0.6, cowlLight: 1,
    /** Owner fields: sim time (s), set before update(). */
    time: 0.5,
    isEnabled() { return mesh.isEnabled(); },
    setEnabled(on) { for (const m of meshes) m.setEnabled(on); },
    /** Depth material for a shadow cascade (same vertex shader as the cloth). */
    makeShadowMaterial(name, light, origin) {
      const m = new ShaderMaterial(name, scene, { vertex: 'cloth', fragment: 'shadowDepth' }, {
        attributes: ['position'], uniforms: ['viewProjection', 'shadowLight', 'shadowOrigin'],
        storageBuffers: ['clothVerts'], shaderLanguage: ShaderLanguage.WGSL,
      });
      m.setStorageBuffer('clothVerts', verts);
      m.setVector4('shadowLight', light); m.setVector4('shadowOrigin', origin);
      m.backFaceCulling = false;
      return m;
    },
    freeze() {
      for (const m of [mat, furMat, fxMat]) { m.freeze(); fastFrozenIsReady(m); }
    },
    /** Kick up spray where a foot planted (footfall event), at sim time `time`. */
    spray(x, y, z, dx, dz, speed) {
      const count = Math.min(24, 7 + Math.round(speed * 2.6));
      for (let k = 0; k < count; k++) {
        const i = FX_GLOWS + sprayNext; sprayNext = (sprayNext + 1) % FX_SPRAY;
        const o = i * 8, side = (rnd() - 0.5) * 2, fwd = rnd();
        fxData[o] = x + dx * (0.06 + 0.1 * fwd) + dz * side * 0.07;
        fxData[o + 1] = y + 0.02;
        fxData[o + 2] = z + dz * (0.06 + 0.1 * fwd) - dx * side * 0.07;
        fxData[o + 3] = this.time - 0.02 * rnd();
        const kick = speed * (0.12 + 0.3 * rnd());
        fxData[o + 4] = dx * kick + dz * side * (0.3 + 0.4 * rnd());
        fxData[o + 5] = 0.35 + 0.9 * rnd() + speed * 0.12;
        fxData[o + 6] = dz * kick - dx * side * (0.3 + 0.4 * rnd());
        fxData[o + 7] = 0.025 + 0.04 * rnd();
      }
    },
    /** Run the simulation (inputs already set on `wraith`) and upload the vertices and effects. */
    update() {
      wraith.update();
      verts.update(wraith.packed);
      const b = wraith.body, t = this.time;
      // The cowl light: deep in the hood, a little forward of the head's centre, breathing slowly.
      const breath = 1 - BREATH_DEPTH * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI / BREATH_PERIOD));
      head.x = b.head[0] + b.hf[0] * 0.03 - b.hu[0] * 0.01; head.y = b.head[1] + b.hf[1] * 0.03 - b.hu[1] * 0.01; head.z = b.head[2] + b.hf[2] * 0.03 - b.hu[2] * 0.01;
      head.w = this.cowlLight * breath;
      clothParams.x = 1; clothParams.y = t; clothParams.w = this.handLight;
      // Fingertips: along the forearm past the wrist.
      for (let s = 0; s < 2; s++) {
        const o = s * 3, h = s === 0 ? handL : handR;
        let ax = b.ha[o] - b.el[o], ay = b.ha[o + 1] - b.el[o + 1], az = b.ha[o + 2] - b.el[o + 2];
        const al = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
        h.x = b.ha[o] + ax / al * 0.13; h.y = b.ha[o + 1] + ay / al * 0.13; h.z = b.ha[o + 2] + az / al * 0.13;
        h.w = 0.75 + 0.25 * Math.sin(t * 3.7 + s * 2.1);
      }
      // Glow sprites: cowl (cold, small, faint) and fingertips (the element's light).
      glow(fxData, 0, head, 0.3 * head.w, 0.5 * head.w, 0.75 * head.w, 0.045, 1);
      glow(fxData, 1, handL, 0.25 * handL.w, 0.45 * handL.w, 0.6 * handL.w, 0.035, this.handLight);
      glow(fxData, 2, handR, 0.25 * handR.w, 0.45 * handR.w, 0.6 * handR.w, 0.035, this.handLight);
      fxBuf.update(fxData);
      fxParams.x = t; fxParams.y = wraith.cloth.windX * 0.2; fxParams.z = wraith.cloth.windZ * 0.2;
      furParams.x = wraith.cloth.windX * 0.05; furParams.y = wraith.cloth.windZ * 0.05; furParams.z = t;
    },
  };
}
