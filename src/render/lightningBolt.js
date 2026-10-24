// The lightning bolt's mesh (Phase 8 M11): MAX_SEGMENTS camera-facing ribbons (shaders/lightning.wgsl.js)
// rebuilt for each strike from world/boltShape.js — one upload per strike, nothing per frame but the
// brightness. A core draw (writes depth, see the shader) and a glow draw share the geometry.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { boltVertexWGSL, boltFragmentWGSL } from '../shaders/lightning.wgsl.js';
import { MAX_SEGMENTS, buildBolt } from '../world/boltShape.js';
import { bindEnvironment } from './environment.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

/** @param {import('@babylonjs/core').Scene} scene */
export function createLightningBolt(scene) {
  ShaderStore.ShadersStoreWGSL.boltVertexShader = boltVertexWGSL;
  ShaderStore.ShadersStoreWGSL.boltFragmentShader = boltFragmentWGSL;
  const n = MAX_SEGMENTS;
  const pos = new Float32Array(n * 4 * 3), other = new Float32Array(n * 4 * 3), uv = new Float32Array(n * 4 * 2);
  const idx = new Uint32Array(n * 6), seg = new Float32Array(n * 8);
  for (let s = 0; s < n; s++) {
    for (let k = 0; k < 4; k++) { uv[(s * 4 + k) * 2] = k === 0 || k === 3 ? -1 : 1; uv[(s * 4 + k) * 2 + 1] = 1; }
    const v = s * 4, o = s * 6;
    idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
  }
  const mesh = new Mesh('lightningBolt', scene);
  const vd = new VertexData(); vd.positions = pos; vd.normals = other; vd.uvs = uv; vd.indices = idx;
  vd.applyToMesh(mesh, true);
  const fogV = new Vector4(0, 0, 0, 0), coreV = new Vector4(0, 0, 0, 0), glowV = new Vector4(0, 1, 0, 0);
  const make = (name, bolt, depth) => {
    const mat = new ShaderMaterial(name, scene, { vertex: 'bolt', fragment: 'bolt' }, {
      attributes: ['position', 'normal', 'uv'], uniforms: ['viewProjection', 'bolt', 'boltFog', ...ENV_UNIFORMS], shaderLanguage: ShaderLanguage.WGSL, needAlphaBlending: true,
    });
    bindEnvironment(mat);
    mat.setVector4('bolt', bolt); mat.setVector4('boltFog', fogV);
    mat.alphaMode = Constants.ALPHA_ONEONE;
    mat.disableDepthWrite = !depth;
    mat.backFaceCulling = false;
    mat.freeze(); fastFrozenIsReady(mat);
    return mat;
  };
  mesh.material = make('boltCore', coreV, true);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
  const glowMesh = mesh.clone('lightningGlow');
  glowMesh.material = make('boltGlow', glowV, false);
  glowMesh.alwaysSelectAsActiveMesh = true; glowMesh.doNotSyncBoundingInfo = true;
  let built = -1;
  return {
    mesh, glowMesh,
    /** Owner fields: brightness 0..1 (this frame), the weather fog's base density, falloff and base height. */
    brightness: 0.5 - 0.5, fogDensity: 0.5 - 0.5, fogFalloff: 0.5 - 0.5, fogBase: 0.5 - 0.5,
    /** Rebuild for a strike (version-gated): from the cloud over (topX, topZ) at topY down to the ground point. */
    build(version, seed, topX, topY, topZ, gx, gy, gz) {
      if (version === built) return;
      built = version;
      const count = buildBolt(seed, topX, topY, topZ, gx, gy, gz, seg);
      for (let s = 0; s < n; s++) {
        const o = s * 8;
        for (let k = 0; k < 4; k++) {
          // k 0,1 sit at the start, 2,3 at the end; each carries the other end.
          const end = k < 2 ? 0 : 4, oth = k < 2 ? 4 : 0, v = (s * 4 + k) * 3;
          if (s < count) {
            pos[v] = seg[o + end]; pos[v + 1] = seg[o + end + 1]; pos[v + 2] = seg[o + end + 2];
            other[v] = seg[o + oth]; other[v + 1] = seg[o + oth + 1]; other[v + 2] = seg[o + oth + 2];
            uv[(s * 4 + k) * 2 + 1] = seg[o + end + 3];
          } else { pos[v] = pos[v + 1] = pos[v + 2] = 0; other[v] = other[v + 1] = other[v + 2] = 0; uv[(s * 4 + k) * 2 + 1] = 0; }
        }
      }
      mesh.updateVerticesData(VertexBuffer.PositionKind, pos);
      mesh.updateVerticesData(VertexBuffer.NormalKind, other);
      mesh.updateVerticesData(VertexBuffer.UVKind, uv);
    },
    update() {
      coreV.x = glowV.x = this.brightness;
      fogV.x = this.fogDensity; fogV.y = this.fogFalloff; fogV.z = this.fogBase;
    },
  };
}
