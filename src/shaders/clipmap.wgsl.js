// Clipmap terrain (BRIEF §4.2). One static N×N grid drawn as LEVELS thin instances (level index in
// the instance matrix translation x). Each level is a full square around its snapped origin; the
// vertex shader sinks the part the next finer level covers below it, so no trim strips are needed.
// Geomorphing: within the outer band of each level, odd vertices slide onto the coarser grid and
// heights blend to the coarser level's function, so seams are watertight and nothing pops.
//
// Height H(P, level) = macro (Catmull-Rom over 2 m texels from storage buffers, each texel falling
// back to the 8 m overview while its tile is not resident; levels ≥ 8 m spacing use the overview
// directly) + meso (shared with the CPU, src/terrain/meso.js, faded by level spacing) + micro
// (GPU-only decimetre detail near the camera).
//
// Phase 1 "clay" shading: wrapped diffuse + sky ambient + aerial perspective, tinted by biome.

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';
import { STATE_SAMPLE_WGSL, STATE_COMPACTION_WGSL } from './terrainState.wgsl.js';
import { SNOW_WGSL } from './snow.wgsl.js';
import { MATERIALS_DECL, MATERIALS_WGSL } from './materials.wgsl.js';
import { TERRAIN_NOISE_WGSL } from './terrainNoise.wgsl.js';

export const CLIPMAP_N = 256;     // quads per level side
export const CLIPMAP_LEVELS = 12; // finest 6.25 cm, coarsest 128 m spacing (half-extent 16 km)

/** Height functions shared by the clipmap shader and tools/capture/parity-check.mjs. */
export const HEIGHT_WGSL = /* wgsl */ `
const W_HALF: f32 = 4096.0;
const N2: i32 = 4096;  const C2: f32 = 2.0;
const N8: i32 = 1024;  const C8: f32 = 8.0;
const NW: i32 = 256;   const CW: f32 = 32.0;
const TILES: i32 = 16; const TILE: i32 = 256;

fn ovTexel(iIn: i32, jIn: i32) -> f32 {
  let i = clamp(iIn, 0, N8 - 1);
  let j = clamp(jIn, 0, N8 - 1);
  let idx = j * N8 + i;
  let w = overviewH[idx >> 1u];
  let v = select(w & 0xffffu, w >> 16u, (idx & 1) != 0);
  return f32(v) / 32.0 - 128.0;
}

fn detailTexel(iIn: i32, jIn: i32) -> f32 {
  let i = clamp(iIn, 0, N2 - 1);
  let j = clamp(jIn, 0, N2 - 1);
  let tx = i >> 8u;
  let tz = j >> 8u;
  let k = tz * TILES + tx;
  if (resident[k] != 0u) {
    let idx = k * TILE * TILE + (j - tz * TILE) * TILE + (i - tx * TILE);
    let w = heights[idx >> 1u];
    let v = select(w & 0xffffu, w >> 16u, (idx & 1) != 0);
    return f32(v) / 32.0 - 128.0;
  }
  // Overview fallback at the 2 m texel centre (same rule as WorldData._texel).
  let u = (f32(i) + 0.5) * 0.25 - 0.5;
  let vv = (f32(j) + 0.5) * 0.25 - 0.5;
  let i0 = i32(floor(u)); let j0 = i32(floor(vv));
  let fu = u - f32(i0); let fv = vv - f32(j0);
  let a = ovTexel(i0, j0); let b = ovTexel(i0 + 1, j0);
  let c = ovTexel(i0, j0 + 1); let d = ovTexel(i0 + 1, j0 + 1);
  let ab = a + (b - a) * fu;
  return ab + ((c + (d - c) * fu) - ab) * fv;
}

fn crW(t: f32) -> vec4f {
  let t2 = t * t; let t3 = t2 * t;
  return vec4f(0.5 * (-t3 + 2.0 * t2 - t), 0.5 * (3.0 * t3 - 5.0 * t2 + 2.0), 0.5 * (-3.0 * t3 + 4.0 * t2 + t), 0.5 * (t3 - t2));
}

fn macroDetail(x: f32, z: f32) -> f32 {
  let u = (x + W_HALF) / C2 - 0.5;
  let v = (W_HALF - z) / C2 - 0.5;
  let i0 = i32(floor(u)); let j0 = i32(floor(v));
  let wu = crW(u - f32(i0)); let wv = crW(v - f32(j0));
  var h = 0.0;
  for (var m = -1; m <= 2; m++) {
    let j = j0 + m;
    let row = wu.x * detailTexel(i0 - 1, j) + wu.y * detailTexel(i0, j) + wu.z * detailTexel(i0 + 1, j) + wu.w * detailTexel(i0 + 2, j);
    h += row * wv[m + 1];
  }
  return h;
}

fn macroOverview(x: f32, z: f32) -> f32 {
  let u = (x + W_HALF) / C8 - 0.5;
  let v = (W_HALF - z) / C8 - 0.5;
  let i0 = i32(floor(u)); let j0 = i32(floor(v));
  let wu = crW(u - f32(i0)); let wv = crW(v - f32(j0));
  var h = 0.0;
  for (var m = -1; m <= 2; m++) {
    let j = j0 + m;
    let row = wu.x * ovTexel(i0 - 1, j) + wu.y * ovTexel(i0, j) + wu.z * ovTexel(i0 + 1, j) + wu.w * ovTexel(i0 + 2, j);
    h += row * wv[m + 1];
  }
  return h;
}

// Bilinear biome weights (8 m): returns frost, meadow, mire, dunes in .xyzw and ember, coast in out.
fn biomeAt(x: f32, z: f32, wB: ptr<function, vec2f>) -> vec4f {
  let u = (x + W_HALF) / C8 - 0.5;
  let v = (W_HALF - z) / C8 - 0.5;
  let i0 = clamp(i32(floor(u)), 0, N8 - 1); let j0 = clamp(i32(floor(v)), 0, N8 - 1);
  let i1 = clamp(i0 + 1, 0, N8 - 1); let j1 = clamp(j0 + 1, 0, N8 - 1);
  let fu = clamp(u - floor(u), 0.0, 1.0); let fv = clamp(v - floor(v), 0.0, 1.0);
  let a00 = unpack4x8unorm(biomeA[j0 * N8 + i0]); let a10 = unpack4x8unorm(biomeA[j0 * N8 + i1]);
  let a01 = unpack4x8unorm(biomeA[j1 * N8 + i0]); let a11 = unpack4x8unorm(biomeA[j1 * N8 + i1]);
  let b00 = unpack4x8unorm(biomeB[j0 * N8 + i0]); let b10 = unpack4x8unorm(biomeB[j0 * N8 + i1]);
  let b01 = unpack4x8unorm(biomeB[j1 * N8 + i0]); let b11 = unpack4x8unorm(biomeB[j1 * N8 + i1]);
  let b = mix(mix(b00, b10, fu), mix(b01, b11, fu), fv);
  *wB = b.xy;
  return mix(mix(a00, a10, fu), mix(a01, a11, fu), fv);
}

fn windAt(x: f32, z: f32) -> vec2f {
  let u = (x + W_HALF) / CW - 0.5;
  let v = (W_HALF - z) / CW - 0.5;
  let i0 = clamp(i32(floor(u)), 0, NW - 1); let j0 = clamp(i32(floor(v)), 0, NW - 1);
  let i1 = clamp(i0 + 1, 0, NW - 1); let j1 = clamp(j0 + 1, 0, NW - 1);
  let fu = clamp(u - floor(u), 0.0, 1.0); let fv = clamp(v - floor(v), 0.0, 1.0);
  let w00 = unpack4x8unorm(windMap[j0 * NW + i0]).xy; let w10 = unpack4x8unorm(windMap[j0 * NW + i1]).xy;
  let w01 = unpack4x8unorm(windMap[j1 * NW + i0]).xy; let w11 = unpack4x8unorm(windMap[j1 * NW + i1]).xy;
  // unorm bytes → signed: (b·255 − 128)/127
  let w = (mix(mix(w00, w10, fu), mix(w01, w11, fu), fv) * 255.0 - 128.0) / 127.0;
  let l = length(w);
  return select(vec2f(1.0, 0.0), w / l, l > 1e-4);
}

// LOD fade of a feature with wavelength lambda at grid spacing s (fully present while s ≤ λ/8).
fn lodFade(lambda: f32, s: f32) -> f32 { return 1.0 - smoothstep(lambda / 8.0, lambda / 3.0, s); }

fn mesoLod(x: f32, z: f32, wA: vec4f, wB: vec2f, wind: vec2f, s: f32) -> f32 {
  if (s <= 0.75) { return tn_mesoHeight(x, z, wA, wB, wind); }
  // Coarse levels: keep the layers whose wavelength the grid can carry.
  let fadeDunes = lodFade(140.0, s);
  let fadeDrift = lodFade(42.0, s);
  let fadeSmall = lodFade(8.0, s);
  let wA2 = vec4f(wA.x * fadeDrift, wA.y * fadeSmall, wA.z * fadeSmall, wA.w * fadeDunes);
  let wB2 = vec2f(wB.x * lodFade(60.0, s), wB.y * fadeSmall);
  return tn_mesoHeight(x, z, wA2, wB2, wind);
}

fn microH(x: f32, z: f32, wA: vec4f, wind: vec2f, s: f32) -> f32 {
  // Only grids that sample these features at ≥ 4 vertices per wavelength carry them (coarser
  // levels would alias them into moiré); shading normals carry the detail further out.
  let f = 1.0 - smoothstep(0.065, 0.14, s);
  if (f <= 0.0) { return 0.0; }
  let u = x * wind.x + z * wind.y;
  let v = -x * wind.y + z * wind.x;
  let ripples = 0.035 * tn_fbm(u / 0.55, v / 2.2, 2, 991u);
  let grain = 0.02 * tn_fbm(x / 0.35, z / 0.35, 2, 992u);
  // Frost sastrugi: sharp wind-carved ridges elongated along the wind (decimetres high, metres
  // long), with a steep upwind prow: the ridge line is sampled slightly downwind for the profile.
  var sast = 0.0;
  if (wA.x > 0.01) {
    let fs = f;
    if (fs > 0.0) {
      let n = tn_fbm(u / 2.6, v / 0.55, 3, 993u);
      let r = 1.0 - abs(n);
      let prow = 0.5 + 0.5 * tn_valueNoise(u / 0.9 + 0.35, v / 0.55, 994u);
      let field = smoothstep(-0.2, 0.5, tn_fbm(u / 14.0, v / 6.0, 2, 995u)); // sastrugi come in fields
      sast = fs * 0.11 * r * r * r * (0.6 + 0.4 * prow) * field;
    }
  }
  return f * ((wA.w + wA.x * 0.6) * ripples + grain) + wA.x * sast;
}

// Beyond the baked 8 km the clamped edge texels would extend as flat shelves: fall away below
// sea level over 2 km (same rule as WorldData.edgeFalloff). The mountain-ring impostor owns the
// horizon out there.
fn edgeFalloff(h: f32, x: f32, z: f32) -> f32 {
  let out = max(max(abs(x), abs(z)) - W_HALF, 0.0);
  return mix(h, -60.0, smoothstep(0.0, 2000.0, out));
}

fn terrainH(x: f32, z: f32, s: f32) -> f32 {
  let macroH = edgeFalloff(select(macroDetail(x, z), macroOverview(x, z), s >= 8.0), x, z);
  var wB = vec2f(0.0);
  let wA = biomeAt(x, z, &wB);
  let wind = windAt(x, z);
  let alp = tn_alpineHeight(x, z, macroH, wA.x, lodFade(180.0, s), lodFade(60.0, s));
  return macroH + mesoLod(x, z, wA, wB, wind, s) + alp + microH(x, z, wA, wind, s);
}
`;

export const clipmapVertexWGSL = /* wgsl */ `
attribute position: vec3f;
attribute world0: vec4f;
attribute world1: vec4f;
attribute world2: vec4f;
attribute world3: vec4f;
uniform viewProjection: mat4x4f;
uniform levels: array<vec4f,16>;
uniform camGrid: vec4f;
var<storage, read> levelData: array<vec4f>;
var<storage, read> biomeA: array<u32>;
var<storage, read> biomeB: array<u32>;
var<storage, read> windMap: array<u32>;
var<storage, read> hydro: array<u32>;
${STATE_SAMPLE_WGSL}
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vLevel: f32;
varying vBiomeA: vec4f;
varying vBiomeB: vec2f;
varying vWind: vec2f;
varying vLake: f32;
varying vNormalC: vec3f;

const W_HALF: f32 = 4096.0;
const N8: i32 = 1024; const C8: f32 = 8.0;
const NW: i32 = 256;   const CW: f32 = 32.0;
const N4: i32 = 2048;  const C4: f32 = 4.0;

// Prevailing wind (unit, blowing toward), bilinear over the 32 m climatology.
fn windAtV(x: f32, z: f32) -> vec2f {
  let u = (x + W_HALF) / CW - 0.5;
  let v = (W_HALF - z) / CW - 0.5;
  let i0 = clamp(i32(floor(u)), 0, NW - 1); let j0 = clamp(i32(floor(v)), 0, NW - 1);
  let i1 = clamp(i0 + 1, 0, NW - 1); let j1 = clamp(j0 + 1, 0, NW - 1);
  let fu = clamp(u - floor(u), 0.0, 1.0); let fv = clamp(v - floor(v), 0.0, 1.0);
  let w = mix(mix(unpack4x8unorm(windMap[j0 * NW + i0]).xy, unpack4x8unorm(windMap[j0 * NW + i1]).xy, fu),
              mix(unpack4x8unorm(windMap[j1 * NW + i0]).xy, unpack4x8unorm(windMap[j1 * NW + i1]).xy, fu), fv);
  let d = (w * 255.0 - 128.0) / 127.0;
  let l = length(d);
  return select(vec2f(1.0, 0.0), d / l, l > 1e-4);
}
// Lake mask (hydro channel 1), bilinear over 4 m texels.
fn lakeAt(x: f32, z: f32) -> f32 {
  let u = (x + W_HALF) / C4 - 0.5;
  let v = (W_HALF - z) / C4 - 0.5;
  let i0 = clamp(i32(floor(u)), 0, N4 - 1); let j0 = clamp(i32(floor(v)), 0, N4 - 1);
  let i1 = clamp(i0 + 1, 0, N4 - 1); let j1 = clamp(j0 + 1, 0, N4 - 1);
  let fu = clamp(u - floor(u), 0.0, 1.0); let fv = clamp(v - floor(v), 0.0, 1.0);
  return mix(mix(unpack4x8unorm(hydro[j0 * N4 + i0]).y, unpack4x8unorm(hydro[j0 * N4 + i1]).y, fu),
             mix(unpack4x8unorm(hydro[j1 * N4 + i0]).y, unpack4x8unorm(hydro[j1 * N4 + i1]).y, fu), fv);
}
const V: u32 = ${CLIPMAP_N + 1}u;
const HALF: f32 = ${CLIPMAP_N / 2}.0;

fn biomeAt(x: f32, z: f32, wB: ptr<function, vec2f>) -> vec4f {
  let u = (x + W_HALF) / C8 - 0.5;
  let v = (W_HALF - z) / C8 - 0.5;
  let i0 = clamp(i32(floor(u)), 0, N8 - 1); let j0 = clamp(i32(floor(v)), 0, N8 - 1);
  let i1 = clamp(i0 + 1, 0, N8 - 1); let j1 = clamp(j0 + 1, 0, N8 - 1);
  let fu = clamp(u - floor(u), 0.0, 1.0); let fv = clamp(v - floor(v), 0.0, 1.0);
  let a = mix(mix(unpack4x8unorm(biomeA[j0 * N8 + i0]), unpack4x8unorm(biomeA[j0 * N8 + i1]), fu),
              mix(unpack4x8unorm(biomeA[j1 * N8 + i0]), unpack4x8unorm(biomeA[j1 * N8 + i1]), fu), fv);
  let b = mix(mix(unpack4x8unorm(biomeB[j0 * N8 + i0]), unpack4x8unorm(biomeB[j0 * N8 + i1]), fu),
              mix(unpack4x8unorm(biomeB[j1 * N8 + i0]), unpack4x8unorm(biomeB[j1 * N8 + i1]), fu), fv);
  *wB = b.xy;
  return a;
}

fn levelSample(level: u32, i: u32, j: u32) -> vec4f { return levelData[(level * V + j) * V + i]; }

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let level = u32(vertexInputs.world3.x + 0.5);
  let L = uniforms.levels[level];
  let s = L.z;
  let i = u32(vertexInputs.position.x + HALF);
  let j = u32(vertexInputs.position.z + HALF);
  var p = L.xy + vertexInputs.position.xz * s;
  let d0 = levelSample(level, i, j);
  var h = d0.x;
  var nxz = d0.yz;
  // Morph toward the parent grid in the outer band (camera-relative distance, continuous).
  let cam = uniforms.camGrid.xz;
  let dist = max(abs(p.x - cam.x), abs(p.y - cam.y)) / s;
  let band = 24.0;
  var alpha = clamp((dist - (HALF - 1.0 - band)) / band, 0.0, 1.0);
  if (level == ${CLIPMAP_LEVELS - 1}u) { alpha = 0.0; }
  if (alpha > 0.0) {
    // Odd vertices collapse onto the even (parent) vertex below them; even ones stay.
    let ti = i - (i & 1u);
    let tj = j - (j & 1u);
    let t = L.xy + (vec2f(f32(ti), f32(tj)) - HALF) * s;
    let P = uniforms.levels[level + 1u];
    let pi = u32((t.x - P.x) / P.z + HALF + 0.5);
    let pj = u32((t.y - P.y) / P.z + HALF + 0.5);
    let dp = levelSample(level + 1u, pi, pj);
    p = mix(p, t, alpha);
    h = mix(h, dp.x, alpha);
    nxz = mix(nxz, dp.yz, alpha);
  }
  let n = normalize(vec3f(nxz.x, sqrt(max(1.0 - dot(nxz, nxz), 0.0)), nxz.y));
  // Hide this level where the finer level draws: vertices strictly inside the finer square sink
  // far below it (depth hides them). Boundary vertices stay, so the two surfaces meet exactly —
  // no fragment discard, no precision-dependent cracks, and early-z keeps working.
  if (level > 0u) {
    let F = uniforms.levels[level - 1u];
    let ext = F.z * HALF - F.z * 0.5;
    if (abs(p.x - F.x) < ext && abs(p.y - F.y) < ext) { h -= 200.0; }
  }
  // Terrain-state deformation (BRIEF §4.3): displaced mass raises, depression lowers. Fine levels
  // only — a coarse grid would alias the 2 cm / 25 cm state; distant marks shade via the fragment.
  let defFade = 1.0 - smoothstep(0.5, 2.0, s);
  if (defFade > 0.0) { h += stateOffset(p.x, p.y) * defFade; }
  let wp = vec3f(p.x, h, p.y);
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vNormal = n;
  vertexOutputs.vLevel = f32(level);
  vertexOutputs.vWind = windAtV(p.x, p.y);
  // Large-scale normal (three levels coarser, bilinear): free of the micro layer, so the
  // material's rock/ice masks follow landforms, not individual sastrugi.
  let lc = min(level + 3u, ${CLIPMAP_LEVELS - 1}u);
  let Pc = uniforms.levels[lc];
  let gc = (p - Pc.xy) / Pc.z + HALF;
  let gi = clamp(floor(gc), vec2f(0.0), vec2f(2.0 * HALF - 1.0));
  let gf = clamp(gc - gi, vec2f(0.0), vec2f(1.0));
  let c00 = levelSample(lc, u32(gi.x), u32(gi.y)).yz; let c10 = levelSample(lc, u32(gi.x) + 1u, u32(gi.y)).yz;
  let c01 = levelSample(lc, u32(gi.x), u32(gi.y) + 1u).yz; let c11 = levelSample(lc, u32(gi.x) + 1u, u32(gi.y) + 1u).yz;
  let nc = mix(mix(c00, c10, gf.x), mix(c01, c11, gf.x), gf.y);
  vertexOutputs.vNormalC = vec3f(nc.x, sqrt(max(1.0 - dot(nc, nc), 0.0)), nc.y);
  vertexOutputs.vLake = lakeAt(p.x, p.y);
  var wB = vec2f(0.0);
  vertexOutputs.vBiomeA = biomeAt(p.x, p.y, &wB);
  vertexOutputs.vBiomeB = wB;
}
`;

export const clipmapFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform levels: array<vec4f,16>;
uniform playerPos: vec4f;
uniform spellLights: array<vec4f,8>;   // 4 × (pos.xyz, radius), (colour.rgb, intensity)
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vLevel: f32;
varying vBiomeA: vec4f;
varying vBiomeB: vec2f;
varying vWind: vec2f;
varying vLake: f32;
varying vNormalC: vec3f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
${STATE_SAMPLE_WGSL}
${STATE_COMPACTION_WGSL}
${MATERIALS_DECL}
${MATERIALS_WGSL}
${SNOW_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let level = i32(fragmentInputs.vLevel + 0.5);
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  // Pixel footprint in metres (detail fades by it): computed before any branch.
  let fp = length(fwidth(wp)) * 0.7;
  let V = normalize(camPos - wp);
  var N = normalize(fragmentInputs.vNormal);
  matDpx = dpdx(wp); matDpy = dpdy(wp);
  let dist = length(camPos - wp);

  // Clay albedo tinted by biome (debug-readable, not final materials).
  let wA = fragmentInputs.vBiomeA; let wB = fragmentInputs.vBiomeB;
  // Roughly physical albedos per biome (clay view): snow, grass, mire, sand, ash, beach.
  var albedo = vec3f(0.78, 0.80, 0.84) * wA.x + vec3f(0.17, 0.24, 0.11) * wA.y + vec3f(0.12, 0.14, 0.10) * wA.z
             + vec3f(0.52, 0.42, 0.28) * wA.w + vec3f(0.10, 0.095, 0.09) * wB.x + vec3f(0.50, 0.46, 0.38) * wB.y;
  albedo = albedo / max(wA.x + wA.y + wA.z + wA.w + wB.x + wB.y, 0.001);
  let slope = 1.0 - N.y;
  albedo = mix(albedo, vec3f(0.30, 0.29, 0.28), smoothstep(0.35, 0.6, slope));
  // Clay-view sea: below sea level reads as dark water until the Phase 12 ocean exists.
  let sea = smoothstep(0.5, -1.5, wp.y);
  albedo = mix(albedo, vec3f(0.035, 0.065, 0.085), sea);
  N = normalize(mix(N, vec3f(0.0, 1.0, 0.0), sea));
  // Terrain state: normals from the deformation heightfield at its own resolution (2 cm in the
  // fine window, 25 cm in coarse pages), so marks light correctly even where geometry is coarse.
  let st = stateHeights(wp.x, wp.z);
  var stateGrad = vec2f(0.0);
  if (st.x + st.y > 1e-4) {
    let e = stateTexel(wp.x, wp.z);
    stateGrad = vec2f(stateOffset(wp.x + e, wp.z) - stateOffset(wp.x - e, wp.z),
                      stateOffset(wp.x, wp.z + e) - stateOffset(wp.x, wp.z - e)) / (2.0 * e);
    N = normalize(vec3f(N.x - stateGrad.x * N.y, N.y, N.z - stateGrad.y * N.y));
  }

  let L = uniforms.keyDir;
  let wrap = 0.25;
  let diff = clamp((dot(N, L) + wrap) / (1.0 + wrap), 0.0, 1.0);
  let pp = uniforms.playerPos;
  let toP = wp.xz - (pp.xz - L.xz * 0.35);
  let cs = 1.0 - 0.55 * exp(-dot(toP, toP) / (pp.w * pp.w)) * smoothstep(1.5, 0.0, abs(wp.y - pp.y));
  // Light from the atmosphere: key colour and sky irradiance computed on the GPU from the LUTs.
  let key = atmoKeyColor();
  let skyUp = atmoSkyUp() * uniforms.envMisc.w; let skySide = atmoSkySide() * uniforms.envMisc.w;
  let sky = shIrradiance(N) * uniforms.envMisc.w;
  let bounce = (key * max(L.y, 0.0) * (0.12 / PI) + skyUp * 0.25) * mix(0.0, 1.0, clamp(-N.y * 0.5 + 0.5, 0.0, 1.0));
  // Lambert: albedo/π · E · cosθ for the key; sky terms are already radiance (E/π).
  let vis = shadowVisibility(wp, normalize(fragmentInputs.vNormal), camPos, fragmentInputs.position.xy);
  var col = albedo * (key * diff * cs * vis * (1.0 / PI) + sky * mix(1.0, cs, 0.5));
  // Frost Steppe material (Phase 2) over the clay view, by frost weight.
  let wSum = wA.x + wA.y + wA.z + wA.w + wB.x + wB.y;
  let wFrost = smoothstep(0.3, 0.7, wA.x / max(wSum, 0.001)) * (1.0 - sea);
  // Reflection weight for SSR (post chain): Fresnel × the ice/wet gloss, in the target's alpha.
  var ssrMask = 0.0;
  if (wFrost > 0.001) {
    let Ng = normalize(vec3f(fragmentInputs.vNormal.x - stateGrad.x * fragmentInputs.vNormal.y, fragmentInputs.vNormal.y,
                             fragmentInputs.vNormal.z - stateGrad.y * fragmentInputs.vNormal.y));
    var fs = frostSurface(wp, Ng, normalize(fragmentInputs.vNormalC), normalize(fragmentInputs.vWind), fragmentInputs.vLake, fp);
    frostApplyState(&fs, wp, st, stateSurface(wp.x, wp.z), fp);
    var fcol = frostLight(fs, wp, Ng, V, L, key, vis * cs, uniforms.envMisc.w, fp);
    ssrMask = wFrost * fs.ice * (0.02 + 0.98 * pow(1.0 - max(dot(fs.N, V), 0.0), 5.0)) * 0.6;
    // Spell lights (BRIEF §5.3): display-referred, and mostly from within — the drift glows
    // around the light (subsurface), ice and slush catch it on the surface.
    let ex = uniforms.fogParams.z * atmoExposure();
    for (var li = 0u; li < 4u; li++) {
      let lp = uniforms.spellLights[li * 2u]; let lc = uniforms.spellLights[li * 2u + 1u];
      if (lc.w <= 0.0) { continue; }
      let lv = lp.xyz - wp; let d = length(lv);
      if (d >= lp.w) { continue; }
      let fall = (1.0 - d / lp.w) * (1.0 - d / lp.w) / (1.0 + d * d * 0.6);
      let nl = max(dot(fs.N, lv / max(d, 1e-3)), 0.0);
      let glow = lc.rgb * lc.w * fall * (0.35 * nl * (fs.snow + fs.ice) + 0.55 * fs.snow + 0.25 * fs.ice);
      fcol += glow * fs.albedo / max(ex, 1e-6) * 0.35;
    }
    col = mix(col, fcol, wFrost);
  }
  // Aerial perspective.
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, dist * 0.001);
  var outc = displayTransform(col, uniforms.fogParams.z * atmoExposure());
  fragmentOutputs.color = vec4f(outc, ssrMask);
}
`;
