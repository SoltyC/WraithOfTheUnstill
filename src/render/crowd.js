// The crowd (Phase 10 U6): up to CROWD_MAX robed figures in one draw — the cutscenes' crowds (the hall alive in the flashbacks,
// the people behind a hero) and, later, the floating robes. Their cloth is baked once, in a worker, after load
// (render/crowdBake.worker.js: our own body and cloth through each motion), and played back on the GPU (shaders/crowd.wgsl.js),
// blended between baked frames. Figures are data: place them with set(list); the mesh draws nothing until they are shown.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { crowdVertexWGSL, crowdFragmentWGSL, CROWD_CLIPS } from '../shaders/crowd.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';
import { Wraith } from '../character/wraith/wraith.js';

export const CROWD_MAX = 48;

/** The motions baked for the crowd (name → spec for the worker). Hands: where the hands go, relative to the figure (facing +z). */
export const CROWD_MOTIONS = [
  { name: 'stand' },
  { name: 'walk', walk: 1.05 },
  { name: 'run', walk: 3.6 },
  { name: 'knead', clip: 'knead1', hands: [-0.05, 1.1, 0.58, -0.05, 1.1, 0.58], spread: 0.1 },
  { name: 'rock', clip: 'rock' },
  { name: 'haul', clip: 'wheel', hands: [0, 1.06, 0.42, 0, 1.06, 0.68] },
];

export function createCrowd(scene, atmo, clipmap) {
  const S = ShaderStore.ShadersStoreWGSL;
  S.crowdVertexShader = crowdVertexWGSL; S.crowdFragmentShader = crowdFragmentWGSL;
  const engine = scene.getEngine();
  // The robe's topology from a figure built once (the same garments the heroes wear).
  const proto = new Wraith({ qx: 0, qz: 0, h: 0, sample() { this.h = 0; } });
  const n = proto.cloth.n, I = proto.indices, nv = n;
  const pos = new Float32Array(nv * 3 * CROWD_MAX), fig = new Float32Array(nv * CROWD_MAX), idx = new Uint32Array(I.length * CROWD_MAX);
  for (let f = 0; f < CROWD_MAX; f++) {
    for (let i = 0; i < n; i++) { const o = (f * nv + i) * 3; pos[o] = i; pos[o + 1] = proto.uv[i * 2]; pos[o + 2] = proto.uv[i * 2 + 1]; fig[f * nv + i] = f; }
    for (let k = 0; k < I.length; k++) idx[f * I.length + k] = I[k] + f * nv;
  }
  const mesh = new Mesh('crowd', scene);
  const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.applyToMesh(mesh, false);
  mesh.setVerticesData('crowd', fig, false, 1);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
  // Always drawn (its pipeline is made at load); figures not shown collapse to nothing in the vertex shader.
  // A frame of baked data until the bake arrives (one particle frame per motion: nothing drawn reads it unshown).
  let bake = new StorageBuffer(engine, 16 * n, undefined, 'crowd-bake');
  const figs = new Float32Array(CROWD_MAX * 12), figBuf = new StorageBuffer(engine, figs.byteLength, undefined, 'crowd-figs');
  figBuf.update(figs);
  const time = new Vector4(0, n, 0, 0), clips = new Array(CROWD_CLIPS * 4).fill(1);
  const lit = { samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES], storage: [...ATMO_MATERIAL_BUFFERS, 'shadowData'] };
  const mat = new ShaderMaterial('crowd', scene, { vertex: 'crowd', fragment: 'crowd' }, {
    attributes: ['position', 'crowd'],
    uniforms: ['viewProjection', 'crowdTime', 'crowdClips', 'clothParams', 'clothHead', 'clothHandL', 'clothHandR', 'clothFrost', 'clothTint', 'clothRobe', 'clothBand', 'clothSash', 'clothFlow', 'spellLights', ...ENV_UNIFORMS],
    samplers: lit.samplers, storageBuffers: ['crowdBake', 'crowdFigs', ...lit.storage, 'lightGrid'],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo);
  const z4 = () => new Vector4(0, 0, 0, 0);
  mat.setVector4('crowdTime', time); mat.setArray4('crowdClips', clips);
  mat.setVector4('clothParams', new Vector4(0, 0, 0, 0)); mat.setVector4('clothHead', z4()); mat.setVector4('clothHandL', z4()); mat.setVector4('clothHandR', z4());
  mat.setVector4('clothFrost', z4()); mat.setVector4('clothFlow', z4()); mat.setVector4('clothTint', new Vector4(1, 1, 1, 1));
  mat.setVector4('clothRobe', z4()); mat.setVector4('clothBand', z4()); mat.setVector4('clothSash', z4());
  mat.setStorageBuffer('crowdBake', bake); mat.setStorageBuffer('crowdFigs', figBuf);
  mat.setStorageBuffer('lightGrid', clipmap.lightGrid); mat.setArray4('spellLights', clipmap.spellLights);
  mat.backFaceCulling = false;
  mesh.material = mat;

  const byName = {};
  const crowd = {
    mesh, material: mat, ready: false, motions: byName, count: 0,
    /** Bake the motions (a worker; resolves when the crowd can be shown). */
    bake(base) {
      return new Promise((resolve) => {
        const wk = new Worker(new URL('./crowdBake.worker.js', import.meta.url), { type: 'module' });
        wk.onmessage = (e) => {
          const { clips: cl, data } = e.data;
          const nb = new StorageBuffer(engine, data.byteLength, undefined, 'crowd-bake');
          nb.update(data);
          mat.setStorageBuffer('crowdBake', nb); bake.dispose(); bake = nb;
          cl.forEach((c, k) => { byName[c.name] = k; clips[k * 4] = c.first; clips[k * 4 + 1] = c.frames; clips[k * 4 + 2] = c.period; clips[k * 4 + 3] = c.speed; });
          crowd.ready = true; wk.terminate(); engine.snapshotRenderingReset?.(); resolve(crowd);
        };
        wk.postMessage({ base, specs: CROWD_MOTIONS });
      });
    },
    /**
     * Place the figures: [{ x, y, z (world), yaw, scale, motion (name), t (offset s), walk (range m, walkers), dye [r, g, b] }].
     * Fewer than CROWD_MAX: the rest are hidden.
     */
    set(list) {
      figs.fill(0);
      const m = Math.min(list.length, CROWD_MAX);
      for (let k = 0; k < m; k++) {
        const f = list[k], o = k * 12, dye = f.dye || [1.4, 1.4, 1.35];
        figs[o] = f.x; figs[o + 1] = f.y; figs[o + 2] = f.z; figs[o + 3] = f.yaw || 0;
        figs[o + 4] = f.scale || 1; figs[o + 5] = byName[f.motion] ?? 0; figs[o + 6] = f.t || 0; figs[o + 7] = f.motion === 'walk' || f.motion === 'run' ? (f.walk || 20) : 0;
        figs[o + 8] = dye[0]; figs[o + 9] = dye[1]; figs[o + 10] = dye[2]; figs[o + 11] = crowd.shown ? 1 : 0;
      }
      figBuf.update(figs);
      crowd.count = m;
    },
    /** Show or hide every placed figure. */
    show(on) { const v = on && crowd.ready ? 1 : 0; for (let k = 0; k < crowd.count; k++) figs[k * 12 + 11] = v; figBuf.update(figs); crowd.shown = !!v; },
    shown: false,
    /** The crowd's clock (s). */
    update(t) { time.x = t; },
    freeze() { mat.freeze(); fastFrozenIsReady(mat); },
  };
  return crowd;
}
