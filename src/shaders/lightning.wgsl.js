// The lightning bolt (Phase 8 M11): camera-facing ribbons along the segments of world/boltShape.js,
// additive, HDR (it saturates and blooms). Each vertex carries its own end (position), the other end
// of its segment (normal) and (side −1/1, width factor) (uv). Two draws share the geometry: the
// core, thin and white-hot, which writes depth (the post chain fogs a pixel by its depth, so the bolt
// is fogged as the geometry it is — and gains the fog back below, since lightning outshines haze),
// and the glow, wide and faint, which does not.

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { WEATHER_FOG_WGSL } from './post/fog.wgsl.js';

export const boltVertexWGSL = /* wgsl */ `
attribute position: vec3f;
attribute normal: vec3f;
attribute uv: vec2f;
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform bolt: vec4f;        // x = brightness 0..1, y = 0 core / 1 glow
uniform boltFog: vec4f;     // the weather fog's density at the base (1/m), 1/scale height, base height (m)
varying vSide: f32;
varying vGain: f32;
${WEATHER_FOG_WGSL}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let cam = uniforms.cameraPosition;
  let p = vertexInputs.position; let q = vertexInputs.normal;
  let dist = length(p - cam);
  let dir = normalize(q - p);
  let toCam = (cam - p) / max(dist, 1.0);
  let side = normalize(cross(dir, toCam) + vec3f(1e-5, 0.0, 0.0));
  let glow = uniforms.bolt.y;
  // One to two pixels across for the core (a pixel ~ dist · 0.0009), several for the glow.
  let width = vertexInputs.uv.y * max(0.25, dist * mix(0.0022, 0.0075, glow));
  let wp = p - dir * width * 0.7 + side * vertexInputs.uv.x * width;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (uniforms.bolt.x < 0.004) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  // The fog between here and the bolt would swallow it: lightning is far brighter than daylight.
  let od = fogOpticalDepth(cam, (p - cam) / max(dist, 1.0), dist, uniforms.boltFog);
  vertexOutputs.vSide = vertexInputs.uv.x;
  vertexOutputs.vGain = min(exp(od * 0.97), 400.0) * uniforms.bolt.x;
}
`;

export const boltFragmentWGSL = /* wgsl */ `
${ENV_DECL}
varying vSide: f32;
varying vGain: f32;
uniform bolt: vec4f;
${COMMON_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let x = fragmentInputs.vSide;
  let core = exp(-x * x * 7.0);
  let halo = exp(-x * x * 2.0);
  let glow = uniforms.bolt.y;
  if (glow < 0.5 && core < 0.25) { discard; }
  let i = mix(core * 14.0, halo * 0.9, glow);
  let c = mix(vec3f(0.8, 0.9, 1.0), vec3f(0.55, 0.7, 1.0), glow) * i * fragmentInputs.vGain;
  fragmentOutputs.color = vec4f(min(c, vec3f(160.0)), 0.0);
}
`;
