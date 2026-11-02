// Ebbhold's grey box (render/ebbhold.js): Shaper stone in courses, the undercroft's black sand, the five people's places as pale
// blocks, the sea-doors in dark bronze. No sun reaches it (its ceilings cast into the shadow maps, and this material leaves the key
// out): only the lamps — world lights of the 'held' kind (systems/lights.js), flames that burn and do not flicker (storylines.md,
// *Keeping it fair*), which light the Wraith the same way — and a faint cold fill. The water's
// colour and the dark between lamps are post/compose's (the city sets its interior flag).

import { ENV_DECL, COMMON_WGSL, SPELL_LIGHT_DECL, SPELL_LIGHT_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';

export const ebbVertexWGSL = /* wgsl */ `
attribute position: vec3f;
attribute normal: vec3f;
attribute info: vec4f;               // x = kind (0 stone, 1 sand, 2 prop, 3 bronze, 4 flame, 5 column), y = per-box seed
uniform viewProjection: mat4x4f;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vInfo: vec4f;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  vertexOutputs.position = uniforms.viewProjection * vec4f(vertexInputs.position, 1.0);
  vertexOutputs.vWorldPos = vertexInputs.position;
  vertexOutputs.vNormal = vertexInputs.normal;
  vertexOutputs.vInfo = vertexInputs.info;
}
`;

export const ebbFragmentWGSL = /* wgsl */ `
${ENV_DECL}
${SPELL_LIGHT_DECL}
uniform ebbParams: vec4f;                        // y = fill (display-referred)
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vInfo: vec4f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SPELL_LIGHT_WGSL}
fn eHash(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453); }
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let N = normalize(fragmentInputs.vNormal);
  let kind = fragmentInputs.vInfo.x;
  let ex = uniforms.fogParams.z * atmoExposure();
  // A flame: its own light.
  if (kind > 3.5 && kind < 4.5) {
    fragmentOutputs.color = vec4f(displayTransform(vec3f(6.0, 3.4, 1.3) * 0.6 / max(ex, 1e-6), ex), 0.0);   // display-referred, like the lamps it stands for
    return fragmentOutputs;
  }
  // Courses of dressed stone: 0.55 m high, blocks 1.1 m long, each course offset; the face's axes from its normal.
  let an = abs(N);
  var uv = wp.xz;
  if (an.x > 0.5) { uv = vec2f(wp.z, wp.y); } else if (an.z > 0.5) { uv = vec2f(wp.x, wp.y); }
  let row = floor(uv.y / 0.55);
  let bu = uv.x / 1.1 + row * 0.5;
  let cell = vec2f(floor(bu), row);
  let fu = fract(bu); let fv = fract(uv.y / 0.55);
  let mortar = select(1.0 - 0.45 * (1.0 - smoothstep(0.0, 0.03, min(min(fu, 1.0 - fu) * 1.1, min(fv, 1.0 - fv) * 0.55))), 1.0, an.y > 0.5 && kind > 0.5);
  let tone = 0.85 + 0.3 * eHash(vec3f(cell, fragmentInputs.vInfo.y));
  var albedo = vec3f(0.30, 0.32, 0.31) * tone * mortar;
  if (kind > 0.5 && kind < 1.5) { albedo = vec3f(0.07, 0.068, 0.072) * (0.8 + 0.4 * eHash(floor(wp * 9.0))); }   // black sand
  if (kind > 1.5 && kind < 2.5) { albedo = vec3f(0.55, 0.53, 0.5); }                                             // the people's places
  if (kind > 2.5 && kind < 3.5) { albedo = vec3f(0.16, 0.11, 0.06) * tone; }                                       // bronze
  if (kind > 4.5) { albedo *= 1.1; }
  // The lamps (the world-light grid, display-referred, with a little wrap so a pillar's dark side is not black) and the
  // cold fill: what little light the water and the far halls give back.
  let fill = vec3f(0.55, 0.75, 0.8) * uniforms.ebbParams.y * (0.8 + 0.2 * N.y);
  let col = albedo * fill / max(ex, 1e-6) + spellLit(wp, N, albedo, 0.25, ex);
  fragmentOutputs.color = vec4f(displayTransform(col, ex), 0.0);
}
`;
