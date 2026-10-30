// Sand ground blow and rising disturbance puffs: one bounded static draw, no per-particle CPU updates.
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { sandDustFragmentWGSL } from '../shaders/sandDust.wgsl.js';
import { duneCasterDustVertexWGSL } from '../shaders/duneCasterDust.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

// One fixed transparent draw, 14 bounded sources × 48 puffs; no particle objects or texture assets.
export function createDuneCasterDust(scene,atmo,shaped){
  ShaderStore.ShadersStoreWGSL.duneCasterDustVertexShader=duneCasterDustVertexWGSL;
  ShaderStore.ShadersStoreWGSL.duneCasterDustFragmentShader=sandDustFragmentWGSL;
  const n=14*48;
  const pos = new Float32Array(n * 4 * 3), idx = new Uint32Array(n * 6);
  const cx = [-1, 1, 1, -1], cy = [-1, -1, 1, 1];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) { const o = (i * 4 + k) * 3; pos[o] = i; pos[o + 1] = cx[k]; pos[o + 2] = cy[k]; }
    const v = i * 4, o = i * 6;
    idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
  }
  const mesh = new Mesh('duneCasterDust', scene);
  const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.applyToMesh(mesh, false);
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.doNotSyncBoundingInfo = true;
  mesh.freezeWorldMatrix();
  const mat=new ShaderMaterial('duneCasterDust',scene,{vertex:'duneCasterDust',fragment:'duneCasterDust'},{
    attributes:['position'],uniforms:['viewProjection','whirls',...ENV_UNIFORMS],
    samplers:[...ATMO_MATERIAL_TEXTURES,...SHADOW_TEXTURES],storageBuffers:[...ATMO_MATERIAL_BUFFERS,'shadowData'],
    shaderLanguage:ShaderLanguage.WGSL,needAlphaBlending:true,
  });
  bindEnvironment(mat);bindAtmosphere(mat,atmo);mat.setArray4('whirls',shaped.whirls);
  mat.alphaMode=Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;mat.disableDepthWrite=true;mat.backFaceCulling=false;mesh.material=mat;
  mat.freeze();fastFrozenIsReady(mat);
  return {mesh,material:mat,update(){mat.setArray4('whirls',shaped.whirls);}};
}
