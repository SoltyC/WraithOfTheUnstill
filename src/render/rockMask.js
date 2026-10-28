// Four MiB R8 data texture avoids exceeding the clipmap fragment's eight storage-buffer limit.
// It shares the bake's material classification; no new geology coordinates or rebake are needed.
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { createRockMask } from '../world/rockMask.js';
export function createRockMaskTexture(scene,streamer){
  const n=streamer.surfaceN;
  if(streamer.surfaceData.length!==n*n*4)throw new Error('Rock mask surface dimensions mismatch');
  const data=createRockMask(streamer.surfaceData,streamer.manifest.surface.materials.rock);
  const tex=RawTexture.CreateRTexture(data,n,n,scene,false,false,Texture.BILINEAR_SAMPLINGMODE,Constants.TEXTURETYPE_UNSIGNED_BYTE);
  tex.name='baked-rock-mask';tex.gammaSpace=false;tex.wrapU=Texture.CLAMP_ADDRESSMODE;tex.wrapV=Texture.CLAMP_ADDRESSMODE;
  return tex;
}
