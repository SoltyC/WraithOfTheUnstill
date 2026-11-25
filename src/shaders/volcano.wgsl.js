// The volcano's cone (centre 2350, -2150; tools/bake-world/geography.mjs; systems/volcano.js): three scans
// (data/materials/sources.json) over the clay ember ground, so the mountain reads as a volcano near and far:
//   ash-ground   charred soil, ash and cinders — the lower flanks, where it is gentle enough to hold
//   obsidian     black glassy rock — steep faces, the upper cone and the crater rim; pushed glossier than the scan
//   lava-crust   black crust with molten seams — the flows near the crater and the crater floor; the seams glow
// The flows are radial streaks (the same field the clay view darkened by), so from kilometres off the cone shows dark
// ribs of rock on grey ash. The scans keep their detail but take the art-directed bases (matRetint), and each is sampled
// at a near and a far scale (mdLayer, shaders/meadow.wgsl.js), height-blended where they meet.
// Uses matDpx/matDpy from the top of the clipmap fragment (this branch is non-uniform).

import { SOW_FARMS } from '../world/sow.js';

export const VOLCANO = { x: 2350, z: -2150 };

/** The Sow's valley (world/sow.js): how fertile the ember ground is here, 0..1 — green round the six farms, fading out over
 *  ~200 m into the dry ash plain. Shared by the terrain (emberSurface) and the grass (shaders/grass.wgsl.js). */
export const SOW_WGSL = /* wgsl */ `
fn sowFertile(p: vec2f) -> f32 {
  var d = 1e9;
${SOW_FARMS.map((f) => `  d = min(d, length(p - vec2f(${f.at[0].toFixed(1)}, ${f.at[1].toFixed(1)})));`).join('\n')}
  return 1.0 - smoothstep(90.0, 230.0, d);
}
/** A farm's yard (trodden earth, no grass): within the dry-stone wall round house and byre. */
fn sowYard(p: vec2f) -> f32 {
  var d = 1e9;
${SOW_FARMS.map((f) => { const c = [f.at[0] + Math.cos(f.facing) * 4.5, f.at[1] - Math.sin(f.facing) * 4.5]; return `  d = min(d, length(p - vec2f(${c[0].toFixed(1)}, ${c[1].toFixed(1)})));`; }).join('\n')}
  return 1.0 - smoothstep(9.0, 14.0, d);
}
`;

export const VOLCANO_WGSL = /* wgsl */ `
${SOW_WGSL}
struct VolcSurf { albedo: vec3f, N: vec3f, rough: f32, ao: f32, glow: f32 };

/** The cone's weight here (0 off it): by distance from the crater and by the ember biome's share. */
fn volcanoCone(wp: vec3f, emberShare: f32) -> f32 {
  let d = length(wp.xz - vec2f(${VOLCANO.x}.0, ${VOLCANO.z}.0));
  return (1.0 - smoothstep(500.0, 1500.0, d)) * smoothstep(0.3, 0.7, emberShare);
}

fn volcanoSurface(wp: vec3f, Ng: vec3f, Nc: vec3f, fp: f32) -> VolcSurf {
  var o: VolcSurf;
  let p = wp.xz;
  let rel = p - vec2f(${VOLCANO.x}.0, ${VOLCANO.z}.0);
  let d = length(rel);
  let ang = atan2(rel.y, rel.x);
  // (The steepness from the true normal as well as the coarse one: the pit's walls are steep at any scale.)
  let slope = max(1.0 - Nc.y, 1.0 - Ng.y);
  // Radial flows, wandering as they come down; strongest near the top.
  let flow = smoothstep(0.35, 0.9, sin(ang * 23.0 + 3.0 * sin(ang * 5.0 + d * 0.004) + 0.6 * noised(p * 0.006).x) * 0.5 + 0.5);
  let upper = 1.0 - smoothstep(250.0, 900.0, d);
  let n1 = noised(p * 0.021 + 5.0).x; let n2 = noised(p * 0.11 + 9.0).x;
  // Weights: ash where it can lie, glassy rock on the steeps, in the flows and up top, crust in the young flows and the crater.
  var wAsh = 1.0;
  var wObs = max(smoothstep(0.3, 0.55, slope), max(flow * mix(0.35, 1.0, upper), upper * 0.6)) + 0.15 * n1;
  var wLav = flow * (1.0 - smoothstep(180.0, 520.0, d)) + (1.0 - smoothstep(110.0, 190.0, d)) * 0.9 + 0.1 * n2;
  // (Not on the pit's walls: the crust lies on the flats; a face is glassy rock, projected without stretch.)
  wLav *= 1.0 - smoothstep(0.3, 0.5, slope);
  wObs = clamp(wObs, 0.0, 1.0); wLav = clamp(wLav, 0.0, 1.0);
  wAsh = clamp(1.0 - wObs * 0.9 - wLav * 0.6, 0.0, 1.0);
  var ash: MatS; var obs: MatS; var lav: MatS;
  ash.albedo = vec3f(0.0); ash.N = Ng; ash.rough = 1.0; ash.ao = 1.0; ash.h = 0.5;
  obs = ash; lav = ash;
  if (wAsh > 0.03) { ash = mdLayer(MAT_ASH_GROUND, p, 0.33, Ng, fp, vec3f(0.105, 0.098, 0.092), 0.55); } else { wAsh = 0.0; }
  if (wObs > 0.03) {
    // World-projected on the steeps (no stretch down a face), top-down elsewhere.
    if (slope > 0.3 && d < 162.0) {
      // The pit's walls (world/crater.js): old flows laid one on another, cut through — dark strata.
      // (Two scales of the strata, shifted, blended by a slow noise: no one tile repeats down the face.)
      let k = 0.055; let k2 = 0.13;
      let sa = matBiplanarG(MAT_ROCK_STRATA, wp * k, Ng, 1.0, matDpx * k, matDpy * k);
      let sb = matBiplanarG(MAT_OBSIDIAN, wp * k2 + vec3f(7.0, 3.0, 11.0), Ng, 1.0, matDpx * k2, matDpy * k2);
      let m = smoothstep(-0.25, 0.35, noised(wp.xz * 0.03 + vec2f(wp.y * 0.02, 0.0)).x);
      obs = sa;
      obs.albedo = mix(matRetint(sa, MAT_ROCK_STRATA, vec3f(0.055, 0.05, 0.048), 0.6), matRetint(sb, MAT_OBSIDIAN, vec3f(0.035, 0.033, 0.036), 0.7), m * 0.6);
      obs.N = normalize(mix(sa.N, sb.N, m * 0.6));
      obs.rough = mix(sa.rough, sb.rough, m * 0.6);
    } else if (slope > 0.3) {
      let k = 0.22;
      obs = matBiplanarG(MAT_OBSIDIAN, wp * k, Ng, 1.0, matDpx * k, matDpy * k);
      obs.albedo = matRetint(obs, MAT_OBSIDIAN, vec3f(0.032, 0.031, 0.036), 0.7);
    } else {
      obs = mdLayer(MAT_OBSIDIAN, p + vec2f(13.0, -7.0), 0.22, Ng, fp, vec3f(0.032, 0.031, 0.036), 0.7);
    }
  } else { wObs = 0.0; }
  var glowRaw = 0.0;
  if (wLav > 0.03) {
    lav = mdLayer(MAT_LAVA_CRUST, p + vec2f(-21.0, 4.0), 0.16, Ng, fp, vec3f(0.05, 0.043, 0.04), 0.15);
    // The molten seams (the scan's emission, in the height map's blue) at the near scale, faded out where unresolved.
    let k = 0.16;
    glowRaw = textureSampleGrad(matHgt, matHgtSampler, (p + vec2f(-21.0, 4.0)) * k, MAT_LAVA_CRUST, vec2f(matDpx.x, matDpx.z) * k, vec2f(matDpy.x, matDpy.z) * k).z;
  } else { wLav = 0.0; }
  // Height-blend: the higher texel wins where the layers meet.
  var w = vec3f(wAsh * (0.4 + ash.h), wObs * (0.6 + obs.h), wLav * (0.5 + lav.h));
  w = pow(w, vec3f(3.0)) + vec3f(1e-5);
  w = w / (w.x + w.y + w.z);
  o.albedo = ash.albedo * w.x + obs.albedo * w.y + lav.albedo * w.z;
  o.N = normalize(ash.N * w.x + obs.N * w.y + lav.N * w.z);
  // The glass: far glossier than the scan's rock — up close; far off the facets average out to a rough grey.
  o.rough = mix(ash.rough * w.x + min(obs.rough, 0.32) * w.y + lav.rough * w.z, 0.9, smoothstep(0.04, 0.6, fp));
  o.ao = ash.ao * w.x + obs.ao * w.y + lav.ao * w.z;
  // The seams: dark while the mountain is stilled (lava is generated — shaders/lava.wgsl.js — and the ground lit by it);
  // restored (the Ember Warden in the vent), they breathe — the terrain's emberWaste uniform scales this, near the crater.
  // (Only the thin seams, on flat crust — a face would stretch them into streaks — and near the crater.)
  o.glow = smoothstep(0.55, 0.9, glowRaw) * w.z * smoothstep(0.85, 0.95, Ng.y) * (1.0 - smoothstep(140.0, 520.0, d));
  return o;
}

/** The ember biome's ground off the cone (user, 2026-11-22: "keep it normal"): dark volcanic soil under dry grass, ash where
 *  the cone's falls reach, rock on the steeps — and round the Sow's farms, the greenest ground in the Waste: turf and soil. */
fn emberSurface(wp: vec3f, Ng: vec3f, Nc: vec3f, fp: f32) -> VolcSurf {
  var o: VolcSurf;
  let p = wp.xz;
  let slope = 1.0 - Nc.y;
  let n1 = noised(p * 0.013 + 3.0).x; let n2 = noised(p * 0.057 + 11.0).x;
  let fert = sowFertile(p) * smoothstep(260.0, 215.0, wp.y);
  let dcone = length(p - vec2f(${VOLCANO.x}.0, ${VOLCANO.z}.0));
  let ashK = (1.0 - smoothstep(1300.0, 2200.0, dcone)) * (1.0 - fert);
  // Weights: soil everywhere a little; dry grass on the open ground; turf in the valley; ash toward the cone; rock on steeps.
  let yard = sowYard(p);
  var wSoil = 0.35 + 0.35 * smoothstep(-0.2, 0.5, n2);
  var wDry = (1.0 - fert) * (1.0 - ashK) * smoothstep(-0.3, 0.4, n1 + 0.3);
  var wTurf = fert * smoothstep(-0.5, 0.3, n1 + 0.2);
  var wAsh = ashK * (0.6 + 0.4 * smoothstep(-0.2, 0.4, n2));
  let wRock = smoothstep(0.38, 0.6, slope);
  let flat = 1.0 - wRock;
  wDry *= 1.0 - yard; wTurf *= 1.0 - yard; wSoil = max(wSoil, yard);
  wSoil *= flat; wDry *= flat; wTurf *= flat; wAsh *= flat;
  var soil: MatS; soil.albedo = vec3f(0.0); soil.N = Ng; soil.rough = 1.0; soil.ao = 1.0; soil.h = 0.5;
  var dry = soil; var turf = soil; var ash = soil; var rock = soil;
  if (yard > 0.5) { soil = mdLayer(MAT_EARTH, p + vec2f(5.0, 19.0), 0.5, Ng, fp, vec3f(0.13, 0.1, 0.075), 0.6); }
  else { soil = mdLayer(MAT_SOIL, p + vec2f(-41.0, 17.0), 0.33, Ng, fp, vec3f(0.085, 0.066, 0.052), 0.55); }
  if (wDry > 0.03) { dry = mdLayer(MAT_GRASS_GROUND, p + vec2f(23.0, -5.0), 0.38, Ng, fp, vec3f(0.17, 0.15, 0.085), 0.6); } else { wDry = 0.0; }
  if (wTurf > 0.03) { turf = mdLayer(MAT_TURF, p + vec2f(3.0, 29.0), 0.42, Ng, fp, vec3f(0.1, 0.13, 0.05) * meadowTint(p), 0.35); } else { wTurf = 0.0; }
  if (wAsh > 0.03) { ash = mdLayer(MAT_ASH_GROUND, p + vec2f(-9.0, 51.0), 0.33, Ng, fp, vec3f(0.11, 0.104, 0.098), 0.5); } else { wAsh = 0.0; }
  if (wRock > 0.03) {
    let k = 0.25;
    rock = matBiplanarG(MAT_ROCK_STRATA, wp * k, Ng, 1.0, matDpx * k, matDpy * k);
    rock.albedo = matRetint(rock, MAT_ROCK_STRATA, vec3f(0.075, 0.07, 0.068), 0.5);
  }
  var w0 = wSoil * (0.5 + soil.h); var w1 = wDry * (0.6 + dry.h); var w2 = wTurf * (0.7 + turf.h); var w3 = wAsh * (0.5 + ash.h); var w4 = wRock * (0.5 + rock.h);
  let pw = 4.0;
  w0 = pow(w0, pw); w1 = pow(w1, pw); w2 = pow(w2, pw); w3 = pow(w3, pw); w4 = pow(w4, pw);
  let ws = max(w0 + w1 + w2 + w3 + w4, 1e-5);
  o.albedo = (soil.albedo * w0 + dry.albedo * w1 + turf.albedo * w2 + ash.albedo * w3 + rock.albedo * w4) / ws;
  o.N = normalize(soil.N * w0 + dry.N * w1 + turf.N * w2 + ash.N * w3 + rock.N * w4);
  o.rough = (soil.rough * w0 + dry.rough * w1 + turf.rough * w2 + ash.rough * w3 + rock.rough * w4) / ws;
  o.rough = max(o.rough, 0.6);
  o.ao = (soil.ao * w0 + dry.ao * w1 + turf.ao * w2 + ash.ao * w3 + rock.ao * w4) / ws;
  o.glow = 0.0;
  return o;
}

fn volcanoLight(s: VolcSurf, V: vec3f, L: vec3f, key: vec3f, vis: f32, skyScale: f32) -> vec3f {
  let nl = max(dot(s.N, L), 0.0);
  var c = s.albedo * (key * nl * vis / PI + shIrradiance(s.N) * skyScale) * mix(1.0, s.ao, 0.7);
  // A GGX-ish lobe: the obsidian's broad sheen in low sun and a hard glint up close.
  let H = normalize(L + V);
  let a = s.rough * s.rough;
  let nh = max(dot(s.N, H), 0.0);
  let dd = nh * nh * (a * a - 1.0) + 1.0;
  let D = a * a / (PI * dd * dd + 1e-5);
  let F = 0.04 + 0.96 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  c += key * vis * nl * D * F * 0.25;
  // The sky in the glass, at grazing angles.
  let R = reflect(-V, s.N);
  c += atmoSky(normalize(vec3f(R.x, max(R.y, 0.02), R.z))) * (0.02 + 0.98 * pow(1.0 - max(dot(s.N, V), 0.0), 5.0)) * (1.0 - s.rough) * 0.06;
  return c;
}
`;
