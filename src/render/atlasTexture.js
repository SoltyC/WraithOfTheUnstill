// A canvas-drawn atlas uploaded as a mipmapped sRGB GPU texture, wrapped for Babylon (the leaf and
// ground-cover atlases: drawn at load, never fetched).

import { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';

/**
 * @param {any} engine  WebGPU engine
 * @param {import('@babylonjs/core').Scene} scene
 * @param {OffscreenCanvas} canvas  square, power of two
 * @param {string} label
 */
export function canvasAtlasTexture(engine, scene, canvas, label) {
  const dev = engine._device, size = canvas.width, mips = Math.floor(Math.log2(size)) + 1;
  const tex = dev.createTexture({ label, size: [size, size, 1], format: 'rgba8unorm-srgb', mipLevelCount: mips, usage: 0x04 | 0x02 | 0x10 });
  dev.queue.copyExternalImageToTexture({ source: canvas }, { texture: tex, premultipliedAlpha: false }, [size, size, 1]);
  engine._textureHelper.generateMipmaps(tex, mips, 0);
  const it = engine.wrapWebGPUTexture(tex);
  it.generateMipMaps = true; it._useSRGBBuffer = true; it.useMipMaps = true;
  it.samplingMode = Constants.TEXTURE_TRILINEAR_SAMPLINGMODE;
  it.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE; it.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
  it._cachedAnisotropicFilteringLevel = 4;
  it._hardwareTexture.setUsage(0, true, false, false, false, size, size, 1);
  return new BaseTexture(scene, it);
}
