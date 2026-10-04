// Display pass (BRIEF §5.8, the end of the post chain): the graded, tonemapped frame to the
// swapchain. Input is the post chain's last HDR target (pre-exposed linear). Tonemap (AgX or
// ACES) → 3D LUT grade (biome × stilled/restored) → film grain → linear→sRGB → dither.
// Row 0 of every post texture is the bottom of the view (Babylon's render-target convention), and
// fragmentInputs.position is y-up here too, so the frame is read texel for texel.

export const displayVertexWGSL = /* wgsl */ `
attribute position: vec2f;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  vertexOutputs.position = vec4f(vertexInputs.position, 0.0, 1.0);
}
`;

export const displayFragmentWGSL = /* wgsl */ `
var src: texture_2d<f32>;
var srcSampler: sampler;
var bloom: texture_2d<f32>;
var bloomSampler: sampler;
var lut: texture_2d<f32>;
var lutSampler: sampler;
uniform params: vec4f;   // x = tonemapper (0 ACES, 1 AgX), y = grain, z = frame index, w = LUT on
uniform viewport: vec4f; // render size (w, h), 1/w, 1/h
uniform params2: vec4f;  // x = sharpen (0..1), y = bloom intensity, z = bloom on

// ACES (Narkowicz fit), the Phase 0–5 look.
fn aces(x: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

// AgX (Troy Sobotka; Benjamin Wrensch's polynomial fit) with a restrained "punchy" look:
// highlights desaturate toward white instead of skewing hue or clipping (BRIEF §5.8).
fn agxContrast(x: vec3f) -> vec3f {
  let x2 = x * x; let x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
fn agx(c: vec3f) -> vec3f {
  let inset = mat3x3f(vec3f(0.842479062253094, 0.0423282422610123, 0.0423756549057051),
                      vec3f(0.0784335999999992, 0.878468636469772, 0.0784336),
                      vec3f(0.0792237451477643, 0.0791661274605434, 0.879142973793104));
  let outset = mat3x3f(vec3f(1.19687900512017, -0.0528968517574562, -0.0529716355144438),
                       vec3f(-0.0980208811401368, 1.15190312990417, -0.0980434501171241),
                       vec3f(-0.0990297440797205, -0.0989611768448433, 1.15107367264116));
  let minEv = -12.47393; let maxEv = 4.026069;
  var v = inset * max(c, vec3f(1e-10));
  v = clamp(log2(v), vec3f(minEv), vec3f(maxEv));
  v = (v - minEv) / (maxEv - minEv);
  v = agxContrast(v);
  // Look: a touch of contrast and saturation (AgX's base is deliberately flat).
  let luma = dot(v, vec3f(0.2126, 0.7152, 0.0722));
  v = pow(max(v, vec3f(0.0)), vec3f(1.12));
  v = luma + 1.12 * (v - luma);
  v = outset * v;
  // AgX's output is display-encoded (power 2.2); return linear for the LUT and sRGB encode.
  return pow(clamp(v, vec3f(0.0), vec3f(1.0)), vec3f(2.2));
}

// 32³ grading LUT stored as a 1024×32 strip (blue selects the slice), sampled in sRGB-encoded
// space with manual blue interpolation.
fn applyLut(c: vec3f) -> vec3f {
  let s = clamp(c, vec3f(0.0), vec3f(1.0)) * 31.0;
  let b0 = floor(s.b); let b1 = min(b0 + 1.0, 31.0); let fb = s.b - b0;
  let u = (s.r + 0.5) / 1024.0; let v = (s.g + 0.5) / 32.0;
  let a = textureSampleLevel(lut, lutSampler, vec2f(u + b0 / 32.0, v), 0.0).rgb;
  let d = textureSampleLevel(lut, lutSampler, vec2f(u + b1 / 32.0, v), 0.0).rgb;
  return mix(a, d, fb);
}

fn toSrgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}

fn hash3(p: vec3f) -> f32 {
  var q = fract(p * 0.1031);
  q += dot(q, q.zyx + 31.32);
  return fract((q.x + q.y) * q.z);
}

fn tonemap(hdr: vec3f) -> vec3f {
  return select(aces(hdr), agx(hdr), uniforms.params.x > 0.5);
}
fn loadHdr(p: vec2i) -> vec3f {
  let q = clamp(p, vec2i(0), vec2i(uniforms.viewport.xy) - 1);
  return textureLoad(src, q, 0).rgb;
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let px = vec2i(fragmentInputs.position.xy);
  var hdr = loadHdr(px);
  if (uniforms.params2.z > 0.5) {
    let b = textureSampleLevel(bloom, bloomSampler, (fragmentInputs.position.xy) * uniforms.viewport.zw, 0.0).rgb;
    hdr = mix(hdr, b, uniforms.params2.y);
  }
  var c = tonemap(hdr);
  // Post-TAA sharpening (BRIEF §5.8, last in the chain), contrast-adaptive (AMD CAS-style) on the
  // tonemapped image: strong where the neighbourhood is flat, weak at hard edges (no halos).
  if (uniforms.params2.x > 0.0) {
    let n = tonemap(loadHdr(px + vec2i(0, 1))); let s = tonemap(loadHdr(px - vec2i(0, 1)));
    let ea = tonemap(loadHdr(px + vec2i(1, 0))); let w = tonemap(loadHdr(px - vec2i(1, 0)));
    let mn = min(c, min(min(n, s), min(ea, w)));
    let mx = max(c, max(max(n, s), max(ea, w)));
    let amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3f(1e-4)), vec3f(0.0), vec3f(1.0)));
    let wgt = -amp * mix(0.125, 0.2, uniforms.params2.x) * uniforms.params2.x;
    c = clamp((c + (n + s + ea + w) * wgt) / (1.0 + 4.0 * wgt), vec3f(0.0), vec3f(1.0));
  }
  var e = toSrgb(c);
  if (uniforms.params.w > 0.5) { e = applyLut(e); }
  // Film grain: luminance-weighted (strongest in the mids, none in deep shadow or near white),
  // a fresh pattern each frame; subtle (BRIEF §5.8).
  let l = dot(e, vec3f(0.2126, 0.7152, 0.0722));
  let g = hash3(vec3f(fragmentInputs.position.xy, uniforms.params.z)) - 0.5;
  e += vec3f(g * uniforms.params.y * 4.0 * l * (1.0 - l));
  // Dither away 8-bit banding in the sky gradients.
  let n = fract(52.9829189 * fract(dot(fragmentInputs.position.xy, vec2f(0.06711056, 0.00583715)))) - 0.5;
  e += vec3f(n / 255.0);
  fragmentOutputs.color = vec4f(e, 1.0);
}
`;
