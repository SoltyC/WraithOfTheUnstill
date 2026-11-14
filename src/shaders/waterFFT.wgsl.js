// Lake waves by FFT (realism plan W2; Tessendorf, "Simulating Ocean Water"). Three cascades of a
// JONSWAP spectrum sized for a lake's short fetch, each a band of wavelengths in its own tile:
//   0: 5.3 m tile, wavelengths 5.3 – 1.23 m   (the longest a lake raises; mostly empty in light air)
//   1: 1.23 m tile, 1.23 – 0.29 m             (the spectrum's peak: ~0.8 m at 6 m/s over 250 m)
//   2: 0.29 m tile, 0.29 – 0.04 m             (short gravity and capillary ripples: the glitter)
// The tiles are incommensurate and each band is sampled only where it is resolved, so no tiling
// reads. Shorter than 4 cm is roughness (WAVE_VAR.w). The spectrum is built once, here on the CPU,
// for a reference wind (WAVE_UREF along +x); per frame a compute pass evolves it (dispersion, so each
// wavelength travels at its own speed), two more transform it to slopes; the water shaders sample
// them in the wind's frame and scale each band by the wind at the point (render/waterWaves.js,
// shaders/water.wgsl.js waterSlope): the gusts ruffle the lake in patches, still air leaves a mirror.

export const FFT_N = 64;
export const WAVE_TILES = [5.3, 1.23, 0.29];
export const WAVE_MIN = 0.04;                 // shortest wavelength in the FFT (m)
export const WAVE_UREF = 6;                   // reference wind (m/s)
export const WAVE_LOOP = 240;                // s: the waves repeat after this (time is taken modulo it)
const FETCH = 250;                            // m
const G = 9.81;

// A small seeded RNG (the spectrum is the same every run).
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** JONSWAP with fetch (Hasselmann et al. 1973) as an omnidirectional wavenumber spectrum E(k) (m³). */
function jonswapK(k, U, F) {
  const w = Math.sqrt(G * k + 7.4e-5 * k * k * k);
  const dwdk = (G + 3 * 7.4e-5 * k * k) / (2 * w);
  const alpha = 0.076 * Math.pow(U * U / (F * G), 0.22);
  const wp = 22 * Math.pow(G * G / (U * F), 1 / 3);
  const sigma = w <= wp ? 0.07 : 0.09;
  const r = Math.exp(-((w - wp) ** 2) / (2 * sigma * sigma * wp * wp));
  const Sw = alpha * G * G / Math.pow(w, 5) * Math.exp(-1.25 * Math.pow(wp / w, 4)) * Math.pow(3.3, r);
  return { E: Sw * dwdk, kp: wp * wp / G };
}

/** h0 for every cascade (x: along the wind), packed per texel as (h0(k), conj(h0(−k))), and each
 *  band's slope variance (both axes) at the reference wind, normalised so the clean-water total
 *  (Cox & Munk: 0.003 + 0.00512 U) is met with a quarter of it below 4 cm. */
function build() {
  const N = FFT_N, H = new Float32Array(3 * N * N * 4), amp = new Float32Array(3 * N * N * 2);
  const vars = [0, 0, 0];
  const rnd = rng(1729);
  const gauss = () => { const u = Math.max(rnd(), 1e-9), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  for (let c = 0; c < 3; c++) {
    const L = WAVE_TILES[c], dk = 2 * Math.PI / L;
    const kLo = 2 * Math.PI / L * 0.999, kHi = 2 * Math.PI / (c < 2 ? WAVE_TILES[c + 1] : WAVE_MIN);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const nx = i < N / 2 ? i : i - N, nz = j < N / 2 ? j : j - N;
      const kx = nx * dk, kz = nz * dk, k = Math.hypot(kx, kz);
      const o = (c * N * N + j * N + i) * 2;
      if (k < kLo || k >= kHi) continue;
      const { E, kp } = jonswapK(k, WAVE_UREF, FETCH);
      // Spreading: cos² downwind, broadening toward isotropic for the short waves; a little
      // energy runs against the wind (so the field is not a set of ridges).
      const th = Math.atan2(kz, kx), cs = Math.cos(th);
      const iso = 0.12 + 0.3 * Math.min(1, Math.max(0, Math.log(k / (2 * kp)) / Math.log(10)));
      const D = (1 - iso) * (cs > 0 ? (2 / Math.PI) * cs * cs : 0) + iso / (2 * Math.PI);
      const psi = E * D / k;                        // directional spectrum Ψ(k) (m⁴)
      const a = Math.sqrt(psi * dk * dk / 2);
      amp[o] = gauss() * a; amp[o + 1] = gauss() * a;
      vars[c] += k * k * psi * dk * dk;
    }
  }
  const target = 0.75 * (0.003 + 0.00512 * WAVE_UREF), sum = vars[0] + vars[1] + vars[2];
  const s = Math.sqrt(target / sum);
  for (let k = 0; k < amp.length; k++) amp[k] *= s;
  for (let c = 0; c < 3; c++) {
    vars[c] *= s * s;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const o = c * N * N + j * N + i, m = c * N * N + ((N - j) % N) * N + ((N - i) % N);
      H[o * 4] = amp[o * 2]; H[o * 4 + 1] = amp[o * 2 + 1];
      H[o * 4 + 2] = amp[m * 2]; H[o * 4 + 3] = -amp[m * 2 + 1];
    }
  }
  return { H, vars: [...vars, 0.25 * (0.003 + 0.00512 * WAVE_UREF)] };
}
const B = build();
export const WAVE_H0 = B.H;
/** Slope variance (both axes) of each band and of the unresolved rest, at WAVE_UREF. */
export const WAVE_VAR = B.vars;

const f = (v) => v.toFixed(5);

/** Per frame: the spectrum at time t (P[0].x), as slopes (i k h) and height, two fields per complex. */
export const waveSpectrumCS = /* wgsl */ `
@group(0) @binding(0) var<storage, read> h0: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> spec: array<vec4f>;
@group(0) @binding(2) var<storage, read> P: array<vec4f>;
const N: u32 = ${FFT_N}u;
fn cmul(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= N || id.y >= N) { return; }
  let c = id.z;
  let L = select(select(${f(WAVE_TILES[2])}, ${f(WAVE_TILES[1])}, c == 1u), ${f(WAVE_TILES[0])}, c == 0u);
  let n = vec2f(f32(select(i32(id.x), i32(id.x) - i32(N), id.x >= N / 2u)), f32(select(i32(id.y), i32(id.y) - i32(N), id.y >= N / 2u)));
  let k = n * (6.2831853 / L); let kl = length(k);
  // ω quantised to multiples of 2π/WAVE_LOOP (Tessendorf's looping trick, invisible at these
  // frequencies), so the time can be taken modulo the loop and f32 keeps the phase exact.
  let w0 = 6.2831853 / ${f(WAVE_LOOP)};
  let w = floor(sqrt(9.81 * kl + 7.4e-5 * kl * kl * kl) / w0) * w0;
  let ph = w * P[0].x;
  let e = vec2f(cos(ph), sin(ph));
  let i = c * N * N + id.y * N + id.x;
  let a = h0[i];
  let h = cmul(a.xy, e) + cmul(a.zw, vec2f(e.x, -e.y));
  let ih = vec2f(-h.y, h.x);
  // A = ∂h/∂x + i ∂h/∂z (both real in space); B = h + i (−k² h) (height, and its Laplacian).
  let A = ih * k.x - h * k.y;
  let B = h + vec2f(kl * kl * h.y, -kl * kl * h.x);
  spec[i] = vec4f(A, B);
}
`;

/** One inverse FFT pass over N lines of each cascade (workgroup = a line: radix-2 in shared
 *  memory). rows: in place in the buffer; columns: out to the cascades' textures (rgba: slope x,
 *  slope z (wind frame), height, Laplacian). */
export const waveFftCS = (rows) => /* wgsl */ `
@group(0) @binding(0) var<storage, read_write> spec: array<vec4f>;
${rows ? '' : `@group(0) @binding(1) var out0: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var out1: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var out2: texture_storage_2d<rgba16float, write>;`}
const N: u32 = ${FFT_N}u;
const BITS: u32 = ${Math.log2(FFT_N)}u;
var<workgroup> sh: array<vec4f, ${FFT_N}>;
fn cmul(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
fn at(c: u32, line: u32, e: u32) -> u32 { return c * N * N + ${rows ? 'line * N + e' : 'e * N + line'}; }
@compute @workgroup_size(${FFT_N / 2}, 1, 1)
fn main(@builtin(local_invocation_id) lid: vec3u, @builtin(workgroup_id) wid: vec3u) {
  let line = wid.x; let c = wid.y; let t = lid.x;
  for (var q = 0u; q < 2u; q++) {
    let e = t + q * (N / 2u);
    sh[reverseBits(e) >> (32u - BITS)] = spec[at(c, line, e)];
  }
  workgroupBarrier();
  for (var s = 1u; s <= BITS; s++) {
    let half = 1u << (s - 1u);
    let j = t % half;
    let i0 = (t / half) * 2u * half + j; let i1 = i0 + half;
    let ang = 3.14159265 * f32(j) / f32(half);
    let w = vec2f(cos(ang), sin(ang));
    let a = sh[i0]; let b = sh[i1];
    let bw = vec4f(cmul(b.xy, w), cmul(b.zw, w));
    sh[i0] = a + bw; sh[i1] = a - bw;
    workgroupBarrier();
  }
  for (var q = 0u; q < 2u; q++) {
    let e = t + q * (N / 2u);
    let v = sh[e];
    ${rows ? 'spec[at(c, line, e)] = v;' : `let px = vec2i(i32(line), i32(e));
    let o = vec4f(v.x, v.y, v.z, v.w);
    if (c == 0u) { textureStore(out0, px, o); } else if (c == 1u) { textureStore(out1, px, o); } else { textureStore(out2, px, o); }`}
  }
}
`;

/**
 * The wave bands at a point, for the water shaders. The host declares, besides this:
 *   waveTex0..2 (+ their samplers, or one shared `waveSampler` when `shared`), and the functions
 *   waveDir() -> vec2f   the wind's mean direction (the spectrum's +x)
 *   waveBase() -> f32    the wind's mean speed factor (the long bands answer it more than the gusts)
 *   wNoised(p) -> vec3f  value noise
 * waveBands(p, t, U, fp) → slope xy (world), slope variance lost to the footprint (per axis).
 * U: the local wind speed factor (windField z; ~5 m/s at 1).
 */
export const WAVE_BANDS_WGSL = (shared) => /* wgsl */ `
${shared ? `@group(0) @binding(${shared}) var waveSampler: sampler;
@group(0) @binding(${shared + 1}) var waveTex0: texture_2d<f32>;
@group(0) @binding(${shared + 2}) var waveTex1: texture_2d<f32>;
@group(0) @binding(${shared + 3}) var waveTex2: texture_2d<f32>;` : `var waveTex0Sampler: sampler;
var waveTex0: texture_2d<f32>;
var waveTex1Sampler: sampler;
var waveTex1: texture_2d<f32>;
var waveTex2Sampler: sampler;
var waveTex2: texture_2d<f32>;`}
const WAVE_VAR: vec4f = vec4f(${WAVE_VAR.map(f).join(', ')});
fn waveBand(c: i32, uv: vec2f) -> vec2f {
  ${shared
    ? `if (c == 0) { return textureSampleLevel(waveTex0, waveSampler, uv, 0.0).xy; }
  if (c == 1) { return textureSampleLevel(waveTex1, waveSampler, uv, 0.0).xy; }
  return textureSampleLevel(waveTex2, waveSampler, uv, 0.0).xy;`
    : `if (c == 0) { return textureSampleLevel(waveTex0, waveTex0Sampler, uv, 0.0).xy; }
  if (c == 1) { return textureSampleLevel(waveTex1, waveTex1Sampler, uv, 0.0).xy; }
  return textureSampleLevel(waveTex2, waveTex2Sampler, uv, 0.0).xy;`}
}
fn waveBands(p: vec2f, t: f32, Ulocal: f32, fp: f32) -> vec3f {
  let d = waveDir(); let pd = vec2f(-d.y, d.x);
  let Um = waveBase() * 5.0 * 0.8;
  // Cat's paws: patches of ruffled water 10–40 m across, carried downwind a little slower than
  // the air, with near-glassy water between them.
  let q = p - d * t * (1.2 + 0.45 * Um);
  let pn = wNoised(vec2f(dot(q, d), dot(q, pd)) * vec2f(0.03, 0.045)).x * 0.65 + wNoised(q * 0.11 + 5.0).x * 0.35;
  let paw = mix(0.04, 1.5, smoothstep(-0.15, 0.55, pn));
  let Ul = Ulocal * 5.0 * paw;
  // Each band answers its own wind: the ripples at once and fully, the longer waves lag (they are
  // the sea the gusts have raised, so they follow the mean more than the gust).
  let U2 = Ul; let U1 = mix(Ul, Um * paw, 0.4); let U0 = mix(Ul, Um, 0.7);
  let uref = ${f(WAVE_UREF)};
  let g2 = smoothstep(1.0, 2.8, U2) * sqrt(U2 / uref);
  let g1 = smoothstep(1.2, 3.8, U1) * pow(U1 / uref, 0.75);
  let g0 = smoothstep(2.5, 6.0, U0) * pow(U0 / uref, 1.25);
  let a = vec2f(dot(p, d), dot(p, pd));
  var s = vec2f(0.0); var lost = 0.0;
  var gs = array<f32, 3>(g0, g1, g2);
  var lo = array<f32, 3>(${f(WAVE_TILES[1])}, ${f(WAVE_TILES[2])}, ${f(WAVE_MIN)});
  var tile = array<f32, 3>(${WAVE_TILES.map(f).join(', ')});
  for (var c = 0; c < 3; c++) {
    let g = gs[c];
    if (g <= 1e-4) { continue; }
    // A band is drawn while the pixel resolves its shortest waves; past that its slope is roughness.
    let keep = 1.0 - smoothstep(0.15 * lo[c], 0.5 * lo[c], fp);
    if (keep > 0.0) { s += waveBand(c, a / tile[c] + vec2f(0.37, 0.71) * f32(c)) * (g * keep); }
    lost += WAVE_VAR[c] * g * g * (1.0 - keep * keep) * 0.5;
  }
  lost += WAVE_VAR.w * g2 * g2 * 0.5;
  return vec3f(d * s.x + pd * s.y, lost);
}
`;

/** Stand-in where no wave textures are bound (the wadis' still pools). */
export const WAVE_BANDS_NONE_WGSL = /* wgsl */ `
fn waveBands(p: vec2f, t: f32, Ulocal: f32, fp: f32) -> vec3f { return vec3f(0.0); }
`;
