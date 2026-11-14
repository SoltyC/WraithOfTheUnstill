// The optics of the meadow's fresh water (realism plan W1), shared by the water surface
// (shaders/water.wgsl.js) and the lakebed under it (shaders/clipmap.wgsl.js), which must agree.
//
// Diffuse attenuation per metre (R, G, B ≈ 650, 550, 450 nm): pure water absorbs red first
// (0.45, 0.064, 0.015 /m, Pope & Fry); a clear upland lake adds a little dissolved organic matter
// (CDOM, a(440) ≈ 0.2 /m, falling off exponentially toward the red: it takes the blue, so the
// water reads green, not the turquoise of a tropical pool) and some particles (~0.04 /m, grey).
export const W_SIGMA = [0.5, 0.14, 0.25];
// What the deep body scatters back up (irradiance reflectance ≈ 0.33 b_b / (a + b_b), b_b ≈ 0.004–
// 0.005 /m): about 1 % in the green, a few tenths of a percent in the red. A lake is dark; its
// look is the reflection.
export const W_BODY = [0.003, 0.012, 0.007];

const f = (v) => v.toFixed(4);
export const vec3 = (v) => `vec3f(${f(v[0])}, ${f(v[1])}, ${f(v[2])})`;

/** Exact unpolarised Fresnel reflectance of an air–water interface (n = 1.333) at cos θ from the
 *  air side: Schlick under-reflects at grazing, where a lake mirrors most of what it shows. */
export const WATER_FRESNEL_WGSL = /* wgsl */ `
fn waterFresnel(cosI: f32) -> f32 {
  let c = clamp(cosI, 0.0, 1.0);
  let s2 = (1.0 - c * c) / (1.333 * 1.333);
  let ct = sqrt(max(1.0 - s2, 0.0));
  let rs = (c - 1.333 * ct) / (c + 1.333 * ct);
  let rp = (ct - 1.333 * c) / (ct + 1.333 * c);
  return 0.5 * (rs * rs + rp * rp);
}
`;
