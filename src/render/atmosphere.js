// Atmosphere system (BRIEF §5.2): owns the Hillaire LUTs and the per-frame passes.
// Exposes textures and a light buffer that the sky, terrain and character shaders bind:
//   transmittanceLut, skyViewSun, skyViewMoon, aerialLut (2D atlas) — sampled textures
//   atmoLight — storage buffer: [0] key light colour, [1] sky irradiance (up), [2] (side), [3] horizon
//   atmoParams — storage buffer with camera/sun/moon (AtmoParams)
// Per frame: one params upload, then sky-view, aerial-perspective and ambient dispatches.
// Transmittance and multi-scattering are rebuilt only when the haze changes.

import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { ComputeShader } from '@babylonjs/core/Compute/computeShader.js';
import '@babylonjs/core/Engines/WebGPU/Extensions/engine.computeShader.js';
import { Matrix } from '@babylonjs/core/Maths/math.vector.js';
import { transmittanceCS, multiScatCS, skyViewCS, aerialCS, ambientCS } from '../shaders/atmosphereCompute.wgsl.js';
import { AP_RES, AP_SLICES, SKYVIEW_W, SKYVIEW_H } from '../shaders/atmosphere.wgsl.js';
import { env } from './environment.js';
import { params as tunables } from '../core/params.js';
import { clock } from '../core/clock.js';

/** Illuminance of the sun and the (stylised, far brighter than real) moon, in the renderer's
 *  units: sunlit Lambert ground (albedo/π · E · cosθ) lands mid-scale before exposure, and the sky
 *  LUT radiance stays physically consistent with it. */
export const SUN_ILLUMINANCE = 8.2;
export const MOON_ILLUMINANCE = 0.11;
/** Night ambient floor (radiance) so night never reads black; scaled by the night factor. */
export const NIGHT_FLOOR = 0.005;

const invVP = new Matrix();
const vp = new Matrix();

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {import('@babylonjs/core').Camera} camera
 * @param {import('@babylonjs/core').StorageBuffer} biomeA  world biome weights (exposure compensation)
 */
/** Crown cover map: CANOPY_N² texels over the 8192 m world (4 m). */
export const CANOPY_N = 2048;

export function createAtmosphere(scene, camera, biomeA) {
  const engine = scene.getEngine();
  const tex = (w, h, name) => {
    const t = new RawTexture(null, w, h, Constants.TEXTUREFORMAT_RGBA, scene, false, false,
      Constants.TEXTURE_BILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_HALF_FLOAT, Constants.TEXTURE_CREATIONFLAG_STORAGE);
    t.name = name;
    t.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE; t.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    return t;
  };
  const transmittanceLut = tex(256, 64, 'atmo-transmittance');
  const multiScatLut = tex(32, 32, 'atmo-multiscatter');
  const skyViewSun = tex(SKYVIEW_W, SKYVIEW_H, 'atmo-skyview-sun');
  const skyViewMoon = tex(SKYVIEW_W, SKYVIEW_H, 'atmo-skyview-moon');
  const aerialLut = tex(AP_RES * AP_SLICES, AP_RES, 'atmo-aerial');

  const paramsData = new Float32Array(36);
  const atmoParams = new StorageBuffer(engine, paramsData.byteLength, undefined, 'atmo-params');
  const atmoLight = new StorageBuffer(engine, 13 * 16, undefined, 'atmo-light'); // key, sky up/side, horizon+exposure, 9 SH
  // Frame meter, written by the post chain's metering pass (post/meter.js); zero = no meter yet.
  const meterBuf = new StorageBuffer(engine, 16, undefined, 'exposure-meter');

  /** Bind list entries: [name, kind, value]; kinds: buffer | storageTex | tex | sampler (paired with the tex after it). */
  const cs = (name, code, bind) => {
    const mapping = {};
    bind.forEach(([n], k) => { mapping[n] = { group: 0, binding: k }; });
    const s = new ComputeShader(name, engine, { computeSource: code }, { bindingsMapping: mapping });
    for (const [n, kind, value] of bind) {
      if (kind === 'buffer') s.setStorageBuffer(n, value);
      else if (kind === 'storageTex') s.setStorageTexture(n, value);
      else if (kind === 'tex') s.setTexture(n, value, true); // also binds `${n}Sampler`
    }
    return s;
  };
  // Binding order must match the @binding indices in atmosphereCompute.wgsl.js.
  const P = ['P', 'buffer', atmoParams];
  // Sampler entries precede their textures (Babylon binds the sampler at texture binding − 1).
  const T = [['transmittanceLutSampler', 'sampler'], ['transmittanceLut', 'tex', transmittanceLut]];
  const M = [['multiScatLutSampler', 'sampler'], ['multiScatLut', 'tex', multiScatLut]];
  const csTrans = cs('atmoTransmittance', transmittanceCS, [P, ['outTex', 'storageTex', transmittanceLut]]);
  const csMS = cs('atmoMultiScatter', multiScatCS, [P, ['outTex', 'storageTex', multiScatLut], ...T]);
  const csSky = cs('atmoSkyView', skyViewCS, [P, ['outSun', 'storageTex', skyViewSun], ...T, ...M, ['outMoon', 'storageTex', skyViewMoon]]);
  const csAerial = cs('atmoAerial', aerialCS, [P, ['outTex', 'storageTex', aerialLut], ...T, ...M]);
  const csAmbient = cs('atmoAmbient', ambientCS, [P, ['outLight', 'buffer', atmoLight], ...T, ['skySunSampler', 'sampler'], ['skySun', 'tex', skyViewSun], ['skyMoonSampler', 'sampler'], ['skyMoon', 'tex', skyViewMoon], ['biomeA', 'buffer', biomeA], ['meter', 'buffer', meterBuf]]);

  // World crown cover (render/trees.js fills it once the trees are placed; empty until then).
  const canopyTex = new RawTexture(new Uint8Array(CANOPY_N * CANOPY_N), CANOPY_N, CANOPY_N, Constants.TEXTUREFORMAT_R, scene, false, false,
    Constants.TEXTURE_BILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
  canopyTex.name = 'canopy'; canopyTex.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE; canopyTex.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;

  let builtHaze = NaN;
  return {
    canopyTex,
    transmittanceLut, multiScatLut, skyViewSun, skyViewMoon, aerialLut, atmoParams, atmoLight, meterBuf,
    /** Weather inputs (world/weather.js): cloud cover and snowfall, 0..1. */
    cover: 0.5 - 0.5, snow: 0.5 - 0.5,
    /** Closed share of the cloud deck (0..1), derived from cover each frame. */
    deck: 0.5 - 0.5,
    /** Snap exposure every frame (frozen-clock captures: converge, never ease). */
    alwaysSnap: false,
    /** True once the static LUTs exist (the first frames may still be compiling pipelines). */
    ready: false,
    /** Set to jump exposure to its target next frame (teleports, photo spots). */
    snapExposure: true,
    update() {
      const p = paramsData;
      // invViewProj of the camera as it will render this frame (force-refresh the cached
      // matrices so aerial perspective never lags a frame behind camera motion).
      // Babylon's m[] order is column-major as WGSL expects.
      camera.getViewMatrix(true).multiplyToRef(camera.getProjectionMatrix(true), vp);
      vp.invertToRef(invVP);
      const m = invVP.m;
      for (let i = 0; i < 16; i++) p[i] = m[i];
      const c = camera.position;
      p[16] = c.x; p[17] = c.y; p[18] = c.z; p[19] = Math.max(c.y, 0) * 0.001;
      const s = env.sunDir, mo = env.moonDir;
      // The cloud deck (weather) dims the sun and moon reaching the sky, the air and the ground;
      // the overcast sky itself is added to the IBL in the ambient pass and drawn by the clouds.
      // Steeper as the deck closes: scattered cloud barely dims, a snowing deck leaves ~15 %.
      // Scattered cloud (cover ≤ 0.35, "clear") leaves the sun alone; under a closing deck the
      // direct sun all but goes (overcast ≈ 4 %, snowfall ≈ 2 %). It has to: at a low sun even a
      // tenth of the sun on a slope facing it outshines the dim overcast sky, which is lit by the
      // sun's height, not its angle to the slope — the first target shots kept hard warm shadows.
      const cc = Math.min(1, Math.max(0, (this.cover - 0.35) / 0.65));
      this.deck = cc;
      const dim = 0.015 + 0.985 * (1 - cc) * (1 - cc) * (1 - cc);
      p[20] = s.x; p[21] = s.y; p[22] = s.z; p[23] = SUN_ILLUMINANCE * dim;
      p[24] = mo.x; p[25] = mo.y; p[26] = mo.z; p[27] = MOON_ILLUMINANCE * dim;
      p[32] = this.cover; p[33] = SUN_ILLUMINANCE; p[34] = MOON_ILLUMINANCE; p[35] = this.snow;
      const haze = tunables.v.fogDensity;
      p[28] = haze; p[29] = NIGHT_FLOOR * env.night; p[30] = clock.realDt; p[31] = this.snapExposure || this.alwaysSnap ? 1 : 0;
      this.snapExposure = false;
      atmoParams.update(p);
      if (haze !== builtHaze) {
        if (!csTrans.dispatch(32, 8, 1)) return;
        if (!csMS.dispatch(4, 4, 1)) return;
        builtHaze = haze;
      }
      if (!csSky.dispatch(Math.ceil(SKYVIEW_W / 8), Math.ceil(SKYVIEW_H / 8), 2)) return;
      if (!csAerial.dispatch(AP_RES / 4, AP_RES / 4, AP_SLICES / 4)) return;
      if (!csAmbient.dispatch(1, 1, 1)) return;
      this.ready = true;
    },
  };
}
