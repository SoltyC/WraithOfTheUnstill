// Phase 0 test heightfield: a few square kilometres of rolling upland around the origin,
// rising into a ring of ridged mountains so the horizon never reads as flat. Replaced by the
// baked continent in Phase 1. Height is a pure function of (x, z) — the capsule controller and
// the mesh builder call the same function.

import { fbm, ridged } from './noise.js';

export const TEST_SEED = 0x5eed;
// Prevailing wind for directional layers (radians, direction the wind blows toward).
const WIND = 0.6;
const WC = Math.cos(WIND), WS = Math.sin(WIND);

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Height in metres at world (x, z). */
export function heightAt(x, z) {
  const r = Math.sqrt(x * x + z * z);
  // Broad rolling forms.
  const broad = fbm(x / 420, z / 420, 4, TEST_SEED) * 26;
  // Directional drifts: stretched across the wind, sheared along it.
  const u = x * WC + z * WS, v = -x * WS + z * WC;
  const drifts = fbm(u / 140 + v / 600, v / 46, 3, TEST_SEED + 31) * 3.2;
  // A ridge line crossing the near field.
  const ridge = ridged(x / 520 + 3.1, z / 520 - 1.7, 4, TEST_SEED + 77) * 34;
  // Mountain ring.
  const ring = smooth(650, 1900, r);
  // Ridged ranges softened by squaring the broad form: fewer needle peaks, more massif.
  const rm = ridged(x / 760, z / 760, 3, TEST_SEED + 191);
  const mountains = ring * (rm * rm * 340 + fbm(x / 900, z / 900, 3, TEST_SEED + 5) * 60 + 60);
  // Keep the start area gentle.
  const near = 0.35 + 0.65 * smooth(40, 260, r);
  return (broad + ridge) * near + drifts + mountains;
}

/** Writes the unit surface normal into out (any {x,y,z}); central differences, eps metres. */
export function normalAt(x, z, out, eps = 0.35) {
  const hx = heightAt(x + eps, z) - heightAt(x - eps, z);
  const hz = heightAt(x, z + eps) - heightAt(x, z - eps);
  const nx = -hx, ny = 2 * eps, nz = -hz;
  const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
  out.x = nx * inv; out.y = ny * inv; out.z = nz * inv;
  return out;
}
