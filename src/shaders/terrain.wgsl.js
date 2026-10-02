// Phase 0 test-terrain shader ("clay" view, BRIEF §17 Phase 1 allows a debug clay view).
// Pale wind-packed clay with cool sky fill, a warm key, two scales of detail normals,
// a cavity term, a soft contact shadow under the player, and aerial perspective.
// Phase 2 replaces this with the full terrain material framework.

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';

export const terrainVertexWGSL = /* wgsl */ `
attribute position: vec3f;
attribute normal: vec3f;
attribute cavity: f32;
uniform world: mat4x4f;
uniform viewProjection: mat4x4f;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vCavity: f32;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let wp = uniforms.world * vec4f(vertexInputs.position, 1.0);
  vertexOutputs.position = uniforms.viewProjection * wp;
  vertexOutputs.vWorldPos = wp.xyz;
  vertexOutputs.vNormal = normalize((uniforms.world * vec4f(vertexInputs.normal, 0.0)).xyz);
  vertexOutputs.vCavity = vertexInputs.cavity;
}
`;

export const terrainFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform playerPos: vec4f;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vCavity: f32;
${COMMON_WGSL}

// Gradient (d/dp) of a rotated 3-octave value-noise fBm at world scale "scale" metres.
// Octave rotation and an irrational lacunarity hide the lattice single-octave noise shows.
fn detailGrad(p: vec2f, scale: f32) -> vec2f {
  var q = p / scale;
  var g = vec2f(0.0);
  var amp = 1.0;
  // m = (2.07 R)^i; d(noise(m p))/dp = transpose(m) * grad.
  var m = mat2x2f(1.0, 0.0, 0.0, 1.0);
  let r = mat2x2f(0.8, 0.6, -0.6, 0.8) * 2.07;
  for (var i = 0; i < 3; i++) {
    let nd = noised(m * q + vec2f(f32(i) * 17.3, f32(i) * -9.1));
    g += amp * (transpose(m) * nd.yz);
    m = r * m;
    amp *= 0.45 / 2.07; // keep slope contribution per octave falling
  }
  return g / scale;
}

fn perturb(n: vec3f, g: vec2f, strength: f32) -> vec3f {
  return normalize(n - vec3f(g.x, 0.0, g.y) * strength);
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let viewVec = camPos - wp;
  let dist = length(viewVec);
  let V = viewVec / dist;
  var N = normalize(fragmentInputs.vNormal);
  let slope = 1.0 - N.y;

  // Detail normals fade with distance so they never alias.
  let fadeFine = 1.0 - smoothstep(25.0, 90.0, dist);
  let fadeMid = 1.0 - smoothstep(150.0, 600.0, dist);
  // Directional (wind-stretched) mid-scale ripples plus isotropic fine grain.
  let wc = 0.825; let ws = 0.565;
  let pw = vec2f(wp.x * wc + wp.z * ws, -wp.x * ws + wp.z * wc);
  // Directional layer: noise in wind space (stretched along the wind), gradient mapped back.
  let gw = detailGrad(vec2f(pw.x * 0.45, pw.y), 3.2);
  let gws = vec2f(gw.x * 0.45, gw.y);
  let gWorld = vec2f(gws.x * wc - gws.y * ws, gws.x * ws + gws.y * wc);
  N = perturb(N, gWorld, 0.15 * fadeMid);
  N = perturb(N, detailGrad(wp.xz, 0.7), 0.1 * fadeFine);

  // Albedo: pale clay, slightly warmer on exposed slopes, with broad mottling.
  let mott = noised(wp.xz / 37.0).x * 0.5 + noised(wp.xz / 9.0).x * 0.25;
  var albedo = mix(vec3f(0.60, 0.60, 0.60), vec3f(0.58, 0.55, 0.50), smoothstep(0.12, 0.45, slope));
  albedo = albedo * (1.0 + 0.05 * mott);
  albedo = mix(albedo, vec3f(0.32, 0.31, 0.30), smoothstep(0.42, 0.7, slope));

  let L = uniforms.keyDir;
  let NdotL = dot(N, L);
  // Wrapped diffuse keeps the terminator soft (clay, not plastic).
  let wrap = 0.25;
  let diff = clamp((NdotL + wrap) / (1.0 + wrap), 0.0, 1.0);

  // Cavity from the mesh plus a grazing-light micro-occlusion.
  let cav = fragmentInputs.vCavity;
  let ao = clamp(1.0 - max(cav, 0.0) * 0.55, 0.35, 1.0) * (1.0 + max(-cav, 0.0) * 0.08);

  // Soft contact shadow under the player, pushed away from the key light.
  let pp = uniforms.playerPos;
  let toP = wp.xz - (pp.xz - L.xz * 0.35);
  let cs = 1.0 - 0.55 * exp(-dot(toP, toP) / (pp.w * pp.w)) * smoothstep(1.5, 0.0, abs(wp.y - pp.y));

  // Hemispheric ambient: sky from above, warm ground bounce from below.
  let hemi = mix(uniforms.groundBounce, uniforms.skyZenith * 1.15 + uniforms.skyHorizon * 0.25, N.y * 0.5 + 0.5);
  var col = albedo * (uniforms.keyColor * diff * cs + hemi * ao * mix(1.0, cs, 0.5));

  // Faint sheen at grazing angles toward the key (packed-surface response).
  let H = normalize(L + V);
  let spec = pow(max(dot(N, H), 0.0), 48.0) * 0.05 * diff;
  col += uniforms.keyColor * spec;

  col = applyFog(col, wp, camPos, uniforms.sunDir, uniforms.skyZenith, uniforms.skyHorizon, uniforms.sunHalo, uniforms.fogParams);
  var outc = displayTransform(col, uniforms.fogParams.z);
  outc += vec3f(ditherNoise(fragmentInputs.position.xy) / 255.0);
  fragmentOutputs.color = vec4f(outc, 1.0);
}
`;
