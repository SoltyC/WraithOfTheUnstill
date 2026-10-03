// The Shaped's material chunks (BRIEF §8.3): lumps of packed snow, ice shards and a glowing ice
// core, one record per chunk (written by game/shaped/rig.js): (pos, sx), (fwd, sy), (up, sz),
// (seed, kind, glow, alpha). The vertex shader turns a unit icosphere into an irregular clod
// (shards taper to a point), scales it and hangs it on its bone; facets are flat (screen-space
// derivative normals). Readable telegraphs through material: as `glow` rises the core lights up
// and cracks across the snow glow cold blue (BRIEF §8.3).

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';

export const shapedVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // unit icosphere vertex
attribute uv: vec2f;                // x = chunk record index
uniform viewProjection: mat4x4f;
var<storage, read> chunkData: array<vec4f>;
varying vWorldPos: vec3f;
varying vLocal: vec3f;
varying vKind: f32;
varying vGlow: f32;
varying vSeed: f32;

fn hs(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(12.9898, 78.233, 37.719))) * 43758.5453); }

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let ci = u32(vertexInputs.uv.x + 0.5);
  let a = chunkData[ci * 4u]; let b = chunkData[ci * 4u + 1u]; let c = chunkData[ci * 4u + 2u]; let d = chunkData[ci * 4u + 3u];
  let seed = d.x; let kind = d.y;
  var v = vertexInputs.position;
  // An irregular clod: each vertex pushed in or out by a hash of its direction and the seed.
  v *= 0.78 + 0.36 * hs(v * 3.1 + seed);
  if (kind > 0.5 && kind < 1.5) {
    // Shard: a long tapered prism-like lump, pointed toward +y.
    v = vec3f(v.x * (1.0 - 0.75 * max(v.y, 0.0)), v.y, v.z * (1.0 - 0.75 * max(v.y, 0.0)));
  }
  let local = v * vec3f(a.w, b.w, c.w) * 0.5;
  let f = b.xyz; let u = c.xyz; let r = cross(u, f);
  // A small per-chunk twist so clusters do not line up.
  let tw = (hs(vec3f(seed, 1.0, 2.0)) - 0.5) * 0.8;
  let ct = cos(tw); let st = sin(tw);
  let lx = local.x * ct - local.z * st; let lz = local.x * st + local.z * ct;
  let wp = a.xyz + r * lx + u * local.y + f * lz;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (d.w < 0.5) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vLocal = v;
  vertexOutputs.vKind = kind;
  vertexOutputs.vGlow = d.z;
  vertexOutputs.vSeed = seed;
}
`;

export const shapedFragmentWGSL = /* wgsl */ `
${ENV_DECL}
varying vWorldPos: vec3f;
varying vLocal: vec3f;
varying vKind: f32;
varying vGlow: f32;
varying vSeed: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let V = normalize(camPos - wp);
  // Flat facets.
  var N = normalize(cross(dpdx(wp), dpdy(wp)));
  if (dot(N, V) < 0.0) { N = -N; }
  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  let vis = shadowVisibility(wp, N, camPos, fragmentInputs.position.xy);
  let nl = dot(N, L);
  let nv = clamp(dot(N, V), 0.0, 1.0);
  let sky = shIrradiance(N) * uniforms.envMisc.w;
  let exposure = uniforms.fogParams.z * atmoExposure();
  let kind = i32(fragmentInputs.vKind + 0.5);
  let cold = vec3f(0.62, 0.86, 1.32) / 0.84;
  var col = vec3f(0.0);
  if (kind == 0) {
    // Packed rime: denser and greyer-blue than the fresh snow it rose from (so it reads against
    // it), wrapped diffuse, a cold subsurface glow in shade, undersides and crevices darker.
    let grain = noised(wp.xz * 9.0 + vec2f(fragmentInputs.vSeed, 0.0)).x;
    let albedo = vec3f(0.55, 0.63, 0.74) * (0.9 + 0.1 * grain);
    let under = mix(0.45, 1.0, smoothstep(-0.9, 0.4, fragmentInputs.vLocal.y));
    let diff = clamp((nl + 0.3) / 1.3, 0.0, 1.0);
    let sss = vec3f(0.38, 0.62, 1.0) * (0.14 * (1.0 - vis * clamp(nl, 0.0, 1.0)) + 0.06 * pow(1.0 - nv, 2.0));
    col = albedo * (key * (diff * vis + sss) / PI + sky * cold * under);
    // Icy rim: the silhouette catches the sky (separates the creature from the snowfield).
    col += sky * cold * vec3f(0.5, 0.7, 0.9) * pow(1.0 - nv, 3.0) * 0.6;
  } else {
    // Ice (shards, core): glossy, sky in its facets, cyan through its body.
    let F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
    let R = reflect(-V, N);
    let refl = atmoSky(normalize(vec3f(R.x, max(R.y, 0.02), R.z)));
    let body = select(vec3f(0.3, 0.52, 0.62), vec3f(0.12, 0.24, 0.34), kind == 2);
    col = body * (key * clamp(nl * 0.5 + 0.5, 0.0, 1.0) * vis / PI + sky * cold) * (1.0 - F) + refl * F;
    let H = normalize(L + V);
    col += key * pow(max(dot(N, H), 0.0), 300.0) * 5.0 * vis;
  }
  // Telegraph: the core lights from within and cracks glow across the snow (display-referred).
  // A faint living light in the core at all times; the telegraph floods it.
  let g = max(fragmentInputs.vGlow, select(0.0, 0.18, kind == 2));
  if (g > 0.001) {
    let glowCol = vec3f(0.45, 0.78, 1.0);
    if (kind == 2) { col += glowCol * g * 0.9 / max(exposure, 1e-6); }
    else {
      let n = noised(fragmentInputs.vLocal.xz * 5.0 + fragmentInputs.vLocal.y * 3.0 + vec2f(fragmentInputs.vSeed)).x;
      let crack = 1.0 - smoothstep(0.0, 0.08, abs(n));
      col += glowCol * g * crack * 0.6 / max(exposure, 1e-6);
    }
  }
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(camPos - wp) * 0.001);
  var outc = displayTransform(col, exposure);
  outc += vec3f(ditherNoise(fragmentInputs.position.xy) / 255.0);
  fragmentOutputs.color = vec4f(outc, 1.0);
}
`;
