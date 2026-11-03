// The kelp of the Sounding (Phase 10 U2; render/kelp.js places it, world/kelp.js says where it grows). Giant kelp: a thin stipe
// rising from its holdfast, buoyant, swaying on the slow current with a wave travelling up it; blades hung off it in alternate
// ranks, angled up, ruffled at the edge and fluttering, the top ones long and streaming downstream as the canopy. Near the body
// the stipes bend away (it parts round the Wraith); a snag pulls one in towards the chest (the tear: systems/lung.js).
// Lit as under water: the sun arrives bent and dimmed by the depth, the sky's light from above; thin blades glow gold where the
// light comes through them (the look of a kelp forest from inside). Compose fogs it by distance and lays the caustics on it.

import { ENV_DECL, COMMON_WGSL, GRID_LIGHT_DECL, GRID_LIGHT_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { UNDERWATER_WGSL } from './water.wgsl.js';

/** Stipe rings, sides; blades per stipe, segments along a blade. */
export const KELP_RINGS = 16, KELP_SIDES = 3, KELP_BLADES = 46, KELP_BSEG = 5;

const CENTRE_WGSL = /* wgsl */ `
fn kH(n: f32) -> f32 { return fract(sin(n * 12.9898) * 43758.5453); }
// The stipe's line at s (0 root … 1 top): up its height, leaned, swayed on the current, a wave running up it; parted round the
// body and pulled to a snag.
fn kelpCentre(I: vec4f, J: vec4f, s: f32) -> vec3f {
  let t = uniforms.kelpParams.x;
  let H = I.w; let ph = J.x; let lean = J.y;
  var c = vec3f(I.x, I.y + s * H, I.z);
  let cur = vec2f(0.82, 0.57);                  // the pit's slow current (down the coast)
  let side = vec2f(-cur.y, cur.x);
  let s2 = s * s;
  let drift = (1.6 + 0.9 * sin(t * 0.11 + ph)) * s2 * (H / 30.0);
  let wave = 0.45 * s * sin(t * 0.42 - s * H * 0.11 + ph) + 0.18 * s * sin(t * 0.71 - s * H * 0.23 + ph * 1.7);
  c = vec3f(c.x + cur.x * drift + side.x * wave + cos(lean) * 0.05 * H * s, c.y - 0.6 * s2 * drift * 0.3, c.z + cur.y * drift + side.y * wave + sin(lean) * 0.05 * H * s);
  // Parted round the body (its reach grows towards the canopy, where the fronds are wide).
  let B = uniforms.kelpBody;
  let d = c.xz - B.xz; let dl = length(d) + 1e-4; let dy = abs(c.y - B.y);
  let f = max(0.0, 1.0 - dl / B.w) * max(0.0, 1.0 - dy / 3.5);
  c = vec3f(c.x + d.x / dl * f * f * 1.7, c.y, c.z + d.y / dl * f * f * 1.7);
  // A snag: the nearest stipes pulled towards the chest.
  let S = uniforms.kelpSnag;
  if (S.w > 0.0) {
    let v = S.xyz - c; let vl = length(v);
    let k = max(0.0, 1.0 - vl / 4.5);
    c += v * S.w * k * k * 0.8;
  }
  return c;
}
`;

export const kelpVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = slot, y = s (along the stipe), z = kind (0 stipe, 1 blade)
attribute kelpV: vec4f;             // stipe: ring angle; blade: angle out, l (0..1 along it), w (−1..1 across), its index
uniform viewProjection: mat4x4f;
uniform kelpParams: vec4f;          // x = time (s), y = the water's level, z = shown, w = —
uniform kelpBody: vec4f;            // the Wraith (x, y, z) and the reach it parts the kelp at (m)
uniform kelpSnag: vec4f;            // a snag (x, y, z, strength 0..1)
var<storage, read> kelpInst: array<vec4f>;   // per slot: (x, root y, z, height), (phase, lean, scale, alive)
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vKelp: vec4f;               // kind, s, l, seed
${CENTRE_WGSL}
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let slot = u32(vertexInputs.position.x + 0.5);
  let I = kelpInst[slot * 2u]; let J = kelpInst[slot * 2u + 1u];
  let s = vertexInputs.position.y; let kind = vertexInputs.position.z; let V = vertexInputs.kelpV;
  let t = uniforms.kelpParams.x;
  let c = kelpCentre(I, J, s);
  let c2 = kelpCentre(I, J, min(1.0, s + 0.02));
  let T = normalize(c2 - c + vec3f(0.0, 1e-4, 0.0));
  var Rx = normalize(cross(T, vec3f(0.0, 0.0, 1.0)) + vec3f(0.0, 0.0, 1e-4)); let Rz = cross(Rx, T);
  var wp: vec3f; var n: vec3f;
  if (kind < 0.5) {
    // The stipe: thin, thicker at the holdfast (its branching root mass flares at the foot).
    let r = (0.014 + 0.06 * pow(1.0 - min(s * 14.0, 1.0), 2.0)) * J.z;
    let a = V.x;
    n = Rx * cos(a) + Rz * sin(a);
    wp = c + n * r;
  } else {
    // A blade: out from the stipe at its angle, buoyant (angled up), longer and streaming downstream in the canopy.
    let bi = V.w; let l = V.y; let w = V.z;
    let seed = kH(bi + J.x * 7.0);
    let canopy = smoothstep(0.78, 0.98, s);
    let len = (0.6 + 0.5 * seed + 0.7 * canopy) * J.z;
    let az = V.x + (kH(bi * 3.1 + J.y) - 0.5) * 1.6;   // each blade its own way round the stipe
    let out = vec3f(cos(az), 0.0, sin(az));
    let cur = vec3f(0.82, -0.08, 0.57);
    let lift = 0.5 + 0.9 * kH(bi * 7.7 + J.x);
    var dir = normalize(mix(normalize(out * 0.75 + T * lift), cur, 0.1 + 0.3 * canopy * kH(bi * 5.3 + J.y)));
    // The blade's flutter: a wave down its length.
    let fl = sin(t * 1.6 + l * 5.0 + seed * 20.0) * 0.12 * l;
    let wd = normalize(cross(dir, T) + vec3f(1e-4, 0.0, 0.0));
    let bn = normalize(cross(wd, dir));
    // Its outline: a narrow lance, the edge ruffled.
    let half = (0.075 + 0.05 * seed) * pow(sin(3.14159 * min(l * 1.15 + 0.08, 1.0)), 0.6) * (1.0 + 0.18 * sin(l * 38.0 + seed * 9.0)) * J.z;
    // Curved along its length: buoyant, it bows up and away downstream (each its own), and cups across its width.
    let bow = normalize(T * 0.5 + cur * (0.5 + 0.4 * seed) + out * 0.2) * (0.25 + 0.25 * seed);
    wp = c + (dir * l + bow * l * l) * len + bn * (fl + 0.05 * w * w * half / 0.1) + wd * w * half;
    // (a twist along it lets the light catch it unevenly)
    n = normalize(bn + wd * 0.35 * sin(l * 6.0 + seed * 12.0));
  }
  var outp = uniforms.viewProjection * vec4f(wp, 1.0);
  if (uniforms.kelpParams.z < 0.5 || J.w < 0.5) { outp = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.position = outp;
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vNormal = n;
  vertexOutputs.vKelp = vec4f(kind, s, V.y, J.x);
}
`;

export const kelpFragmentWGSL = /* wgsl */ `
${ENV_DECL}
${GRID_LIGHT_DECL}
uniform kelpParams: vec4f;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vKelp: vec4f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${UNDERWATER_WGSL}
${GRID_LIGHT_WGSL}
fn kHash3(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453); }
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos; let cam = uniforms.cameraPosition;
  let V = normalize(cam - wp);
  var N = normalize(fragmentInputs.vNormal);
  if (dot(N, V) < 0.0) { N = -N; }
  let k = fragmentInputs.vKelp; let blade = k.x > 0.5;
  let lvl = uniforms.kelpParams.y;
  // Kelp: olive to gold, the blades paler towards their tips and in the canopy, a dark midrib, mottled; the stipe darker, rough.
  let mott = 0.8 + 0.4 * kHash3(floor(wp * vec3f(9.0, 3.0, 9.0)));
  var albedo = vec3f(0.115, 0.082, 0.026) * mott;
  if (blade) {
    let tip = k.z;
    albedo = mix(vec3f(0.12, 0.086, 0.026), vec3f(0.2, 0.15, 0.045), tip * 0.7 + 0.3 * smoothstep(0.8, 1.0, k.y)) * mott;
    // Fine longitudinal ridges (the blade's corrugation), near only.
    let near = 1.0 - smoothstep(6.0, 18.0, length(cam - wp));
    albedo *= 1.0 - 0.18 * near * (0.5 + 0.5 * sin(dot(wp, vec3f(41.0, 7.0, 37.0))));
  } else {
    albedo = vec3f(0.075, 0.055, 0.02) * mott;
  }
  let L = uniforms.keyDir; let key = atmoKeyColor();
  // The sun bent at the surface and dimmed along its way down; the sky's light from above, dimmed by the depth.
  let rs = refract(-L, vec3f(0.0, 1.0, 0.0), 0.7502);
  let Ld = -rs;
  let down = soundingDown(wp, L);
  let sunHere = key * down * max(L.y, 0.0) * smoothstep(0.0, 0.12, L.y);
  let sky = atmoSkyUp() * down;
  let nl = dot(N, Ld);
  var col = albedo * (sunHere * max(nl, 0.0) / PI + sky * (0.55 + 0.45 * N.y));
  if (blade) {
    // Through the blade: the light behind it comes through gold (thin tissue, brown pigment), stronger looking towards the sun.
    let behind = max(-nl, 0.0);
    let look = pow(max(dot(-V, Ld), 0.0), 3.0);
    col += vec3f(0.5, 0.34, 0.07) * sunHere * behind * (0.25 + 1.2 * look) / PI;
    col += vec3f(0.3, 0.22, 0.05) * sky * 0.2;
    // A wet sheen.
    let H = normalize(Ld + V);
    col += sunHere * pow(max(dot(N, H), 0.0), 40.0) * 0.12 * step(0.0, nl);
  }
  let ex = uniforms.fogParams.z * atmoExposure();
  // The world's lights (the column's glow): wrapped, the blades thin enough to take it from either side.
  col += gridLit(wp, N, albedo + select(vec3f(0.0), vec3f(0.12, 0.09, 0.03), blade), 0.6, ex);
  fragmentOutputs.color = vec4f(displayTransform(col, ex), 0.0);
}
`;
