// Diamond dust (BRIEF §5.6, the stilled biome): ice grains hanging motionless in the air of a
// stilled steppe — the clearest sign that the wind itself has stopped. Stateless GPU points in a
// camera-centred volume: each grain is a hashed seed that only moves by the wind's accumulated
// "moving time" (owner-integrated, 0 while stilled), so the air is frozen until the release
// sets it drifting, then thinning away. Every grain is a tiny plate crystal with its own
// orientation: it flashes only where it mirrors the sun into the eye, so the frozen field
// twinkles as the camera moves through it. Additive (premultiplied with alpha 0).

import { CLIPMAP_N, CLIPMAP_LEVELS } from './clipmap.wgsl.js';
import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';

export const DUST_COUNT = 7000;
const R = 32; // m: half extent of the camera-centred volume

export const dustVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = grain id, yz = quad corner (−1..1)
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform levels: array<vec4f,16>;
uniform dust: vec4f;                // x = moving time (s), y = density 0..1, z = time (s)
var<storage, read> levelData: array<vec4f>;
var<storage, read> biomeA: array<u32>;
var<storage, read> windMap: array<u32>;
varying vUv: vec2f;
varying vAlpha: f32;
varying vWorldPos: vec3f;
varying vNrm: vec3f;
varying vSize: f32;

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
  let tm = uniforms.dust.x;
  let h1 = hsh(id * 5u); let h2 = hsh(id * 5u + 1u); let h3 = hsh(id * 5u + 2u); let h4 = hsh(id * 5u + 3u); let h5 = hsh(id * 5u + 4u);
  let w0 = windAtD(cam.x, cam.z);
  // Seeds in a 2R tile, carried downwind only by the moving time; wrapped around the camera.
  let base = vec2f(h1, h2) * 2.0 * RT + w0 * (3.0 + 3.0 * h3) * tm;
  let rel = base - cam.xz;
  let wrapped = rel - 2.0 * RT * floor((rel + RT) / (2.0 * RT));
  let p = cam.xz + wrapped;
  // Heights: most grains low, thinning upward; a slow settle once the air moves.
  let y = groundAtD(p.x, p.y) + 0.25 + 12.0 * h4 * h4 + 0.15 * sin(tm * (0.7 + h5) + h1 * 6.28);
  let wp0 = vec3f(p.x, y, p.y);
  let dist = length(wp0 - cam);
  var alpha = uniforms.dust.y * smoothstep(0.45, 0.8, frostAtD(p.x, p.y))
            * (1.0 - smoothstep(RT * 0.6, RT * 0.95, length(wrapped))) * smoothstep(0.6, 1.6, dist);
  // At least ~1.5 px wide at any distance; energy kept by dimming the grains that are enlarged.
  let size = max(0.006, dist * 0.0011);
  alpha *= (0.006 / size) * (0.006 / size) * 0.5 + 0.5 * (0.006 / size);
  let toCam = normalize(cam - wp0);
  let right = normalize(cross(vec3f(0.0, 1.0, 0.0), toCam));
  let up = cross(toCam, right);
  let wp = wp0 + (right * corner.x + up * corner.y) * size;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (alpha < 0.003) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vUv = corner;
  vertexOutputs.vAlpha = alpha;
  vertexOutputs.vWorldPos = wp0;
  // A plate crystal: mostly horizontal (they settle face-down in still air), a few tumbled.
  let tilt = select(0.3, 1.57, h5 > 0.45) * h3;
  let az = h1 * 6.2832 + tm * 2.0 * h2;
  vertexOutputs.vNrm = normalize(vec3f(sin(az) * sin(tilt), cos(tilt), cos(az) * sin(tilt)));
  vertexOutputs.vSize = size;
}
`;

export const dustFragmentWGSL = /* wgsl */ `
${ENV_DECL}
varying vUv: vec2f;
varying vAlpha: f32;
varying vWorldPos: vec3f;
varying vNrm: vec3f;
varying vSize: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let r2 = dot(fragmentInputs.vUv, fragmentInputs.vUv);
  if (r2 > 1.0) { discard; }
  let wp = fragmentInputs.vWorldPos;
  let V = normalize(uniforms.cameraPosition - wp);
  let L = uniforms.keyDir;
  // Mirror flash: the plate sends the sun into the eye (two faces), plus faint forward scatter.
  let H = normalize(L + V);
  let m = abs(dot(fragmentInputs.vNrm, H));
  let flash = pow(m, 500.0) * 40.0 + pow(m, 40.0) * 0.5;
  let c = dot(-V, L);
  let fwd = 0.04 + 0.5 * pow(max(c, 0.0), 8.0);
  let vis = shadowVisibilityFast(wp, uniforms.cameraPosition);
  let col = atmoKeyColor() * (flash + fwd) * vis * 0.2 + shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w * 0.04;
  let lit = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(uniforms.cameraPosition - wp) * 0.001);
  let outc = displayTransform(lit, uniforms.fogParams.z * atmoExposure());
  let a = fragmentInputs.vAlpha * (1.0 - r2) * (1.0 - r2);
  fragmentOutputs.color = vec4f(outc * a, 0.0);
}
`;
