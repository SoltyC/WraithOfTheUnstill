// Scanned PBR materials at runtime (DECISIONS.md "Scans first"; built by tools/textures/build.mjs
// from data/materials/sources.json). Three texture arrays, one layer per material:
//   matAlb  albedo (rgba8unorm-srgb, size²)
//   matNrm  normal x, normal y (GL, tangent space), roughness (rgba8unorm, size²)
//   matHgt  height, ambient occlusion (rgba8unorm, (size/2)²)
// The packed WebPs are decoded by the browser (createImageBitmap, off the main thread) and copied
// straight into the GPU textures — no CPU readback — then every layer gets its mip chain on the
// GPU. All of it happens behind the loading screen (BRIEF §15); materials bind the three arrays
// with bindMaterialLibrary() and sample them through shaders/materials.wgsl.js.

import SRC from '../../data/materials/sources.json';
import { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';

/** Layer index by material id (also exported to WGSL as MAT_* constants). */
export const MAT = Object.fromEntries(SRC.materials.map((m) => [m.id, m.layer]));
export const MAT_SAMPLERS = ['matAlb', 'matNrm', 'matHgt'];

const USAGE = 0x04 /* TEXTURE_BINDING */ | 0x02 /* COPY_DST */ | 0x10 /* RENDER_ATTACHMENT */;
const mipCount = (s) => Math.floor(Math.log2(s)) + 1;

/**
 * Load every material into the arrays. Resolves when the textures are filled and mipmapped.
 * @param {any} engine  WebGPUEngine
 * @param {any} scene
 */
export async function loadMaterialLibrary(engine, scene) {
  const dev = engine._device;
  const n = SRC.materials.length, S = SRC.size, H = S / 2;
  const make = (format, size, label) => dev.createTexture({ label, size: [size, size, n], format, mipLevelCount: mipCount(size), usage: USAGE, dimension: '2d' });
  const sets = [
    { key: 'alb', tex: make('rgba8unorm-srgb', S, 'mat-albedo'), size: S },
    { key: 'nrm', tex: make('rgba8unorm', S, 'mat-normal'), size: S },
    { key: 'hgt', tex: make('rgba8unorm', H, 'mat-height'), size: H },
  ];
  const base = import.meta.env.BASE_URL + 'textures/';
  await Promise.all(SRC.materials.map(async (m) => {
    for (const s of sets) {
      const blob = await (await fetch(base + m.id + '.' + s.key + '.webp')).blob();
      const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      dev.queue.copyExternalImageToTexture({ source: bmp }, { texture: s.tex, origin: [0, 0, m.layer], premultipliedAlpha: false }, [s.size, s.size, 1]);
      bmp.close();
    }
  }));
  // Mips per layer (Babylon's render-pass mip generator; its pipelines are created here, at load).
  const tm = engine._textureHelper;
  for (const s of sets) for (let l = 0; l < n; l++) tm.generateMipmaps(s.tex, mipCount(s.size), l);
  const wrap = (s) => {
    const it = engine.wrapWebGPUTexture(s.tex);
    it.is2DArray = true; it.depth = n; it.baseDepth = n; it.generateMipMaps = true; it.type = 0; it.format = 5;
    it._useSRGBBuffer = s.key === 'alb';
    // A wrapped texture has no view yet: make the 2D-array view over every mip and layer.
    it._hardwareTexture.setUsage(0, true, true, false, false, s.size, s.size, n);
    // The WebGPU sampler is read from the internal texture (it is the TextureSampler): trilinear,
    // mipmapped, repeating, anisotropic. (Left at its defaults it sampled nearest — blocky texels,
    // worst at reduced render scale where coarser mips are chosen.)
    it.samplingMode = Constants.TEXTURE_TRILINEAR_SAMPLINGMODE;
    it.useMipMaps = true;
    it.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE; it.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE; it.wrapR = Constants.TEXTURE_WRAP_ADDRESSMODE;
    it._cachedAnisotropicFilteringLevel = 8;
    const t = new BaseTexture(scene, it);
    t.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE; t.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
    t.anisotropicFilteringLevel = 8;
    t.name = 'mat-' + s.key;
    return t;
  };
  return { alb: wrap(sets[0]), nrm: wrap(sets[1]), hgt: wrap(sets[2]), count: n };
}

/** Bind the library's arrays to a ShaderMaterial (declare MAT_SAMPLERS in its samplers). */
export function bindMaterialLibrary(mat, lib) {
  mat.setTexture('matAlb', lib.alb); mat.setTexture('matNrm', lib.nrm); mat.setTexture('matHgt', lib.hgt);
}
