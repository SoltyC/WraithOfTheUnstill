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

fn iceHalo(dir: vec3f) -> vec3f {
  let sd = atmoParams.sunDir.xyz;
  if (sd.y < -0.02) { return vec3f(0.0); }
  let th = degrees(acos(clamp(dot(dir, sd), -1.0, 1.0)));
  // Ring: sharp inside (no light refracts closer than the minimum deviation), long fall outside.
  let x = th - 22.0;
  var ring = select(exp(-x / 2.2) * smoothstep(-0.0, 0.25, x), exp(-(x * x) / 0.06), x < 0.0);
  // Dispersion: red at the inner edge, through gold, to white.
  let tint = mix(vec3f(1.0, 0.55, 0.32), vec3f(1.0, 0.97, 0.92), smoothstep(0.0, 1.6, x));
  // Sun dogs: at the sun's elevation, a little outside the ring as the sun rises.
  let e = asin(clamp(sd.y, -1.0, 1.0)); let ed = degrees(e);
  let de = degrees(asin(clamp(dir.y, -1.0, 1.0))) - ed;
  var da = atan2(dir.z, dir.x) - atan2(sd.z, sd.x);
  da = da - 6.2831853 * floor((da + 3.1415927) / 6.2831853);
  let daw = abs(degrees(da)) * cos(e);
  let dogR = 22.0 + 0.35 * max(ed, 0.0);
  let dx = daw - dogR;
  let dog = exp(-(de * de) / 1.1) * select(exp(-dx / 1.6) * smoothstep(-0.2, 0.3, dx), exp(-(dx * dx) / 0.08), dx < 0.0);
  let dogTint = mix(vec3f(1.0, 0.5, 0.28), vec3f(1.0, 0.95, 0.9), smoothstep(0.0, 1.8, dx));
  // Pillar: a vertical column through a low sun.
  let pillar = exp(-(daw * daw) / 0.35) * exp(-abs(de) / 7.0) * smoothstep(14.0, 2.0, ed) * smoothstep(0.4, 3.0, abs(de));
  // A faint parhelic band at the sun's height.
  let band = exp(-(de * de) / 0.25) * 0.08 * smoothstep(8.0, 30.0, daw);
  let E = atmoKeyColor();
  return E * (tint * ring * 0.045 + dogTint * dog * 0.5 + vec3f(1.0, 0.92, 0.8) * pillar * 0.05 + band * 0.02);
}

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
  // Ice halo of the stilled air (artParams.y: 1 stilled, fading as the land is restored): the
  // grains held motionless in the cold refract the sun into a 22° ring (sharp, reddish inner edge,
  // a soft white skirt outward), sun dogs either side at the sun's height and, when the sun is low,
  // a pillar of light through it. Plate and column crystals hanging still: the stillness itself,
  // made visible. It is gone when the wind returns.
  if (uniforms.artParams.y > 0.001) {
    // Inside the ring the sky is a shade darker (no light is refracted there).
    let thIn = degrees(acos(clamp(dot(dir, atmoParams.sunDir.xyz), -1.0, 1.0)));
    col *= 1.0 - 0.12 * uniforms.artParams.y * smoothstep(8.0, 20.0, thIn) * smoothstep(22.3, 21.6, thIn) * step(-0.02, atmoParams.sunDir.y);
    col += iceHalo(dir) * uniforms.artParams.y;
  }
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
    // Few bright stars, many faint ones (a steep magnitude distribution).
    // max(): pow() of a negative base is NaN on real GPUs (it blacked out the sky between stars).
    let bright = step(0.975, h) * pow(max(h - 0.975, 0.0) / 0.025, 5.0);
    let starNight = smoothstep(0.6, 1.0, night);
    col += vec3f(0.80, 0.86, 1.0) * core * bright * 0.4 * starNight * smoothstep(0.02, 0.25, up);
  }

  var outc = displayTransform(col, uniforms.fogParams.z * atmoExposure());
  fragmentOutputs.color = vec4f(outc, 0.0); // alpha: SSR weight (none)
}
`;
