// GPU grass (PLAN.md Phase 8 M3; art bar: screenshots/reference/forest-ruins-target.webp).
// Stateless like the snowfall: one static mesh per ring whose vertices only carry (clump id, blade,
// vertex); everything else is built in the vertex shader from the world cell the clump falls in —
// so a blade is the same blade whenever the camera comes back, nothing is uploaded per frame, and
// the draw never changes. Three camera-centred rings (cell 0.3 / 0.9 / 2.7 m) each skip the area
// the finer one covers, and thin out over their outer band so the next takes over without a seam.
//
// A blade: a tapered strip of S segments, curved by its lean, bent by the wind (travelling gust
// fronts along the climatological wind, the restoration's strength: a stilled meadow stands rigid)
// and laid down where the terrain state is pressed or ploughed (footprints, the surf's groove).
// Placement: meadow weight, not on steep ground, patch density from noise. Shading: colour from
// root to tip with per-blade variation; light through the blade when backlit (the reference's
// glowing grass), a sheen along it, occlusion toward the root, shadows from the cascades.

import { CLIPMAP_N, CLIPMAP_LEVELS } from './clipmap.wgsl.js';
import { ENV_DECL, COMMON_WGSL, SPELL_LIGHT_DECL, SPELL_LIGHT_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';
import { STATE_SAMPLE_WGSL, STATE_COMPACTION_WGSL } from './terrainState.wgsl.js';

/** Rings: [cell (m), grid (cells per side), blades per clump, segments per blade]. */
export const GRASS_RINGS = [[0.22, 110, 6, 4], [0.66, 110, 4, 2], [2.0, 110, 3, 1]];
export const vertsPerBlade = (seg) => (seg + 1) * 2;

export const grassVertexWGSL = /* wgsl */ `
attribute position: vec3f;           // x = clump id, y = blade, z = vertex in blade (row*2 + side)
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform levels: array<vec4f,16>;
uniform grassRing: vec4f;            // x = cell (m), y = grid cells per side, z = inner skip half (m), w = segments
uniform grassParams: vec4f;          // x = time (s), y = wind strength (0 stilled … 1), z = density ×, w = ring index
var<storage, read> levelData: array<vec4f>;
var<storage, read> biomeA: array<u32>;
var<storage, read> windMap: array<u32>;
varying vT: f32;                     // 0 root … 1 tip
varying vSide: f32;                  // −1 … 1 across
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vSeed: f32;
varying vDry: f32;

${STATE_SAMPLE_WGSL}
${STATE_COMPACTION_WGSL}

const V: u32 = ${CLIPMAP_N + 1}u;
const HALF: f32 = ${CLIPMAP_N / 2}.0;
const W_HALF: f32 = 4096.0;
const N8: i32 = 1024; const C8: f32 = 8.0;
const NW: i32 = 256; const CW: f32 = 32.0;

fn gh(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return f32((x >> 22u) ^ x) / 4294967295.0;
}
fn gh2(a: i32, b: i32, k: u32) -> f32 { return gh((u32(a) * 73856093u) ^ (u32(b) * 19349663u) ^ (k * 83492791u)); }
fn gGround(x: f32, z: f32) -> f32 {
  for (var l = 0u; l < ${CLIPMAP_LEVELS}u; l++) {
    let L = uniforms.levels[l];
    let g = (vec2f(x, z) - L.xy) / L.z + HALF;
    if (g.x >= 1.0 && g.y >= 1.0 && g.x < 2.0 * HALF - 1.0 && g.y < 2.0 * HALF - 1.0) {
      let b = floor(g); let t = g - b; let i = u32(b.x); let j = u32(b.y);
      return mix(mix(levelData[(l * V + j) * V + i].x, levelData[(l * V + j) * V + i + 1u].x, t.x),
                 mix(levelData[(l * V + j + 1u) * V + i].x, levelData[(l * V + j + 1u) * V + i + 1u].x, t.x), t.y);
    }
  }
  return 0.0;
}
fn gMeadow(x: f32, z: f32) -> f32 {
  let i = clamp(i32((x + W_HALF) / C8), 0, N8 - 1); let j = clamp(i32((W_HALF - z) / C8), 0, N8 - 1);
  let a = unpack4x8unorm(biomeA[j * N8 + i]);
  return a.y / max(a.x + a.y + a.z + a.w, 0.05);
}
fn gWind(x: f32, z: f32) -> vec2f {
  let i = clamp(i32((x + W_HALF) / CW), 0, NW - 1); let j = clamp(i32((W_HALF - z) / CW), 0, NW - 1);
  let w = (unpack4x8unorm(windMap[j * NW + i]).xy * 255.0 - 128.0) / 127.0;
  let l = length(w);
  return select(vec2f(1.0, 0.0), w / l, l > 1e-4);
}
fn vn(p: vec2f) -> f32 {
  let i = floor(p); let f = p - i; let u = f * f * (3.0 - 2.0 * f);
  let a = gh2(i32(i.x), i32(i.y), 7u); let b = gh2(i32(i.x) + 1, i32(i.y), 7u);
  let c = gh2(i32(i.x), i32(i.y) + 1, 7u); let d = gh2(i32(i.x) + 1, i32(i.y) + 1, 7u);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let id = u32(vertexInputs.position.x + 0.5);
  let blade = u32(vertexInputs.position.y + 0.5);
  let vtx = u32(vertexInputs.position.z + 0.5);
  let cell = uniforms.grassRing.x; let n = u32(uniforms.grassRing.y); let skip = uniforms.grassRing.z;
  let S = uniforms.grassRing.w;
  let cam = uniforms.cameraPosition;
  // The clump's world cell (camera-snapped grid) and its stable hash seeds.
  let c0 = vec2i(floor(cam.xz / cell)) - vec2i(i32(n / 2u));
  let gx = c0.x + i32(id % n); let gz = c0.y + i32(id / n);
  let h1 = gh2(gx, gz, 1u + blade * 7u); let h2 = gh2(gx, gz, 2u + blade * 7u); let h3 = gh2(gx, gz, 3u + blade * 7u);
  let h4 = gh2(gx, gz, 4u + blade * 7u); let h5 = gh2(gx, gz, 5u);
  let cx = (f32(gx) + 0.5) * cell; let cz = (f32(gz) + 0.5) * cell;
  // Blade root: around the clump centre.
  let ang = h1 * 6.2831853; let rr = sqrt(h2) * cell * 0.7;
  var root = vec2f(cx + h5 * cell * 0.4 + cos(ang) * rr, cz + gh2(gx, gz, 6u) * cell * 0.4 + sin(ang) * rr);
  let toCam = root - cam.xz; let dc = max(abs(toCam.x), abs(toCam.y));
  let half = f32(n) * 0.5 * cell;
  // Inside the finer ring's square: skip. Toward this ring's edge: thin out (the coarser takes over).
  var keep = select(1.0, 0.0, dc < skip);
  let edge = smoothstep(half * 0.72, half * 0.95, dc);
  // Density: the meadow, patches, not on steep ground.
  let mw = gMeadow(root.x, root.y);
  let patchN = vn(root * 0.05) * 0.7 + vn(root * 0.21) * 0.3;
  let dens = smoothstep(0.45, 0.8, mw) * smoothstep(0.05, 0.4, patchN + 0.2) * uniforms.grassParams.z;
  if (h3 > dens) { keep = 0.0; }
  let gy = gGround(root.x, root.y) + stateOffset(root.x, root.y);
  let gy2 = gGround(root.x + 0.7, root.y); let gy3 = gGround(root.x, root.y + 0.7);
  let slope = length(vec2f(gy2 - gy, gy3 - gy)) / 0.7;
  keep *= 1.0 - smoothstep(0.55, 0.8, slope);
  // Pressed and ploughed ground lays the grass down (footprints, the surf's groove, compaction).
  let st = stateSurface(root.x, root.y);
  let dep = stateHeights(root.x, root.y).x;
  let flat = clamp(st.x * 1.4 + dep * 6.0, 0.0, 1.0);
  // Blade dimensions: tall, thin near; wider and denser-looking clumps further out.
  let ring = uniforms.grassParams.w;
  var hgt = (0.18 + 0.32 * h4 + 0.35 * h4 * h4 * h4 * h4) * (0.55 + 0.7 * patchN) * (1.0 - 0.8 * flat);
  // Blades right at the lens thin away (a blade a hand from the camera fills the screen).
  let nearCam = smoothstep(0.7, 1.9, length(vec3f(root.x, gGround(root.x, root.y), root.y) - cam));
  let wid = (0.012 + 0.012 * h2) * (1.0 + ring * 1.4) * (1.0 - edge) * nearCam;
  if (keep < 0.5 || wid <= 1e-4) {
    vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0);
    vertexOutputs.vT = 0.0; vertexOutputs.vSide = 0.0; vertexOutputs.vWorldPos = vec3f(0.0); vertexOutputs.vNormal = vec3f(0.0, 1.0, 0.0); vertexOutputs.vSeed = 0.0; vertexOutputs.vDry = 0.0;
    return vertexOutputs;
  }
  let row = f32(vtx / 2u); let side = select(-1.0, 1.0, (vtx & 1u) == 1u);
  let t = row / S;
  // Facing and lean (each blade its own); the wind bends it further, in travelling gusts.
  let yaw = h3 * 6.2831853 + h1;
  let face = vec2f(cos(yaw), sin(yaw));
  let wd = gWind(root.x, root.y);
  let time = uniforms.grassParams.x;
  let phase = dot(root, wd) * 0.09 - time * 1.6;
  let gust = 0.55 + 0.45 * sin(phase) * sin(phase * 0.37 + 1.3) + 0.15 * sin(time * 3.1 + h1 * 6.28);
  let windAmt = uniforms.grassParams.y * gust;
  let lean = vec2f(sin(yaw * 1.7), cos(yaw * 1.3)) * (0.15 + 0.35 * h2) + wd * windAmt * 0.9 + vec2f(face.y, -face.x) * flat * 1.6;
  // Blade spine: bend grows with t² (stiff root), length preserved roughly.
  let bend = lean * t * t;
  let up = sqrt(max(1.0 - dot(bend, bend) * 0.5, 0.15));
  var p = vec3f(root.x + bend.x * hgt, gy + t * hgt * up, root.y + bend.y * hgt);
  // Width tapers to the tip; the blade faces its yaw.
  let w = wid * (1.0 - t * 0.85);
  let across = vec3f(-face.y, 0.0, face.x);
  p += across * side * w;
  // Normal: the blade's face, rolled across its width (a rounded blade), tilted up with distance
  // so a far field shades like the turf under it.
  var nrm = normalize(vec3f(face.x, 0.4, face.y) + across * side * 0.6);
  let far = smoothstep(8.0, 40.0, length(p - cam));
  nrm = normalize(mix(nrm, vec3f(0.0, 1.0, 0.0), 0.35 + 0.45 * far));
  vertexOutputs.position = uniforms.viewProjection * vec4f(p, 1.0);
  vertexOutputs.vT = t;
  vertexOutputs.vSide = side;
  vertexOutputs.vWorldPos = p;
  vertexOutputs.vNormal = nrm;
  vertexOutputs.vSeed = h4;
  vertexOutputs.vDry = smoothstep(0.55, 0.85, vn(root * 0.031 + 5.0) + 0.3 * h1);
}
`;

export const grassFragmentWGSL = /* wgsl */ `
${ENV_DECL}
${SPELL_LIGHT_DECL}
varying vT: f32;
varying vSide: f32;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vSeed: f32;
varying vDry: f32;
${COMMON_WGSL}
${SPELL_LIGHT_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let V = normalize(camPos - wp);
  var N = normalize(fragmentInputs.vNormal);
  // Two-sided: flip toward the viewer across the blade only — a blade's normal never points into
  // the ground (seen from behind, a flipped normal faced down and the blade went black).
  if (dot(N, V) < 0.0) { N = vec3f(-N.x, N.y, -N.z); }
  N = normalize(vec3f(N.x, max(N.y, 0.25), N.z));
  let t = fragmentInputs.vT;
  let sd = fragmentInputs.vSeed;
  // Colour: dark at the root, green through the body, paler and warmer at the tip; patches of
  // dry, straw-coloured grass; per-blade variation.
  let green = mix(vec3f(0.075, 0.11, 0.03), vec3f(0.12, 0.15, 0.045), sd);
  let dry = mix(vec3f(0.2, 0.19, 0.09), vec3f(0.25, 0.23, 0.12), sd);
  var albedo = mix(green, dry, fragmentInputs.vDry * (0.25 + 0.45 * t));
  albedo *= mix(0.35, 1.0, smoothstep(0.0, 0.45, t));
  albedo = mix(albedo, albedo * vec3f(1.15, 1.1, 0.8), t * t * 0.5);
  // A midrib: a little lighter along the blade's centre.
  albedo *= 0.92 + 0.12 * (1.0 - abs(fragmentInputs.vSide));
  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  let nl = dot(N, L);
  let vis = shadowVisibility(wp, N, camPos, fragmentInputs.position.xy);
  let ao = mix(0.35, 1.0, smoothstep(0.0, 0.6, t));
  let diff = clamp((nl + 0.3) / 1.3, 0.0, 1.0);
  let sky = shIrradiance(N) * uniforms.envMisc.w * ao;
  var col = albedo * (key * diff * vis / PI + sky);
  // Light through the blade: strongest looking toward the sun (the reference's glowing grass).
  let back = pow(clamp(dot(-V, L), 0.0, 1.0), 3.0) * (0.35 + 0.65 * t);
  col += key * albedo * vec3f(0.95, 1.3, 0.8) * back * vis * 0.32;
  // Sheen along the blade.
  let H = normalize(L + V);
  col += key * pow(max(dot(N, H), 0.0), 24.0) * 0.06 * vis * t;
  let ex = uniforms.fogParams.z * atmoExposure();
  col += spellLit(wp, N, albedo, 0.4, ex);
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(camPos - wp) * 0.001);
  fragmentOutputs.color = vec4f(displayTransform(col, ex), 0.0);
}
`;
