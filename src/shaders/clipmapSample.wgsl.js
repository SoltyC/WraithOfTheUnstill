// Bilinear height from existing computed clipmap levels; bindings are named levels and cp.
import { CLIPMAP_N, CLIPMAP_LEVELS } from '../terrain/clipmapLayout.js';
const V=CLIPMAP_N+1;
export const CLIPMAP_SAMPLE_WGSL = /* wgsl */ `
fn baseHeight(p: vec2f) -> f32 {
  for (var l = 0u; l < ${CLIPMAP_LEVELS}u; l++) {
    let s = cp[l].z;
    if (s <= 0.0) { continue; }
    let uv = (p - cp[l].xy) / s + vec2f(${CLIPMAP_N / 2}.0);
    if (any(uv < vec2f(0.0)) || any(uv >= vec2f(${CLIPMAP_N}.0))) { continue; }
    let cell = vec2u(floor(uv)); let f = fract(uv);
    let k = (l * ${V}u + cell.y) * ${V}u + cell.x;
    return mix(mix(levels[k].x, levels[k + 1u].x, f.x), mix(levels[k + ${V}u].x, levels[k + ${V + 1}u].x, f.x), f.y);
  }
  return 0.0;
}
`;
