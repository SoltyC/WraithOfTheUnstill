// The Frost Warden's surface (BRIEF §8.4): a piece of the steppe come alive — the same chunk
// records as the lesser Shaped (game/shaped/rig.js), but each chunk is a smooth, craggy mass
// (a noise-displaced ellipsoid with ridged crags; normals from the displacement, so it lights
// like terrain, not like low-poly facets), and the material is a glacier: snow capping whatever
// faces up, with the terrain snow's sparkle and cold subsurface glow; glacial blue ice on the
// flanks and undersides, light passing through it, white fracture planes; dark crevices where
// the masses meet. Water joints keep their churning liquid look; a stomp's telegraph glows along
// the fractures.

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';

const NOISE3 = /* wgsl */ `
fn h3(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453); }
fn vnoise3(p: vec3f) -> f32 {
  let i = floor(p); let f = p - i; let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3f(1, 0, 0)), u.x), mix(h3(i + vec3f(0, 1, 0)), h3(i + vec3f(1, 1, 0)), u.x), u.y),
             mix(mix(h3(i + vec3f(0, 0, 1)), h3(i + vec3f(1, 0, 1)), u.x), mix(h3(i + vec3f(0, 1, 1)), h3(i + vec3f(1, 1, 1)), u.x), u.y), u.z);
}
`;

export const wardenVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // unit icosphere vertex
attribute uv: vec2f;                // x = chunk record index
uniform viewProjection: mat4x4f;
var<storage, read> chunkData: array<vec4f>;
var<storage, read> chunkNbr: array<u32>;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vLocal: vec3f;
varying vKind: f32;
varying vGlow: f32;
varying vSeed: f32;
varying vOcc: f32;
varying vCover: f32;
${NOISE3}
const NBR = 16u;
const WARDEN_CHUNKS = 380u;

// Ellipsoid distance (1 = its surface) of world point p from chunk j, and its outward direction.
struct Ell { d: f32, n: vec3f }
fn ell(j: u32, p: vec3f) -> Ell {
  let a = chunkData[j * 4u]; let b = chunkData[j * 4u + 1u]; let c = chunkData[j * 4u + 2u];
  let r = cross(c.xyz, b.xyz);
  let sc = max(vec3f(a.w, b.w, c.w) * 0.5, vec3f(1e-3));
  let dp = p - a.xyz;
  let q = vec3f(dot(dp, r), dot(dp, c.xyz), dot(dp, b.xyz)) / sc;
  var o: Ell;
  o.d = length(q);
  o.n = normalize(r * (q.x / sc.x) + c.xyz * (q.y / sc.y) + b.xyz * (q.z / sc.z) + vec3f(0.0, 1e-5, 0.0));
  return o;
}

// Radius of the craggy mass along unit direction v: broad lumps, then ridged crags.
fn massR(v: vec3f, seed: f32, kind: f32, cover: f32) -> f32 {
  let s = vec3f(seed * 0.37, seed * 0.11, seed * 0.23);
  let lump = vnoise3(v * 1.6 + s);
  let crag = 1.0 - abs(vnoise3(v * 3.7 + s * 1.7) * 2.0 - 1.0);
  let fine = 1.0 - abs(vnoise3(v * 9.0 + s * 2.3) * 2.0 - 1.0);
  // Broad lumps, then sharp ridged crags and fine breakup: rock-like masses, not balloons.
  var r = 0.68 + 0.2 * lump + 0.28 * crag * crag * crag + 0.07 * fine * fine;
  if (kind > 0.5 && kind < 1.5) { r = 0.85 + 0.15 * crag; }           // shards: cleaner
  // Snowed over (the release): crags fill in toward a smooth drift.
  else { r = mix(r, 0.86 + 0.14 * lump, cover * 0.85); }
  return r;
}
fn shardShape(v: vec3f, kind: f32) -> vec3f {
  if (kind > 0.5 && kind < 1.5) { return vec3f(v.x * (1.0 - 0.8 * max(v.y, 0.0)), v.y, v.z * (1.0 - 0.8 * max(v.y, 0.0))); }
  return v;
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let ci = u32(vertexInputs.uv.x + 0.5);
  let a = chunkData[ci * 4u]; let b = chunkData[ci * 4u + 1u]; let c = chunkData[ci * 4u + 2u]; let d = chunkData[ci * 4u + 3u];
  let seed = d.x; let kind = floor(d.y + 0.02);
  // Snow cover rides in alpha: 1 bare … 0.51 buried (≤ 0.5 hidden).
  let cover = select(0.0, clamp((1.0 - d.w) / 0.49, 0.0, 1.0), d.w > 0.5 && ci < WARDEN_CHUNKS);
  let v = normalize(vertexInputs.position);
  // Displaced surface point, and two neighbours along the tangent plane for the normal.
  let t1 = normalize(cross(v, select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(v.y) > 0.9)));
  let t2 = cross(v, t1);
  let e = 0.04;
  let v1 = normalize(v + t1 * e); let v2 = normalize(v + t2 * e);
  let p0 = shardShape(v * massR(v, seed, kind, cover), kind);
  let p1 = shardShape(v1 * massR(v1, seed, kind, cover), kind);
  let p2 = shardShape(v2 * massR(v2, seed, kind, cover), kind);
  let sc = vec3f(a.w, b.w, c.w) * 0.5;
  // Normal in the unscaled frame → scaled frame (inverse scale), then to world.
  var nl = normalize(cross(p1 - p0, p2 - p0));
  if (dot(nl, p0) < 0.0) { nl = -nl; }
  nl = normalize(nl / max(sc, vec3f(1e-3)));
  let f = b.xyz; let u = c.xyz; let r = cross(u, f);
  let tw = (h3(vec3f(seed, 1.0, 2.0)) - 0.5) * 0.8;
  let ct = cos(tw); let st = sin(tw);
  let local = p0 * sc;
  let lx = local.x * ct - local.z * st; let lz = local.x * st + local.z * ct;
  let nx = nl.x * ct - nl.z * st; let nz = nl.x * st + nl.z * ct;
  let wp = a.xyz + r * lx + u * local.y + f * lz;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (d.w < 0.5) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vWorldPos = wp;
  var nW = normalize(r * nx + u * nl.y + f * nz);
  // One mass, not a heap: blend the crag normal toward the normal of the smooth union of this
  // chunk and its neighbours (a soft field over their ellipsoids), and shade where they meet.
  var contact = 0.0;
  if (ci < WARDEN_CHUNKS && kind != 1.0 && d.w > 0.5) {
    let own = ell(ci, wp);
    var acc = own.n * exp(-1.6 * own.d * own.d);
    for (var k = 0u; k < NBR; k++) {
      let j = chunkNbr[ci * NBR + k];
      if (j == ci) { break; }
      if (chunkData[j * 4u + 3u].w < 0.5) { continue; }
      let e2 = ell(j, wp);
      acc += e2.n * exp(-1.6 * e2.d * e2.d);
      contact += smoothstep(1.45, 0.85, e2.d);
    }
    nW = normalize(mix(nW, normalize(acc), 0.7 + 0.25 * cover));
  }
  vertexOutputs.vNormal = nW;
  vertexOutputs.vCover = cover;
  vertexOutputs.vLocal = p0;
  vertexOutputs.vKind = d.y;
  vertexOutputs.vGlow = d.z;
  vertexOutputs.vSeed = seed;
  // Crevice occlusion: recesses of the mass, and the underside of each chunk.
  vertexOutputs.vOcc = (clamp((length(p0) - 0.78) / 0.3, 0.0, 1.0) * 0.6 + 0.4 * smoothstep(-0.9, 0.3, v.y)) * (1.0 - min(contact * 0.4, 0.7));
}
`;

export const wardenFragmentWGSL = /* wgsl */ `
${ENV_DECL}
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vLocal: vec3f;
varying vKind: f32;
varying vGlow: f32;
varying vSeed: f32;
varying vOcc: f32;
varying vCover: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
${NOISE3}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let V = normalize(camPos - wp);
  let fp = length(fwidth(wp));
  var N = normalize(fragmentInputs.vNormal);
  if (dot(N, V) < 0.0) { N = -N; }
  let kind = i32(floor(fragmentInputs.vKind + 0.02));
  let hurt = clamp((fragmentInputs.vKind - f32(kind)) / 0.45, 0.0, 1.0);
  let frozen = fragmentInputs.vGlow > 1.5;
  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  let sky = shIrradiance(N) * uniforms.envMisc.w;
  let exposure = uniforms.fogParams.z * atmoExposure();
  let cold = vec3f(0.62, 0.86, 1.32) / 0.84;
  // Surface detail: wind-packed grain and ice ripples (faded with distance), on the normal.
  let dfade = 1.0 - smoothstep(0.02, 0.12, fp);
  let g1 = noised(wp.xz * 1.3 + wp.y * 0.7); let g2 = noised(vec2f(wp.x + wp.z, wp.y) * 4.0);
  N = normalize(N + vec3f(g1.y, 0.0, g1.z) * 0.08 + vec3f(g2.y, g2.z, -g2.y) * 0.05 * dfade);
  let nl = dot(N, L);
  let nv = clamp(dot(N, V), 0.0, 1.0);
  let vis = shadowVisibility(wp, normalize(fragmentInputs.vNormal), camPos, fragmentInputs.position.xy);
  let occ = mix(0.35, 1.0, fragmentInputs.vOcc);
  let H = normalize(L + V);
  var col = vec3f(0.0);
  if (kind == 3 && !frozen) {
    // Water joint: liquid held in by the stillness — churning, glossy, lit from within.
    let churn = noised(fragmentInputs.vLocal.xz * 2.5 + vec2f(fragmentInputs.vGlow * 3.0)).x;
    let F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
    let R = reflect(-V, normalize(N + vec3f(churn * 0.3, 0.0, churn * 0.3)));
    col = atmoSky(normalize(vec3f(R.x, max(R.y, 0.02), R.z))) * F + vec3f(0.1, 0.3, 0.4) * sky * cold;
    col += key * pow(max(dot(N, H), 0.0), 200.0) * 4.0 * vis;
    col += vec3f(0.3, 0.75, 1.0) * (0.55 + 0.25 * churn) * (0.6 + 0.4 * fragmentInputs.vGlow) / max(exposure, 1e-6) * 0.5;
  } else {
    // Snow on what faces up; glacial ice on the flanks and beneath (all ice when frozen solid).
    let lump = vnoise3(wp * 0.25);
    // Mostly packed snow; ice shows on undersides, in scoured patches and on the shards.
    // Large swathes: snow cover over the mass, ice where it is scoured or faces down.
    let scour = smoothstep(0.58, 0.72, vnoise3(wp * 0.045 + 7.0));
    let Ns = normalize(fragmentInputs.vNormal);
    var snow = smoothstep(-0.35, 0.25, Ns.y + 0.25 * (vnoise3(wp * 0.07) - 0.5)) * (1.0 - scour);
    if (kind != 0 || frozen) { snow = snow * 0.2; }
    // Lain down into the land: fresh drift snow over all of it (the spires stay ice).
    if (kind != 1) { snow = max(snow, fragmentInputs.vCover); }
    // Snow: the terrain's look — wrapped diffuse, cold subsurface glow in shade, sparkle.
    let snowAlb = vec3f(0.86, 0.88, 0.92);
    let diffS = clamp((nl + 0.35) / 1.35, 0.0, 1.0);
    let sssS = vec3f(0.38, 0.62, 1.0) * (0.16 * (1.0 - vis * clamp(nl, 0.0, 1.0)) + 0.06 * pow(1.0 - nv, 2.0));
    var cs = snowAlb * (key * (diffS * vis + sssS) / PI + sky * cold * occ);
    let cell = floor(wp * 40.0);
    let glint = step(0.96, h3(cell)) * pow(max(dot(normalize(N + (vec3f(h3(cell + 1.0), h3(cell + 2.0), h3(cell + 3.0)) - 0.5) * 0.6), H), 0.0), 400.0);
    cs += key * glint * 3.0 * vis * dfade;
    // Glacial ice: deep blue body, light passing through it, white fracture planes, sky in it.
    let iceVar = vnoise3(wp * 0.6 + fragmentInputs.vSeed);
    let iceAlb = mix(vec3f(0.16, 0.34, 0.48), vec3f(0.42, 0.64, 0.78), iceVar);
    let frac = 1.0 - smoothstep(0.0, 0.06, abs(vnoise3(wp * vec3f(0.35, 0.9, 0.35) + 3.0) - 0.5));
    // Weathered glacier ice: rough, so the sky reflection is soft and limited.
    let F = (0.02 + 0.98 * pow(1.0 - nv, 5.0)) * 0.22;
    let R = reflect(-V, N);
    let refl = atmoSky(normalize(vec3f(R.x, max(R.y, 0.02), R.z)));
    let through = vec3f(0.25, 0.55, 0.8) * (key * 0.22 * (1.0 - vis * max(nl, 0.0)) + sky * 0.5);
    var ci = iceAlb * (key * max(nl, 0.0) * vis / PI + sky * cold * occ) + through * occ;
    ci = mix(ci, vec3f(0.85, 0.92, 1.0) * (key * max(nl * 0.5 + 0.5, 0.0) * vis / PI + sky), frac * 0.55 * dfade);
    ci = ci * (1.0 - F) + refl * F;
    ci += key * pow(max(dot(N, H), 0.0), 24.0) * 0.12 * vis;
    col = mix(ci, cs, snow) * mix(0.55, 1.0, occ);
    // The stomp's telegraph: light along the fractures.
    let g = fragmentInputs.vGlow;
    if (g > 0.001 && !frozen) {
      // Light within: the ice fills with a cold blue glow; the fractures carry the brightest light.
      let core = 1.0 - smoothstep(0.0, 0.025, abs(vnoise3(wp * vec3f(0.35, 0.9, 0.35) + 3.0) - 0.5));
      let inner = (1.0 - snow * 0.7) * (0.25 + 0.75 * pow(1.0 - nv, 1.5));
      col = col * (1.0 - 0.35 * g) + (vec3f(0.12, 0.42, 1.0) * (frac * 0.25 + inner * 0.8) + vec3f(0.6, 0.85, 1.0) * core * 0.2) * g / max(exposure, 1e-6) * 0.55;
    }
    if (frozen) { col += vec3f(0.4, 0.7, 1.0) * 0.06 / max(exposure, 1e-6); }
  }
  // Hurt flash (kind's fraction): the struck body whitens and its rim burns cold for an instant.
  if (hurt > 0.001) {
    col = mix(col, vec3f(0.85, 0.93, 1.0) * (sky + key * 0.25), hurt * 0.55);
    col += vec3f(0.5, 0.8, 1.0) * hurt * (0.25 + 0.75 * pow(1.0 - nv, 2.0)) * 0.35 / max(exposure, 1e-6);
  }
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(camPos - wp) * 0.001);
  var outc = displayTransform(col, exposure);
  outc += vec3f(ditherNoise(fragmentInputs.position.xy) / 255.0);
  fragmentOutputs.color = vec4f(outc, 1.0);
}
`;
