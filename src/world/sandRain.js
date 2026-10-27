// The wetting of dry sand under rain (D1a), as plain functions: the single source for the curve
// the sand shader (shaders/sand.wgsl.js) injects as WGSL constants, and what tests/sandRain.test.js
// checks. Rain-wetness w (world/weather.js: rises over ~22 s of rain, dries over ~75 s) runs 0..1:
//   w = 0.03..0.3  individual drops: each hashed cell holds one drop with its own arrival
//                  threshold; it lands as a small dark disc with a dimple, then spreads
//   w = 0.3..0.62  discs overlap and wet blotches grow between them
//   w = 0.62..0.95 the whole surface goes uniformly darker, cooler and tighter (a glossy film while it rains)
// Drying (the slow puddle value still above w): crests and stoss slopes lighten first, hollows last.

export const SAND_RAIN = {
  thrMin: 0.02,        // lowest arrival threshold of a drop (first dots)
  thrSpan: 0.36,       // thresholds spread over [thrMin, thrMin + thrSpan] (coarse cells)
  thrFine: 0.12,       // the fine layer's thresholds start later
  growSpan: 0.5,       // a drop reaches its full radius growSpan after its arrival
  r0: 0.005, rVar: 0.007, rGrow: 3.2,  // radius (m): 5..12 mm at arrival, up to x4.2 before the cell cap
  cellCoarse: 0.12, cellFine: 0.05,
  spreadFrom: 0.22, spreadSpan: 0.4,   // blotches between drops
  uniFrom: 0.62, uniTo: 0.95,          // fully wet
  dryHold: 0.5,                        // how much topography skews the wetness while drying
  wetDark: 0.32,                      // pore absorption; stays darker through the meter's +0.75-stop headroom
};

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Radius (m) of a drop with threshold thr and random r4 (0..1) at wetness w; 0 before it lands. */
export function dropRadius(w, thr, r4, scale = 1) {
  if (w <= thr) return 0;
  const S = SAND_RAIN;
  return (S.r0 + S.rVar * r4) * scale * (1 + S.rGrow * sstep(thr + 0.02, thr + S.growSpan, w));
}
/** Share of the surface covered by drops (expected, from the threshold distributions). */
export function dotCover(w) {
  const S = SAND_RAIN; let sum = 0;
  for (const [cell, off, span, sc] of [[S.cellCoarse, S.thrMin, S.thrSpan, 1], [S.cellFine, S.thrFine + S.thrMin, S.thrSpan, 0.6]]) {
    let cov = 0; const K = 64;
    for (let i = 0; i < K; i++) for (let j = 0; j < 4; j++) {
      const thr = off + span * (i + 0.5) / K, r = Math.min(dropRadius(w, thr, (j + 0.5) / 4, sc), 0.3 * cell);
      cov += Math.PI * r * r / (cell * cell);
    }
    sum += cov / (K * 4);
  }
  return Math.min(1, sum);
}
/** The uniform darkening (0 dry .. 1 fully wet) that follows the dots. */
export function uniformWet(w) { return sstep(SAND_RAIN.uniFrom, SAND_RAIN.uniTo, w); }
/** Blotch spread (0..1) between the drops. */
export function spread(w) { return Math.min(1, Math.max(0, (w - SAND_RAIN.spreadFrom) / SAND_RAIN.spreadSpan)); }
/** Local wetness while drying: `hold` 0 (crest) .. 1 (hollow); dryK from puddle - w (the slow value). */
export function localWet(w, puddle, hold) {
  const dryK = sstep(0, 0.2, puddle - w);
  return Math.min(1, Math.max(0, w + dryK * (Math.min(1, Math.max(0, hold)) - 0.5) * SAND_RAIN.dryHold));
}

/** WGSL constants for the shader. */
export const SAND_RAIN_WGSL = `
const SR_THR_MIN: f32 = ${SAND_RAIN.thrMin}; const SR_THR_SPAN: f32 = ${SAND_RAIN.thrSpan}; const SR_THR_FINE: f32 = ${SAND_RAIN.thrFine};
const SR_GROW: f32 = ${SAND_RAIN.growSpan}; const SR_R0: f32 = ${SAND_RAIN.r0}; const SR_RVAR: f32 = ${SAND_RAIN.rVar}; const SR_RGROW: f32 = ${SAND_RAIN.rGrow};
const SR_CELL_C: f32 = ${SAND_RAIN.cellCoarse}; const SR_CELL_F: f32 = ${SAND_RAIN.cellFine};
const SR_SPREAD0: f32 = ${SAND_RAIN.spreadFrom}; const SR_SPREAD_SPAN: f32 = ${SAND_RAIN.spreadSpan};
const SR_UNI0: f32 = ${SAND_RAIN.uniFrom}; const SR_UNI1: f32 = ${SAND_RAIN.uniTo};
const SR_DRY_HOLD: f32 = ${SAND_RAIN.dryHold}; const SR_WET_DARK: f32 = ${SAND_RAIN.wetDark};
`;
