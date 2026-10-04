// TAA pass (shaders/post/taa.wgsl.js). Two compute instances with fixed bindings alternate the
// history (A reads h0 → writes h1; B reads h1 → writes h0); both also write `out`, the stable
// target the rest of the chain and the display pass read.

import { Constants } from '@babylonjs/core/Engines/constants.js';
import { storageTexture, computePass } from './post.js';
import { taaCS } from '../shaders/post/taa.wgsl.js';
import { dofCS } from '../shaders/post/dof.wgsl.js';

/**
 * @param {ReturnType<typeof import('./post.js').createPost>} post
 * @param {import('@babylonjs/core').Scene} scene
 * @param {() => import('@babylonjs/core').BaseTexture} input  the composed current frame (getter: it is rebuilt on resize)
 */
export function createTaa(post, scene, input) {
  const engine = scene.getEngine();
  let h0, h1, out, a, b, dofA, dofB;
  const build = (W, H) => {
    if (h0) { h0.dispose(); h1.dispose(); out.dispose(); }
    h0 = storageTexture(scene, W, H, 'taaHist0');
    h1 = storageTexture(scene, W, H, 'taaHist1');
    out = storageTexture(scene, W, H, 'taaOut', Constants.TEXTURE_NEAREST_SAMPLINGMODE);
    const binds = (hin, hout) => [['P', 'buffer', post.paramsBuf], ['cur', 'tex', input()], ['depthTex', 'tex', post.depthTex],
      ['histSampler', 'sampler'], ['hist', 'stex', hin], ['outHist', 'storageTex', hout], ['outColor', 'storageTex', out]];
    a = computePass(engine, 'taaA', taaCS, binds(h0, h1));
    b = computePass(engine, 'taaB', taaCS, binds(h1, h0));
    // DOF (after TAA): reads this frame's history target, overwrites `out` (no extra copy when off).
    const dofBinds = (hcur) => [['P', 'buffer', post.paramsBuf], ['src', 'tex', hcur], ['depthTex', 'tex', post.depthTex], ['outColor', 'storageTex', out]];
    dofA = computePass(engine, 'dofA', dofCS, dofBinds(h1));
    dofB = computePass(engine, 'dofB', dofCS, dofBinds(h0));
    taa.out = out;
  };
  const taa = {
    on: true,
    /** History weight per frame (0.9 ≈ 10-frame average). */
    feedback: 0.9,
    out: null,
    /** DOF: focus distance (m), in-focus half range (m), max blur (px), far blur on (0..1);
     *  dofOn runs the pass (the release cinematic). */
    dofOn: false, focus: 40, focusRange: 25, maxBlur: 9, farBlur: 1,
    run() {
      const W = post.width, H = post.height, even = (post.frame & 1) === 0;
      (even ? a : b).dispatch(Math.ceil(W / 8), Math.ceil(H / 8), 1);
      if (taa.dofOn || warm < 3) {
        if ((even ? dofA : dofB).dispatch(Math.ceil(W / 8), Math.ceil(H / 8), 1)) warm |= even ? 1 : 2;
      }
    },
  };
  let warm = 0; // bits: DOF A/B have run once (during loading: no late pipeline on the first cinematic)
  build(post.width, post.height);
  post.onResize((W, H) => { build(W, H); post.resetHistory = true; });
  post.onParams((P) => {
    P[44] = taa.feedback; P[46] = taa.on ? 1 : 0; post.jitter = taa.on;
    P[76] = taa.focus; P[77] = taa.focusRange; P[78] = taa.maxBlur; P[79] = taa.dofOn ? taa.farBlur : 0;
  });
  return taa;
}
