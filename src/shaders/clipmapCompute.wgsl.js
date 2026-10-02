// Clipmap level update (compute). For every dirty level, evaluates the terrain height function at
// each grid vertex (pass "heights"), then derives normals from neighbouring grid heights
// (pass "normals"). Output per vertex: vec4(height, nx, nz, 0) in levelData, laid out
// [level][j][i] with V = N + 1 vertices per side. Levels whose snapped origin did not move (and
// whose residency version is current) are skipped by checking the dirty flag in params.

import { TERRAIN_NOISE_WGSL } from './terrainNoise.wgsl.js';
import { HEIGHT_WGSL, CLIPMAP_N, CLIPMAP_LEVELS } from './clipmap.wgsl.js';

const V = CLIPMAP_N + 1;

const COMMON = /* wgsl */ `
struct Params {
  // xy = origin (world x, z), z = spacing, w = dirty (1 = recompute)
  levels: array<vec4f, ${CLIPMAP_LEVELS}>,
};
@group(0) @binding(0) var<storage, read> heights: array<u32>;
@group(0) @binding(1) var<storage, read> overviewH: array<u32>;
@group(0) @binding(2) var<storage, read> biomeA: array<u32>;
@group(0) @binding(3) var<storage, read> biomeB: array<u32>;
@group(0) @binding(4) var<storage, read> windMap: array<u32>;
@group(0) @binding(5) var<storage, read> resident: array<u32>;
@group(0) @binding(6) var<storage, read_write> levelData: array<vec4f>;
@group(0) @binding(7) var<storage, read> params: Params;
const V: u32 = ${V}u;
const HALF: f32 = ${CLIPMAP_N / 2}.0;
`;

export const clipmapHeightsWGSL = /* wgsl */ `
${COMMON}
${TERRAIN_NOISE_WGSL}
${HEIGHT_WGSL}
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let level = id.z;
  if (id.x >= V || id.y >= V) { return; }
  let L = params.levels[level];
  if (L.w < 0.5) { return; }
  let s = L.z;
  let x = L.x + (f32(id.x) - HALF) * s;
  let z = L.y + (f32(id.y) - HALF) * s;
  levelData[(level * V + id.y) * V + id.x] = vec4f(terrainH(x, z, s), 0.0, 0.0, 0.0);
}
`;

export const clipmapNormalsWGSL = /* wgsl */ `
${COMMON}
fn hAt(level: u32, i: i32, j: i32) -> f32 {
  let ii = u32(clamp(i, 0, i32(V) - 1));
  let jj = u32(clamp(j, 0, i32(V) - 1));
  return levelData[(level * V + jj) * V + ii].x;
}
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let level = id.z;
  if (id.x >= V || id.y >= V) { return; }
  let L = params.levels[level];
  if (L.w < 0.5) { return; }
  let s = L.z;
  let i = i32(id.x); let j = i32(id.y);
  // Central differences (one-sided at the border).
  let il = max(i - 1, 0); let ir = min(i + 1, i32(V) - 1);
  let jd = max(j - 1, 0); let ju = min(j + 1, i32(V) - 1);
  let gx = (hAt(level, ir, j) - hAt(level, il, j)) / (f32(ir - il) * s);
  let gz = (hAt(level, i, ju) - hAt(level, i, jd)) / (f32(ju - jd) * s);
  let n = normalize(vec3f(-gx, 1.0, -gz));
  let k = (level * V + id.y) * V + id.x;
  levelData[k] = vec4f(levelData[k].x, n.x, n.z, 0.0);
}
`;

export const CLIPMAP_V = V;
