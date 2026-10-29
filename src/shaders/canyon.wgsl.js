// The ravine wall kit (world/canyonKit.js): sandstone cliffs along the canyon risers. UV is metres
// along the wall and world height, so the scan's own layering runs along the beds. Colour by bed
// (world height: the same beds on both sides of the canyon, matching the terrain's sandstone,
// shaders/sandstone.wgsl.js), desert varnish streaking down from the lips, sand dusted on every
// upward face and splashed up the foot, and the canyon's warm bounce light in the shade.
// Kinds (cliff.z): 0 the Galleries' red strata, 1 the Stride's darker bedrock, 2 a slot's smooth,
// wind-polished sandstone.

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';
import { MATERIALS_DECL, MATERIALS_WGSL } from './materials.wgsl.js';
import { SANDSTONE_STRATA } from '../terrain/geology.js';

export const canyonVertexWGSL = /* wgsl */ `
attribute position: vec3f;
attribute normal: vec3f;
attribute uv: vec2f;
attribute cliff: vec4f;      // riser foot contour height, cliff top, kind, 1 on the lip and cap
uniform viewProjection: mat4x4f;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vUv: vec2f;
varying vCliff: vec4f;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let wp = vertexInputs.position;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vNormal = vertexInputs.normal;
  vertexOutputs.vUv = vertexInputs.uv;
  vertexOutputs.vCliff = vertexInputs.cliff;
}
`;

export const canyonFragmentWGSL = /* wgsl */ `
${ENV_DECL}
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vUv: vec2f;
varying vCliff: vec4f;
${MATERIALS_DECL}
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
${MATERIALS_WGSL}

fn cy_hash(x: f32) -> f32 { return fract(sin(x * 127.1 + 31.7) * 43758.5453); }

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let V = normalize(camPos - wp);
  var Ng = normalize(fragmentInputs.vNormal + vec3f(0.0, 1e-5, 0.0));
  if (dot(Ng, V) < 0.0) { Ng = -Ng; }
  let fp = length(fwidth(wp));
  let iso = fragmentInputs.vCliff.x; let top = fragmentInputs.vCliff.y; let kind = fragmentInputs.vCliff.z;
  let slot = kind > 1.5; let rift = kind > 0.5 && !slot;
  // The scan along the wall (u) and up it (world y), at two scales (5.5 m and 2.1 m tiles, offset)
  // so its tiling never reads as courses of brick: the strata cliff, or a slot's polished sandstone
  // (the layer by kind; grad sampling, so the varying layer index is fine).
  let layer = select(MAT_CLIFF_STRATA, MAT_SANDSTONE_SMOOTH, slot);
  let uv = fragmentInputs.vUv / select(5.5, 3.0, slot);
  let du1 = dpdx(uv); let du2 = dpdy(uv);
  let sC0 = matUvG(layer, uv, Ng, wp, du1, du2);
  let k2 = 5.5 / 2.1;
  let sC1 = matUvG(layer, uv * k2 + vec2f(0.31, 0.57), Ng, wp, du1 * k2, du2 * k2);
  var sC = sC0;
  sC.albedo = sqrt(sC0.albedo * sC1.albedo); sC.N = normalize(sC0.N + sC1.N - Ng); sC.ao = min(sC0.ao, sC1.ao + 0.15);
  let n1 = noised(vec2f(fragmentInputs.vUv.x * 0.21, wp.y * 0.13)).x;
  let n2 = noised(wp.xz * 0.9 + vec2f(wp.y * 0.3)).x;

  // Beds by world height: a tone per strata (as the terrain's sandstone) and per sub-band (as the
  // geometry's harder and softer beds, world/canyonKit.js BAND = 1.7 m).
  let warp = noised(wp.xz * 0.012 + vec2f(23.0, 71.0)).x * 0.4;
  let bed = (wp.y + warp) / ${SANDSTONE_STRATA}.0;
  let tone = cy_hash(floor(bed));
  let sub = cy_hash(floor(wp.y / 1.7) + 0.5);
  var bedCol = mix(vec3f(0.5, 0.29, 0.17), vec3f(0.66, 0.5, 0.34), tone);         // red-ochre … cream
  bedCol *= 0.86 + 0.24 * sub;
  bedCol = mix(bedCol, vec3f(0.72, 0.6, 0.45), step(0.86, sub) * 0.5);           // pale seams
  var albedo = matRetint(sC, layer, bedCol * mix(vec3f(1.0), vec3f(0.86, 0.8, 0.74), fragmentInputs.vCliff.w), 0.3);
  albedo *= pow(max(dot(sC.albedo / matMean(layer), vec3f(0.333)), 0.05), 0.3);
  var N = sC.N; var rao = sC.ao;
  if (rift) {
    // The Stride: older, darker rock under the sandstone, cold in its depths.
    albedo = mix(albedo, matRetint(sC, layer, vec3f(0.24, 0.19, 0.16), 0.2), 0.75);
  }
  if (slot) {
    // Wind-polished: smooth pale orange stone, flowing tonal lines, no beds.
    let flow = 0.5 + 0.5 * sin((wp.y * 0.6 + 2.2 * sin(fragmentInputs.vUv.x * 0.07 + wp.y * 0.05) + 1.4 * n1) * 1.7);
    albedo = matRetint(sC, layer, mix(vec3f(0.62, 0.38, 0.22), vec3f(0.7, 0.47, 0.28), flow * flow), 0.35);
    N = normalize(mix(Ng, sC.N, 0.5)); rao = mix(1.0, sC.ao, 0.6);
  }
  // Desert varnish: dark streaks running down from the lip, strongest just under it.
  let below = top - wp.y;
  let streak = smoothstep(0.15, 0.6, noised(vec2f(fragmentInputs.vUv.x * 0.85, wp.y * 0.035)).x * 0.5 + 0.5 + 0.25 * n1 - 0.25);
  let varnish = streak * (1.0 - smoothstep(1.0, 7.0 + 5.0 * n1, below)) * step(0.5, 1.0 - fragmentInputs.vCliff.w) * select(0.75, 0.25, slot);
  albedo = mix(albedo, albedo * vec3f(0.38, 0.29, 0.24), varnish);
  // Overhang undersides and joints hold shadow; the scan's cavities too.
  var ao = mix(1.0, rao, 0.85) * mix(1.0, 0.55, smoothstep(0.1, 0.7, -Ng.y));
  // Sand: dusted on upward faces (ledges, the cap), splashed up the foot from the tread.
  // (A flat sand tone with the scan's own light and dark: a third array sample cost more than it showed.)
  let sandAlb = vec3f(0.6, 0.43, 0.26) * (0.9 + 0.2 * n2);
  // The lip and cap are caprock: a harder bed, only lightly dusted (a full sand cover read as a pale
  // band round the rim, never quite the terrain's sand).
  let dust = smoothstep(0.5, 0.82, Ng.y + 0.18 * n2) * mix(1.0, 0.3, fragmentInputs.vCliff.w);
  let foot = 1.0 - smoothstep(0.1, 1.2 + 0.7 * n1, wp.y - (iso - 1.5));
  let sandK = max(dust, foot * 0.85);
  albedo = mix(albedo, sandAlb, sandK);
  N = normalize(mix(N, Ng, sandK * 0.7));

  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  let nl = dot(N, L);
  let diff = clamp(nl, 0.0, 1.0);
  // Soft shadows near; one tap beyond 120 m, where the walls fill much of a rim view's screen.
  var vis = 1.0;
  if (length(camPos - wp) < 120.0) { vis = shadowVisibility(wp, Ng, camPos, fragmentInputs.position.xy); }
  else { vis = shadowVisibilityFast(wp, camPos); }
  let sky = shIrradiance(N) * uniforms.envMisc.w * ao;
  // The canyon's warm bounce: sunlit sand and the opposite wall light the shade orange (faces
  // turned sideways and down get the most; it never reaches past the cap).
  let bounce = key * max(L.y, 0.0) * vec3f(0.62, 0.42, 0.25) * 0.3 / PI * clamp(0.65 - 0.55 * N.y, 0.0, 1.0) * ao;
  var col = albedo * (key * diff * vis / PI + sky + bounce);
  let H = normalize(L + V);
  col += key * pow(max(dot(N, H), 0.0), select(20.0, 40.0, slot)) * select(0.03, 0.08, slot) * vis * diff;
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(camPos - wp) * 0.001);
  fragmentOutputs.color = vec4f(displayTransform(col, uniforms.fogParams.z * atmoExposure()), 0.0);
}
`;
