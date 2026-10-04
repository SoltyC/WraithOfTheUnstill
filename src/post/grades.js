// Colour grades for the LUT (BRIEF §5.8, §2.4): one per biome and restoration state, blended by
// the owner. Layout matches shaders/post/lut.wgsl.js (g0 desaturate, warmth, flatten, strength;
// g1 shadow tint; g2 highlight gain). Restrained by design: the world carries the look, the grade
// only leans it. Stilled is cool, flat and drained; restored is full colour with warm light over
// cold blue shadows (BRIEF §5.3, §18).

export const GRADES = {
  neutral: { g0: [0, 0, 0], g1: [1, 1, 1], g2: [1, 1, 1] },
  frostStilled: { g0: [0.5, -0.5, 0.45], g1: [0.95, 0.99, 1.07], g2: [0.98, 0.995, 1.02] },
  frostRestored: { g0: [-0.1, 0.22, -0.12], g1: [0.93, 0.98, 1.09], g2: [1.025, 1.0, 0.965] },
};

/**
 * Blend the frost grade by restoration r (0 stilled … 1 restored) at the given strength into
 * out (Float32Array(16)). Other biomes' grades join here, weighted at the camera, as they land.
 */
export function blendGrade(out, r, strength) {
  const a = GRADES.frostStilled, b = GRADES.frostRestored;
  for (let i = 0; i < 3; i++) {
    out[i] = a.g0[i] + (b.g0[i] - a.g0[i]) * r;
    out[4 + i] = a.g1[i] + (b.g1[i] - a.g1[i]) * r;
    out[8 + i] = a.g2[i] + (b.g2[i] - a.g2[i]) * r;
  }
  out[3] = strength;
}
