// Spindrift (BRIEF §5.6 ground blow, §6.1): a low, wind-driven stream of snow across open
// ground. Stateless GPU particles: every streak is a hashed seed in a camera-centred tile that
// advects downwind with time and wraps, rides the terrain height read from the clipmap levels,
// and is modulated by gust sheets travelling with the wind and by the frost biome weight. Soft
// streaks stretched along the wind; lit by forward scattering (bright toward the sun) and the
// sky IBL; premultiplied alpha. Deterministic for a given clock (captures are reproducible).

import { CLIPMAP_N, CLIPMAP_LEVELS } from './clipmap.wgsl.js';
import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';

export const SPINDRIFT_COUNT = 9000;
const R = 55; // m: half extent of the camera-centred tile

export const spindriftVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = streak id, yz = quad corner (−1..1)
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform levels: array<vec4f,16>;
uniform drift: vec4f;               // x = time (s), y = strength 0..1, z = speed scale
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

fn hsh(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return f32((x >> 22u) ^ x) / 4294967295.0;
}
fn windAtS(x: f32, z: f32) -> vec2f {
  let i = clamp(i32((x + W_HALF) / CW), 0, NW - 1); let j = clamp(i32((W_HALF - z) / CW), 0, NW - 1);
  let w = (unpack4x8unorm(windMap[j * NW + i]).xy * 255.0 - 128.0) / 127.0;
  let l = length(w);
  return select(vec2f(1.0, 0.0), w / l, l > 1e-4);
}
fn frostAt(x: f32, z: f32) -> f32 {
  let i = clamp(i32((x + W_HALF) / C8), 0, N8 - 1); let j = clamp(i32((W_HALF - z) / C8), 0, N8 - 1);
  let a = unpack4x8unorm(biomeA[j * N8 + i]);
  return a.x / max(a.x + a.y + a.z + a.w, 0.05);
}
// Terrain height from the finest clipmap level that covers (x, z) (bilinear).
fn groundAt(x: f32, z: f32) -> f32 {
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
  let t = uniforms.drift.x;
  let cam = uniforms.cameraPosition;
  let h1 = hsh(id * 4u); let h2 = hsh(id * 4u + 1u); let h3 = hsh(id * 4u + 2u); let h4 = hsh(id * 4u + 3u);
  let w0 = windAtS(cam.x, cam.z);
  let speed = (5.0 + 5.0 * h3) * uniforms.drift.z;
  // Position in a 2R tile that slides downwind, wrapped around the camera.
  let base = vec2f(h1, h2) * 2.0 * RT + w0 * speed * t;
  let rel = base - cam.xz;
  let wrapped = rel - 2.0 * RT * floor((rel + RT) / (2.0 * RT));
  var p = cam.xz + wrapped;
  let wind = windAtS(p.x, p.y);
  // Hugging the ground: most streaks within a few decimetres, a few lifted higher.
  let lift = 0.03 + 0.7 * h4 * h4 * h4 * h4 + 0.04 * sin(t * (2.0 + 3.0 * h1) + h2 * 6.28);
  let y = groundAt(p.x, p.y) + lift;
  // Gust sheets: a noise field advected with the wind; plus biome, distance and lifetime fades.
  let gp = (p - wind * t * 9.0) / vec2f(22.0, 22.0);
  let gust = smoothstep(0.45, 0.85, 0.5 + 0.5 * sin(gp.x * 1.7 + sin(gp.y * 1.3) * 2.0) * cos(gp.y * 0.9 + h1 * 0.6));
  let life = fract(t * (0.25 + 0.2 * h2) + h3);
  let dist = length(wrapped);
  var alpha = uniforms.drift.y * gust * smoothstep(0.45, 0.8, frostAt(p.x, p.y)) * sin(3.14159 * life)
            * (1.0 - smoothstep(RT * 0.55, RT * 0.95, dist)) * smoothstep(1.0, 3.0, dist) * (1.0 - 0.6 * h4);
  // Streak stretched along the wind, facing the camera around the wind axis.
  let ax = normalize(vec3f(wind.x, 0.0, wind.y));
  let toCam = normalize(cam - vec3f(p.x, y, p.y));
  let ay = normalize(cross(toCam, ax));
  let len = 0.6 + 1.6 * h1 * h1;
  let wid = 0.025 + 0.045 * h2;
  let wp = vec3f(p.x, y, p.y) + ax * corner.x * len + ay * corner.y * wid;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (alpha < 0.002) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); } // cull invisible streaks
  vertexOutputs.vUv = corner;
  vertexOutputs.vAlpha = alpha;
  vertexOutputs.vWorldPos = wp;
}
`;

export const spindriftFragmentWGSL = /* wgsl */ `
${ENV_DECL}
varying vUv: vec2f;
varying vAlpha: f32;
varying vWorldPos: vec3f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let u = fragmentInputs.vUv;
  let shape = (1.0 - u.x * u.x) * pow(max(1.0 - u.y * u.y, 0.0), 2.0);
  let a = clamp(fragmentInputs.vAlpha * shape * 0.12, 0.0, 1.0);
  if (a < 0.002) { discard; }
  let wp = fragmentInputs.vWorldPos;
  let V = normalize(uniforms.cameraPosition - wp);
  let L = uniforms.keyDir;
  // Fine ice grains scatter strongly forward: bright when looking toward the sun.
  let g = 0.65; let c = dot(-V, L);
  let hg = (1.0 - g * g) / pow(max(1.0 + g * g - 2.0 * g * c, 1e-3), 1.5) * (1.0 / (4.0 * PI));
  // Grains in shadow are lit by the sky only.
  let vis = shadowVisibility(wp, vec3f(0.0, 1.0, 0.0), uniforms.cameraPosition, fragmentInputs.position.xy);
  let col = atmoKeyColor() * (0.08 + hg) * 0.9 * vis + shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w;
  let lit = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(uniforms.cameraPosition - wp) * 0.001);
  let outc = displayTransform(lit, uniforms.fogParams.z * atmoExposure());
  fragmentOutputs.color = vec4f(outc * a, a);
}
`;
