// Falling snow (BRIEF §5.6: snowfall and blizzard). Stateless GPU flakes in a camera-centred
// volume, like the diamond dust: every flake is a hashed seed falling through a wrapped column and
// carried downwind by the owner-integrated wind travel, so a change of wind or density never pops.
// Snowfall drifts down in soft flakes; a blizzard drives them nearly level in streaks stretched
// along their motion relative to the camera (motion blur). Lit by the sky and the sun (shadowed,
// forward-scattering), fogged by the atmosphere; premultiplied, no depth write.

import { CLIPMAP_N, CLIPMAP_LEVELS } from './clipmap.wgsl.js';
import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';

export const SNOW_COUNT = 16000;
const R = 26; // m: half extent of the camera-centred column
const HT = 18; // m: column height (wrapped)

export const snowVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = flake id, yz = quad corner (−1..1)
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform levels: array<vec4f,16>;
uniform snow: vec4f;                // x = fall travel (m), y = density 0..1, zw = wind travel x, z (m, wrapped)
uniform snowWind: vec4f;            // xy = wind direction (unit), z = fall speed (m/s), w = wind speed (m/s)
var<storage, read> levelData: array<vec4f>;
var<storage, read> biomeA: array<u32>;
var<storage, read> windMap: array<u32>;
varying vUv: vec2f;
varying vAlpha: f32;
varying vWorldPos: vec3f;

const V: u32 = ${CLIPMAP_N + 1}u;
const HALF: f32 = ${CLIPMAP_N / 2}.0;
const W_HALF: f32 = 4096.0;
const NW: i32 = 256; const CW: f32 = 32.0;
const N8: i32 = 1024; const C8: f32 = 8.0;
const RT: f32 = ${R}.0;
const HT: f32 = ${HT}.0;

fn hsh(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return f32((x >> 22u) ^ x) / 4294967295.0;
}
fn windAtD(x: f32, z: f32) -> vec2f {
  let i = clamp(i32((x + W_HALF) / CW), 0, NW - 1); let j = clamp(i32((W_HALF - z) / CW), 0, NW - 1);
  let w = (unpack4x8unorm(windMap[j * NW + i]).xy * 255.0 - 128.0) / 127.0;
  let l = length(w);
  return select(vec2f(1.0, 0.0), w / l, l > 1e-4);
}
fn frostAtD(x: f32, z: f32) -> f32 {
  let i = clamp(i32((x + W_HALF) / C8), 0, N8 - 1); let j = clamp(i32((W_HALF - z) / C8), 0, N8 - 1);
  let a = unpack4x8unorm(biomeA[j * N8 + i]);
  return a.x / max(a.x + a.y + a.z + a.w, 0.05);
}
fn groundAtD(x: f32, z: f32) -> f32 {
  for (var l = 0u; l < ${CLIPMAP_LEVELS}u; l++) {
    let L = uniforms.levels[l];
    let g = (vec2f(x, z) - L.xy) / L.z + HALF;
    if (g.x >= 1.0 && g.y >= 1.0 && g.x < 2.0 * HALF - 1.0 && g.y < 2.0 * HALF - 1.0) {
      let b = floor(g); let t = g - b;
      let i = u32(b.x); let j = u32(b.y);
      let h00 = levelData[(l * V + j) * V + i].x; let h10 = levelData[(l * V + j) * V + i + 1u].x;
      let h01 = levelData[(l * V + j + 1u) * V + i].x; let h11 = levelData[(l * V + j + 1u) * V + i + 1u].x;
      return mix(mix(h00, h10, t.x), mix(h01, h11, t.x), t.y);
    }
  }
  return 0.0;
}


@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let id = u32(vertexInputs.position.x + 0.5);
  let corner = vertexInputs.position.yz;
  let cam = uniforms.cameraPosition;
  let h1 = hsh(id * 7u); let h2 = hsh(id * 7u + 1u); let h3 = hsh(id * 7u + 2u); let h4 = hsh(id * 7u + 3u); let h5 = hsh(id * 7u + 4u);
  let wd = uniforms.snowWind.xy;
  // Per-flake speed variation; a little flutter.
  let fall = uniforms.snow.x * (0.75 + 0.5 * h3);
  let flutter = vec2f(sin(fall * 1.3 + h1 * 6.28), cos(fall * 1.1 + h2 * 6.28)) * (0.25 + 0.6 * h4);
  let base = vec2f(h1, h2) * 2.0 * RT + uniforms.snow.zw + flutter;
  let rel = base - cam.xz;
  let wrapped = rel - 2.0 * RT * floor((rel + RT) / (2.0 * RT));
  let p = cam.xz + wrapped;
  // Height: a column around the camera, falling and wrapping.
  let ycol = h5 * HT - fall;
  let yrel = ycol - HT * floor((ycol - (cam.y - HT * 0.35)) / HT);
  let g = groundAtD(p.x, p.y);
  let wp0 = vec3f(p.x, yrel, p.y);
  let dist = length(wp0 - cam);
  // Visible share of the flakes follows the density; flakes below the ground are hidden.
  var alpha = select(0.0, 1.0, h3 * 0.999 < uniforms.snow.y) * smoothstep(0.0, 0.3, wp0.y - g)
            * (1.0 - smoothstep(RT * 0.55, RT * 0.95, length(wrapped))) * smoothstep(0.35, 1.2, dist);
  // Flake size: at least ~1.2 px, dimmed when enlarged.
  let size = max(0.012 + 0.01 * h4, dist * 0.0009);
  alpha *= min(1.0, (0.014 / size) * 1.4);
  // Motion relative to the camera stretches the quad (shutter ~1/60 s, plus a floor for wind).
  let vel = vec3f(wd.x * uniforms.snowWind.w, -uniforms.snowWind.z, wd.y * uniforms.snowWind.w);
  let toCam = normalize(cam - wp0);
  let vScreen = vel - toCam * dot(vel, toCam);
  let vl = length(vScreen);
  let stretch = clamp(vl * 0.03, 0.0, 0.9);
  let ax = select(normalize(cross(vec3f(0.0, 1.0, 0.0), toCam)), vScreen / max(vl, 1e-4), vl > 0.05);
  let ay = normalize(cross(toCam, ax));
  let wp = wp0 + ax * corner.x * (size + stretch) + ay * corner.y * size;
  alpha *= size / (size + stretch * 0.6);
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (alpha < 0.004) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vUv = corner;
  vertexOutputs.vAlpha = alpha;
  vertexOutputs.vWorldPos = wp0;
}
`;

export const snowFragmentWGSL = /* wgsl */ `
${ENV_DECL}
varying vUv: vec2f;
varying vAlpha: f32;
varying vWorldPos: vec3f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let r2 = dot(fragmentInputs.vUv * vec2f(0.8, 1.0), fragmentInputs.vUv * vec2f(0.8, 1.0));
  if (r2 > 1.0) { discard; }
  let wp = fragmentInputs.vWorldPos;
  let V = normalize(uniforms.cameraPosition - wp);
  let L = uniforms.keyDir;
  // Snow crystals scatter strongly forward; the sky lights them from everywhere.
  let c = dot(-V, L);
  let phase = 0.25 + 1.6 * pow(max(c, 0.0), 6.0);
  let vis = shadowVisibilityFast(wp, uniforms.cameraPosition);
  // Lit by the whole sky (flakes are tiny white scatterers; at 0.9 they read as dark dashes
  // against sunlit snow), plus the sun.
  let col = atmoKeyColor() * phase * vis * 0.45 + (shIrradiance(V) + shIrradiance(vec3f(0.0, 1.0, 0.0))) * uniforms.envMisc.w * 1.1;
  let lit = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(uniforms.cameraPosition - wp) * 0.001);
  let outc = displayTransform(lit, uniforms.fogParams.z * atmoExposure());
  let a = fragmentInputs.vAlpha * (1.0 - r2) * 0.85;
  fragmentOutputs.color = vec4f(outc * a, a);
}
`;
