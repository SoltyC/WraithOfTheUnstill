// Speed streaks (BRIEF §9.3 "screen-space wind streaks appear"): thin streaks of rushing air in a
// volume around the camera, stretched along the travel direction and moving past it, faded in by
// speed. World-space but camera-relative (no post-processing pass needed); stateless in the vertex
// shader from a hash per streak and the time. Premultiplied alpha, no depth write.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { ENV_UNIFORMS, ENV_DECL, COMMON_WGSL } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS, ATMO_MATERIAL_WGSL } from '../shaders/atmoMaterial.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';

const COUNT = 160;

const vertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = streak, yz = corner (−1..1)
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform streakParams: vec4f;        // xyz = travel velocity (m/s), w = distance travelled (m)
uniform streakFade: vec4f;          // x = intensity 0..1
varying vUv: vec2f;
varying vAlpha: f32;
fn hs(n: f32) -> f32 { return fract(sin(n * 127.1) * 43758.5453); }
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let id = vertexInputs.position.x;
  let corner = vertexInputs.position.yz;
  let v = uniforms.streakParams.xyz;
  let speed = length(v);
  let f = select(vec3f(0.0, 0.0, 1.0), v / max(speed, 1e-3), speed > 0.1);
  let up0 = vec3f(0.0, 1.0, 0.0);
  let side = normalize(cross(up0, f) + vec3f(1e-4, 0.0, 0.0));
  let up = cross(f, side);
  // A box around the camera: across ±9 m, up −2..+5 m, along ±22 m, streaks travel backward
  // through it at (a fraction above) the travel speed and wrap.
  let a = hs(id * 1.3) * 2.0 - 1.0; let b = hs(id * 2.7); let c = hs(id * 4.1);
  let L = 44.0;
  let along = fract(c - uniforms.streakParams.w * (1.1 + 0.4 * hs(id * 5.9)) / L) * L - L * 0.5;
  let p = uniforms.cameraPosition + side * a * 9.0 + up * (b * 7.0 - 2.0) + f * along;
  let len = 0.4 + speed * 0.09 * (0.6 + 0.8 * hs(id * 7.3));
  let toCam = normalize(uniforms.cameraPosition - p);
  let w = normalize(cross(f, toCam));
  let wp = p + f * corner.x * len + w * corner.y * (0.006 + 0.008 * hs(id * 9.1));
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  // Fade: by intensity, near the ends of the box, and close to the camera (no streak in the face).
  let d = length(p - uniforms.cameraPosition);
  let fade = uniforms.streakFade.x * (1.0 - smoothstep(14.0, 22.0, abs(along))) * smoothstep(2.0, 5.0, d);
  vertexOutputs.vAlpha = fade * (0.4 + 0.6 * hs(id * 11.3));
  if (vertexOutputs.vAlpha < 0.002) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vUv = corner;
}
`;

const fragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform streakParams: vec4f;
uniform streakFade: vec4f;
varying vUv: vec2f;
varying vAlpha: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let u = fragmentInputs.vUv;
  let shape = (1.0 - u.x * u.x) * (1.0 - u.y * u.y);
  let a = clamp(fragmentInputs.vAlpha * shape * 0.16, 0.0, 1.0);
  if (a < 0.001) { discard; }
  // The colour of the air: sky light (bright, slightly cool).
  let col = shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w * 1.6 + atmoKeyColor() * 0.05;
  let outc = displayTransform(col, uniforms.fogParams.z * atmoExposure());
  fragmentOutputs.color = vec4f(outc * a, a);
}
`;

/** @param {import('@babylonjs/core').Scene} scene */
export function createSpeedStreaks(scene, atmo) {
  ShaderStore.ShadersStoreWGSL.speedStreaksVertexShader = vertexWGSL;
  ShaderStore.ShadersStoreWGSL.speedStreaksFragmentShader = fragmentWGSL;
  const pos = new Float32Array(COUNT * 4 * 3), idx = new Uint32Array(COUNT * 6);
  const cx = [-1, 1, 1, -1], cy = [-1, -1, 1, 1];
  for (let i = 0; i < COUNT; i++) {
    for (let k = 0; k < 4; k++) { const o = (i * 4 + k) * 3; pos[o] = i; pos[o + 1] = cx[k]; pos[o + 2] = cy[k]; }
    const v = i * 4, o = i * 6;
    idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
  }
  const mesh = new Mesh('speedStreaks', scene);
  const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.applyToMesh(mesh, false);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
  const params = new Vector4(0, 0, 0, 0), fade = new Vector4(0, 0, 0, 0);
  const mat = new ShaderMaterial('speedStreaks', scene, { vertex: 'speedStreaks', fragment: 'speedStreaks' }, {
    attributes: ['position'],
    uniforms: ['viewProjection', 'streakParams', 'streakFade', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES], storageBuffers: [...ATMO_MATERIAL_BUFFERS],
    shaderLanguage: ShaderLanguage.WGSL, needAlphaBlending: true,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo);
  mat.setVector4('streakParams', params); mat.setVector4('streakFade', fade);
  mat.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;
  mat.disableDepthWrite = true; mat.backFaceCulling = false;
  mesh.material = mat;
  mat.freeze(); fastFrozenIsReady(mat);
  let travelled = 0;
  return {
    mesh,
    /** Owner fields: travel velocity (m/s), frame dt (s), traversal engagement 0..1. */
    vx: 0.5, vy: 0.5, vz: 0.5, dt: 0.5, engaged: 0.5 - 0.5,
    update() {
      const sp = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
      // Distance travelled drives the streaks (a phase from time × speed would jump as speed changes).
      travelled = (travelled + sp * this.dt) % 4400;
      params.x = this.vx; params.y = this.vy; params.z = this.vz; params.w = travelled;
      fade.x = this.engaged * Math.min(1, Math.max(0, (sp - 7) / 9));
    },
  };
}
