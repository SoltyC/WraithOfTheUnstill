// Grading LUT (BRIEF §5.8: "restrained colour grading through a shared LUT system, blended at
// borders; stilled and restored states have their own grading"). The owner blends grade
// parameters by biome weight at the camera and by restoration, and this pass bakes them into a
// 32³ LUT (a 1024×32 strip, blue picks the slice) applied after tonemapping in display space.
//
// Parameters (G, 3 × vec4):
//   g0 = (desaturate, warmth, flatten, strength)       flatten < 0 adds contrast around 0.42
//   g1 = (shadow tint r, g, b, −)                      multiplies the shadows (weight (1 − 2.2·luma)²)
//   g2 = (highlight gain r, g, b, −)                   multiplies the highlights above mid-grey

export const lutCS = /* wgsl */ `
struct G { g0: vec4f, g1: vec4f, g2: vec4f, pad: vec4f };
@group(0) @binding(0) var<storage, read> G_: G;
@group(0) @binding(1) var outLut: texture_storage_2d<rgba16float, write>;

fn toLin(c: vec3f) -> vec3f {
  return select(pow((c + 0.055) / 1.055, vec3f(2.4)), c / 12.92, c <= vec3f(0.04045));
}
fn toSrgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= 1024u || id.y >= 32u) { return; }
  let r = f32(id.x % 32u) / 31.0; let g = f32(id.y) / 31.0; let b = f32(id.x / 32u) / 31.0;
  let inp = toLin(vec3f(r, g, b));
  var c = inp;
  let p0 = G_.g0; let p1 = G_.g1; let p2 = G_.g2;
  // Stilled/restored look (the Phase 5 grade, now in the LUT): desaturate, warmth, flatten.
  let luma = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3f(luma), p0.x);
  c *= vec3f(1.0 + 0.07 * p0.y, 1.0 + 0.01 * p0.y, 1.0 - 0.09 * p0.y);
  c = max(mix(c, vec3f(0.42) + (c - vec3f(0.42)) * 0.72, p0.z), vec3f(0.0));
  // Shadow tint (cold biomes: blue shadows, BRIEF §18) and highlight gain.
  let l2 = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  let sh = (1.0 - clamp(l2 * 2.2, 0.0, 1.0));
  c *= mix(vec3f(1.0), p1.xyz, sh * sh);
  let hi = smoothstep(0.25, 0.9, l2);
  c *= mix(vec3f(1.0), p2.xyz, hi);
  c = clamp(c, vec3f(0.0), vec3f(1.0));
  let outc = mix(inp, c, p0.w);
  textureStore(outLut, vec2u(id.x, id.y), vec4f(toSrgb(outc), 1.0));
}
`;
