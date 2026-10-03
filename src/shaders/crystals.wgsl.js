// Crystallize formations (BRIEF §9.2, §9.4 "ice, glass, crystal: refraction with internal
// fracture planes and subsurface light transport. They should make the player stop and look").
//
// Each crystal is a six-sided prism with a pointed tip, generated in the vertex shader from its
// record (base, birth time, axis, height, radius, seed, grow time): facets get their own vertices
// so normals are flat. Growth eases out with an overshoot from the birth time.
//
// Shading (no scene colour to refract): the view ray is refracted into the crystal and the light
// it finds is the sky above, or lit snow below, absorbed toward cyan along a path that lengthens
// toward the base; plus a fresnel sky reflection, a hard sun glint, restrained dispersion at
// grazing angles, internal fracture planes that catch the light, and a faint cold glow inside
// (strongest low in the crystal) — the formation's own light transported through the ice.

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';

export const CRYSTAL_SIDES = 6;
/** Vertices per crystal: 6 side quads (4 each) + 6 tip triangles (3 each). */
export const CRYSTAL_VERTS = CRYSTAL_SIDES * 4 + CRYSTAL_SIDES * 3;

export const crystalVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = crystal index, y = facet (0..5 sides, 6..11 tips), z = corner
uniform viewProjection: mat4x4f;
uniform crystalParams: vec4f;       // x = time
var<storage, read> crystalData: array<vec4f>;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vH: f32;
varying vSeed: f32;
varying vCentre: vec3f;
varying vGrow: f32;
varying vAxis: vec3f;

fn h11(x: f32) -> f32 { return fract(sin(x * 91.3458) * 47453.5453); }

// Corner j (0..5) of the cross-section at height fraction f (0 base, 1 shoulder), and the tip.
fn corner(j: i32, f: f32, seed: f32, r: f32) -> vec2f {
  let a = (f32(j) + 0.15 * (h11(seed * 7.0 + f32(j)) - 0.5)) / ${CRYSTAL_SIDES}.0 * 6.2831853;
  let rr = r * (0.82 + 0.3 * h11(seed * 13.0 + f32(j))) * mix(1.0, 0.86, f);
  return vec2f(cos(a), sin(a)) * rr;
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let ci = u32(vertexInputs.position.x + 0.5);
  let facet = i32(vertexInputs.position.y + 0.5);
  let cn = i32(vertexInputs.position.z + 0.5);
  let A = crystalData[ci * 3u]; let B = crystalData[ci * 3u + 1u]; let C = crystalData[ci * 3u + 2u];
  let seed = C.y;
  // Growth: eased out with a small overshoot (water snapping into crystal).
  let g0 = clamp((uniforms.crystalParams.x - A.w) / max(C.z, 1e-3), 0.0, 1.0);
  let c1 = 1.70158; let c3 = c1 + 1.0;
  let gm = g0 - 1.0;                                 // pow() of a negative base is NaN on GPUs
  let grow = select(1.0 + c3 * gm * gm * gm + c1 * gm * gm, 0.0, g0 <= 0.0);
  let height = B.w * grow;
  let radius = C.x * min(1.0, grow * 1.6);
  // Basis around the axis.
  let ax = normalize(B.xyz);
  let up = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(ax.y) > 0.95);
  let e1 = normalize(cross(up, ax)); let e2 = cross(ax, e1);
  let shoulder = 0.78 + 0.1 * h11(seed * 3.0);
  // Corners of this facet: side j: (j,0) (j+1,0) (j,1) (j+1,1); tip j: (j,1) (j+1,1) tip.
  var p = array<vec3f, 4>(vec3f(0.0), vec3f(0.0), vec3f(0.0), vec3f(0.0));
  let j = facet % ${CRYSTAL_SIDES};
  let j1 = (j + 1) % ${CRYSTAL_SIDES};
  let tipOff = (vec2f(h11(seed * 5.0), h11(seed * 9.0)) - 0.5) * radius * 0.5;
  let tip = ax * height + e1 * tipOff.x + e2 * tipOff.y;
  let c0 = corner(j, 0.0, seed, radius); let c1b = corner(j1, 0.0, seed, radius);
  let s0 = corner(j, 1.0, seed, radius); let s1 = corner(j1, 1.0, seed, radius);
  p[0] = e1 * c0.x + e2 * c0.y; p[1] = e1 * c1b.x + e2 * c1b.y;
  p[2] = ax * height * shoulder + e1 * s0.x + e2 * s0.y; p[3] = ax * height * shoulder + e1 * s1.x + e2 * s1.y;
  var local: vec3f; var n: vec3f; var hf: f32;
  if (facet < ${CRYSTAL_SIDES}) {
    local = p[cn];
    n = normalize(cross(p[1] - p[0], p[2] - p[0]));
    hf = select(0.0, shoulder, cn >= 2);
  } else {
    var q = array<vec3f, 3>(p[2], p[3], tip);
    local = q[min(cn, 2)];
    n = normalize(cross(p[3] - p[2], tip - p[2]));
    hf = select(shoulder, 1.0, cn >= 2);
  }
  // Outward normals (the winding differs per facet type; orient against the axis line).
  let radial = local - ax * dot(local, ax);
  if (dot(n, radial + ax * 0.2) < 0.0) { n = -n; }
  let wp = A.xyz + local;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (grow <= 0.0) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vNormal = n;
  vertexOutputs.vH = hf;
  vertexOutputs.vSeed = seed;
  vertexOutputs.vCentre = A.xyz + ax * height * 0.45;
  vertexOutputs.vGrow = g0;
  vertexOutputs.vAxis = ax;
}
`;

export const crystalFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform crystalParams: vec4f;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vH: f32;
varying vSeed: f32;
varying vCentre: vec3f;
varying vGrow: f32;
varying vAxis: vec3f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}

fn hh(x: f32) -> f32 { return fract(sin(x * 91.3458) * 47453.5453); }

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let V = normalize(camPos - wp);
  var N = normalize(fragmentInputs.vNormal);
  if (dot(N, V) < 0.0) { N = -N; }
  let nv = clamp(dot(N, V), 0.0, 1.0);
  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  let vis = shadowVisibility(wp, N, camPos, fragmentInputs.position.xy);
  let ambient = shIrradiance(N) * uniforms.envMisc.w;
  let exposure = uniforms.fogParams.z * atmoExposure();
  // Reflection.
  let F = 0.018 + 0.982 * pow(1.0 - nv, 5.0);
  let R = reflect(-V, N);
  let refl = atmoSky(normalize(vec3f(R.x, max(R.y, 0.02), R.z)));
  // Refraction: what the bent view ray finds — sky above, sunlit snow below — absorbed toward
  // cyan along a path that lengthens toward the base of the crystal.
  let T = refract(-V, N, 1.0 / 1.31);
  let below = smoothstep(0.05, -0.25, T.y);
  let snowLit = (key * max(L.y, 0.0) * vis / PI + shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w) * 0.85;
  let behind = mix(atmoSky(normalize(vec3f(T.x, max(T.y, 0.02), T.z))), snowLit, below);
  let path = 0.6 + 2.2 * (1.0 - fragmentInputs.vH);
  let absorb = exp(-vec3f(1.1, 0.42, 0.24) * path);
  var col = behind * absorb * (1.0 - F) + refl * F;
  // Restrained dispersion: a faint spectral fringe at grazing angles.
  let g = pow(1.0 - nv, 3.0);
  col += vec3f(0.22, -0.04, 0.3) * g * 0.12 * length(behind);
  // Internal fracture planes (two per crystal): thin sheets that catch the sun and the sky.
  let rel = wp - fragmentInputs.vCentre;
  var frac = 0.0;
  for (var k = 0; k < 2; k++) {
    let sk = fragmentInputs.vSeed * 17.0 + f32(k) * 3.1;
    let pn = normalize(vec3f(hh(sk) - 0.5, hh(sk + 1.0) - 0.5, hh(sk + 2.0) - 0.5));
    let d = abs(dot(rel, pn) - (hh(sk + 3.0) - 0.5) * 0.08);
    frac += (1.0 - smoothstep(0.0, 0.006 + 0.01 * (1.0 - nv), d)) * (0.5 + 0.5 * noised(rel.xz * 40.0).x);
  }
  col += (key * vis * 0.35 + ambient * 0.8) * frac * 0.5;
  // Sun glint on the facets.
  let H = normalize(L + V);
  col += key * pow(max(dot(N, H), 0.0), 400.0) * 8.0 * vis;
  // Light transported inside the ice: a cold glow, strongest low in the crystal, flaring as it
  // forms (display-referred).
  let flare = 1.0 + 3.0 * (1.0 - smoothstep(0.0, 1.0, fragmentInputs.vGrow));
  let core = pow(1.0 - fragmentInputs.vH, 2.0) * (0.35 + 0.65 * nv);
  col += vec3f(0.35, 0.65, 1.0) * core * 0.045 * flare / max(exposure, 1e-6);
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(camPos - wp) * 0.001);
  var outc = displayTransform(col, exposure);
  outc += vec3f(ditherNoise(fragmentInputs.position.xy) / 255.0);
  fragmentOutputs.color = vec4f(outc, 1.0);
}
`;
