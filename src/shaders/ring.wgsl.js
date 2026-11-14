// Distant mountain ring (clay view): rock with snow above a wandering snowline, lit by the
// atmosphere's key and sky light and fogged by aerial perspective. No shadow receive: the ring
// lies beyond the last cascade.

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';

export const ringVertexWGSL = /* wgsl */ `
attribute position: vec3f;
attribute normal: vec3f;
uniform viewProjection: mat4x4f;
varying vWorldPos: vec3f;
varying vNormal: vec3f;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  vertexOutputs.position = uniforms.viewProjection * vec4f(vertexInputs.position, 1.0);
  vertexOutputs.vWorldPos = vertexInputs.position;
  vertexOutputs.vNormal = vertexInputs.normal;
}
`;

export const ringFragmentWGSL = /* wgsl */ `
${ENV_DECL}
varying vWorldPos: vec3f;
varying vNormal: vec3f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let Ng = normalize(fragmentInputs.vNormal);
  let dist = length(camPos - wp);
  // Erosion detail (realism plan, 2026-11-14): the mesh is 57 × 125 m, so a range read as smooth
  // facets. Ridged noise gradients from 900 m to 25 m cut gullies and ribs into the slopes, steeper
  // the steeper the face (flat crests and valley floors stay calm); the snow then lies in the gullies
  // and on the ledges, the rock ribs stand dark — how a distant range actually reads.
  let steep = 1.0 - smoothstep(0.55, 0.95, Ng.y);
  var g = vec2f(0.0); var amp = 260.0; var f = 1.0 / 900.0; var gully = 0.0;
  for (var o = 0; o < 5; o++) {
    // Stretched down the fall line (gullies run downhill), rotated each octave.
    let q = wp.xz * f + vec2f(f32(o) * 17.3, f32(o) * 5.1);
    let n = noised(q);
    let sgn = select(-1.0, 1.0, n.x > 0.5);
    g += -sgn * n.yz * amp * f * 2.0;
    gully += (1.0 - abs(n.x * 2.0 - 1.0)) * amp;
    amp *= 0.42; f *= 2.3;
  }
  gully = gully / 450.0;
  let fadeD = 1.0 - smoothstep(30000.0, 45000.0, dist);
  let N = normalize(Ng - vec3f(g.x, 0.0, g.y) * (0.35 + 0.9 * steep) * fadeD);
  // Bearing from the centre: north ranges are frost-capped, east volcanic and dark.
  let b = normalize(wp.xz);
  let east = smoothstep(0.2, 0.9, b.x) * smoothstep(-0.6, 0.3, -b.y);
  var albedo = mix(vec3f(0.22, 0.21, 0.20), vec3f(0.11, 0.10, 0.095), east);
  // Rock: banded by height (strata), darker on the ribs, paler talus on the gentler feet.
  let strata = 0.85 + 0.3 * noised(vec2f(wp.y * 0.012, dot(wp.xz, vec2f(0.0007, 0.0004)))).x;
  albedo *= strata * mix(1.15, 0.8, steep) * (0.85 + 0.3 * clamp(gully, 0.0, 1.0));
  // Low slopes near the sea carry scrub on the south and west.
  albedo = mix(albedo, vec3f(0.14, 0.17, 0.10), smoothstep(160.0, 20.0, wp.y) * (1.0 - east) * smoothstep(0.5, 0.9, N.y));
  let snowline = mix(1050.0, 650.0, smoothstep(-0.2, 0.8, b.y)) + mix(0.0, 400.0, east) + 120.0 * noised(wp.xz * 0.0011).x;
  // Snow on what is flat enough to hold it, after the detail: ledges and gully beds white, ribs bare.
  let snow = smoothstep(snowline, snowline + 160.0, wp.y + 220.0 * (gully - 0.5)) * smoothstep(0.5, 0.78, N.y);
  albedo = mix(albedo, vec3f(0.78, 0.80, 0.84), snow);

  let L = uniforms.keyDir;
  let diff = clamp((dot(N, L) + 0.15) / 1.15, 0.0, 1.0);
  let key = atmoKeyColor();
  let sky = mix(atmoSkySide(), atmoSkyUp(), clamp(N.y, 0.0, 1.0)) * uniforms.envMisc.w;
  var col = albedo * (key * diff * (1.0 / PI) + sky);
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, dist * 0.001);
  var outc = displayTransform(col, uniforms.fogParams.z * atmoExposure());
  fragmentOutputs.color = vec4f(outc, 0.0); // alpha: SSR weight (none)
}
`;
