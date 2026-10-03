// WGSL twin of src/terrain/noise.js (hashU32, hash2, valueNoise, fbm) and src/terrain/meso.js
// (mesoHeight). Same integer hashing (u32 wrap ≙ Math.imul/>>>0), same constants, same octave
// rotation, so CPU collision and GPU geometry agree to float precision. Edit both together;
// tools/capture/parity-check.mjs verifies them on the GPU.

export const TERRAIN_NOISE_WGSL = /* wgsl */ `
fn tn_hashU32(xIn: u32) -> u32 {
  var x = xIn;
  x = x ^ (x >> 16u);
  x = x * 0x7feb352du;
  x = x ^ (x >> 15u);
  x = x * 0x846ca68bu;
  x = x ^ (x >> 16u);
  return x;
}

fn tn_hash2(ix: i32, iz: i32, seed: u32) -> f32 {
  let h = tn_hashU32((bitcast<u32>(ix) * 0x27d4eb2du) ^ tn_hashU32((bitcast<u32>(iz) * 0x165667b1u) ^ seed));
  return f32(h) * (1.0 / 4294967296.0);
}

fn tn_valueNoise(x: f32, z: f32, seed: u32) -> f32 {
  let fx = floor(x);
  let fz = floor(z);
  let tx = x - fx;
  let tz = z - fz;
  let ux = tx * tx * tx * (tx * (tx * 6.0 - 15.0) + 10.0);
  let uz = tz * tz * tz * (tz * (tz * 6.0 - 15.0) + 10.0);
  let ix = i32(fx);
  let iz = i32(fz);
  let a = tn_hash2(ix, iz, seed);
  let b = tn_hash2(ix + 1, iz, seed);
  let c = tn_hash2(ix, iz + 1, seed);
  let d = tn_hash2(ix + 1, iz + 1, seed);
  let ab = a + (b - a) * ux;
  let cd = c + (d - c) * ux;
  return (ab + (cd - ab) * uz) * 2.0 - 1.0;
}

fn tn_fbm(xIn: f32, zIn: f32, octaves: i32, seed: u32) -> f32 {
  var x = xIn;
  var z = zIn;
  var sum = 0.0;
  var amp = 1.0;
  var norm = 0.0;
  for (var i = 0; i < octaves; i++) {
    sum += amp * tn_valueNoise(x, z, seed + u32(i) * 1013u);
    norm += amp;
    let rx = 0.8 * x - 0.6 * z;
    let rz = 0.6 * x + 0.8 * z;
    x = rx * 2.03;
    z = rz * 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

const MESO_SEED: u32 = 0x6d65u;

fn tn_duneProfile(p: f32) -> f32 {
  if (p < 0.72) { let t = p / 0.72; return t * t * (3.0 - 2.0 * t) * 0.92 + t * 0.08; }
  let t = (p - 0.72) / 0.28;
  return 1.0 - t * (2.0 - t);
}

// w0..w5 = frost, meadow, mire, dunes, ember, coast. wind = unit direction blown toward.
fn tn_mesoHeight(x: f32, z: f32, wA: vec4f, wB: vec2f, wind: vec2f) -> f32 {
  let u = x * wind.x + z * wind.y;
  let v = -x * wind.y + z * wind.x;
  let S = MESO_SEED;
  var h = 0.0;
  if (wA.w > 0.001) {
    let phase = u / 140.0 + 0.9 * tn_fbm(u / 900.0, v / 600.0, 3, S + 1u) + 0.25 * tn_valueNoise(v / 170.0, u / 400.0, S + 2u);
    let p = phase - floor(phase);
    let seg = 0.7 + 0.3 * tn_fbm(v / 260.0, u / 700.0, 3, S + 3u);
    let big = tn_duneProfile(p) * 22.0 * seg;
    let ripple = 0.6 * tn_fbm(u / 18.0, v / 55.0, 3, S + 4u);
    h += wA.w * (big + ripple);
  }
  if (wA.x > 0.001) {
    let drift = 2.2 * tn_fbm(u / 160.0, v / 42.0, 4, S + 11u);
    let sastrugi = 0.55 * tn_fbm(u / 26.0, v / 6.0, 3, S + 12u);
    h += wA.x * (drift + sastrugi);
  }
  if (wB.x > 0.001) {
    let phase = u / 60.0 + 0.6 * tn_fbm(u / 500.0, v / 350.0, 3, S + 21u);
    let p = phase - floor(phase);
    h += wB.x * (tn_duneProfile(p) * 3.2 * (0.6 + 0.4 * tn_fbm(v / 140.0, u / 300.0, 2, S + 22u)) + 0.4 * tn_fbm(x / 30.0, z / 30.0, 3, S + 23u));
  }
  if (wA.y > 0.001) { h += wA.y * 1.1 * tn_fbm(x / 55.0, z / 55.0, 4, S + 31u); }
  if (wA.z > 0.001) { h += wA.z * 0.35 * tn_fbm(x / 9.0, z / 9.0, 3, S + 41u); }
  if (wB.y > 0.001) { h += wB.y * 0.25 * tn_fbm(u / 40.0, v / 12.0, 2, S + 51u); }
  return h;
}

// Twin of alpineHeight in src/terrain/meso.js.
fn tn_alpineHeight(x: f32, z: f32, macroH: f32, wFrost: f32, fRidge: f32, fGully: f32) -> f32 {
  let a = smoothstep(750.0, 1250.0, macroH) * wFrost;
  if (a <= 0.001) { return 0.0; }
  let S = MESO_SEED;
  let wx = x + 60.0 * tn_fbm(x / 400.0, z / 400.0, 2, S + 61u);
  let wz = z + 60.0 * tn_fbm(x / 400.0 + 5.2, z / 400.0, 2, S + 62u);
  var r = 1.0 - abs(tn_fbm(wx / 180.0, wz / 180.0, 3, S + 63u));
  r = r * r * r;
  let g = 1.0 - smoothstep(0.0, 0.22, abs(tn_fbm(wx / 60.0, wz / 60.0, 2, S + 64u)));
  return a * (fRidge * (70.0 * r - 20.0) - fGully * 28.0 * g);
}
`;
