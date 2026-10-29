// The ravine wall kit's meshes (world/canyonKit.js, built by world/canyon.worker.js) and its one
// material (shaders/canyon.wgsl.js). Each chunk shows one level of detail by the camera's distance
// to its edge (with hysteresis); the near level is built on request and freed again when the camera
// leaves. Snapshot rendering replays recorded bundles, so meshes are switched by setEnabled and the
// recording is reset only when a set actually changes (as systems/architecture.js does).
// A hidden three-vertex mesh draws from the first frame so the colour and shadow pipelines are made
// behind the loading screen, whenever the worker's chunks arrive (BRIEF §15: no late pipelines).

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { canyonVertexWGSL, canyonFragmentWGSL } from '../shaders/canyon.wgsl.js';
import { CANYON_LODS } from '../world/canyonKit.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';
import { MAT_SAMPLERS, bindMaterialLibrary } from '../materials/library.js';
import { SHADOW_SPLITS } from './shadows.js';

const HYST = 30;           // m of hysteresis on every distance switch
const NEAR_KEEP = 520;     // a built near level is freed beyond this (m)
const SHADOW_MARGIN = 60;  // a chunk casts into cascade c within its split plus this (m)

/**
 * @param {import('@babylonjs/core').Scene} scene
 */
export function createCanyonWalls(scene, atmo, matLib, shadows, bindShadows) {
  const engine = scene.getEngine();
  ShaderStore.ShadersStoreWGSL.canyonVertexShader = canyonVertexWGSL;
  ShaderStore.ShadersStoreWGSL.canyonFragmentShader = canyonFragmentWGSL;
  const attributes = ['position', 'normal', 'uv', 'cliff'];
  const mat = new ShaderMaterial('canyon', scene, { vertex: 'canyon', fragment: 'canyon' }, {
    attributes,
    uniforms: ['viewProjection', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES, ...MAT_SAMPLERS],
    storageBuffers: [...ATMO_MATERIAL_BUFFERS, 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo); bindMaterialLibrary(mat, matLib); bindShadows(mat, shadows);
  mat.backFaceCulling = false;
  const shadowMats = new Map();
  const makeShadowMaterial = (name, light, origin) => {
    if (shadowMats.has(light)) return shadowMats.get(light);
    const m = new ShaderMaterial(name, scene, { vertex: 'canyon', fragment: 'shadowDepth' }, {
      attributes, uniforms: ['viewProjection', 'shadowLight', 'shadowOrigin'], shaderLanguage: ShaderLanguage.WGSL,
    });
    m.setVector4('shadowLight', light); m.setVector4('shadowOrigin', origin);
    m.backFaceCulling = false;
    shadowMats.set(light, m);
    return m;
  };
  const meshOf = (name, g, cx = 0, cz = 0, r = 1, y0 = -1, y1 = 1) => {
    const m = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = g.positions; vd.normals = g.normals; vd.uvs = g.uvs; vd.indices = g.indices;
    vd.applyToMesh(m, false);
    m.setVerticesData('cliff', g.cliff, false, 4);
    m.alwaysSelectAsActiveMesh = true;
    m.setBoundingInfo(new BoundingInfo(new Vector3(cx - r, y0, cz - r), new Vector3(cx + r, y1, cz + r)));
    m.freezeWorldMatrix(); m.doNotSyncBoundingInfo = true;
    m.material = mat;
    return m;
  };
  // The warm-up mesh: one degenerate-looking triangle far under the world.
  const warm = meshOf('canyonWarm', {
    positions: new Float32Array([0, -5000, 0, 0.01, -5000, 0, 0, -5000, 0.01]), normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
    uvs: new Float32Array(6), cliff: new Float32Array(12), indices: new Uint32Array([0, 1, 2]),
  });
  shadows.addCaster(warm, makeShadowMaterial, 1, 1);

  /** Chunks: { cx, cz, radius, y0, y1, mesh: [near, mid, far], shown: lod or −1, want, pending, cast: [c0, c1] }. */
  const chunks = [];
  let ready = false, inFlight = 0;
  const worker = new Worker(new URL('../world/canyon.worker.js', import.meta.url), { type: 'module' });
  const view = {
    chunks, material: mat, ready: false,
    /** Owner fields: camera position (x, z); set before update(). */
    camX: 0.5, camZ: 0.5,
    /** Disabled (dev toggle): nothing shows. */
    on: true,
    update() {
      if (!ready) return;
      let changed = false;
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const d = Math.hypot(c.cx - this.camX, c.cz - this.camZ) - c.radius;
        // The wanted level, with hysteresis toward the one shown.
        let want = -1;
        for (let l = 0; l < CANYON_LODS.length; l++) {
          const r = CANYON_LODS[l].range + (c.shown === l ? HYST : c.shown >= 0 && c.shown < l ? -HYST : 0);
          if (d < r) { want = l; break; }
        }
        if (!this.on) want = -1;
        // The near level, built on request (two at a time); the mid one stands in meanwhile.
        if (want === 0 && !c.mesh[0]) {
          if (!c.pending && inFlight < 2) { c.pending = true; inFlight++; worker.postMessage({ type: 'build', i, l: 0 }); }
          want = 1;
        }
        if (want !== c.shown) {
          if (c.shown >= 0) c.mesh[c.shown].setEnabled(false);
          if (want >= 0) c.mesh[want].setEnabled(true);
          c.shown = want; changed = true;
        }
        // Shadows: only the near level casts, into cascade 1 (casters are not culled per cascade, and
        // the whole near mesh in the 24 m cascade 0 cost ~0.35 ms; cascade 0's receivers also read 1).
        // Farther off, the terrain's own risers cast the canyon's shade.
        for (let ci = 1; ci < 2; ci++) {
          const r = SHADOW_SPLITS[ci] + SHADOW_MARGIN, w = c.shown === 0 && d < (c.cast[ci] ? r + HYST : r);
          if (w !== c.cast[ci]) { if (c.mesh[0]) shadows.setCasterActive(c.mesh[0], ci, w); c.cast[ci] = w; changed = true; }
        }
        // Free a near level the camera has left.
        if (c.mesh[0] && c.shown !== 0 && d > NEAR_KEEP) {
          c.cast[0] = c.cast[1] = false;
          for (let ci = 0; ci < 2; ci++) shadows.setCasterActive(c.mesh[0], ci, false);
          c.mesh[0].dispose(); c.mesh[0] = null; changed = true;
        }
      }
      if (changed) engine.snapshotRenderingReset();
    },
    freeze() { mat.freeze(); fastFrozenIsReady(mat); },
  };
  view.whenReady = new Promise((resolve) => {
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'init') {
        m.chunks.forEach((meta, i) => {
          const c = { ...meta, mesh: [null, null, null], shown: -1, pending: false, cast: [false, false] };
          for (let l = 1; l < CANYON_LODS.length; l++) {
            const mesh = meshOf('canyon' + l + '_' + meta.key, m.lods[i][l - 1], meta.cx, meta.cz, meta.radius, meta.y0, meta.y1);
            mesh.setEnabled(false);
            c.mesh[l] = mesh;
          }
          chunks.push(c);
        });
        ready = view.ready = true;
        engine.snapshotRenderingReset();
        resolve();
      } else if (m.type === 'build') {
        const c = chunks[m.i];
        inFlight--; c.pending = false;
        const mesh = meshOf('canyon0_' + c.key, m.geo, c.cx, c.cz, c.radius, c.y0, c.y1);
        mesh.setEnabled(false);
        shadows.addCaster(mesh, makeShadowMaterial, 1, 1);
        for (let ci = 0; ci < 2; ci++) shadows.setCasterActive(mesh, ci, false);
        c.mesh[0] = mesh;
      }
    };
  });
  worker.postMessage({ type: 'init', url: new URL(import.meta.env.BASE_URL + 'world/ravines.json', location.href).href });
  return view;
}
