// Weather volumes in the post chain (shaders/post/fog.wgsl.js): the cloud layer and the light-shaft
// ratio at quarter resolution, plus the parameters the compose pass's analytic weather fog reads.
// Inputs each frame: the weather (world/weather.js), the ground height under the camera (the
// fog's base), the key-light direction, and dt (cloud drift).

import { Constants } from '@babylonjs/core/Engines/constants.js';
import { storageTexture, computePass } from './post.js';
import { fogCS, cloudNoiseCS, cloudNoiseLoCS } from '../shaders/post/fog.wgsl.js';

/**
 * @param {ReturnType<typeof import('./post.js').createPost>} post
 * @param {import('@babylonjs/core').Scene} scene
 * @param {any} atmo
 * @param {any} shadows  render/shadows.js
 */
export function createFog(post, scene, atmo, shadows) {
  const engine = scene.getEngine();
  const noise = storageTexture(scene, 512, 512, 'cloudNoise');
  noise.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE; noise.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
  const csNoise = computePass(engine, 'cloudNoise', cloudNoiseCS, [['outTex', 'storageTex', noise]]);
  const noiseLo = storageTexture(scene, 128, 128, 'cloudNoiseLo');
  noiseLo.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE; noiseLo.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
  const csNoiseLo = computePass(engine, 'cloudNoiseLo', cloudNoiseLoCS, [['src', 'tex', noise], ['outTex', 'storageTex', noiseLo]]);
  let noiseBuilt = 0; // 1: base built, 2: far level built too
  let cloudTex, shaftTex, cs, qw = 1, qh = 1;
  const build = (W, H) => {
    if (cloudTex) { cloudTex.dispose(); shaftTex.dispose(); }
    qw = Math.ceil(W / 4); qh = Math.ceil(H / 4);
    cloudTex = storageTexture(scene, qw, qh, 'clouds');
    shaftTex = storageTexture(scene, qw, qh, 'shafts');
    cs = computePass(engine, 'weatherVolumes', fogCS, [['P', 'buffer', post.paramsBuf], ['depthTex', 'tex', post.depthTex],
      ['atmoLight', 'buffer', atmo.atmoLight], ['shadowData', 'buffer', shadows.shadowData],
      ['shadowMap0', 'tex', shadows.maps[0]], ['shadowMap1', 'tex', shadows.maps[1]], ['shadowMap2', 'tex', shadows.maps[2]],
      ['noiseSampler', 'sampler'], ['noiseTex', 'stex', noise],
      ['noiseLoSampler', 'sampler'], ['noiseLo', 'stex', noiseLo], ['cloudOut', 'storageTex', cloudTex], ['shaftOut', 'storageTex', shaftTex]]);
    fog.cloudTex = cloudTex; fog.shaftTex = shaftTex;
  };
  const fog = {
    on: true, shaftsOn: true,
    cloudTex: null, shaftTex: null,
    /** Inputs (owner): weather, ground height below the camera (m), key direction, dt. */
    weather: null, groundY: 0.5, dt: 0.5 - 0.5,
    keyDir: null,
    offX: 0.5 - 0.5, offZ: 0.5 - 0.5,
    /** Valley (inversion) fog of still air (owner): the level of its flat top (m), its density
     *  inside (1/m), the softness of the top (m) and its weight (0 = none; the stilled state). */
    inv: { top: 0.5, density: 0.5 - 0.5, soft: 6, weight: 0.5 - 0.5 },
    run() {
      if (noiseBuilt === 0) { if (csNoise.dispatch(64, 64, 1)) noiseBuilt = 1; }
      else if (noiseBuilt === 1) { if (csNoiseLo.dispatch(16, 16, 1)) noiseBuilt = 2; }
      if (!fog.on) return;
      cs.dispatch(Math.ceil(qw / 8), Math.ceil(qh / 8), 1);
    },
  };
  build(post.width, post.height);
  post.onResize((W, H) => build(W, H));
  post.onParams((P) => {
    const w = fog.weather;
    if (!w || !fog.on) { P[56] = 0; P[59] = 0; P[61] = 0; P[108] = 0; return; }
    // Visibility: ~300 km clear haze is the atmosphere's job; overcast ~4 km, snowfall ~1 km,
    // blizzard ~150 m (σ = 3 / visibility).
    const f = Math.pow(w.fog, 2.2);
    P[56] = 0.00002 + (0.02 - 0.00002) * f;
    // Scale height deepens with the weather: a blizzard swallows the peaks, a haze hugs the valleys.
    P[57] = 1 / (300 + 600 * w.fog * w.fog);
    P[58] = fog.groundY;
    P[59] = fog.shaftsOn ? 1 : 0;
    // Clouds drift downwind (the field's offset is subtracted: features move with the wind).
    const sp = 6 + 10 * w.wind;
    fog.offX -= 0.6 * sp * fog.dt; fog.offZ -= 0.8 * sp * fog.dt;
    if (fog.offX < -1e5) fog.offX += 14000 * 7; if (fog.offZ < -1e5) fog.offZ += 14000 * 7;
    P[60] = w.snow; P[61] = w.cover; P[62] = fog.offX; P[63] = fog.offZ;
    const k = fog.keyDir;
    P[64] = k.x; P[65] = k.y; P[66] = k.z; P[67] = 1;
    const iv = fog.inv;
    P[108] = iv.density * iv.weight; P[109] = iv.top; P[110] = iv.soft; P[111] = iv.weight;
  });
  return fog;
}
