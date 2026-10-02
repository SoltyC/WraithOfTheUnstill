// Cascaded shadow maps (BRIEF §5.3). Four orthographic cascades along the view, each a 2048² R32F
// render target of light-space linear depth. Cascades are fitted to bounding spheres of their
// frustum slices and snapped to whole texels so shadows do not shimmer as the camera moves.
// Casters: the clipmap (its own vertex shader, depth fragment) and the player capsule.
// Receivers bind shadowData (matrices, splits, origins, light) and the four maps.

import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera.js';
import { Camera } from '@babylonjs/core/Cameras/camera.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { Matrix, Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { shadowDepthFragmentWGSL, CASCADES, SHADOW_SIZE } from '../shaders/shadows.wgsl.js';
import { STATE_SAMPLE_BUFFERS } from '../shaders/terrainState.wgsl.js';
import { env } from './environment.js';

export const SHADOW_SPLITS = [24, 140, 800, 4500];
const BACKOFF = 4000;   // m toward the light: distant ranges still cast into the cascades

const vp = new Matrix();
const CLEAR_FAR = new Color4(1e6, 0, 0, 1);

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {import('@babylonjs/core').TargetCamera} viewCamera
 * @param {{ clipmap: any, capsule: import('@babylonjs/core').Mesh }} casters
 */
export function createShadows(scene, viewCamera, casters) {
  const engine = scene.getEngine();
  ShaderStore.ShadersStoreWGSL.shadowDepthFragmentShader = shadowDepthFragmentWGSL;

  const data = new Float32Array(88);
  const shadowData = new StorageBuffer(engine, data.byteLength, undefined, 'shadow-data');
  const maps = [], cams = [], lights = [], origins = [];
  const clip = casters.clipmap;

  for (let c = 0; c < CASCADES; c++) {
    const cam = new TargetCamera('shadowCam' + c, new Vector3(0, 100, 0), scene, false);
    cam.mode = Camera.ORTHOGRAPHIC_CAMERA;
    cam.minZ = 0; cam.maxZ = 10000;
    const rtt = new RenderTargetTexture('shadowCascade' + c, SHADOW_SIZE, scene, {
      generateMipMaps: false, type: Constants.TEXTURETYPE_FLOAT, format: Constants.TEXTUREFORMAT_R,
      samplingMode: Constants.TEXTURE_NEAREST_SAMPLINGMODE, generateDepthBuffer: true, generateStencilBuffer: false,
    });
    rtt.activeCamera = cam;
    rtt.clearColor = new Color4(1e6, 0, 0, 1);
    rtt.renderList = [clip.mesh, casters.capsule];
    rtt.renderParticles = false; rtt.renderSprites = false;
    const light = new Vector4(0, 1, 0, 0), origin = new Vector4(0, 0, 0, 0);
    // Clipmap depth: same vertex shader and bindings as the terrain, depth fragment.
    const cm = new ShaderMaterial('clipmapShadow' + c, scene, { vertex: 'clipmap', fragment: 'shadowDepth' }, {
      attributes: ['position'],
      uniforms: ['viewProjection', 'levels', 'camGrid', 'shadowLight', 'shadowOrigin'],
      storageBuffers: ['levelData', 'biomeA', 'biomeB', 'windMap', 'hydro', ...STATE_SAMPLE_BUFFERS],
      shaderLanguage: ShaderLanguage.WGSL,
    });
    cm.setArray4('levels', clip.levels);
    cm.setVector4('camGrid', clip.camGrid);
    cm.setStorageBuffer('levelData', clip.levelData);
    cm.setStorageBuffer('biomeA', clip.buffers.biomeA);
    cm.setStorageBuffer('biomeB', clip.buffers.biomeB);
    cm.setStorageBuffer('windMap', clip.buffers.wind);
    cm.setStorageBuffer('hydro', clip.buffers.hydro);
    cm.setVector4('shadowLight', light); cm.setVector4('shadowOrigin', origin);
    cm.backFaceCulling = false;
    clip.stateBound.push(cm);
    const pm = new ShaderMaterial('capsuleShadow' + c, scene, { vertex: 'capsule', fragment: 'shadowDepth' }, {
      attributes: ['position', 'normal'],
      uniforms: ['world', 'viewProjection', 'shadowLight', 'shadowOrigin'],
      shaderLanguage: ShaderLanguage.WGSL,
    });
    pm.setVector4('shadowLight', light); pm.setVector4('shadowOrigin', origin);
    rtt.setMaterialForRendering(clip.mesh, cm);
    rtt.setMaterialForRendering(casters.capsule, pm);
    // Cleared by the pass start itself (see below): the RTT's own clear would restart the pass.
    rtt.onClearObservable.add(() => {});
    scene.customRenderTargets.push(rtt);
    maps.push(rtt); cams.push(cam); lights.push(light); origins.push(origin);
  }
  // With snapshot rendering, Babylon starts each render-target pass eagerly with loadOp "load",
  // then clear() ends it and starts a second pass that clears: two passes (and a full load/store
  // of a 2048² colour + depth target) per cascade. Start shadow passes cleared instead, once.
  const shadowTargets = new Set(maps.map((m) => m.renderTarget));
  const startRT = engine._startRenderTargetRenderPass;
  if (typeof startRT === 'function') {
    engine._startRenderTargetRenderPass = function (rt, setClear, color, depth, stencil) {
      if (shadowTargets.has(rt)) return startRT.call(this, rt, true, CLEAR_FAR, true, false);
      return startRT.call(this, rt, setClear, color, depth, stencil);
    };
  } else {
    console.warn('[shadows] _startRenderTargetRenderPass missing (Babylon changed): shadow maps not cleared');
  }

  return {
    maps, shadowData, cameras: cams,
    /** Adds a caster to every cascade with its own depth material (makeMat(name, light, origin)). */
    addCaster(mesh, makeMat) {
      for (let c = 0; c < CASCADES; c++) {
        maps[c].renderList.push(mesh);
        maps[c].setMaterialForRendering(mesh, makeMat('casterShadow' + mesh.name + c, lights[c], origins[c]));
      }
    },
    /** 0 disables shadows (overlay toggle). */
    strength: 1,
    update() {
      const L = env.keyDir; // towards the light
      viewCamera.getDirectionToRef(FORWARD, tmpFwd);
      const fwd = tmpFwd;
      const fov = viewCamera.fov, aspect = engine.getAspectRatio(viewCamera);
      const th = Math.tan(fov * 0.5), tw = th * aspect;
      // Light basis: travel direction d = −L; right/up perpendicular.
      const dx = -L.x, dy = -L.y, dz = -L.z;
      const yaw = Math.atan2(dx, dz), pitch = Math.asin(Math.max(-1, Math.min(1, -dy)));
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      // Camera right (cy, 0, −sy) and up (sy·sp, cp, cy·sp) for a TargetCamera with that rotation.
      const rx = cy, rz = -sy, ux = sy * sp, uy = cp, uz = cy * sp;
      let near = viewCamera.minZ;
      for (let c = 0; c < CASCADES; c++) {
        const far = SHADOW_SPLITS[c];
        // Bounding sphere of the frustum slice (centre on the view axis).
        const mid = (near + far) * 0.5;
        const fx = far * tw, fy = far * th, nx = near * tw, ny = near * th;
        const rFar = Math.sqrt(fx * fx + fy * fy + (far - mid) * (far - mid));
        const rNear = Math.sqrt(nx * nx + ny * ny + (mid - near) * (mid - near));
        let R = Math.max(rFar, rNear);
        R = Math.ceil(R / 4) * 4; // quantise the radius too: stable texel size
        const p = viewCamera.position;
        let cxw = p.x + fwd.x * mid, cyw = p.y + fwd.y * mid, czw = p.z + fwd.z * mid;
        // Snap the centre to whole texels in light space.
        const texel = (2 * R) / SHADOW_SIZE;
        const a = cxw * rx + czw * rz, b = cxw * ux + cyw * uy + czw * uz;
        const da = Math.floor(a / texel) * texel - a, db = Math.floor(b / texel) * texel - b;
        cxw += rx * da + ux * db; cyw += uy * db; czw += rz * da + uz * db;
        const cam = cams[c];
        cam.position.set(cxw - dx * (R + BACKOFF), cyw - dy * (R + BACKOFF), czw - dz * (R + BACKOFF));
        cam.rotation.set(pitch, yaw, 0);
        cam.orthoLeft = -R; cam.orthoRight = R; cam.orthoBottom = -R; cam.orthoTop = R;
        cam.minZ = 0; cam.maxZ = 2 * R + BACKOFF;
        cam.getViewMatrix(true).multiplyToRef(cam.getProjectionMatrix(true), vp);
        const m = vp.m;
        for (let k = 0; k < 16; k++) data[c * 16 + k] = m[k];
        data[64 + c] = far;
        data[68 + c * 4] = cam.position.x; data[69 + c * 4] = cam.position.y; data[70 + c * 4] = cam.position.z; data[71 + c * 4] = texel;
        lights[c].set(L.x, L.y, L.z, 0);
        origins[c].set(cam.position.x, cam.position.y, cam.position.z, 0);
        near = far;
      }
      data[84] = L.x; data[85] = L.y; data[86] = L.z; data[87] = L.y > -0.05 ? this.strength : 0;
      shadowData.update(data);
    },
  };
}

const FORWARD = new Vector3(0, 0, 1);
const tmpFwd = new Vector3();
