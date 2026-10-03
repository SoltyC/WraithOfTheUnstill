// Rock outcrops with accumulation (BRIEF §5.1 rock, §6.1). One icosphere mesh, thin-instanced:
// every instance is displaced in the vertex shader by noise seeded per instance (no two rocks
// alike, smooth normals by finite differences), seated on the rendered terrain height read from
// the clipmap levels, and rejected on the GPU outside the frost biome or on cliffs. Fragment:
// dark layered strata with triplanar detail, snow accumulated on upward faces and drifted
// against the base, lit like the terrain (sun/moon, sky IBL, CSM).
//
// Instance data rides in the thin-instance matrix: world0 = (x, z, size, yaw), world1 = (seed,
// aspect, burial, kind), world2/3 unused.

import { CLIPMAP_N, CLIPMAP_LEVELS } from './clipmap.wgsl.js';
import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';

/** Vertex code shared by the colour pass and (with normals off) the shadow casters. */
const ROCKS_VERTEX = /* wgsl */ `
attribute position: vec3f;   // unit icosphere
attribute world0: vec4f;
attribute world1: vec4f;
attribute world2: vec4f;
attribute world3: vec4f;
uniform viewProjection: mat4x4f;
uniform levels: array<vec4f,16>;
var<storage, read> levelData: array<vec4f>;
var<storage, read> biomeA: array<u32>;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vLocal: vec3f;
varying vBase: f32;          // height above the rock's ground contact (m)
varying vSize: f32;

const V: u32 = ${CLIPMAP_N + 1}u;
const HALF: f32 = ${CLIPMAP_N / 2}.0;
const W_HALF: f32 = 4096.0;
const N8: i32 = 1024; const C8: f32 = 8.0;

fn rk_hash3(p: vec3f) -> f32 {
  let q = fract(p * vec3f(0.1031, 0.1030, 0.0973));
  let r = q + dot(q, q.yzx + 33.33);
  return fract((r.x + r.y) * r.z);
}
fn rk_noise3(p: vec3f) -> f32 {
  let i = floor(p); let f = p - i; let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rk_hash3(i), rk_hash3(i + vec3f(1, 0, 0)), u.x), mix(rk_hash3(i + vec3f(0, 1, 0)), rk_hash3(i + vec3f(1, 1, 0)), u.x), u.y),
             mix(mix(rk_hash3(i + vec3f(0, 0, 1)), rk_hash3(i + vec3f(1, 0, 1)), u.x), mix(rk_hash3(i + vec3f(0, 1, 1)), rk_hash3(i + vec3f(1, 1, 1)), u.x), u.y), u.z) * 2.0 - 1.0;
}
// Radius of the rock along unit direction d: lumpy, with planar fractures (abs ridges) and a
// flattened base; seed selects the shape.
fn rk_radius(d: vec3f, seed: f32) -> f32 {
  let o = vec3f(seed * 17.3, seed * 7.1, seed * 3.7);
  var r = 1.0 + 0.30 * rk_noise3(d * 1.3 + o) + 0.14 * rk_noise3(d * 2.9 + o * 1.7) + 0.05 * rk_noise3(d * 6.5 + o);
  // Fracture planes: two flattened facets at seeded orientations.
  let n1 = normalize(vec3f(sin(seed * 9.0), 0.6, cos(seed * 9.0)));
  let n2 = normalize(vec3f(cos(seed * 5.0), -0.2, sin(seed * 5.0)));
  // Smooth minimum: the facets blend into the lumpy body. A hard min() left razor-thin
  // slivers and abrupt sliced faces where a plane crossed the mesh ("chopped" rocks).
  r = rk_smin(r, 0.86 / max(dot(d, n1), 0.25), 0.3);
  r = rk_smin(r, 0.95 / max(dot(d, n2), 0.25), 0.3);
  return max(r, 0.45);
}
fn rk_smin(a: f32, b: f32, k: f32) -> f32 { let h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
fn rk_point(d: vec3f, seed: f32, aspect: vec3f) -> vec3f { return d * rk_radius(d, seed) * aspect; }

fn rk_ground(x: f32, z: f32) -> f32 {
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
fn rk_frost(x: f32, z: f32) -> f32 {
  let i = clamp(i32((x + W_HALF) / C8), 0, N8 - 1); let j = clamp(i32((W_HALF - z) / C8), 0, N8 - 1);
  let a = unpack4x8unorm(biomeA[j * N8 + i]);
  return a.x / max(a.x + a.y + a.z + a.w, 0.05);
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let w0 = vertexInputs.world0; let w1 = vertexInputs.world1;
  let x = w0.x; let z = w0.y; let size = w0.z; let yaw = w0.w;
  let seed = w1.x; let burial = w1.z;
  if (size <= 0.0) {
    // Unused instance slot: emit a degenerate vertex (clipped) and skip all the work.
    vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0);
    vertexOutputs.vWorldPos = vec3f(0.0); vertexOutputs.vNormal = vec3f(0.0, 1.0, 0.0);
    vertexOutputs.vLocal = vec3f(0.0); vertexOutputs.vBase = 0.0; vertexOutputs.vSize = 0.0;
    return vertexOutputs;
  }
  let aspect = vec3f(1.0 + 0.35 * fract(seed * 3.1), 0.55 + 0.35 * w1.y, 1.0 - 0.2 * fract(seed * 5.3));
  let d = normalize(vertexInputs.position);
  let pl = rk_point(d, seed, aspect);
  // Normal by finite differences on the sphere (tangent offsets of the direction); the shadow
  // casters skip it (RK_NORMALS = false), which halves their vertex cost.
  var nl = d;
  if (RK_NORMALS) {
    var t1 = normalize(cross(d, vec3f(0.0, 1.0, 0.0)));
    if (abs(d.y) > 0.99) { t1 = vec3f(1.0, 0.0, 0.0); }
    let t2 = cross(d, t1);
    let e = 0.02;
    let pa = rk_point(normalize(d + t1 * e), seed, aspect);
    let pb = rk_point(normalize(d + t2 * e), seed, aspect);
    nl = normalize(cross(pa - pl, pb - pl));
    if (dot(nl, d) < 0.0) { nl = -nl; }
  }
  // Ground: sample around the footprint, seat on the lowest so the rock never floats, sink by burial.
  let r = size * 0.9;
  let g0 = rk_ground(x, z);
  let gmin = min(min(rk_ground(x + r, z), rk_ground(x - r, z)), min(rk_ground(x, z + r), rk_ground(x, z - r)));
  let ground = min(g0, gmin + (g0 - gmin) * 0.3);
  let slope = (g0 - gmin) / r;
  let cy = cos(yaw); let sy = sin(yaw);
  let pw = vec3f(pl.x * cy - pl.z * sy, pl.y, pl.x * sy + pl.z * cy) * size;
  let nw = vec3f(nl.x * cy - nl.z * sy, nl.y, nl.x * sy + nl.z * cy);
  let base = ground - size * aspect.y * burial;
  var wp = vec3f(x, base, z) + pw;
  // Outside the frost steppe, or on slopes where the terrain material already shows rock: none.
  let keep = rk_frost(x, z) > 0.55 && slope < 0.9;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (!keep) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vNormal = nw;
  vertexOutputs.vLocal = pl * size + vec3f(seed * 31.0, 0.0, seed * 17.0);
  vertexOutputs.vBase = wp.y - ground;
  vertexOutputs.vSize = size;
}
`;

export const rocksVertexWGSL = 'const RK_NORMALS: bool = true;\n' + ROCKS_VERTEX;
export const rocksShadowVertexWGSL = 'const RK_NORMALS: bool = false;\n' + ROCKS_VERTEX;

export const rocksFragmentWGSL = /* wgsl */ `
${ENV_DECL}
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vLocal: vec3f;
varying vBase: f32;
varying vSize: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}

fn rk_fpFade(lambda: f32, fp: f32) -> f32 { return 1.0 - smoothstep(lambda * 0.12, lambda * 0.5, fp); }

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let fp = length(fwidth(wp)) * 0.7;
  let V = normalize(camPos - wp);
  let Ng = normalize(fragmentInputs.vNormal);
  let lp = fragmentInputs.vLocal;
  // Triplanar detail bumps (local space, so they move with the rock).
  var w = pow(abs(Ng), vec3f(4.0)); w = w / (w.x + w.y + w.z);
  var dn = vec3f(0.0);
  for (var k = 0; k < 2; k++) {
    let sc = select(0.18, 0.7, k == 1);
    let a = select(0.05, 0.22, k == 1) * rk_fpFade(sc, fp);
    let nx = noised(lp.zy / sc); let ny = noised(lp.xz / sc + 3.0); let nz = noised(lp.xy / sc + 7.0);
    dn += a / sc * (w.x * vec3f(0.0, nx.z, nx.y) + w.y * vec3f(ny.y, 0.0, ny.z) + w.z * vec3f(nz.y, nz.z, 0.0));
  }
  let Nr = normalize(Ng - dn);
  // Strata: thin layers in the rock's frame, tilted per rock; contrast fades with distance.
  let strata = fract(lp.y / 0.55 + 0.25 * lp.x * 0.15 + 0.3 * noised(lp.xz * 0.6).x);
  let band = (smoothstep(0.0, 0.1, strata) * (1.0 - smoothstep(0.5, 0.65, strata)) - 0.5) * rk_fpFade(0.55, fp);
  var albedo = vec3f(0.09, 0.095, 0.105) * (1.0 + 0.5 * band) * (0.85 + 0.3 * (0.5 + 0.5 * noised(lp.xz * 1.3 + lp.y).x));
  // Lichen-free frost rock: a faint rusty stain in places.
  albedo = mix(albedo, vec3f(0.12, 0.10, 0.085), 0.15 * smoothstep(0.3, 0.8, noised(lp.xz * 0.35).x));
  // Accumulation: snow sits on upward faces (noisy edge, more toward the top), and drifts
  // against the base up to ~0.35 m.
  let n1 = noised(wp.xz * 2.1).x; let n2 = noised(wp.xz * 0.6 + 4.0).x;
  let up = smoothstep(0.45, 0.78, Nr.y + 0.12 * n1 + 0.1 * n2);
  let drift = 1.0 - smoothstep(0.08, 0.4 + 0.15 * n2, fragmentInputs.vBase);
  let snow = max(up, drift);
  let snowAlb = vec3f(0.84, 0.87, 0.92);
  albedo = mix(albedo, snowAlb, snow);
  let N = normalize(mix(Nr, Ng, snow * 0.6));

  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  let nl = dot(N, L);
  let wrap = 0.3 * snow;
  let diff = clamp((nl + wrap) / (1.0 + wrap), 0.0, 1.0);
  let vis = shadowVisibility(wp, Ng, camPos, fragmentInputs.position.xy);
  let cold = vec3f(0.62, 0.86, 1.32) / 0.84;
  // Cavity occlusion: crevices (low noise) and the underside see less sky.
  let ao = (0.75 + 0.25 * clamp(N.y * 0.5 + 0.5, 0.0, 1.0)) * (0.85 + 0.15 * clamp(0.5 + 0.5 * n1, 0.0, 1.0));
  let sky = shIrradiance(N) * cold * uniforms.envMisc.w * ao;
  var col = albedo * (key * diff * vis / PI + sky);
  // Rock: a little sheen at grazing (weathered surface); snow: soft sheen.
  let H = normalize(L + V);
  let spec = pow(max(dot(N, H), 0.0), mix(24.0, 12.0, snow)) * 0.04 * vis * clamp(nl, 0.0, 1.0);
  col += key * spec;
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(camPos - wp) * 0.001);
  var outc = displayTransform(col, uniforms.fogParams.z * atmoExposure());
  outc += vec3f(ditherNoise(fragmentInputs.position.xy) / 255.0);
  fragmentOutputs.color = vec4f(outc, 1.0);
}
`;
