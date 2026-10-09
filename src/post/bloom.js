// Bloom mip chain (shaders/post/bloom.wgsl.js): 6 downsamples from the TAA output (½ … 1/64),
// then 5 upsamples back to ½ resolution. `out` (½ resolution) is mixed in by the display pass.

import { storageTexture, computePass } from './post.js';
import { bloomDownCS, bloomUpCS } from '../shaders/post/bloom.wgsl.js';

const LEVELS = 6;

/**
 * @param {ReturnType<typeof import('./post.js').createPost>} post
 * @param {import('@babylonjs/core').Scene} scene
 * @param {() => import('@babylonjs/core').BaseTexture} input
 */
export function createBloom(post, scene, input) {
  const engine = scene.getEngine();
  const down = [], up = [], csDown = [], csUp = [];
  const groups = new Int32Array(LEVELS * 4); // dispatch sizes: down x, y, up x, y per level
  const build = (W, H) => {
    for (const t of down) t.dispose();
    for (const t of up) t.dispose();
    down.length = up.length = csDown.length = csUp.length = 0;
    let w = W, h = H;
    for (let i = 0; i < LEVELS; i++) {
      w = Math.max(1, Math.ceil(w / 2)); h = Math.max(1, Math.ceil(h / 2));
      down.push(storageTexture(scene, w, h, 'bloomDown' + i));
      groups[i * 4] = groups[i * 4 + 2] = Math.ceil(w / 8); groups[i * 4 + 1] = groups[i * 4 + 3] = Math.ceil(h / 8);
      if (i < LEVELS - 1) up.push(storageTexture(scene, w, h, 'bloomUp' + i));
    }
    const codeK = bloomDownCS(true), code = bloomDownCS(false);
    for (let i = 0; i < LEVELS; i++) {
      const src = i === 0 ? input() : down[i - 1];
      csDown.push(computePass(engine, 'bloomDown' + i, i === 0 ? codeK : code, [['srcSampler', 'sampler'], ['src', 'stex', src], ['dst', 'storageTex', down[i]]]));
    }
    for (let i = LEVELS - 2; i >= 0; i--) {
      const src = i === LEVELS - 2 ? down[LEVELS - 1] : up[i + 1];
      csUp[i] = computePass(engine, 'bloomUp' + i, bloomUpCS, [['srcSampler', 'sampler'], ['src', 'stex', src], ['cur', 'tex', down[i]], ['dst', 'storageTex', up[i]]]);
    }
    bloom.out = up[0];
  };
  const bloom = {
    on: true,
    /** Fraction of the blurred frame mixed in (display pass). */
    intensity: 0.045,
    out: null,
    run() {
      if (!bloom.on) return;
      for (let i = 0; i < LEVELS; i++) csDown[i].dispatch(groups[i * 4], groups[i * 4 + 1], 1);
      for (let i = LEVELS - 2; i >= 0; i--) csUp[i].dispatch(groups[i * 4 + 2], groups[i * 4 + 3], 1);
    },
  };
  build(post.outWidth, post.outHeight);
  post.onResizeOut((W, H) => build(W, H));
  return bloom;
}
