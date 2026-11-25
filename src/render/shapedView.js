// The Shaped's renderer: one mesh holding every chunk slot of the pool (an icosphere per chunk,
// chunk index in uv.x), records from the Shaped system uploaded once per frame. Opaque,
// shadow-casting. The material variant (frost / meadow kinds) rides in each chunk record's kind,
// so one pipeline serves every Shaped. Empty slots collapse in the vertex shader (fixed draw: snapshot rendering).

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { CreateIcoSphereVertexData } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder.js';
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { shapedVertexWGSL, shapedFragmentWGSL, shapedPieceVertexWGSL, shapedPieceFragmentWGSL } from '../shaders/shaped.wgsl.js';
import { MAT_SAMPLERS, bindMaterialLibrary } from '../materials/library.js';
import { wardenVertexWGSL, wardenFragmentWGSL } from '../shaders/warden.wgsl.js';
import { bellwetherVertexWGSL, bellwetherFragmentWGSL } from '../shaders/bellwether.wgsl.js';
import { emberWardenVertexWGSL, emberWardenFragmentWGSL } from '../shaders/emberWarden.wgsl.js';
import { emberWardenPieceFragmentWGSL } from '../shaders/emberWardenPiece.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {any} atmo
 * @param {Float32Array} chunks  records (16 floats each) owned by the Shaped system
 */
export function createShapedView(scene, atmo, chunks, opts = {}) {
  ShaderStore.ShadersStoreWGSL.shapedVertexShader = shapedVertexWGSL;
  ShaderStore.ShadersStoreWGSL.shapedFragmentShader = shapedFragmentWGSL;
  ShaderStore.ShadersStoreWGSL.shapedPieceVertexShader = shapedPieceVertexWGSL;
  ShaderStore.ShadersStoreWGSL.shapedPieceFragmentShader = shapedPieceFragmentWGSL;
  ShaderStore.ShadersStoreWGSL.wardenVertexShader = wardenVertexWGSL;
  ShaderStore.ShadersStoreWGSL.wardenFragmentShader = wardenFragmentWGSL;
  ShaderStore.ShadersStoreWGSL.bellwetherVertexShader = bellwetherVertexWGSL;
  ShaderStore.ShadersStoreWGSL.bellwetherFragmentShader = bellwetherFragmentWGSL;
  ShaderStore.ShadersStoreWGSL.emberWardenVertexShader = emberWardenVertexWGSL;
  ShaderStore.ShadersStoreWGSL.emberWardenFragmentShader = emberWardenFragmentWGSL;
  ShaderStore.ShadersStoreWGSL.emberWardenPieceVertexShader = shapedPieceVertexWGSL;
  ShaderStore.ShadersStoreWGSL.emberWardenPieceFragmentShader = emberWardenPieceFragmentWGSL;
  // Sculpted pieces (render/shapedPieces.js): chunks whose kind has a family take an authored mesh
  // (uv.y = 1, its atlas place in uv2, its normal); the rest keep the icosphere clod.
  const pieces = opts.pieces || null;
  const shader = pieces ? (opts.pieceShader || 'shapedPiece') : (opts.shader || 'shaped');
  const engine = scene.getEngine();
  const count = chunks.length / 16;
  const ico = CreateIcoSphereVertexData({ radius: 1, subdivisions: opts.subdivisions ?? 1, flat: false });
  const geo = new Array(count);
  let tv = 0, ti = 0;
  for (let c = 0; c < count; c++) {
    const pc = pieces ? pieces.set.pick(pieces.kinds[c], pieces.seeds[c], pieces.lod) : null;
    geo[c] = pc;
    tv += (pc ? pc.positions.length : ico.positions.length) / 3; ti += pc ? pc.indices.length : ico.indices.length;
  }
  const pos = new Float32Array(tv * 3), uv = new Float32Array(tv * 2), idx = new Uint32Array(ti);
  const nrm = pieces ? new Float32Array(tv * 3) : null, uv2 = pieces ? new Float32Array(tv * 2) : null;
  let vo = 0, io = 0;
  for (let c = 0; c < count; c++) {
    const pc = geo[c], P = pc ? pc.positions : ico.positions, I = pc ? pc.indices : ico.indices, nv = P.length / 3;
    pos.set(P, vo * 3);
    if (nrm) { nrm.set(pc ? pc.normals : ico.positions, vo * 3); if (pc) uv2.set(pc.uvs, vo * 2); }
    for (let v = 0; v < nv; v++) { uv[(vo + v) * 2] = c; uv[(vo + v) * 2 + 1] = pc ? 1 : 0; }
    for (let k = 0; k < I.length; k++) idx[io + k] = I[k] + vo;
    vo += nv; io += I.length;
  }
  const name = opts.name || 'shaped';
  const mesh = new Mesh(name, scene);
  const vd = new VertexData(); vd.positions = pos; vd.uvs = uv; vd.indices = idx;
  if (nrm) { vd.normals = nrm; vd.uvs2 = uv2; }
  vd.applyToMesh(mesh, false);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
  const buf = new StorageBuffer(engine, chunks.byteLength, undefined, name + '-chunks');
  buf.update(chunks);
  // Optional neighbour lists (the Warden's smooth-mass shading).
  const nbr = opts.neighbours || null;
  const nbrBuf = nbr ? new StorageBuffer(engine, nbr.byteLength, undefined, name + '-nbr') : null;
  if (nbrBuf) nbrBuf.update(nbr);
  const sbufs = nbr ? ['chunkData', 'chunkNbr'] : ['chunkData'];
  const attributes = pieces ? ['position', 'uv', 'uv2'] : ['position', 'uv'];
  const mat = new ShaderMaterial(name, scene, { vertex: shader, fragment: shader }, {
    attributes,
    uniforms: ['viewProjection', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES, ...(pieces ? ['pieceAtlas', ...(pieces.set.mask ? ['pieceMask'] : []), ...MAT_SAMPLERS] : [])],
    storageBuffers: [...sbufs, ...ATMO_MATERIAL_BUFFERS, 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo);
  mat.setStorageBuffer('chunkData', buf);
  if (nbrBuf) mat.setStorageBuffer('chunkNbr', nbrBuf);
  if (pieces) { mat.setTexture('pieceAtlas', pieces.set.atlas); if (pieces.set.mask) mat.setTexture('pieceMask', pieces.set.mask); bindMaterialLibrary(mat, pieces.matLib); }
  mesh.material = mat;
  // Depth prepass (opts.prepass; drawn first: render/trees.js orders 'shapedZ' meshes with the
  // leaves'): the colour pass then shades each visible pixel once, however many of the body's
  // overlapping masses lie behind it (the Walker's hull and legs overlap many deep).
  let zMesh = null, zMat = null;
  if (opts.prepass) {
    zMesh = new Mesh('shapedZ-' + name, scene, null, mesh);
    zMesh.alwaysSelectAsActiveMesh = true; zMesh.doNotSyncBoundingInfo = true; zMesh.freezeWorldMatrix();
    zMat = new ShaderMaterial('shapedZ-' + name, scene, { vertex: shader, fragment: 'shadowDepth' }, {
      attributes, uniforms: ['viewProjection', 'shadowLight', 'shadowOrigin'], storageBuffers: sbufs, shaderLanguage: ShaderLanguage.WGSL,
    });
    zMat.setStorageBuffer('chunkData', buf);
    if (nbrBuf) zMat.setStorageBuffer('chunkNbr', nbrBuf);
    zMat.disableColorWrite = true;
    zMesh.material = zMat;
    mat.depthFunction = Constants.EQUAL;
  }
  return {
    mesh, material: mat, zMesh,
    /** Show or hide the view (and its prepass). */
    setEnabled(on) { mesh.setEnabled(on); if (zMesh) zMesh.setEnabled(on); },
    makeShadowMaterial(name, light, origin) {
      const m = new ShaderMaterial(name, scene, { vertex: shader, fragment: 'shadowDepth' }, {
        attributes, uniforms: ['viewProjection', 'shadowLight', 'shadowOrigin'],
        storageBuffers: sbufs, shaderLanguage: ShaderLanguage.WGSL,
      });
      m.setStorageBuffer('chunkData', buf);
      if (nbrBuf) m.setStorageBuffer('chunkNbr', nbrBuf);
      m.setVector4('shadowLight', light); m.setVector4('shadowOrigin', origin);
      return m;
    },
    freeze() { mat.freeze(); fastFrozenIsReady(mat); if (zMat) { zMat.freeze(); fastFrozenIsReady(zMat); } },
    update() { buf.update(chunks); },
    /** Re-upload the neighbour lists (they change only when the rig is re-measured). */
    updateNeighbours() { if (nbrBuf) nbrBuf.update(nbr); },
  };
}
