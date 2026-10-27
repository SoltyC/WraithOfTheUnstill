// Stone FX (the earth verbs): the dust and glitter that go with the real chunk geometry — a Shard's
// crumb trail, a Ridge's heaving dust and glittering crest, a Bloom's ejecta falling back as a slow
// curtain, the puff where a plate breaks, a splash on water. Stateless GPU particles like the Gale's:
// every quad is a hashed seed with a looping or aged life, animated in the vertex shader from the clock
// and a small uniform block (src/game/bending/stone.js writeFx), nothing uploaded per frame but 37 vec4.
// Premultiplied, no depth write. Colour by the surface the earth came from.

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';

export const SHARDS = 3, RIDGES = 3, BLOOMS = 2, PTS = 6;
export const PER_SHARD = 36, PER_RIDGE = 70, PER_BLOOM = 250, PER_PUFF = 26, PER_SPLASH = 30;
export const STONE_COUNT = SHARDS * PER_SHARD + RIDGES * PER_RIDGE + BLOOMS * PER_BLOOM + PER_PUFF + PER_SPLASH;
const R0 = SHARDS * PER_SHARD, B0 = R0 + RIDGES * PER_RIDGE, P0 = B0 + BLOOMS * PER_BLOOM, S0 = P0 + PER_PUFF;

export const stoneFxVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = particle id, yz = quad corner (−1..1)
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform stone: array<vec4f, 37>;    // see stone.js writeFx
uniform stoneT: vec4f;              // x = time (s)
varying vUv: vec2f;
varying vAlpha: f32;
varying vKind: f32;
varying vSeed: f32;
varying vMat: f32;
varying vWorldPos: vec3f;

fn sh(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return f32((x >> 22u) ^ x) / 4294967295.0;
}

// Kinds: 1 glint fleck (a tiny bright grain), 2 dust puff, 3 water droplet.
fn kindFor(mtl: f32, h: f32) -> f32 {
  if (mtl > 2.5 && mtl < 3.5) { return 3.0; }
  return select(2.0, 1.0, h < 0.6);
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let id = u32(vertexInputs.position.x + 0.5);
  let corner = vertexInputs.position.yz;
  let t = uniforms.stoneT.x;
  let h1 = sh(id * 8u + 1u); let h2 = sh(id * 8u + 2u); let h3 = sh(id * 8u + 3u); let h4 = sh(id * 8u + 4u);
  let h5 = sh(id * 8u + 5u); let h6 = sh(id * 8u + 6u); let h7 = sh(id * 8u + 7u);
  var p = vec3f(0.0, -1000.0, 0.0);
  var sx = 0.05; var sy = 0.05; var rot = 0.0;
  var alpha = 0.0; var kind = 1.0; var mtl = 0.0;

  if (id < ${R0}u) {
    // ---- Shard: crumbs and dust falling away behind the plate.
    let g = id / ${PER_SHARD}u;
    let A = uniforms.stone[g]; let D = uniforms.stone[3u + g];
    mtl = D.w;
    let u = fract(h1 + t * (0.9 + 0.6 * h2));
    let back = u * (0.5 + 2.6 * h3);
    p = A.xyz - D.xyz * back + vec3f((h4 - 0.5) * 0.9, (h5 - 0.5) * 0.7 - u * u * 1.4, (h6 - 0.5) * 0.9);
    kind = kindFor(mtl, h7);
    sx = select(0.02 + 0.03 * h4, 0.07 + 0.09 * h4 + 0.08 * u, kind > 1.5 && kind < 2.5);
    sy = sx; rot = h5 * 6.28 + t * (2.0 + 5.0 * h6);
    alpha = A.w * (1.0 - u) * select(0.95, 0.4, kind > 1.5 && kind < 2.5);
  } else if (id < ${B0}u) {
    // ---- Ridge: dust heaving off the crest, grit glittering along the wall, a plume at the head.
    let j = id - ${R0}u;
    let r = j / ${PER_RIDGE}u; let k = j % ${PER_RIDGE}u;
    let H = uniforms.stone[6u + r]; let M = uniforms.stone[9u + r];
    let S = H.w; mtl = M.x;
    if (k < 46u) {
      // Along the dragged path (six points), rising off the crest.
      let sp = h1 * 4.999;
      let i0 = u32(floor(sp)); let f = sp - floor(sp);
      let P0v = uniforms.stone[12u + r * ${PTS}u + i0]; let P1v = uniforms.stone[12u + r * ${PTS}u + min(i0 + 1u, ${PTS - 1}u)];
      let base = mix(P0v.xyz, P1v.xyz, f);
      let u = fract(h2 + t * (0.25 + 0.3 * h3));
      let lat = (h4 - 0.5) * 3.0;
      p = base + vec3f((h5 - 0.5) * 3.2, 0.7 + u * (0.6 + 1.2 * h6) , (h6 - 0.5) * 3.2) + vec3f(lat * 0.0, 0.0, 0.0);
      kind = kindFor(mtl, h7);
      sx = select(0.018 + 0.02 * h4, 0.12 + 0.12 * h4 + 0.15 * u, kind > 1.5 && kind < 2.5);
      sy = sx; rot = h5 * 6.28 + t * (1.0 + 3.0 * h6);
      alpha = S * smoothstep(0.0, 0.1, u) * (1.0 - u) * select(0.8, 0.22, kind > 1.5 && kind < 2.5);
    } else {
      // The head: spray thrown up where the earth is being dragged.
      let u = fract(h1 + t * (0.8 + 0.8 * h2));
      let a = h3 * 6.28;
      let rr = (0.3 + 1.4 * h4) * u;
      p = H.xyz + vec3f(cos(a) * rr, 0.2 + 2.2 * u * (1.0 - 0.6 * u) * (0.4 + h5), sin(a) * rr);
      kind = kindFor(mtl, h7);
      sx = select(0.02 + 0.03 * h4, 0.1 + 0.1 * h4 + 0.12 * u, kind > 1.5 && kind < 2.5);
      sy = sx; rot = h5 * 6.28 + t * 3.0;
      alpha = S * (1.0 - u) * smoothstep(0.0, 0.08, u) * select(0.9, 0.3, kind > 1.5 && kind < 2.5);
    }
  } else if (id < ${P0}u) {
    // ---- Bloom: ejecta thrown up from the crater, a slow glittering curtain falling back, a dust ring.
    let j = id - ${B0}u;
    let b = j / ${PER_BLOOM}u; let k = j % ${PER_BLOOM}u;
    let A = uniforms.stone[30u + b]; let B = uniforms.stone[32u + b];
    let age = A.w; let R = B.x; mtl = B.z;
    // Snow is the top layer: what the eruption throws is the dark earth and rock beneath it.
    let earthy = select(mtl, 7.0, mtl < 0.5);
    if (age >= 0.0 && B.y > 0.0) {
      if (k < 150u) {
        // Ballistic with a soft gravity: up fast, then a long hang and fall (the curtain).
        let a = h1 * 6.283;
        let rr = R * (0.15 + 0.85 * sqrt(h2)) * 0.55;
        let vy = 4.0 + 3.2 * h3; let g = 3.4 + 0.8 * h4;
        let hv = (0.4 + 1.5 * h5) * (0.5 + 0.5 * R / 3.0);
        let life = 2.0 * vy / g;
        let tt = age - h6 * 0.12;
        if (tt > 0.0 && tt < life) {
          let y = vy * tt - 0.5 * g * tt * tt;
          p = A.xyz + vec3f(cos(a) * (rr + hv * tt), max(y, 0.0) + 0.05, sin(a) * (rr + hv * tt));
          mtl = earthy;
          kind = kindFor(mtl, select(0.0, 0.9, h7 < 0.35));          // mostly clods, some grit
          if (kind < 1.5) { sx = 0.045 + 0.05 * h4 + 0.04 * h6 * h6; }
          else if (kind < 2.5) { sx = 0.16 + 0.16 * h4; }
          else { sx = 0.04 + 0.03 * h4; }
          sy = sx; rot = h5 * 6.28 + tt * (2.0 + 5.0 * h6);
          alpha = smoothstep(0.0, 0.06, tt) * (1.0 - smoothstep(life - 0.4, life, tt)) * select(1.0, 0.55, kind > 1.5 && kind < 2.5);
        }
      } else if (k < 190u) {
        // The ring of dust blown out along the ground over the first second.
        let u = age / 1.1;
        if (u < 1.0) {
          let a = h1 * 6.283; let e = 1.0 - (1.0 - u) * (1.0 - u);
          let rr = R * (0.3 + 0.95 * h2) * (0.35 + 0.65 * e);
          p = A.xyz + vec3f(cos(a) * rr, 0.15 + 0.7 * h3 * sin(u * 3.14159), sin(a) * rr);
          kind = select(2.0, 3.0, mtl > 2.5 && mtl < 3.5);
          sx = 0.25 + 0.3 * h4 + 0.5 * u; sy = sx; rot = h5 * 6.28 + t;
          alpha = (1.0 - u) * 0.5;
        }
      } else {
        // The eruption's burst: a billow of powder and soil dust thrown up and out in the first moments.
        let u = age / 0.95;
        if (u >= 0.0 && u < 1.0) {
          let a = h1 * 6.283; let e = 1.0 - (1.0 - u) * (1.0 - u);
          let rr = R * (0.1 + 0.55 * h2) * (0.3 + 0.7 * e);
          p = A.xyz + vec3f(cos(a) * rr, 0.2 + (1.2 + 3.4 * h3) * sqrt(e) * (1.0 - 0.35 * u), sin(a) * rr);
          mtl = select(mtl, earthy, h7 < 0.5);                  // half powder, half soil: it must read against the snow
          kind = 2.0;
          sx = 0.45 + 0.6 * h4 + 1.1 * u; sy = sx; rot = h5 * 6.28 + t * 0.6;
          alpha = (1.0 - u) * smoothstep(0.0, 0.05, u) * 0.62;
        }
      }
    }
  } else if (id < ${S0}u) {
    // ---- The puff where a plate broke.
    let k = id - ${P0}u;
    let A = uniforms.stone[34]; mtl = uniforms.stone[36].x;
    let u = A.w / 0.9;
    if (u >= 0.0 && u < 1.0) {
      let a = h1 * 6.283; let e = 1.0 - (1.0 - u) * (1.0 - u);
      let rr = (0.2 + 1.2 * h2) * e;
      p = A.xyz + vec3f(cos(a) * rr, 0.1 + 1.0 * h3 * e, sin(a) * rr);
      kind = kindFor(mtl, h7);
      sx = select(0.02 + 0.03 * h4, 0.12 + 0.2 * h4 * u + 0.1 * u, kind > 1.5 && kind < 2.5);
      sy = sx; rot = h5 * 6.28 + t * 3.0;
      alpha = (1.0 - u) * select(0.95, 0.5, kind > 1.5 && kind < 2.5);
    }
  } else {
    // ---- A splash on water: droplets thrown up and falling back.
    let A = uniforms.stone[35];
    let u = A.w / 1.0;
    if (u >= 0.0 && u < 1.0) {
      let a = h1 * 6.283; let hv = 0.5 + 1.8 * h2; let vy = 3.0 + 3.0 * h3;
      let tt = A.w;
      p = A.xyz + vec3f(cos(a) * hv * tt, max(vy * tt - 5.0 * tt * tt, 0.0), sin(a) * hv * tt);
      kind = 3.0; mtl = 3.0; sx = 0.03 + 0.03 * h4; sy = sx; rot = h5 * 6.28;
      alpha = (1.0 - u) * 0.9;
    }
  }

  let toCam = normalize(uniforms.cameraPosition - p);
  let ax = normalize(cross(vec3f(0.0, 1.0, 0.0), toCam));
  let ay = normalize(cross(toCam, ax));
  let q = vec2f(corner.x * sx, corner.y * sy);
  let cr = cos(rot); let sr = sin(rot);
  let q2 = vec2f(cr * q.x - sr * q.y, sr * q.x + cr * q.y);
  let wp = p + ax * q2.x + ay * q2.y;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (alpha < 0.002) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vUv = corner;
  vertexOutputs.vAlpha = alpha;
  vertexOutputs.vKind = kind;
  vertexOutputs.vSeed = h6;
  vertexOutputs.vMat = mtl;
  vertexOutputs.vWorldPos = p;
}
`;

export const stoneFxFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform stoneT: vec4f;
varying vUv: vec2f;
varying vAlpha: f32;
varying vKind: f32;
varying vSeed: f32;
varying vMat: f32;
varying vWorldPos: vec3f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}

fn grain(mtl: f32, seed: f32) -> vec3f {
  if (mtl > 6.5) { return mix(vec3f(0.15, 0.115, 0.085), vec3f(0.3, 0.25, 0.19), seed); }  // the earth under the snow
  if (mtl < 0.5) { return vec3f(0.86, 0.9, 0.98); }                                       // snow
  if (mtl < 1.5) { return mix(vec3f(0.2, 0.15, 0.09), vec3f(0.3, 0.38, 0.14), seed); }  // turf and soil
  if (mtl < 2.5) { return mix(vec3f(0.36, 0.36, 0.34), vec3f(0.52, 0.5, 0.45), seed); } // rock
  if (mtl < 3.5) { return vec3f(0.85, 0.93, 1.0); }                                       // water
  if (mtl < 4.5) { return mix(vec3f(0.74, 0.58, 0.34), vec3f(0.86, 0.72, 0.46), seed); } // sand
  if (mtl < 5.5) { return vec3f(0.24, 0.17, 0.11); }                                      // mud
  return vec3f(0.22, 0.2, 0.19);                                                          // ash
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let uv = fragmentInputs.vUv;
  let kind = fragmentInputs.vKind;
  let seed = fragmentInputs.vSeed;
  let ex = uniforms.fogParams.z * atmoExposure();
  let wp = fragmentInputs.vWorldPos;
  let t = uniforms.stoneT.x;
  var d = 0.0;
  var glint = 0.0;
  let albedo = grain(fragmentInputs.vMat, seed);
  if (kind < 1.5) {
    // A grain of the earth that catches the sun: a small disc that twinkles.
    d = smoothstep(1.0, 0.3, dot(uv, uv));
    glint = pow(max(sin(t * 8.0 + seed * 60.0), 0.0), 10.0);
  } else if (kind < 2.5) {
    // A puff of dust.
    let r = length(uv);
    let n = noised(uv * 1.7 + wp.xz * 0.9 + vec2f(t * 0.1)).x;
    d = smoothstep(1.0, 0.2, r + 0.3 * n);
  } else {
    d = smoothstep(1.0, 0.5, length(uv));
    glint = pow(max(sin(t * 11.0 + seed * 50.0), 0.0), 14.0);
  }
  if (d <= 0.001) { discard; }
  let sky = shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w;
  let cosT = dot(normalize(wp - uniforms.cameraPosition), uniforms.keyDir);
  let phase = 0.3 + 1.6 * pow(max(cosT, 0.0), 4.0);
  let col = albedo * (sky + atmoKeyColor() * max(uniforms.keyDir.y + 0.1, 0.0) * phase / PI);
  let a = d * fragmentInputs.vAlpha;
  var lit = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(uniforms.cameraPosition - wp) * 0.001);
  // Ochre glitter: the sun on mica.
  lit += vec3f(1.0, 0.86, 0.6) * glint * 1.6 / max(ex, 1e-6);
  fragmentOutputs.color = vec4f(displayTransform(lit, ex) * a, a);
}
`;
