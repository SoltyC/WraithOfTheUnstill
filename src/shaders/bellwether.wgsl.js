// The Bellwether's hide: the Frost Warden's smooth-mass chunk shader (chunks blend into one body
// through the neighbour table) with the glacier material swapped for the meadow's: turf (grass up
// top, soil on the flanks), lichen-grey Shaper stone with moss on its upper faces, dark root, and
// amber pods (the eyes, the valve cores) that glow with the record's glow. Built from the Warden's
// source so the geometry pass stays identical.

import { wardenVertexWGSL, wardenFragmentWGSL } from './warden.wgsl.js';

const MATERIAL = /* wgsl */ `
  {
    let Ns = normalize(fragmentInputs.vNormal);
    let up = clamp(Ns.y, 0.0, 1.0);
    let sd = fragmentInputs.vSeed;
    let n1 = vnoise3(wp * 0.3 + sd * 0.1);
    let n2 = vnoise3(wp * 1.7 + sd);
    let n3 = vnoise3(wp * 5.0);
    var albedo = vec3f(0.35);
    var trans = 0.0;
    if (kind == 5) {
      // Turf: grass where it faces up, soil on the flanks, tussocks in the grain.
      let grass = vec3f(0.17, 0.30, 0.08) * (0.75 + 0.4 * n2) * (0.9 + 0.2 * n3);
      let soil = vec3f(0.17, 0.11, 0.065) * (0.8 + 0.3 * n1);
      albedo = mix(soil, grass, smoothstep(0.2, 0.55, Ns.y + 0.25 * (n1 - 0.5)));
      trans = 0.12 * up;
    } else if (kind == 6) {
      // Shaper stone: lichen-grey slabs, pale lichen blotches, moss gathering on the upper faces.
      let stone = vec3f(0.40, 0.40, 0.38) * (0.82 + 0.3 * n2);
      let lich = smoothstep(0.45, 0.7, vnoise3(wp * 0.45 + sd) + 0.2 * up);
      let moss = smoothstep(0.42, 0.7, n1 + 0.35 * up);
      albedo = mix(stone, vec3f(0.52, 0.55, 0.30), lich * 0.55);
      albedo = mix(albedo, vec3f(0.15, 0.27, 0.08) * (0.8 + 0.4 * n3), moss * 0.75 * smoothstep(0.1, 0.5, up));
    } else if (kind == 8) {
      albedo = vec3f(0.45, 0.25, 0.09);
      trans = 0.3;
    } else {
      // Root: thick, dark, ropy.
      albedo = vec3f(0.10, 0.07, 0.045) * (0.7 + 0.6 * n2);
    }
    let diff = clamp((nl + 0.25) / 1.25, 0.0, 1.0);
    col = albedo * (key * (diff * vis + trans * pow(1.0 - nv, 2.0)) / PI + sky * occ);
    let gl = fragmentInputs.vGlow;
    if (gl > 0.001 && kind == 8) { col += vec3f(1.0, 0.62, 0.22) * gl * 0.9 / max(exposure, 1e-6); }
  }
`;

const a = wardenFragmentWGSL.indexOf('  if (kind == 3 && !frozen) {');
const b = wardenFragmentWGSL.indexOf('  // Hurt flash');
if (a < 0 || b < a) throw new Error('bellwether.wgsl: the Warden fragment shader changed shape');

export const bellwetherFragmentWGSL = wardenFragmentWGSL.slice(0, a) + MATERIAL + wardenFragmentWGSL.slice(b);
// 600 chunk slots use the neighbour blend; fewer cleaving planes than the glacier (earth, not ice blocks).
export const bellwetherVertexWGSL = wardenVertexWGSL.replace('const WARDEN_CHUNKS = 380u;', 'const WARDEN_CHUNKS = 600u;').replace('for (var i = 0; i < 7; i++)', 'for (var i = 0; i < 4; i++)');
