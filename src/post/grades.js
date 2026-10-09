// Colour grades for the LUT (BRIEF §5.8, §2.4): one per biome and restoration state, blended by
// the owner. Layout matches shaders/post/lut.wgsl.js (g0 desaturate, warmth, flatten, strength;
// g1 shadow tint; g2 highlight gain). Restrained by design: the world carries the look, the grade
// only leans it. Stilled is cool, flat and drained; restored is full colour with warm light over
// cold blue shadows (BRIEF §5.3, §18).

export const GRADES = {
  neutral: { g0: [0, 0, 0], g1: [1, 1, 1], g2: [1, 1, 1] },
  frostStilled: { g0: [0.68, -0.35, -0.1], g1: [0.97, 0.99, 1.04], g2: [0.98, 0.995, 1.02] },
  frostRestored: { g0: [-0.1, 0.22, -0.12], g1: [0.93, 0.98, 1.09], g2: [1.025, 1.0, 0.965] },
  // The meadow stilled: the green drained toward hay and slate, the air flat and close; restored:
  // full green and gold, warm light, cool shadow (reference: screenshots/reference/).
  meadowStilled: { g0: [0.45, -0.1, 0.0], g1: [0.97, 0.99, 1.03], g2: [1.0, 0.99, 0.97] },
  meadowRestored: { g0: [0.02, 0.3, -0.08], g1: [0.92, 0.97, 1.06], g2: [1.04, 1.01, 0.94] },
};

/**
 * Blend the frost and meadow grades (meadow = its weight at the camera; r and rMeadow each biome's
 * restoration, 0 stilled … 1 restored) at the given strength into
 * out (Float32Array(16)). Other biomes' grades join here, weighted at the camera, as they land.
 */
export function blendGrade(out, r, strength, meadow = 0, rMeadow = r) {
  const a = GRADES.frostStilled, b = GRADES.frostRestored, c = GRADES.meadowStilled, d = GRADES.meadowRestored;
  for (let i = 0; i < 3; i++) {
    const f0 = a.g0[i] + (b.g0[i] - a.g0[i]) * r, m0 = c.g0[i] + (d.g0[i] - c.g0[i]) * rMeadow;
    const f1 = a.g1[i] + (b.g1[i] - a.g1[i]) * r, m1 = c.g1[i] + (d.g1[i] - c.g1[i]) * rMeadow;
    const f2 = a.g2[i] + (b.g2[i] - a.g2[i]) * r, m2 = c.g2[i] + (d.g2[i] - c.g2[i]) * rMeadow;
    out[i] = f0 + (m0 - f0) * meadow; out[4 + i] = f1 + (m1 - f1) * meadow; out[8 + i] = f2 + (m2 - f2) * meadow;
  }
  out[3] = strength;
}
