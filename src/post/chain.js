// The post chain's assembly (BRIEF §5.8): builds the post framework (post.js) and its passes in
// order, and registers each one's dev-overlay toggle for A/B comparison (BRIEF §12.1).
//   TAA → SSAO → SSR → DOF → bloom → tonemap (AgX/ACES) → LUT grade → grain → sharpen
// (the display pass does tonemap, grade and grain; see shaders/post/display.wgsl.js).

import { createPost } from './post.js';
import { createTaa } from './taa.js';
import { createCompose } from './compose.js';
import { createBloom } from './bloom.js';
import { computePass } from './post.js';
import { createFog } from './fog.js';
import { meterCS } from '../shaders/post/meter.wgsl.js';
import { params } from '../core/params.js';
import { registerToggle } from '../core/systems.js';

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {import('@babylonjs/core').TargetCamera} camera
 * @param {any} atmo
 * @param {any} shadows
 */
export function createPostChain(scene, camera, atmo, shadows) {
  const post = createPost(scene, camera);
  const fog = createFog(post, scene, atmo, shadows);
  const comp = createCompose(post, scene, camera, atmo, fog);
  // Exposure meter: reads the composed frame, feeds the atmosphere's ambient pass next frame.
  const meter = { on: true, cs: null };
  const buildMeter = () => {
    meter.cs = computePass(scene.getEngine(), 'exposureMeter', meterCS, [['P', 'buffer', post.paramsBuf], ['src', 'tex', comp.out],
      ['atmoLight', 'buffer', atmo.atmoLight], ['meter', 'buffer', atmo.meterBuf]]);
  };
  buildMeter();
  post.onResize(buildMeter);
  post.onParams((P) => { P[71] = params.v.exposure; P[84] = meter.on ? 1 : 0; });
  const taa = createTaa(post, scene, () => comp.out);
  post.addPass(() => fog.run());
  post.addPass(() => comp.run());
  post.addPass(() => meter.cs.dispatch(1, 1, 1));
  const bloom = createBloom(post, scene, () => taa.out);
  post.addPass(() => taa.run());
  post.addPass(() => bloom.run());
  const wire = () => { post.setFinal(taa.out); post.setBloom(bloom.out); };
  wire();
  post.onResize(wire);
  post.onParams(() => { post.bloomOn = bloom.on; post.bloomIntensity = bloom.intensity; });
  registerToggle({ key: 'postTaa', label: 'TAA', group: 'Post', on: true, onChange: (on) => { taa.on = on; post.resetHistory = true; } });
  registerToggle({ key: 'postAo', label: 'SSAO', group: 'Post', on: true, onChange: (on) => { comp.aoOn = on; } });
  registerToggle({ key: 'postBloom', label: 'bloom', group: 'Post', on: true, onChange: (on) => { bloom.on = on; } });
  registerToggle({ key: 'postMeter', label: 'metered exposure', group: 'Post', on: true, onChange: (on) => { meter.on = on; } });
  registerToggle({ key: 'postClouds', label: 'clouds + weather fog', group: 'Post', on: true, onChange: (on) => { fog.on = on; } });
  registerToggle({ key: 'postShafts', label: 'light shafts', group: 'Post', on: true, onChange: (on) => { fog.shaftsOn = on; } });
  registerToggle({ key: 'postSsr', label: 'SSR (ice, wet)', group: 'Post', on: true, onChange: (on) => { comp.ssrOn = on; } });
  registerToggle({ key: 'postSharpen', label: 'sharpen', group: 'Post', on: true, onChange: (on) => { post.sharpen = on ? 0.35 : 0; } });
  registerToggle({ key: 'postAgx', label: 'AgX tonemap (off: ACES)', group: 'Post', on: post.tonemapper === 1, onChange: (on) => { post.tonemapper = on ? 1 : 0; } });
  registerToggle({ key: 'postGrade', label: 'LUT grade', group: 'Post', on: post.lutOn, onChange: (on) => { post.lutOn = on; } });
  registerToggle({ key: 'postGrain', label: 'film grain', group: 'Post', on: post.grain > 0, onChange: (on) => { post.grain = on ? 0.035 : 0; } });
  return {
    post, taa, comp, bloom, fog,
    name: 'post',
    update() { post.update(); },
  };
}
