// Meso height layers per biome (BRIEF §4.2): directional detail measured in metres to tens of
// metres, added on top of the baked macro height. This file and src/shaders/meso.wgsl.js define
// the SAME function — edit both together; tools/capture/parity-check.mjs compares them on the GPU.
//
// Inputs: world (x, z), biome weights w[0..5] (frost, meadow, mire, dunes, ember, coast) and the
// prevailing wind direction (unit, the direction the wind blows toward).
//
// Layers (each built in the wind frame: u along the wind, v across it):
//   dunes  — transverse dunes ~140 m apart, gentle stoss slope, steep lee slip face, crests
//            broken into barchan-like segments; plus metre-scale secondary ripples
//   frost  — wind drifts (tens of metres) and sastrugi ridges (metres), both stretched downwind
//   ember  — smaller ash dunes ~60 m apart
//   meadow — soft hummocks;  mire — tussocks;  coast — near-flat with faint swash bars
//
// Allocation-free: plain numbers in and out (callers write the result into a field).

import { valueNoise, fbm } from './noise.js';

export const MESO_SEED = 0x6d65;

/** Asymmetric dune profile over one period p ∈ [0,1): rises to the crest at 0.72, then a slip face. */
function duneProfile(p) {
  if (p < 0.72) { const t = p / 0.72; return t * t * (3 - 2 * t) * 0.92 + t * 0.08; }
  const t = (p - 0.72) / 0.28;            // slip face: steep, slightly concave
  return 1 - t * (2 - t);
}

/**
 * Meso height (m) at (x, z).
 * @param {number} x @param {number} z
 * @param {number} wFrost @param {number} wMeadow @param {number} wMire
 * @param {number} wDunes @param {number} wEmber @param {number} wCoast
 * @param {number} windX @param {number} windZ  unit vector
 */
export function mesoHeight(x, z, wFrost, wMeadow, wMire, wDunes, wEmber, wCoast, windX, windZ) {
  const u = x * windX + z * windZ;        // along wind
  const v = -x * windZ + z * windX;       // across wind
  let h = 0;
  const S = MESO_SEED;

  if (wDunes > 0.001) {
    // Crest lines wander with low-frequency noise; amplitude breaks into segments along v.
    const phase = u / 140 + 0.9 * fbm(u / 900, v / 600, 3, S + 1) + 0.25 * valueNoise(v / 170, u / 400, S + 2);
    const p = phase - Math.floor(phase);
    const seg = 0.7 + 0.3 * fbm(v / 260, u / 700, 3, S + 3);
    const big = duneProfile(p) * 22 * seg;
    const ripple = 0.6 * fbm(u / 18, v / 55, 3, S + 4);
    h += wDunes * (big + ripple);
  }
  if (wFrost > 0.001) {
    const drift = 2.2 * fbm(u / 160, v / 42, 4, S + 11);
    const sastrugi = 0.55 * fbm(u / 26, v / 6, 3, S + 12);
    h += wFrost * (drift + sastrugi);
  }
  if (wEmber > 0.001) {
    const phase = u / 60 + 0.6 * fbm(u / 500, v / 350, 3, S + 21);
    const p = phase - Math.floor(phase);
    h += wEmber * (duneProfile(p) * 3.2 * (0.6 + 0.4 * fbm(v / 140, u / 300, 2, S + 22)) + 0.4 * fbm(x / 30, z / 30, 3, S + 23));
  }
  if (wMeadow > 0.001) h += wMeadow * 1.1 * fbm(x / 55, z / 55, 4, S + 31);
  if (wMire > 0.001) h += wMire * 0.35 * fbm(x / 9, z / 9, 3, S + 41);
  if (wCoast > 0.001) h += wCoast * 0.25 * fbm(u / 40, v / 12, 2, S + 51);
  return h;
}

const smooth01 = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

/**
 * Alpine relief (Phase 2 look-dev): sharp warped ridge crests and carved gullies on high frost
 * terrain, so mountains read as rock-cut, not rounded. Weighted by the macro height (none below
 * ~750 m) and the frost weight. fRidge/fGully are LOD fades (1 on the CPU; the clipmap fades
 * them out on grids too coarse to carry them). Shared with WGSL (tn_alpineHeight) — edit both.
 */
export function alpineHeight(x, z, macroH, wFrost, fRidge, fGully) {
  const a = smooth01(750, 1250, macroH) * wFrost;
  if (a <= 0.001) return 0;
  const S = MESO_SEED;
  const wx = x + 60 * fbm(x / 400, z / 400, 2, S + 61);
  const wz = z + 60 * fbm(x / 400 + 5.2, z / 400, 2, S + 62);
  let r = 1 - Math.abs(fbm(wx / 180, wz / 180, 3, S + 63));
  r = r * r * r;
  const g = 1 - smooth01(0, 0.22, Math.abs(fbm(wx / 60, wz / 60, 2, S + 64)));
  return a * (fRidge * (70 * r - 20) - fGully * 28 * g);
}
