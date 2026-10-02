// Deterministic 2D gradient noise for the bake (not the runtime meso layers, which use
// src/terrain/noise.js so JS and WGSL can share them). Gradient noise avoids the blocky lattice
// look value noise shows at macro scales. Only exact IEEE ops: the 16 unit gradients are built
// from sqrt, never sin/cos.

import { hashU32 } from '../../src/terrain/noise.js';

const GX = new Float64Array(16), GZ = new Float64Array(16);
{
  // 16 directions: axis, diagonal, and (2,1)-family vectors, normalised with sqrt.
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1], [2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2], [1, -2], [2, -1]];
  for (let i = 0; i < 16; i++) { const l = Math.sqrt(dirs[i][0] * dirs[i][0] + dirs[i][1] * dirs[i][1]); GX[i] = dirs[i][0] / l; GZ[i] = dirs[i][1] / l; }
}

function grad(ix, iz, seed) {
  return hashU32(Math.imul(ix, 0x27d4eb2d) ^ hashU32(Math.imul(iz, 0x165667b1) ^ seed)) & 15;
}

/** Gradient noise in ≈[-1, 1] with derivatives: writes [v, dv/dx, dv/dz] to out. */
export function gnoiseD(x, z, seed, out) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const dux = 30 * fx * fx * (fx * (fx - 2) + 1), duz = 30 * fz * fz * (fz * (fz - 2) + 1);
  const g00 = grad(ix, iz, seed), g10 = grad(ix + 1, iz, seed), g01 = grad(ix, iz + 1, seed), g11 = grad(ix + 1, iz + 1, seed);
  const va = GX[g00] * fx + GZ[g00] * fz;
  const vb = GX[g10] * (fx - 1) + GZ[g10] * fz;
  const vc = GX[g01] * fx + GZ[g01] * (fz - 1);
  const vd = GX[g11] * (fx - 1) + GZ[g11] * (fz - 1);
  const k1 = vb - va, k2 = vc - va, k4 = va - vb - vc + vd;
  // Gradient of the bilinear blend of the four ramps.
  const gx = GX[g00] + ux * (GX[g10] - GX[g00]) + uz * (GX[g01] - GX[g00]) + ux * uz * (GX[g00] - GX[g10] - GX[g01] + GX[g11]);
  const gz = GZ[g00] + ux * (GZ[g10] - GZ[g00]) + uz * (GZ[g01] - GZ[g00]) + ux * uz * (GZ[g00] - GZ[g10] - GZ[g01] + GZ[g11]);
  out[0] = (va + k1 * ux + k2 * uz + k4 * ux * uz) * 1.6;
  out[1] = (gx + dux * (k1 + k4 * uz)) * 1.6;
  out[2] = (gz + duz * (k2 + k4 * ux)) * 1.6;
}

const t = new Float64Array(3);
export function gnoise(x, z, seed) { gnoiseD(x, z, seed, t); return t[0]; }

/** Rotated fractal sum in ≈[-1, 1]. */
export function gfbm(x, z, octaves, seed, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * gnoise(x, z, seed + i * 977);
    norm += amp;
    const rx = 0.8 * x - 0.6 * z, rz = 0.6 * x + 0.8 * z;
    x = rx * 2.01; z = rz * 2.01;
    amp *= gain;
  }
  return sum / norm;
}

/** Ridged fractal in [0, 1] with sharp crests. */
export function gridged(x, z, octaves, seed) {
  let sum = 0, amp = 0.5, norm = 0, weight = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(gnoise(x, z, seed + i * 613));
    n = n * n * weight;
    weight = n * 1.8 < 1 ? n * 1.8 : 1;
    sum += n * amp; norm += amp;
    const rx = 0.8 * x - 0.6 * z, rz = 0.6 * x + 0.8 * z;
    x = rx * 2.07; z = rz * 2.07;
    amp *= 0.5;
  }
  return sum / norm;
}

/** Gradient-damped ("eroded") fractal in ≈[-1, 1]: sharp crests, smoothed flanks and gullies. */
export function geroded(x, z, octaves, seed, sharpness = 1) {
  let sum = 0, amp = 0.5, dx = 0, dz = 0, norm = 0, scale = 1;
  for (let i = 0; i < octaves; i++) {
    gnoiseD(x, z, seed + i * 131, t);
    dx += t[1] * scale; dz += t[2] * scale;
    sum += (amp * t[0]) / (1 + sharpness * (dx * dx + dz * dz));
    norm += amp;
    const rx = 0.8 * x - 0.6 * z, rz = 0.6 * x + 0.8 * z;
    x = rx * 2.03; z = rz * 2.03;
    amp *= 0.5;
    scale *= 0.5 * 2.03;
  }
  return sum / norm;
}
