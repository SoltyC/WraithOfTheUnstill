// The ash the eruption left (systems/volcano.js sets its strength, 0 before the eruption … 1 after): settled over the land
// round the mountain, thickest near it and downwind — west-south-west, over the Sow, where the column leaned — in drifts.
// The terrain (shaders/clipmap.wgsl.js, meadow and ember ground) and the grass (shaders/grass.wgsl.js) read the same cover.
export const ASH_WGSL = /* wgsl */ `
fn ashCover(p: vec2f, strength: f32) -> f32 {
  if (strength <= 0.0) { return 0.0; }
  let rel = p - vec2f(2350.0, -2150.0);
  let down = dot(rel / max(length(rel), 1.0), vec2f(-0.95, 0.31));
  // (A narrow lobe: the Sow, straight downwind, buried; the headland camp, off to the side by the sea, only dusted.)
  let lobe = max(down, 0.0);
  let d = length(rel) / (1.0 + 1.0 * lobe * lobe * lobe * lobe);
  let drift = 0.72 + 0.28 * sin(p.x * 0.013 + 2.0 * sin(p.y * 0.011)) * sin(p.y * 0.017 + p.x * 0.004);
  return clamp((1.0 - smoothstep(700.0, 1700.0, d)) * drift * strength, 0.0, 1.0);
}
/** The ash's colour: a dirty mid-grey, in broad patches of lighter fine ash and darker coarse lapilli. */
fn ashColor(p: vec2f) -> vec3f {
  let k = 0.5 + 0.5 * sin(p.x * 0.031 + 1.7 * sin(p.y * 0.023)) * sin(p.y * 0.029 - p.x * 0.011);
  return mix(vec3f(0.05, 0.048, 0.047), vec3f(0.11, 0.106, 0.1), k);
}
`;
