// SSAO and compose (shaders/post/ao.wgsl.js): half-resolution AO from depth, then the current
// frame for TAA = scene × AO, with the weather volumes composited over it (post/fog.js).

import { Constants } from '@babylonjs/core/Engines/constants.js';
import { storageTexture, computePass } from './post.js';
import { aoCS, composeCS } from '../shaders/post/ao.wgsl.js';
import { ssrCS } from '../shaders/post/ssr.wgsl.js';

/**
 * @param {ReturnType<typeof import('./post.js').createPost>} post
 * @param {import('@babylonjs/core').Scene} scene
 * @param {import('@babylonjs/core').TargetCamera} camera
 * @param {any} atmo
 * @param {any} fog  post/fog.js (its targets are rebuilt on resize before this pass's)
 */
export function createCompose(post, scene, camera, atmo, fog) {
  const engine = scene.getEngine();
  let aoTex, ssrTex, out, csAo, csSsr, csCompose;
  const build = (W, H) => {
    if (aoTex) { aoTex.dispose(); ssrTex.dispose(); out.dispose(); }
    aoTex = storageTexture(scene, Math.ceil(W / 2), Math.ceil(H / 2), 'ssao', Constants.TEXTURE_NEAREST_SAMPLINGMODE);
    ssrTex = storageTexture(scene, Math.ceil(W / 2), Math.ceil(H / 2), 'ssr');
    csSsr = computePass(engine, 'ssr', ssrCS, [['P', 'buffer', post.paramsBuf], ['sceneTex', 'tex', post.sceneRT], ['depthTex', 'tex', post.depthTex], ['outSsr', 'storageTex', ssrTex]]);
    out = storageTexture(scene, W, H, 'composed', Constants.TEXTURE_NEAREST_SAMPLINGMODE);
    csAo = computePass(engine, 'ssao', aoCS, [['P', 'buffer', post.paramsBuf], ['depthTex', 'tex', post.depthTex], ['outAo', 'storageTex', aoTex]]);
    csCompose = computePass(engine, 'compose', composeCS, [['P', 'buffer', post.paramsBuf], ['sceneTex', 'tex', post.sceneRT],
      ['depthTex', 'tex', post.depthTex], ['aoTex', 'tex', aoTex], ['cloudSampler', 'sampler'], ['cloudTex', 'stex', fog.cloudTex],
      ['shaftSampler', 'sampler'], ['shaftTex', 'stex', fog.shaftTex], ['atmoLight', 'buffer', atmo.atmoLight],
      ['ssrSampler', 'sampler'], ['ssrTex', 'stex', ssrTex], ['outColor', 'storageTex', out]]);
    comp.out = out;
  };
  const comp = {
    aoOn: true,
    /** AO world radius (m) and intensity. */
    aoRadius: 0.9,
    aoIntensity: 0.55,
    ssrOn: true,
    /** SSR: blend strength, max ray length (m), surface thickness (m). */
    ssrIntensity: 1, ssrRange: 40, ssrThickness: 0.6,
    out: null,
    run() {
      const W = post.width, H = post.height;
      if (comp.aoOn) csAo.dispatch(Math.ceil(W / 16), Math.ceil(H / 16), 1);
      if (comp.ssrOn) csSsr.dispatch(Math.ceil(W / 16), Math.ceil(H / 16), 1);
      csCompose.dispatch(Math.ceil(W / 8), Math.ceil(H / 8), 1);
    },
    rebuild() { build(post.width, post.height); },
  };
  build(post.width, post.height);
  post.onResize((W, H) => build(W, H));
  post.onParams((P) => {
    P[48] = comp.aoRadius; P[49] = comp.aoIntensity; P[50] = comp.aoOn ? 1 : 0;
    // Pixels per metre at 1 m (half-resolution AO samples full-resolution depth).
    P[51] = post.height / (2 * Math.tan(camera.fov * 0.5));
    P[80] = comp.ssrIntensity; P[81] = comp.ssrRange; P[82] = comp.ssrThickness; P[83] = comp.ssrOn ? 1 : 0;
  });
  return comp;
}
