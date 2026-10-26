// Dune types for the Glass Dunes meso layer (Phase 9 D0). Every function takes the wind frame
// (u along the wind, v across it) so crests, slip faces and arms agree with the prevailing wind.
// WGSL twin: src/shaders/duneTypes.wgsl.js — edit both together (tools/capture/parity-check.mjs).
//
// The bake's dune-type map (tools/bake-world/dunemap.mjs) gives a type coordinate t on the axis
//   barchan 0 — transverse 1/3 — star 2/3 — seif 1
// and a "flat" weight (playas, salt pans, ravine floors, the arena). Types are blended on that
// axis; where two types that are not neighbours on it meet, the bake lays a flat belt over the seam.

import { hash2, valueNoise, fbm } from './noise.js';

export const DUNE_SEED = 0x6d65 + 300;

/** Asymmetric dune profile over one period p ∈ [0,1): rises to the crest at 0.72, then a slip face. */
export function duneProfile(p) {
  if (p < 0.72) { const t = p / 0.72; return t * t * (3 - 2 * t) * 0.92 + t * 0.08; }
  const t = (p - 0.72) / 0.28;            // slip face: steep, slightly concave
  return 1 - t * (2 - t);
}

/** Today's layer, kept: transverse ridges ~140 m apart, 22 m high, crests broken into segments. */
export function transverseH(u, v) {
  const S = 0x6d65;
  const phase = u / 140 + 0.9 * fbm(u / 900, v / 600, 3, S + 1) + 0.25 * valueNoise(v / 170, u / 400, S + 2);
  const p = phase - Math.floor(phase);
  const seg = 0.7 + 0.3 * fbm(v / 260, u / 700, 3, S + 3);
  return duneProfile(p) * 22 * seg;
}

/** Barchans: isolated crescents (one per 240 × 200 m cell, most cells), horns trailing downwind. */
export function barchanH(u, v) {
  const S = DUNE_SEED + 10;
  const cu = Math.floor(u / 240), cv = Math.floor(v / 200);
  if (hash2(cu, cv, S) < 0.2) return 0;
  const sc = 0.7 + 0.5 * hash2(cu, cv, S + 1);
  const a = u - (cu + 0.5) * 240 - (hash2(cu, cv, S + 2) - 0.5) * 50;
  const b = v - (cv + 0.5) * 200 - (hash2(cu, cv, S + 3) - 0.5) * 40;
  const L = 70 * sc, B = 65 * sc;
  const e = 1 - (b / B) * (b / B);
  if (e <= 0) return 0;
  const q = a - (0.5 * L / (B * B)) * b * b;     // the crest bows downwind into horns
  const p = (q + L) / L;
  if (p <= 0 || p >= 1) return 0;
  return 11 * sc * Math.sqrt(e) * duneProfile(p);
}

/** Star megadunes, 45–80 m: three arms and a dome per 900 m cell (the union of 2 × 2 cells, so no seams). */
export function starH(u, v) {
  const S = DUNE_SEED + 20, P = 900;
  const i0 = Math.floor(u / P - 0.5), j0 = Math.floor(v / P - 0.5);
  let best = 0;
  for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) {
    const ci = i0 + di, cj = j0 + dj;
    if (hash2(ci, cj, S) < 0.12) continue;
    const sc = 0.8 + 0.35 * hash2(ci, cj, S + 1);
    const a = u - (ci + 0.5) * P - (hash2(ci, cj, S + 2) - 0.5) * 200;
    const b = v - (cj + 0.5) * P - (hash2(ci, cj, S + 3) - 0.5) * 200;
    const R = 330 * sc;
    const r2 = a * a + b * b;
    if (r2 >= R * R) continue;
    // Arm directions: one from a hash, the other two 120° either side (no trigonometry).
    let dx = hash2(ci, cj, S + 4) - 0.5 + 0.01, dy = hash2(ci, cj, S + 5) - 0.5;
    const il = 1 / Math.sqrt(dx * dx + dy * dy);
    dx *= il; dy *= il;
    const H = 45 + 35 * hash2(ci, cj, S + 6), wid = 105 * sc;
    let m = 1 - Math.sqrt(r2) / (0.5 * R);
    m = m > 0 ? m : 0;                                 // the dome
    for (let k = 0; k < 3; k++) {
      const along = a * dx + b * dy, lat = -a * dy + b * dx;
      if (along > 0) {
        const al = 1 - along / R, tl = 1 - Math.abs(lat) / (wid * (1 - 0.55 * along / R));
        if (al > 0 && tl > 0 && al * tl > m) m = al * tl;
      }
      const nx = -0.5 * dx - 0.8660254 * dy;
      dy = 0.8660254 * dx - 0.5 * dy; dx = nx;
    }
    if (H * m > best) best = H * m;
  }
  return best;
}

/** Seif (linear) dunes: sinuous knife-edged ridges parallel to the wind, ~115 m apart, up to 13 m. */
export function seifH(u, v) {
  const S = DUNE_SEED + 40;
  const phase = v / 115 + 0.55 * fbm(u / 700, v / 300, 3, S);
  const p = phase - Math.floor(phase);
  const tri = 1 - Math.abs(2 * p - 1);
  const amp = 13 * (0.65 + 0.35 * fbm(u / 500, v / 250, 2, S + 1));
  return amp * (0.5 * tri * tri * (3 - 2 * tri) + 0.5 * tri);
}
