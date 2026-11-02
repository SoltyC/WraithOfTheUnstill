// The water's planar reflection (Phase 10 F1; the mire's signature frame: trees mirrored in still
// water, which SSR loses as soon as they leave the screen). The camera mirrored under the water
// plane draws the trees (render/trees.js makeReflectMaterial: cheap shading, nothing below the
// plane) into a target of 0.4 × the window's size. The water's surface pass projects its pixel with
// the same camera and reads the tree there (shaders/water.wgsl.js), bent by the waves; where there
// is no tree its sky and SSR stand.
//
// One plane: the level of the water at or near the Wraith. Off when there is none (the pass is
// taken out of the frame), and on Low and Medium (graphics `waterReflect`). Drawn every frame of
// the loading, whatever the setting, so its pipelines are made then.

import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js';
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { Matrix, Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';

/** Target size as a share of the window (each axis). */
const SCALE = 0.4;
/** The mirrored view is this much wider than the view (fov), so the waves can bend what is just
 *  off the screen's edge into it. */
const FOV_MARGIN = 1.15;
/** Seconds a found plane is kept after the water is lost (no flicker along a shore). */
const HOLD = 2;

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {import('@babylonjs/core').TargetCamera} camera  the view camera
 * @param {any} trees  render/trees.js
 * @param {any} water  render/water.js (levelQ, setReflection)
 * @param {(m: any) => void} bindShadows  binds the shadow maps to a material
 * @param {Float32Array} P  the post chain's params (post/fog.js writes the fog and haze there)
 */
export function createWaterReflect(scene, camera, trees, water, bindShadows, P) {
  const engine = scene.getEngine();
  const size = () => ({ width: Math.max(64, Math.round(engine.getRenderWidth() * SCALE)), height: Math.max(36, Math.round(engine.getRenderHeight() * SCALE)) });
  const rtt = new RenderTargetTexture('waterReflect', size(), scene, {
    generateMipMaps: false, type: Constants.TEXTURETYPE_HALF_FLOAT, format: Constants.TEXTUREFORMAT_RGBA,
    samplingMode: Constants.TEXTURE_BILINEAR_SAMPLINGMODE, generateDepthBuffer: true, generateStencilBuffer: false,
  });
  rtt.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE; rtt.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
  rtt.clearColor = new Color4(0, 0, 0, 0);
  rtt.renderParticles = false; rtt.renderSprites = false;
  const cam = new TargetCamera('waterReflectCam', new Vector3(0, 0, 0), scene, false);
  cam.layerMask = camera.layerMask;
  rtt.activeCamera = cam;
  /** x = plane level, y = 0: the aerial lookup at the reflection's own pixel, which is where the
   *  real tree stands on screen (measured: flipping it left the reflection unhazed). */
  const reflPlane = new Vector4(0, 0, 0, 0);
  const screenInfo = new Vector4(1, 1, 1, 1);
  const setScreen = () => { const s = rtt.getSize(); screenInfo.set(s.width, s.height, 1 / s.width, 1 / s.height); };
  setScreen();
  for (const m of trees.meshes) {
    if (!m.metadata) continue;   // the leaf depth prepass: the reflection cuts its leaves itself
    rtt.renderList.push(m);
    const mat = trees.makeReflectMaterial(m, reflPlane, screenInfo);
    bindShadows(mat);
    rtt.setMaterialForRendering(m, mat);
  }
  /** The mirrored camera's view-projection (the water projects its pixels with it). */
  const vp = new Matrix();
  water.setReflection(rtt, vp);

  let inFrame = false, warmed = false, level = 0, seen = -1e9;
  const setInFrame = (on) => {
    if (on === inFrame) return;
    inFrame = on;
    const list = scene.customRenderTargets, i = list.indexOf(rtt);
    if (on && i < 0) list.push(rtt); else if (!on && i >= 0) list.splice(i, 1);
    engine.snapshotRenderingReset();
  };
  setInFrame(true);
  engine.onResizeObservable.add(() => { rtt.resize(size()); setScreen(); engine.snapshotRenderingReset(); });

  const api = {
    /** The setting (graphics preset; owner). */
    on: true,
    /** Owner fields: the Wraith's position, time (s). */
    px: 0.5, pz: 0.5, time: 0.5,
    /** True while the pass draws (dev overlay, tests). */
    get active() { return inFrame; },
    get level() { return level; },
    /** The reflection materials' plane vector (level, aerial flip): tests and tuning. */
    reflPlane,
    /** Loading is over: from here the setting and the water decide. */
    warmed() { warmed = true; },
    update() {
      // The plane: the water under the Wraith, else within 24 m of it.
      let lv = NaN;
      water.qx = this.px; water.qz = this.pz; water.levelQ(); lv = water.lv;
      for (let k = 0; k < 8 && lv !== lv; k++) {
        const a = k * 0.785398; water.qx = this.px + Math.cos(a) * 24; water.qz = this.pz + Math.sin(a) * 24; water.levelQ(); lv = water.lv;
      }
      if (lv === lv) { level = lv; seen = this.time; }
      const want = !warmed || (this.on && this.time - seen < HOLD);
      setInFrame(want);
      water.reflectLevel = inFrame && warmed ? level : -1e4;
      if (!inFrame) return;
      // Mirror the view camera in the plane: same heading, pitch reversed, height reflected.
      reflPlane.x = level;
      // The fog and haze the post chain applies this frame (post/fog.js: P[56..58], P[116..118]).
      water.reflFog.set(P[56], P[57], P[58], 0); water.reflHaze.set(P[116], P[117], P[118], 0);
      cam.fov = camera.fov * FOV_MARGIN; cam.minZ = camera.minZ; cam.maxZ = camera.maxZ;
      const p = camera.position;
      cam.position.set(p.x, 2 * level - p.y, p.z);
      cam.rotation.set(-camera.rotation.x, camera.rotation.y, -camera.rotation.z);
      cam.getViewMatrix().multiplyToRef(cam.getProjectionMatrix(true), vp);
    },
  };
  return api;
}
