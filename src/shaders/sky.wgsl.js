// Sky dome: analytic gradient + sun/moon disc + stable star field at night.
// Phase 1 replaces the gradient with Hillaire sky-view LUT sampling.

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';

export const skyVertexWGSL = /* wgsl */ `
attribute position: vec3f;
uniform world: mat4x4f;
uniform viewProjection: mat4x4f;
varying vDir: vec3f;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let wp = uniforms.world * vec4f(vertexInputs.position, 1.0);
  let clip = uniforms.viewProjection * wp;
  // Pin to the far plane so the dome never clips terrain. Reverse-Z: far = depth 0.
  vertexOutputs.position = vec4f(clip.xy, clip.w * 0.000001, clip.w);
  vertexOutputs.vDir = vertexInputs.position;
}
`;

export const skyFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform moonDir: vec3f;
varying vDir: vec3f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let dir = normalize(fragmentInputs.vDir);
  // Physically based sky (Hillaire LUTs, lit by sun and moon) and the attenuated sun disc.
  // Below the geometric horizon the LUT holds rays that hit the (albedo-less) planet; where no
  // terrain covers the dome, show the hazy horizon instead by mirroring the elevation.
  let r = atmoCamR();
  let horizonY = -sqrt(max(1.0 - (R_GROUND / r) * (R_GROUND / r), 0.0));
  var sdir = dir;
  if (dir.y < horizonY + 0.002) { sdir = normalize(vec3f(dir.x, 2.0 * (horizonY + 0.002) - dir.y, dir.z)); }
  var col = atmoSky(sdir) + atmoSunDisc(dir);
  // Faint floor so the night sky reads deep blue, never black.
  col += vec3f(0.30, 0.45, 1.0) * 0.005 * uniforms.envMisc.x; // same floor as the ambient (atmosphere.js NIGHT_FLOOR)

  // Night: stars and moon, faded in by envMisc.x (night factor).
  let night = uniforms.envMisc.x;
  if (night > 0.001) {
    let md = uniforms.moonDir;
    let mmu = dot(dir, md);
    let moon = smoothstep(0.99935, 0.99955, mmu);
    col += vec3f(0.55, 0.62, 0.78) * moon * 3.0 * night;
    col += vec3f(0.06, 0.08, 0.14) * pow(max(mmu, 0.0), 24.0) * night;
    // Stars: one jittered point per cell of a direction grid, drawn as a ~1 px gaussian so
    // they read as points, not cells. Stable under camera motion (no crawl). Deep night only.
    let up = clamp(dir.y, 0.0, 1.0);
    let uv = vec2f(atan2(dir.z, dir.x) * 180.0, asin(clamp(dir.y, -1.0, 1.0)) * 180.0);
    let cell = floor(uv);
    let h = hash12(cell);
    let jitter = vec2f(hash12(cell + 17.0), hash12(cell + 41.0)) * 0.7 + 0.15;
    let d = (uv - cell - jitter) * vec2f(max(cos(asin(clamp(dir.y, -1.0, 1.0))), 0.05), 1.0);
    let px = fwidth(uv.y);
    let core = exp(-dot(d, d) / max(px * px * 0.6, 1e-6));
    let bright = step(0.965, h) * pow((h - 0.965) / 0.035, 3.0);
    let starNight = smoothstep(0.6, 1.0, night);
    col += vec3f(0.80, 0.86, 1.0) * core * bright * 1.6 * starNight * smoothstep(0.02, 0.25, up);
  }

  var outc = displayTransform(col, uniforms.fogParams.z * atmoExposure());
  outc += vec3f(ditherNoise(fragmentInputs.position.xy) / 255.0);
  fragmentOutputs.color = vec4f(outc, 1.0);
}
`;
