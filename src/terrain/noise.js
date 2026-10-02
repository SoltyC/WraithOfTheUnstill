// Deterministic 2D value noise built only from 32-bit integer ops and float math that is exact
// in both JS and WGSL (Math.imul ≙ u32 multiply). Phase 1 ports these functions verbatim to WGSL
// for CPU/GPU height parity (BRIEF §4.2); keep them free of platform-dependent transcendentals.

/** 32-bit integer hash (lowbias32). @returns uint32 */
export function hashU32(x) {
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x;
}

/** Hash of an integer lattice point and seed → [0, 1). */
export function hash2(ix, iz, seed) {
  const h = hashU32(Math.imul(ix, 0x27d4eb2d) ^ hashU32(Math.imul(iz, 0x165667b1) ^ seed));
  return h / 4294967296;
}

/** Quintic-faded value noise in [-1, 1]. */
export function valueNoise(x, z, seed) {
  const fx = Math.floor(x), fz = Math.floor(z);
  const tx = x - fx, tz = z - fz;
  const ux = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
  const uz = tz * tz * tz * (tz * (tz * 6 - 15) + 10);
  const a = hash2(fx, fz, seed), b = hash2(fx + 1, fz, seed);
  const c = hash2(fx, fz + 1, seed), d = hash2(fx + 1, fz + 1, seed);
  const ab = a + (b - a) * ux;
  const cd = c + (d - c) * ux;
  return (ab + (cd - ab) * uz) * 2 - 1;
}

/** Fractal sum with per-octave rotation to break lattice alignment. Range ≈ [-1, 1]. */
export function fbm(x, z, octaves, seed, lacunarity = 2.03, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0;
  // Rotation by ~36.87° (3-4-5 triangle: exact in floats).
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x, z, seed + i * 1013);
    norm += amp;
    const rx = 0.8 * x - 0.6 * z, rz = 0.6 * x + 0.8 * z;
    x = rx * lacunarity; z = rz * lacunarity;
    amp *= gain;
  }
  return sum / norm;
}

/** Ridged fractal in [0, 1]: sharp crests where noise crosses zero. */
export function ridged(x, z, octaves, seed) {
  let sum = 0, amp = 0.5, norm = 0, weight = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(valueNoise(x, z, seed + i * 7919));
    n *= n * weight;
    weight = Math.min(1, n * 1.6);
    sum += n * amp;
    norm += amp;
    const rx = 0.8 * x - 0.6 * z, rz = 0.6 * x + 0.8 * z;
    x = rx * 2.1; z = rz * 2.1;
    amp *= 0.5;
  }
  return sum / norm;
}
