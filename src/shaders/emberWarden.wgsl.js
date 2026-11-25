// The Ember Warden's crust (game/emberWarden/titan.js; docs/phase-11/ember-warden.md): the Frost Warden's smooth-mass
// chunk geometry (chunks blend into one body through the neighbour table), with the glacier swapped for basalt — dark,
// rough plates dusted with ash on what faces up, cracked across, the cracks glowing with the record's heat (glow 0..1:
// dark red, orange, then white-hot, the cracks widening and the whole plate incandescent at the top). Seams are molten
// rock; the heart a churning core. Obsidian (glow 2: bound by Frost; and the shackles on the rock) is black glass with
// the sky in it. A struck plate flashes hot (kind's fraction). Built from the Warden's source so the geometry stays.

import { wardenVertexWGSL, wardenFragmentWGSL } from './warden.wgsl.js';

const MATERIAL = /* wgsl */ `
  {
    let Ns = normalize(fragmentInputs.vNormal);
    let up = clamp(Ns.y, 0.0, 1.0);
    let sd = fragmentInputs.vSeed;
    let lp = fragmentInputs.vLocal;
    let gl = fragmentInputs.vGlow;
    let heat = clamp(gl, 0.0, 1.0);
    let obs = gl > 1.5;
    let n1 = vnoise3(wp * 0.22 + sd * 0.1);
    let n2 = vnoise3(wp * 1.3 + sd);
    let n3 = vnoise3(wp * 4.1);
    let ex = max(exposure, 1e-6);
    // The heat's colour: dark red, orange, yellow-white.
    let hc = mix(mix(vec3f(0.55, 0.06, 0.01), vec3f(1.0, 0.34, 0.05), smoothstep(0.2, 0.6, heat)), vec3f(1.0, 0.82, 0.55), smoothstep(0.7, 1.0, heat));
    // Cracks: a ridged network over the plate (in its own frame: they ride with it), wider when hotter.
    let cn = abs(vnoise3(lp * 2.2 + vec3f(sd)) - 0.5) + 0.35 * abs(vnoise3(lp * 5.3 + vec3f(sd * 1.7)) - 0.5);
    let crack = 1.0 - smoothstep(0.0, 0.03 + 0.06 * heat, cn);
    if (obs) {
      // Obsidian: black glass, a hard highlight and the sky in it; the last of the heat a faint red deep in the cracks.
      let F = 0.04 + 0.96 * pow(1.0 - nv, 5.0);
      let R = reflect(-V, normalize(N + vec3f(n3 - 0.5) * 0.05));
      let refl = atmoSky(normalize(vec3f(R.x, max(R.y, 0.02), R.z)));
      let base = vec3f(0.018, 0.016, 0.02) * (key * max(nl, 0.0) * vis / PI + sky * occ);
      col = base * (1.0 - F) + refl * (0.25 + 0.75 * F);
      col += key * pow(max(dot(N, H), 0.0), 180.0) * 2.5 * vis;
      col += vec3f(0.5, 0.06, 0.01) * crack * 0.05 / ex;
    } else if (kind == 19 || kind == 20) {
      // Molten: the seams and the heart — churning, lit from within.
      let churn = vnoise3(wp * 0.6 + vec3f(0.0, sd, 0.0)) * 0.6 + vnoise3(wp * 1.9 - vec3f(sd)) * 0.4;
      let k = select(0.25 + 0.75 * heat, 0.6 + 1.4 * heat, kind == 20);
      let mc = mix(vec3f(0.9, 0.18, 0.02), vec3f(1.0, 0.6, 0.18), churn);
      col = vec3f(0.06, 0.02, 0.01) * sky * occ + mc * k * (0.5 + 0.5 * churn) * 0.55 / ex;
    } else {
      // Basalt crust: near-black, rough, vesicular; ash on what faces up; the cracks between plates glowing.
      var albedo = vec3f(0.07, 0.062, 0.058) * (0.75 + 0.5 * n2) * (0.85 + 0.3 * n3);
      let ash = smoothstep(0.25, 0.65, Ns.y + 0.3 * (n1 - 0.5)) * (1.0 - smoothstep(0.35, 0.8, heat));
      albedo = mix(albedo, vec3f(0.24, 0.23, 0.22) * (0.8 + 0.3 * n3), ash * 0.4);
      // Heat darkens it to a scorched glaze before it glows.
      albedo = albedo * (1.0 - 0.35 * heat);
      let diff = clamp((nl + 0.15) / 1.15, 0.0, 1.0);
      col = albedo * (key * diff * vis / PI + sky * occ);
      col += key * pow(max(dot(N, H), 0.0), 16.0) * 0.03 * vis;
      // Glow: the cracks first; then, white-hot, the whole plate's skin.
      let edge = smoothstep(0.55, 0.95, length(lp));
      let g = crack * (0.25 + 0.75 * heat) + heat * heat * (0.15 + 0.35 * edge);
      col += hc * g * (0.08 + 0.9 * heat * heat) * 0.6 / ex;
    }
    // Struck: the plate flares hot for an instant.
    if (hurt > 0.001) { col += vec3f(1.0, 0.55, 0.2) * hurt * (0.2 + 0.8 * crack) * 0.4 / ex; }
  }
`;

const a = wardenFragmentWGSL.indexOf('  if (kind == 3 && !frozen) {');
const b = wardenFragmentWGSL.indexOf('  col = atmoApply(');
if (a < 0 || b < a) throw new Error('emberWarden.wgsl: the Warden fragment shader changed shape');

export const emberWardenFragmentWGSL = wardenFragmentWGSL.slice(0, a) + MATERIAL + wardenFragmentWGSL.slice(b);
export const emberWardenVertexWGSL = wardenVertexWGSL.replace('const WARDEN_CHUNKS = 380u;', 'const WARDEN_CHUNKS = 460u;').replace('for (var i = 0; i < 7; i++)', 'for (var i = 0; i < 5; i++)');
if (emberWardenVertexWGSL === wardenVertexWGSL) throw new Error('emberWarden.wgsl: the Warden vertex shader changed shape');
