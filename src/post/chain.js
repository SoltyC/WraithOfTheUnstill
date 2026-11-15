// The post chain's assembly (BRIEF §5.8): builds the post framework (post.js) and its passes in
// order, and registers each one's dev-overlay toggle for A/B comparison (BRIEF §12.1).
//   TAA → SSAO → SSR → DOF → bloom → tonemap (AgX/ACES) → LUT grade → grain → sharpen
// (the display pass does tonemap, grade and grain; see shaders/post/display.wgsl.js).

import { createHeat } from './heat.js';
import { createPost } from './post.js';
import { createTaa } from './taa.js';
import { createCompose } from './compose.js';
import { createBloom } from './bloom.js';
import { computePass } from './post.js';
import { createFog } from './fog.js';
import { meterCS } from '../shaders/post/meter.wgsl.js';
import { params } from '../core/params.js';
import { env } from '../render/environment.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { registerToggle } from '../core/systems.js';

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {import('@babylonjs/core').TargetCamera} camera
 * @param {any} atmo
 * @param {any} shadows
 */
export function createPostChain(scene, camera, atmo, shadows, surface, windMap) {
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
  post.onParams((P) => { P[71] = params.v.exposure * (post.exposureLift || 1); P[84] = meter.on ? 1 : 0; });
  const heat = createHeat(post,scene,surface,windMap);
  const taa = createTaa(post, scene, () => comp.out, heat);
  post.addPass(() => fog.run());
  post.addPass(() => comp.run());
  let streaks=null;
  post.addPass(()=>{if(streaks)streaks.run();});
  post.addPass(() => meter.cs.dispatch(1, 1, 1));
  const bloom = createBloom(post, scene, () => taa.out);
  post.addPass(() => taa.run());
  post.addPass(() => bloom.run());
  const wire = () => {
    post.setFinal(post.debug === 2 ? post.sceneRT : post.debug === 3 || post.debug === 4 ? comp.out : taa.out);
    post.setBloom(bloom.out);
  };
  wire();
  post.onResizeOut(wire);
  post.onParams(() => { post.bloomOn = bloom.on; post.bloomIntensity = bloom.intensity; });
  // Shade lift (display pass): by day only, so moonlit and lamp-lit nights keep their blacks.
  // (realism plan, 2026-11-14: 1.6 by day, was 2.6 — the lift greyed the darks the reference keeps deep;
  // the wider meter range, atmosphereCompute, now opens a shaded scene instead.)
  const lift = { day: 1.6, night: 0.3 };
  post.onParams(() => { const d = env.envMisc.y; post.shadowLift = lift.night + (lift.day - lift.night) * d; });
  // The lens flare (display pass): the sun projected to the screen; the pass itself tests how much
  // of the disc is seen. Off when the sun is behind the view or set.
  const flare = { on: true }, sunW = new Vector3(), sunS = new Vector3(), fwd = new Vector3();
  post.onParams(() => {
    const s = env.sunDir, cp = camera.globalPosition, f = post.flare;
    camera.getDirectionToRef(Vector3.Forward(), fwd);
    const front = fwd.x * s.x + fwd.y * s.y + fwd.z * s.z;
    if (!flare.on || front < 0.2 || s.y < -0.01) { f[2] = 0; return; }
    sunW.set(cp.x + s.x * 1e4, cp.y + s.y * 1e4, cp.z + s.z * 1e4);
    Vector3.TransformCoordinatesToRef(sunW, camera.getTransformationMatrix(), sunS);
    f[0] = sunS.x * 0.5 + 0.5; f[1] = sunS.y * 0.5 + 0.5; f[2] = 1;
    // The disc's angular radius (atmoSunDisc: ~0.6°) on the screen, as a share of the height.
    f[3] = 0.0105 / Math.tan(camera.fov / 2) * 0.5;
  });
  registerToggle({ key: 'postFlare', label: 'lens flare', group: 'Post', on: true, onChange: (on) => { flare.on = on; } });
  registerToggle({ key: 'postTaa', label: 'TAA', group: 'Post', on: true, onChange: (on) => { taa.on = on; post.resetHistory = true; } });
  registerToggle({ key: 'postMirage', label: 'heat mirage', group: 'Post', on: true, onChange: (on) => { heat.mirage = on; post.resetHistory = true; } });
  registerToggle({ key: 'postHeat', label: 'heat shimmer', group: 'Post', on: true, onChange: (on) => { heat.on = on; post.resetHistory = true; } });
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
    post, taa, comp, bloom, fog, heat, lift,
    setStreaks(s){streaks=s;},
    name: 'post',
    update() { post.update(); },
  };
}
