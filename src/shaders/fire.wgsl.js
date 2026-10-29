// Fire (PLAN.md V6): the camp's hearth and the lit braziers. Stateless GPU particles like the
// snowfall: every quad is a hashed seed with a looping life, animated in the vertex shader from
// the clock, so nothing is uploaded per frame but eight fire positions. Per fire: flame tongues
// (soft teardrops whose colour runs from a white-gold core to red tips), embers rising on the
// heat, and smoke curling away downwind. Flames and embers add light (premultiplied, alpha 0);
// smoke is alpha-blended and lit by the sky and, low down, by the fire. Display-referred emission
// divided by the exposure, as the other emitters (spell lights, glyphs).

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';

export const FIRES = 48; // 8 for the camp (hearth, braziers, built fires) + 40 for the burning village (systems/villageFire.js)
export const PER_FIRE = 112; // camp: 48 flames, 36 embers, 28 smoke. Burning building (fireL.z > 0): 60 tongues, 28 embers, 20 smoke, 4 glow cards
export const FIRE_COUNT = FIRES * PER_FIRE;

export const fireVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = particle id, yz = quad corner (−1..1)
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform fires: array<vec4f, ${FIRES}>; // xyz = base (world), w = size (0 = out)
uniform fireX: array<vec4f, ${FIRES}>; // x = smoke scale (1), y = flame amount (1; 0 = smoke only: every particle is a puff), z = level of detail 0..1 (1: share of particles drawn), w = soot 0..1 (dark, fire-lit smoke)
uniform fireL: array<vec4f, ${FIRES}>; // burning building: xy = flame line direction (x, z), z = half length (m; 0 = a plain camp fire), w = mode*10 + phase (mode 1: an opening, flames burst out along (-dir.y, dir.x))
uniform fireT: vec4f;                  // x = time (s), yz = wind direction (unit x, z), w = wind strength
varying vUv: vec2f;
varying vAlpha: f32;
varying vKind: f32;
varying vLife: f32;
varying vWorldPos: vec3f;
varying vSoot: f32;
varying vGain: f32;
varying vVil: f32;

fn fh(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return f32((x >> 22u) ^ x) / 4294967295.0;
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let id = u32(vertexInputs.position.x + 0.5);
  let corner = vertexInputs.position.yz;
  let f = id / ${PER_FIRE}u; let k = id % ${PER_FIRE}u;
  let F = uniforms.fires[f];
  let S = F.w;
  let X = uniforms.fireX[f];
  let smokeOnly = X.y <= 0.0;
  let t = uniforms.fireT.x;
  let h1 = fh(id * 5u + 1u); let h2 = fh(id * 5u + 2u); let h3 = fh(id * 5u + 3u); let h4 = fh(id * 5u + 4u); let h5 = fh(id * 5u + 5u);
  let wind = vec3f(uniforms.fireT.y, 0.0, uniforms.fireT.z) * uniforms.fireT.w;
  var p = F.xyz; var size = 0.1; var alpha = 0.0; var kind = 0.0; var life = 0.0; var stretch = 1.0;
  var rank = 0.0; // 0..1 within its kind (level of detail)
  let L = uniforms.fireL[f];
  let vil = L.z > 0.0 && !smokeOnly;
  let dir = L.xy; let hl = L.z; let mode = step(5.0, L.w); let ph = L.w - mode * 10.0;
  let outv = vec2f(-dir.y, dir.x);
  let tt = t + ph * 17.0;
  let th = 0.9 + 0.36 * S;      // a tongue's height (m): many, each a man's height or two
  let ssc = 0.55 + 0.22 * S;    // smoke scale
  if (vil) {
    // A burning building: tongues licking along the ridge (or out of the opening and up the wall), a rising
    // column of sparks, a dark rolling smoke column, and a few big faint glow cards lighting the air.
    if (k < 60u) {
      let j = (k * 37u) % 60u;                       // scatter along the line so level of detail thins it evenly
      rank = f32(k) / 60.0;
      life = fract(tt * (1.5 + 1.3 * h1) + h2);
      let s = ((f32(j) + h4) / 60.0 * 2.0 - 1.0) * hl;
      let mid = 1.0 - (s * s) / max(hl * hl, 0.01);
      let fl = 0.75 + 0.35 * sin(tt * 7.0 + f32(j) * 1.7) * sin(tt * 3.3 + h1 * 6.28);
      let hgt = th * fl * select(0.75 + 0.4 * mid, 1.0, mode > 0.5);
      p += vec3f(dir.x * s, h5 * 0.15 - 0.1 * (1.0 - mode), dir.y * s);
      p.y += life * hgt * (0.9 + 0.8 * h3);
      if (mode > 0.5) { // bursting out of the opening, then climbing the wall
        let lunge = hgt * 0.55 * smoothstep(0.0, 0.3, life) * (1.0 - 0.5 * life) * (0.5 + h3);
        p += vec3f(outv.x * lunge, 0.0, outv.y * lunge);
      } else {
        p += vec3f(outv.x, 0.0, outv.y) * (h5 - 0.5) * 0.5;
      }
      p += vec3f(sin(tt * 3.1 + h1 * 6.28), 0.0, cos(tt * 2.7 + h2 * 6.28)) * 0.07 * hgt * life + wind * life * life * 0.35 * hgt;
      size = (0.42 * hgt * (1.0 - life * 0.7) + 0.06) * (0.75 + 0.5 * h3);
      stretch = 2.1;
      alpha = smoothstep(0.0, 0.1, life) * (1.0 - life) * (0.85 + 0.15 * sin(tt * 11.0 + h1 * 40.0));
      kind = 0.0;
      if (rank > mix(0.3, 1.0, clamp((S - 1.0) / 3.0, 0.0, 1.0))) { alpha = 0.0; } // a young fire has fewer tongues
    } else if (k < 88u) {
      rank = f32(k - 60u) / 28.0;
      // Sparks lifted on the heat column, swirling; a few are bright streaks.
      let streak = h1 > 0.82;
      life = fract(tt * (0.22 + 0.3 * h1) * select(1.0, 1.6, streak) + h2);
      let s = (h4 * 2.0 - 1.0) * hl;
      let ang = tt * (0.8 + h1) + h2 * 6.283;
      let rad = life * (0.3 + 0.9 * h5) * (0.6 + 0.15 * S);
      let rise = life * (2.5 + 5.5 * h3) * (0.6 + 0.25 * S) * select(1.0, 1.4, streak);
      p += vec3f(dir.x * s + cos(ang) * rad, 0.4 + rise, dir.y * s + sin(ang) * rad) + wind * life * life * (3.0 + 3.0 * h3);
      size = (0.014 + 0.018 * h3) * select(1.0, 0.8, streak);
      stretch = select(2.0, 6.0, streak);
      alpha = (1.0 - life) * (0.65 + 0.35 * sin(tt * 19.0 + h1 * 50.0)) * select(0.0, 1.0, h5 < 0.92);
      kind = select(1.0, 1.2, streak);
    } else if (k < 108u) {
      rank = f32(k - 88u) / 20.0;
      // Smoke: a thick, dark column from the roof, rolling and widening, leaning downwind.
      let sm = X.x;
      life = fract(tt * (0.06 + 0.04 * h1) + h2);
      p += vec3f(dir.x * h4 * hl * 0.7 + outv.x * (h5 - 0.5) * 0.8, 0.6 + life * 5.5 * ssc * (0.6 + 0.4 * sm), dir.y * h4 * hl * 0.7 + outv.y * (h5 - 0.5) * 0.8);
      p += vec3f(sin(tt * 0.6 + h1 * 6.28), 0.0, cos(tt * 0.5 + h3 * 6.28)) * life * 0.9 * ssc + wind * life * (5.0 + 5.0 * h3) * ssc;
      size = ssc * (1.0 + life * 2.6) * (0.8 + 0.4 * h3) * (0.7 + 0.3 * sm);
      alpha = smoothstep(0.0, 0.18, life) * pow(1.0 - life, 1.3) * 0.5 * (1.0 + 0.7 * X.w) / (1.0 + life * 0.8);
      kind = 2.0;
    } else {
      rank = 0.0;
      // Glow: a few large, very faint additive cards around the base, so the fire lights the air.
      let gi = f32(k - 108u);
      life = 0.0;
      p += vec3f(dir.x * (gi - 1.5) / 1.5 * hl * 0.7 + outv.x * mode * 0.5, th * 0.5 + 0.2, dir.y * (gi - 1.5) / 1.5 * hl * 0.7 + outv.y * mode * 0.5);
      size = (1.4 + hl * 0.55 + S * 0.45) * (0.85 + 0.25 * (gi % 2.0));
      alpha = 0.05 * (0.8 + 0.2 * sin(tt * 9.0 + gi * 2.1) * sin(tt * 5.3 + gi));
      kind = 3.0;
    }
  } else if (k < 48u && !smokeOnly) {
    rank = f32(k) / 48.0;
    // Flame tongues: born at the embers, rising and narrowing, leaning a little downwind.
    life = fract(t * (1.15 + 0.7 * h1) + h2);
    let spread = (1.0 - life * 0.7) * 0.42 * S;
    p += vec3f((h4 - 0.5) * spread, life * (0.75 + 0.7 * h3) * S, (h5 - 0.5) * spread);
    p += vec3f(sin(t * 3.1 + h1 * 6.28), 0.0, cos(t * 2.7 + h2 * 6.28)) * 0.05 * life * S + wind * life * life * 0.25 * S;
    size = S * (0.36 * (1.0 - life) + 0.09) * (0.7 + 0.6 * h3);
    stretch = 1.5;
    alpha = smoothstep(0.0, 0.12, life) * (1.0 - life);
    kind = 0.0;
  } else if (k < 84u && !smokeOnly) {
    rank = f32(k - 48u) / 36.0;
    // Embers: sparks lifted on the heat, wandering, going out.
    life = fract(t * (0.3 + 0.35 * h1) + h2);
    let swirl = vec3f(sin(t * 1.7 + h1 * 6.28) + (h4 - 0.5) * 2.0, 0.0, cos(t * 1.3 + h3 * 6.28) + (h5 - 0.5) * 2.0) * life * 0.45 * S;
    p += vec3f((h4 - 0.5) * 0.3 * S, 0.3 * S + life * (2.2 + 2.4 * h3) * S, (h5 - 0.5) * 0.3 * S) + swirl + wind * life * 1.4 * S;
    size = 0.005 + 0.006 * h3;
    stretch = 2.2;
    alpha = (1.0 - life) * select(0.0, 1.0, h5 < 0.75);
    kind = 1.0;
  } else {
    // Smoke: slow puffs, widening, carried downwind and thinning. X.x stretches a village fire's
    // column (taller, wider, leaning further); X.w darkens and fire-lights it.
    rank = select(f32(k - 84u) / 28.0, f32(k) / ${PER_FIRE}.0, smokeOnly);
    let sm = X.x;
    life = fract(t * (0.09 + 0.05 * h1 / sm) + h2);
    p += vec3f((h4 - 0.5) * 0.4 * S, (0.9 + life * 5.0 * sm) * S, (h5 - 0.5) * 0.4 * S) + wind * life * (2.5 + 2.0 * h3) * S * sm;
    p += vec3f(sin(t * 0.5 + h1 * 6.28), 0.0, cos(t * 0.4 + h3 * 6.28)) * life * 0.6 * S * sm;
    size = S * (0.35 + life * 1.7 * sm) * (0.8 + 0.4 * h3);
    alpha = smoothstep(0.0, 0.25, life) * (1.0 - life) * 0.2 / (1.0 + life * 1.5) * (1.0 + 0.9 * X.w) * select(1.0, 0.5, smokeOnly); // thins as it spreads
    // Smoke only (a hearth's chimney): smaller, more broken puffs — big soft ones read as a smudge.
    if (smokeOnly) { size *= 0.6; }
    kind = select(2.0, 2.2, smokeOnly);
  }
  if (S <= 0.0 || rank > X.z) { alpha = 0.0; }
  // Camera-facing; flames and embers stretched upward.
  let toCam = normalize(uniforms.cameraPosition - p);
  let ax = normalize(cross(vec3f(0.0, 1.0, 0.0), toCam));
  let ay = normalize(cross(toCam, ax));
  let wp = p + ax * corner.x * size + ay * corner.y * size * stretch;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (alpha < 0.002) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vUv = corner;
  vertexOutputs.vAlpha = alpha;
  vertexOutputs.vKind = kind;
  vertexOutputs.vLife = life;
  vertexOutputs.vSoot = X.w;
  // Big fires stack many overlapping tongues (added light): each one dimmer, so the mass stays orange, not white.
  vertexOutputs.vGain = select(1.0 / (1.0 + max(S - 1.0, 0.0) * 1.8), 0.8 / (1.0 + max(S - 1.0, 0.0) * 0.35), vil);
  vertexOutputs.vVil = select(0.0, 1.0, vil);
  vertexOutputs.vWorldPos = p;
}
`;

export const fireFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform fireT: vec4f;
varying vUv: vec2f;
varying vAlpha: f32;
varying vKind: f32;
varying vLife: f32;
varying vWorldPos: vec3f;
varying vSoot: f32;
varying vGain: f32;
varying vVil: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let uv = fragmentInputs.vUv;
  let life = fragmentInputs.vLife;
  let kind = fragmentInputs.vKind;
  let ex = uniforms.fogParams.z * atmoExposure();
  let wp = fragmentInputs.vWorldPos;
  let t = uniforms.fireT.x;
  var outc = vec4f(0.0);
  if (kind < 0.5) {
    // A tongue: a teardrop (round below, drawn to a point above), its edge eaten by noise.
    let q = vec2f(uv.x / max(0.35 + 0.65 * (0.5 - uv.y * 0.5), 0.15), uv.y);
    let r = length(q);
    let n = noised(vec2f(uv.x * 2.3, uv.y * 1.6 - t * 3.5) + wp.xz * 3.0).x;
    let body = smoothstep(1.0, 0.25, r + 0.25 * n);
    if (body <= 0.001) { discard; }
    let temp = clamp((1.0 - life * 0.8) * (1.3 - r) - 0.08 * uv.y, 0.0, 1.0);
    let col = mix(vec3f(0.9, 0.18, 0.03), vec3f(1.0, 0.62, 0.22), smoothstep(0.1, 0.5, temp)) + vec3f(1.0, 0.85, 0.6) * smoothstep(0.55, 0.9, temp) * mix(1.0, 0.25, 1.0 - fragmentInputs.vGain); // big fires: less white core
    let a = body * fragmentInputs.vAlpha;
    var tc = col;
    if (fragmentInputs.vVil > 0.5) { // house fire: hot orange-yellow base, deep red tips, never a white core
      tc = mix(vec3f(0.7, 0.07, 0.01), vec3f(1.0, 0.46, 0.08), smoothstep(0.08, 0.45, temp)) + vec3f(0.5, 0.3, 0.05) * smoothstep(0.5, 0.95, temp);
    }
    let lit = tc * a * 9.0 * fragmentInputs.vGain / max(ex, 1e-6);
    outc = vec4f(displayTransform(lit, ex), 0.0);
  } else if (kind < 1.5) {
    let r2 = dot(uv, uv);
    if (r2 > 1.0) { discard; }
    let a = (1.0 - r2) * fragmentInputs.vAlpha;
    let streak = step(1.1, kind);
    let lit = mix(vec3f(1.0, 0.38, 0.08) * 5.0, vec3f(1.0, 0.62, 0.2) * 12.0, streak) * a / max(ex, 1e-6);
    outc = vec4f(displayTransform(lit, ex), 0.0);
  } else if (kind < 2.5) {
    // Smoke: a soft, lumpy puff of pale wood smoke, lit by the sky, by the sun (bright against it:
    // smoke scatters forward) and, young and low, by the fire under it.
    let r = length(uv);
    let hearth = fragmentInputs.vKind > 2.1; // smoke only: no fire under it to light it
    let n = noised(uv * select(1.7, 2.6, hearth) + wp.xz * 0.7 + vec2f(t * 0.1)).x;
    let d = smoothstep(1.0, 0.2, r + select(0.3, 0.5, hearth) * n);
    if (d <= 0.001) { discard; }
    let sky = shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w;
    // A burning building's column (soot > 0) is dark, lit orange from below by the fire, fading with height.
    let soot = fragmentInputs.vSoot;
    let glow = vec3f(1.0, 0.45, 0.15) * (1.0 - smoothstep(0.0, 0.3, life)) * 0.6 / max(ex, 1e-6)
             + vec3f(1.0, 0.4, 0.12) * soot * (1.0 - smoothstep(0.0, 0.5, life)) * (1.0 - smoothstep(0.0, 0.5, life)) * 0.3 / max(ex, 1e-6); // lit from below, low down only
    let cosT = dot(normalize(wp - uniforms.cameraPosition), uniforms.keyDir);
    let phase = 0.3 + 1.6 * pow(max(cosT, 0.0), 4.0);
    var glowV = select(glow, vec3f(0.0), hearth);
    if (fragmentInputs.vVil > 0.5) { // lit orange from beneath, near the fire only
      let low = 1.0 - smoothstep(0.0, 0.4, life);
      glowV = vec3f(1.0, 0.4, 0.1) * low * low * 1.1 / max(ex, 1e-6);
    }
    let col = vec3f(0.5, 0.52, 0.55) * (1.0 - 0.9 * soot) * (sky + atmoKeyColor() * max(uniforms.keyDir.y + 0.1, 0.0) * phase / PI) + glowV;
    let a = d * fragmentInputs.vAlpha;
    let lit = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(uniforms.cameraPosition - wp) * 0.001);
    outc = vec4f(displayTransform(lit, ex) * a, a);
  } else {
    // Glow card: a very faint warm halo with a slow shimmer, added light.
    let r2 = dot(uv, uv);
    if (r2 > 1.0) { discard; }
    let n = noised(uv * 1.5 + vec2f(t * 0.6, -t * 1.1)).x;
    let a = (1.0 - r2) * (1.0 - r2) * fragmentInputs.vAlpha * (0.8 + 0.4 * n);
    let lit = vec3f(1.0, 0.36, 0.08) * a * 3.0 / max(ex, 1e-6);
    outc = vec4f(displayTransform(lit, ex), 0.0);
  }
  fragmentOutputs.color = outc;
}
`;
