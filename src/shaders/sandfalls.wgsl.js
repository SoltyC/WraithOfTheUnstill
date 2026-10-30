// Sandfalls (render/sandfalls.js): a strip per fall turned to the camera round its path — streaks
// of sand scrolling down it, widening and thinning into veils as it falls, catching the light when
// backlit — and a boiling dust cloud billboarded at its foot. Premultiplied alpha.
import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';

export const sandfallVertexWGSL = /* wgsl */ `
attribute position: vec3f;
attribute fall: vec4f;       // side (−1/1) or the foot's corner x, t down the fall (or the corner y), seed, 1 on the foot
attribute fallTan: vec3f;    // the path's direction
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform fallParams: vec4f;   // x = time, y = flow 0..1
varying vWorldPos: vec3f;
varying vFall: vec4f;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let f = vertexInputs.fall; var wp = vertexInputs.position;
  let toCam = normalize(uniforms.cameraPosition - wp);
  if (f.w < 0.5) {
    let right = normalize(cross(vertexInputs.fallTan, toCam) + vec3f(1e-5, 0.0, 0.0));
    let width = (1.6 + 3.0 * f.y) * (0.8 + 0.4 * f.z);
    wp += right * f.x * width * 0.5;
  } else {
    // The foot's dust: a billboard rising off the floor, wider than the stream.
    let right = normalize(cross(vec3f(0.0, 1.0, 0.0), toCam) + vec3f(1e-5, 0.0, 0.0));
    wp += right * f.x * (3.5 + 1.5 * f.z) + vec3f(0.0, f.y * (4.0 + 1.5 * f.z) - 0.5, 0.0);
  }
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (uniforms.fallParams.y < 0.002) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vFall = f;
}
`;

export const sandfallFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform fallParams: vec4f;
varying vWorldPos: vec3f;
varying vFall: vec4f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos; let f = fragmentInputs.vFall;
  let cam = uniforms.cameraPosition; let V = normalize(cam - wp); let L = uniforms.keyDir;
  let t = uniforms.fallParams.x; let flow = uniforms.fallParams.y;
  var a = 0.0;
  if (f.w < 0.5) {
    // Streaks scrolling down, breaking into veils lower down; soft edges; the lip a dense tongue.
    let u = f.x; let v = f.y;
    let s1 = noised(vec2f(u * 3.5 + f.z * 40.0, v * 9.0 - t * 2.6)).x * 0.5 + 0.5;
    let s2 = noised(vec2f(u * 9.0 - f.z * 13.0, v * 22.0 - t * 4.1)).x * 0.5 + 0.5;
    let streak = smoothstep(0.25, 0.75, s1 * 0.65 + s2 * 0.35);
    a = (1.0 - u * u * u * u) * mix(1.0, 0.6, v) * (0.55 + 0.45 * streak) * (1.0 - smoothstep(0.88, 1.0, v));
  } else {
    // The dust: a soft boiling cloud, densest low.
    let p = vec2f(f.x, f.y * 2.0 - 1.0);
    let boil = noised(p * 1.6 + vec2f(f.z * 31.0, -t * 0.5)).x * 0.5 + 0.5;
    a = (1.0 - smoothstep(0.3, 1.0, length(p) + 0.35 * boil)) * (1.0 - f.y * 0.6) * 0.6;
  }
  a *= flow;
  if (a < 0.003) { discard; }
  let vis = shadowVisibilityFast(wp, cam);
  let key = atmoKeyColor();
  let sand = vec3f(0.86, 0.66, 0.43);
  // Sand scatters forward: backlit, a fall glows along its edges (it "catches the light").
  let fwd = pow(max(dot(-V, L), 0.0), 5.0);
  // A falling curtain is lit all round (grains turn every way): the sun, more of it where unshadowed, and the sky.
  let col = sand * (key * (0.25 + 0.75 * vis) * (0.6 + 1.6 * fwd) / PI + shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w * 1.1);
  let lit = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(cam - wp) * 0.001);
  let outc = displayTransform(lit, uniforms.fogParams.z * atmoExposure());
  fragmentOutputs.color = vec4f(outc * a, a);
}
`;
