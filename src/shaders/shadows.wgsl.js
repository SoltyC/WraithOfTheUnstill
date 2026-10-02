// Cascaded shadow maps (BRIEF §5.3). Each cascade stores light-space linear depth (metres along
// the light direction from the cascade camera) in an R32F target; materials sample it with
// PCSS (blocker search, then a Poisson PCF sized by the penumbra) and pick the cascade by view
// distance, blending across cascade borders.

export const CASCADES = 4;
export const SHADOW_SIZE = 2048;

/** Depth-only fragment shared by every caster: writes distance along the light direction. */
export const shadowDepthFragmentWGSL = /* wgsl */ `
uniform shadowLight: vec4f; // xyz = light direction (towards the light), w = unused
uniform shadowOrigin: vec4f; // xyz = cascade camera position
varying vWorldPos: vec3f;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  // Distance from the cascade camera plane along the direction *away* from the light.
  let d = dot(fragmentInputs.vWorldPos - uniforms.shadowOrigin.xyz, -uniforms.shadowLight.xyz);
  fragmentOutputs.color = vec4f(d, 0.0, 0.0, 1.0);
}
`;

/** Declarations + sampling for receiving materials. Requires vWorldPos and cameraPosition. */
export const SHADOW_RECEIVE_WGSL = /* wgsl */ `
struct ShadowData {
  viewProj: array<mat4x4f, ${CASCADES}>,
  splits: vec4f,        // far distance (m) of each cascade
  origins: array<vec4f, ${CASCADES}>, // cascade camera positions (xyz), w = world size of a texel
  light: vec4f,         // xyz = direction towards the light, w = shadow strength (0 = off)
};
var<storage, read> shadowData: ShadowData;
var shadowMap0: texture_2d<f32>;
var shadowMap0Sampler: sampler;
var shadowMap1: texture_2d<f32>;
var shadowMap1Sampler: sampler;
var shadowMap2: texture_2d<f32>;
var shadowMap2Sampler: sampler;
var shadowMap3: texture_2d<f32>;
var shadowMap3Sampler: sampler;

fn shadowLoad(c: u32, p: vec2i) -> f32 {
  let q = clamp(p, vec2i(0), vec2i(${SHADOW_SIZE - 1}));
  switch c {
    case 0u: { return textureLoad(shadowMap0, q, 0).r; }
    case 1u: { return textureLoad(shadowMap1, q, 0).r; }
    case 2u: { return textureLoad(shadowMap2, q, 0).r; }
    default: { return textureLoad(shadowMap3, q, 0).r; }
  }
}

const POISSON16 = array<vec2f, 16>(
  vec2f(-0.94201624, -0.39906216), vec2f(0.94558609, -0.76890725), vec2f(-0.09418410, -0.92938870), vec2f(0.34495938, 0.29387760),
  vec2f(-0.91588581, 0.45771432), vec2f(-0.81544232, -0.87912464), vec2f(-0.38277543, 0.27676845), vec2f(0.97484398, 0.75648379),
  vec2f(0.44323325, -0.97511554), vec2f(0.53742981, -0.47373420), vec2f(-0.26496911, -0.41893023), vec2f(0.79197514, 0.19090188),
  vec2f(-0.24188840, 0.99706507), vec2f(-0.81409955, 0.91437590), vec2f(0.19984126, 0.78641367), vec2f(0.14383161, -0.14100790));

// Angular radius used for penumbrae (tan). The real sun is 0.0047; a little wider reads better
// at game scale and hides cascade texels. Contact shadows stay sharp because the penumbra grows
// with the receiver–blocker distance (PCSS, BRIEF §5.3).
const SHADOW_LIGHT_TAN: f32 = 0.010;

// Visibility (1 = lit) of world point wp with geometric normal n, in cascade c.
fn shadowCascade(c: u32, wp: vec3f, n: vec3f, rot: vec2f) -> f32 {
  let texel = shadowData.origins[c].w;
  let L = shadowData.light.xyz;
  // Normal-offset + slope-scaled bias in metres, proportional to the cascade texel size.
  let ndl = clamp(dot(n, L), 0.05, 1.0);
  let offsetP = wp + n * texel * 1.5;
  let bias = texel * (1.2 + 2.5 * sqrt(1.0 - ndl * ndl) / ndl);
  let clip = shadowData.viewProj[c] * vec4f(offsetP, 1.0);
  // Babylon renders WebGPU render targets Y-flipped (GL convention), so v follows clip y up.
  let uv = vec2f(clip.x * 0.5 + 0.5, 0.5 + clip.y * 0.5);
  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) { return 1.0; }
  let d = dot(offsetP - shadowData.origins[c].xyz, -L) - bias;
  let px = uv * ${SHADOW_SIZE}.0;
  // Receiver-plane bias: a tap r texels away on a surface tilted from the light sits up to
  // r·texel·tanθ closer to the light; without this, wide filters self-shadow lit slopes (acne).
  let tanT = min(sqrt(1.0 - ndl * ndl) / ndl, 6.0) * texel;
  // 1. Blocker search: mean depth of occluders within the widest penumbra we allow.
  let searchR = clamp(SHADOW_LIGHT_TAN * 60.0 / texel, 2.0, 14.0); // texels: blockers up to ~60 m away
  var blockSum = 0.0; var blockN = 0.0;
  for (var i = 0; i < 16; i++) {
    let o = POISSON16[i];
    let r = vec2f(o.x * rot.x - o.y * rot.y, o.x * rot.y + o.y * rot.x) * searchR;
    let occ = shadowLoad(c, vec2i(floor(px + r)));
    if (occ < d - tanT * length(r)) { blockSum += occ; blockN += 1.0; }
  }
  if (blockN < 0.5) { return 1.0; }
  // 2. Penumbra from the receiver–blocker distance (metres → texels), never below ~1.4 texels.
  let dBlock = blockSum / blockN;
  let radius = clamp((d - dBlock) * SHADOW_LIGHT_TAN / texel, 1.4, 14.0);
  // 3. PCF over that radius.
  var lit = 0.0;
  for (var i = 0; i < 16; i++) {
    let o = POISSON16[i];
    let r = vec2f(o.x * rot.x - o.y * rot.y, o.x * rot.y + o.y * rot.x) * radius;
    let occ = shadowLoad(c, vec2i(floor(px + r)));
    lit += select(0.0, 1.0, d - tanT * length(r) <= occ);
  }
  return lit / 16.0;
}

fn shadowVisibility(wp: vec3f, n: vec3f, camPos: vec3f, fragXY: vec2f) -> f32 {
  if (shadowData.light.w <= 0.0) { return 1.0; }
  let dist = length(wp - camPos);
  let sp = shadowData.splits;
  // Per-pixel rotation of the Poisson disk (interleaved gradient noise angle) hides banding.
  let a = 6.2831853 * fract(52.9829189 * fract(dot(fragXY, vec2f(0.06711056, 0.00583715))));
  let rot = vec2f(cos(a), sin(a));
  var c = 0u;
  if (dist > sp.x) { c = 1u; }
  if (dist > sp.y) { c = 2u; }
  if (dist > sp.z) { c = 3u; }
  if (dist > sp.w) { return 1.0; }
  var v = shadowCascade(c, wp, n, rot);
  // Blend into the next cascade over the last 15% of this one.
  let far = sp[c];
  let near = select(0.0, sp[max(c, 1u) - 1u], c > 0u);
  let t = (dist - near) / (far - near);
  if (t > 0.85 && c < 3u) {
    v = mix(v, shadowCascade(c + 1u, wp, n, rot), (t - 0.85) / 0.15);
  }
  if (c == 3u && t > 0.85) { v = mix(v, 1.0, (t - 0.85) / 0.15); }
  return mix(1.0, v, shadowData.light.w);
}
`;

export const SHADOW_TEXTURES = ['shadowMap0', 'shadowMap1', 'shadowMap2', 'shadowMap3'];
