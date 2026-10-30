// Sandfalls (render/sandfalls.js): a strip per fall turned to the camera round its path — streaks
// of sand scrolling down it, widening and thinning into veils as it falls, catching the light when
// backlit — and a boiling dust cloud billboarded at its foot. Premultiplied alpha. A frozen fall
// (Crystallize at it) stops: its stream and dust fade as a stepped ramp of ice-sand rises in their
// place (sandfallRamp*, opaque).
import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';

export const sandfallVertexWGSL = /* wgsl */ `
attribute position: vec3f;
attribute fall: vec4f;       // side (−1/1) or the foot's corner x, t down the fall (or the corner y), seed, 1 on the foot
attribute fallTan: vec3f;    // the path's direction
attribute fallSite: f32;     // the cascade (site) it belongs to
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform fallParams: vec4f;   // x = time, y = flow 0..1
uniform fallFrozen: array<vec4f, 3>;   // per site: 0 running … 1 frozen
varying vWorldPos: vec3f;
varying vFall: vec4f;
varying vRun: f32;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let f = vertexInputs.fall; var wp = vertexInputs.position;
  let toCam = normalize(uniforms.cameraPosition - wp);
  if (f.w < 0.5) {
    let right = normalize(cross(vertexInputs.fallTan, toCam) + vec3f(1e-5, 0.0, 0.0));
    let width = (1.3 + 1.7 * f.y) * (0.8 + 0.4 * f.z);
    wp += right * f.x * width * 0.5;
  } else {
    // The foot's dust: a billboard rising off the floor, wider than the stream.
    let right = normalize(cross(vec3f(0.0, 1.0, 0.0), toCam) + vec3f(1e-5, 0.0, 0.0));
    wp += right * f.x * (3.5 + 1.5 * f.z) + vec3f(0.0, f.y * (4.0 + 1.5 * f.z) - 0.5, 0.0);
  }
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  let si = u32(vertexInputs.fallSite + 0.5);
  let run = 1.0 - uniforms.fallFrozen[si / 4u][si % 4u];
  if (uniforms.fallParams.y < 0.002 || run < 0.002) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vFall = f;
  vertexOutputs.vRun = run;
}
`;

export const sandfallFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform fallParams: vec4f;
varying vWorldPos: vec3f;
varying vFall: vec4f;
varying vRun: f32;
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
    a = (1.0 - u * u * u * u) * mix(0.8, 0.35, v) * (0.35 + 0.65 * streak) * smoothstep(0.0, 0.08, v) * (1.0 - smoothstep(0.8, 1.0, v));
  } else {
    // The dust: a soft boiling cloud, densest low.
    let p = vec2f(f.x, f.y * 2.0 - 1.0);
    let boil = noised(p * 1.6 + vec2f(f.z * 31.0, -t * 0.5)).x * 0.5 + 0.5;
    a = (1.0 - smoothstep(0.3, 1.0, length(p) + 0.35 * boil)) * (1.0 - f.y * 0.6) * 0.35;
  }
  a *= flow * fragmentInputs.vRun;
  if (a < 0.003) { discard; }
  let vis = shadowVisibilityFast(wp, cam);
  let key = atmoKeyColor();
  let sand = vec3f(0.86, 0.66, 0.43);
  // Sand scatters forward: backlit, a fall glows along its edges (it "catches the light").
  let fwd = pow(max(dot(-V, L), 0.0), 5.0);
  // A falling curtain is lit all round (grains turn every way): the sun, more of it where unshadowed, and the sky.
  // Where the wall shades it, only the sky lights it, and nothing glows from behind.
  let col = sand * (key * vis * (0.6 + 1.6 * fwd) / PI + shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w * 0.8);
  let lit = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(cam - wp) * 0.001);
  let outc = displayTransform(lit, uniforms.fogParams.z * atmoExposure());
  fragmentOutputs.color = vec4f(outc * a, a);
}
`;

// The frozen fall: a rounded fan of frozen sand from the tread up to the lip (render/sandfalls.js
// rampGeometry), rising from its foot as it freezes. Frozen sand with a rime in its grain:
// glittering, glossy at grazing angles (the sky in it), lit and shadowed like the walls.
export const sandfallRampVertexWGSL = /* wgsl */ `
attribute position: vec3f;
attribute ramp: vec3f;       // foot y, lip y, site
uniform viewProjection: mat4x4f;
uniform fallFrozen: array<vec4f, 3>;
varying vWorldPos: vec3f;
varying vRamp: vec3f;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let r = vertexInputs.ramp; let si = u32(r.z + 0.5);
  let fz = uniforms.fallFrozen[si / 4u][si % 4u];
  vertexOutputs.position = uniforms.viewProjection * vec4f(vertexInputs.position, 1.0);
  if (fz < 0.002) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vWorldPos = vertexInputs.position;
  vertexOutputs.vRamp = vec3f(r.x, r.y, fz);
}
`;

export const sandfallRampFragmentWGSL = /* wgsl */ `
${ENV_DECL}
varying vWorldPos: vec3f;
varying vRamp: vec3f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos; let r = fragmentInputs.vRamp;
  // Rising from the foot as it freezes (a ragged front).
  if (wp.y > r.x - 0.5 + (r.y - r.x + 1.0) * r.z + 0.4 * noised(wp.xz * 2.0).x) { discard; }
  let cam = uniforms.cameraPosition; let V = normalize(cam - wp); let L = uniforms.keyDir;
  var N = normalize(cross(dpdx(wp), dpdy(wp))); if (dot(N, V) < 0.0) { N = -N; }
  let n1 = noised(wp.xz * 3.1 + vec2f(wp.y * 2.3)).x; let n2 = noised(vec2f(wp.x + wp.z, wp.y) * 0.7).x;
  // Frozen sand: the grain's warm tone under a pale rime, whiter on the treads, streaked down the risers.
  // Streaks down the pour (the grain froze as it ran), and rime whitening only the flatter tops a little.
  let streak = noised(vec2f((wp.x - wp.z) * 1.7, wp.y * 0.35)).x;
  var albedo = mix(vec3f(0.4, 0.28, 0.17), vec3f(0.52, 0.39, 0.26), 0.5 + 0.35 * streak);
  albedo = mix(albedo, vec3f(0.78, 0.77, 0.76), (0.07 + 0.13 * smoothstep(0.5, 0.95, N.y)) * (0.7 + 0.3 * n1));
  albedo *= 0.92 + 0.12 * n2;
  let vis = shadowVisibilityFast(wp, cam);
  let key = atmoKeyColor();
  let nl = dot(N, L);
  // In the canyon's shade the walls' warm bounce lights it as it lights them (shaders/canyon.wgsl.js).
  let bounce = key * max(L.y, 0.0) * vec3f(0.62, 0.42, 0.25) * 0.3 / PI * clamp(0.75 - 0.5 * N.y, 0.0, 1.0);
  var col = albedo * (key * clamp(nl, 0.0, 1.0) * vis / PI + shIrradiance(N) * uniforms.envMisc.w * 0.8 + bounce);
  // Glossy where the frost glazes it: the sky at a glance, the sun as a tight highlight, and glitter.
  let NV = max(dot(N, V), 0.0); let F = 0.03 + 0.97 * pow(1.0 - NV, 5.0);
  col += shIrradiance(reflect(-V, N)) * uniforms.envMisc.w * F * 0.3;
  let H = normalize(L + V);
  col += key * vis * pow(max(dot(N, H), 0.0), 120.0) * 0.35 * step(0.0, nl);
  let g = floor(wp * 22.0); let gh = fract(sin(dot(g, vec3f(12.9898, 78.233, 37.719))) * 43758.5453);
  col += key * vis * step(0.985, gh) * pow(max(dot(N, H), 0.0), 8.0) * 3.0;
  let lit = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(cam - wp) * 0.001);
  fragmentOutputs.color = vec4f(displayTransform(lit, uniforms.fogParams.z * atmoExposure()), 0.0);
}
`;
