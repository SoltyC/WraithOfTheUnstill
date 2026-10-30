// Light shafts in the slot canyons (Phase 9 D7b; dunes-design.md §7.2 "light shafts at the slot
// bends", p9r-needle-noon): thin volumetric slices across each slot every few metres, drawn
// additively. A slice's pixel glows only where the shadow map says the sun reaches that air, so the
// beams are exactly the sunlight getting in through the opening — strongest looking toward the sun,
// flecked with drifting dust — and nothing where the slot is in shade. Slices fade out within a few
// metres of the camera and beyond ~55 m, so only a handful overlap any pixel.

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
import { slotShaftVertexWGSL, slotShaftFragmentWGSL } from '../shaders/slotShafts.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

const STEP = 3.5;     // m between slices along a slot
const HALF_W = 6;     // half-width of a slice (the 10 m trench and a little)
const RISE = 44;      // floor to above the rim (m)

/**
 * @param {{ kind: string, pts: number[][] }[]} spines  the ravines' spines (world/ravines.json: x, z, half-width, floor)
 * @param {{ collision: Float32Array }[]} chunks  the wall kit's chunks (render/canyonWalls.js): their collision lines carry
 *   each wall's top, so a slice stands only as high as the walls beside it (open air above a rim is all sunlit).
 */
export function createSlotShafts(scene, atmo, shadows, bindShadows, spines, chunks) {
  /** The highest wall top within 9 m of (x, z), or −Infinity. */
  const rimAt = (x, z) => {
    let top = -Infinity;
    for (const c of chunks) {
      if (Math.hypot(c.cx - x, c.cz - z) > c.radius + 10) continue;
      const L = c.collision;
      for (let o = 0; o < L.length; o += 7) if ((L[o] - x) ** 2 + (L[o + 1] - z) ** 2 < 81 && L[o + 5] > top) top = L[o + 5];
    }
    return top;
  };
  ShaderStore.ShadersStoreWGSL.slotShaftVertexShader = slotShaftVertexWGSL;
  ShaderStore.ShadersStoreWGSL.slotShaftFragmentShader = slotShaftFragmentWGSL;
  const pos = [], shaft = [], idx = [];
  for (const sp of spines) {
    if (sp.kind !== 'slot') continue;
    const P = sp.pts;
    let carry = 0;
    for (let k = 0; k < P.length - 1; k++) {
      const [ax, az, , af] = P[k], [bx, bz, , bf] = P[k + 1];
      const len = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / len, tz = (bz - az) / len, nx = -tz, nz = tx;
      let s = carry;
      for (; s < len; s += STEP) {
        const t = s / len, x = ax + (bx - ax) * t, z = az + (bz - az) * t, f = af + (bf - af) * t - 1;
        const rise = Math.min(RISE, rimAt(x, z) - 1.5 - f);
        if (!(rise > 4)) continue;
        const b = pos.length / 3, seed = (pos.length / 12) * 0.618 % 1;
        for (const [u, v] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
          pos.push(x + nx * u * HALF_W, f + v * rise, z + nz * u * HALF_W);
          shaft.push(u, v, seed, 0);
        }
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
      carry = s - len;
    }
  }
  const mesh = new Mesh('slotShafts', scene);
  const vd = new VertexData(); vd.positions = new Float32Array(pos); vd.indices = new Uint32Array(idx); vd.applyToMesh(mesh, false);
  mesh.setVerticesData('shaft', new Float32Array(shaft), false, 4);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
  const params = new Vector4(0, 1, 0, 0);
  const mat = new ShaderMaterial('slotShafts', scene, { vertex: 'slotShaft', fragment: 'slotShaft' }, {
    attributes: ['position', 'shaft'],
    uniforms: ['viewProjection', 'shaftParams', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES],
    storageBuffers: [...ATMO_MATERIAL_BUFFERS, 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
    needAlphaBlending: true,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo); bindShadows(mat, shadows);
  mat.setVector4('shaftParams', params);
  mat.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;
  mat.disableDepthWrite = true;
  mat.backFaceCulling = false;
  mesh.material = mat;
  mat.freeze(); fastFrozenIsReady(mat);
  return {
    mesh, material: mat, slices: idx.length / 6,
    /** Owner fields: time (s, the dust's drift), strength (0 off … 1). */
    time: 0.5, strength: 1, debug: 0,
    update() { params.x = this.time; params.y = this.strength; params.z = this.debug; },
  };
}
