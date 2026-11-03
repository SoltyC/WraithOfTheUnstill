// Tide FX (the water verbs): the Surge's curling front and the foam it leaves, the Draw's mass of water turning in the air and the
// streams rising to it, the Undertow's foam spiralling in and down and the spray at its rim. Stateless GPU particles like the Gale's:
// each quad is a hashed seed with a looping life, animated in the vertex shader from the clock and ten vec4 (game/bending/tide.js
// writeFx); a verb whose strength is 0 culls its quads. Droplets catch the sky and the sun (a glint); foam is a soft white mat.

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';

export const SURGES = 3;
export const PER_SURGE = 170;   // 110 spray on the crest, 60 foam behind
export const PER_DRAW = 170;    // 120 in the mass, 50 rising to it
export const PER_UNDER = 210;   // 150 foam in the spiral, 60 spray at the rim
export const TIDE_COUNT = SURGES * PER_SURGE + PER_DRAW + PER_UNDER;
export const TIDE_FX_VEC4 = 10;
const D0 = SURGES * PER_SURGE, U0 = D0 + PER_DRAW;

export const tideFxVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = particle id, yz = quad corner (−1..1)
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform tide: array<vec4f, ${TIDE_FX_VEC4}>;   // see tide.js writeFx
uniform tideT: vec4f;               // x = time (s)
varying vUv: vec2f;
varying vAlpha: f32;
varying vKind: f32;
varying vSeed: f32;
varying vWorldPos: vec3f;

fn th(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return f32((x >> 22u) ^ x) / 4294967295.0;
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let id = u32(vertexInputs.position.x + 0.5);
  let corner = vertexInputs.position.yz;
  let t = uniforms.tideT.x;
  let h1 = th(id * 8u + 1u); let h2 = th(id * 8u + 2u); let h3 = th(id * 8u + 3u); let h4 = th(id * 8u + 4u);
  let h5 = th(id * 8u + 5u); let h6 = th(id * 8u + 6u);
  let up = vec3f(0.0, 1.0, 0.0);
  var p = vec3f(0.0, -1000.0, 0.0);
  var sz = 0.08;
  var alpha = 0.0; var kind = 0.0;   // 0 a droplet, 1 foam

  if (id < ${D0}u) {
    // ---- Surge: spray thrown up and over the curling crest along its width; foam laid on the ground behind it.
    let g = id / ${PER_SURGE}u; let k = id % ${PER_SURGE}u;
    let G = uniforms.tide[g]; let D = uniforms.tide[3u + g];
    let S = G.w; let dir3 = vec3f(D.x, 0.0, D.y); let perp = vec3f(-D.y, 0.0, D.x);
    let hw = D.z; let dist = D.w; let front = vec3f(G.x, G.y, G.z);
    if (k < 110u) {
      let u = fract(h1 + t * (1.3 + 0.6 * h4));
      let lat = (h2 * 2.0 - 1.0) * hw;
      let edge = 1.0 - smoothstep(0.75, 1.0, abs(h2 * 2.0 - 1.0));      // lower at its ends
      let H = (0.8 + 1.1 * h3) * edge * min(1.0, S * 1.4);
      // Up the face and over: forward along the curl as it rises and falls.
      p = front + perp * lat + dir3 * (u * 1.4 - 0.5) + up * (sin(u * 3.14159) * H + 0.05);
      sz = 0.1 + 0.18 * h5;
      alpha = S * 1.0 * smoothstep(0.0, 0.1, u) * (1.0 - smoothstep(0.75, 1.0, u));
      kind = 0.0;
    } else {
      let lf = max(min(dist, 7.0), 0.01);
      let s = h1 * lf;
      p = front - dir3 * s + perp * (h2 * 2.0 - 1.0) * hw * (0.8 + 0.2 * h3) + up * 0.06;
      sz = 0.4 + 0.5 * h4;
      alpha = S * 0.75 * (1.0 - s / lf) * (0.6 + 0.4 * sin(t * 2.0 + h5 * 6.28));
      kind = 1.0;
    }
  } else if (id < ${U0}u) {
    // ---- Draw: a mass of water turning in the air over the aim; streams of it rising from the ground below.
    let k = id - ${D0}u;
    let M = uniforms.tide[6]; let Q = uniforms.tide[7];
    let m = M.w; let c = vec3f(M.x, M.y, M.z);
    if (k < 120u) {
      let R = (0.5 + 1.1 * m) * (0.7 + 0.3 * h4);
      let th0 = h1 * 6.2832 + t * (0.9 + 1.4 * h2);
      let ph = acos(2.0 * h3 - 1.0);
      let wob = 1.0 + 0.12 * sin(t * 3.0 + h5 * 6.28);
      p = c + vec3f(sin(ph) * cos(th0), cos(ph) * 0.8, sin(ph) * sin(th0)) * R * wob;
      sz = 0.13 + 0.2 * h5;
      alpha = m * 1.0;
      kind = select(0.0, 1.0, h6 < 0.3);
    } else {
      let u = fract(h1 + t * 0.9);
      let src = vec3f(c.x + (h2 - 0.5) * 2.0 * Q.y, Q.x + 0.05, c.z + (h3 - 0.5) * 2.0 * Q.y);
      let a = u * u * (3.0 - 2.0 * u);
      let sw = vec3f(cos(t * 2.0 + h4 * 6.28), 0.0, sin(t * 2.0 + h4 * 6.28)) * 0.25 * sin(u * 3.14159);
      p = mix(src, c, a) + sw;
      sz = 0.07 + 0.07 * h5;
      alpha = m * 0.75 * smoothstep(0.0, 0.15, u) * (1.0 - smoothstep(0.85, 1.0, u));
      kind = 0.0;
    }
  } else {
    // ---- Undertow: foam drawn round and in, faster and lower toward the eye; spray thrown up at the rim.
    let k = id - ${U0}u;
    let C = uniforms.tide[8]; let E = uniforms.tide[9];
    let S = C.w; let R = E.x; let c = vec3f(C.x, C.y, C.z);
    if (k < 150u) {
      let f = 1.0 - fract(h1 + t * 0.32);                 // 1 at the rim → 0 at the eye
      let r = R * (0.08 + 0.92 * f);
      let ang = h2 * 6.2832 + t * (1.6 + 3.2 * (1.0 - f)) + log(max(f, 0.02)) * 1.2;
      p = c + vec3f(cos(ang), 0.0, sin(ang)) * r + up * (0.05 - 0.45 * (1.0 - f) * (1.0 - f));
      sz = (0.45 + 0.55 * h4) * (0.4 + 0.6 * f);
      alpha = S * 0.85 * sqrt(f) * smoothstep(0.0, 0.1, f);
      kind = 1.0;
    } else {
      let u = fract(h1 + t * 1.1);
      let ang = h2 * 6.2832 + t * 1.2;
      let r = R * (0.92 + 0.18 * h3);
      p = c + vec3f(cos(ang), 0.0, sin(ang)) * r + up * (sin(u * 3.14159) * (0.6 + 0.9 * h4) + 0.04);
      sz = 0.1 + 0.14 * h5;
      alpha = S * 1.0 * smoothstep(0.0, 0.1, u) * (1.0 - smoothstep(0.8, 1.0, u));
      kind = 0.0;
    }
  }
  let toCam = normalize(uniforms.cameraPosition - p);
  let ax = normalize(cross(vec3f(0.0, 1.0, 0.0), toCam));
  let ay = normalize(cross(toCam, ax));
  let wp = p + ax * corner.x * sz + ay * corner.y * sz;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (alpha < 0.002) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vUv = corner;
  vertexOutputs.vAlpha = alpha;
  vertexOutputs.vKind = kind;
  vertexOutputs.vSeed = h6;
  vertexOutputs.vWorldPos = p;
}
`;

export const tideFxFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform tideT: vec4f;
varying vUv: vec2f;
varying vAlpha: f32;
varying vKind: f32;
varying vSeed: f32;
varying vWorldPos: vec3f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let uv = fragmentInputs.vUv;
  let wp = fragmentInputs.vWorldPos;
  let ex = uniforms.fogParams.z * atmoExposure();
  let t = uniforms.tideT.x;
  let r2 = dot(uv, uv);
  var d = 0.0; var albedo = vec3f(0.0); var glint = 0.0;
  let sky = shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w;
  let V = normalize(uniforms.cameraPosition - wp);
  let cosT = dot(-V, uniforms.keyDir);
  if (fragmentInputs.vKind < 0.5) {
    // A droplet: a bead of water — bright at its heart, a glint of the sun when it is behind the drop (rimmed bright, it read as a bubble).
    d = smoothstep(1.0, 0.25, r2);
    albedo = mix(vec3f(0.95, 0.98, 1.0), vec3f(0.6, 0.78, 0.86), smoothstep(0.0, 0.9, r2));   // a solid bead: bright at its heart, sea-grey at its edge
    glint = pow(max(cosT, 0.0), 6.0) * (1.0 - smoothstep(0.0, 0.4, r2)) * (0.6 + 0.4 * sin(t * 11.0 + fragmentInputs.vSeed * 50.0));
  } else {
    // Foam: soft, broken white, thinning at its edge.
    let n = noised(uv * 1.9 + wp.xz * 1.3 + vec2f(t * 0.2)).x;
    d = smoothstep(1.0, 0.15, sqrt(r2) + 0.35 * n);
    albedo = vec3f(0.9, 0.94, 0.96) * (0.85 + 0.15 * n);
  }
  if (d <= 0.001) { discard; }
  let phase = 0.35 + 1.4 * pow(max(cosT, 0.0), 4.0);
  let col = albedo * (sky + atmoKeyColor() * max(uniforms.keyDir.y + 0.1, 0.0) * phase / PI);
  let a = d * fragmentInputs.vAlpha;
  var lit = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(uniforms.cameraPosition - wp) * 0.001);
  lit += atmoKeyColor() * glint * 0.9;
  fragmentOutputs.color = vec4f(displayTransform(lit, ex) * a, a);
}
`;
