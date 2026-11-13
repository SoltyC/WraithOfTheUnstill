// Art direction over the physical atmosphere (docs/aesthetic.md). Elden Ring's sky and fog are
// art-directed rather than physical: each region has a key colour, and the sky and fog take
// colour by bearing to the sun (warm toward it, cool away). The air near the camera stays clear
// for contrast where play happens, and the haze deepens with distance. One preset per biome and
// restoration state, blended by the biome weights at the camera (as the grades are). The
// environment light (SH ambient) is computed from the untinted LUTs: like FromSoftware's
// desaturated environment captures, the painted colour stays in the sky and the air and does not
// tint everything it lights. ?art=0 turns it off (before/after shots).

/** sun: tint toward the sun; anti: away; key: the region's colour; keyAmt: haze lean to it;
 *  near: km of clear air at the camera; strength 0..1. Tints are normalised to luminance 1. */
export const ART = {
  frostStilled:   { sun: [1.12, 1.0, 0.86], anti: [0.74, 0.9, 1.34], key: [0.7, 0.84, 1.12], keyAmt: 0.45, near: 0.12, strength: 1 },
  frostRestored:  { sun: [1.3, 1.0, 0.7], anti: [0.74, 0.92, 1.36], key: [0.88, 0.95, 1.1], keyAmt: 0.3, near: 0.12, strength: 1 },
  // Limgrave's lesson: green and gold, the air itself a little green.
  meadowStilled:  { sun: [1.12, 1.0, 0.8], anti: [0.84, 0.94, 1.2], key: [1.02, 0.97, 0.8], keyAmt: 0.35, near: 0.12, strength: 1 },
  meadowRestored: { sun: [1.3, 1.05, 0.62], anti: [0.74, 1.04, 1.14], key: [0.88, 1.1, 0.7], keyAmt: 0.4, near: 0.12, strength: 1 },
  // The erg: amber toward the sun, lavender away (a saturated region, as Caelid is red).
  dunesStilled:   { sun: [1.24, 0.97, 0.72], anti: [0.88, 0.84, 1.28], key: [1.1, 0.92, 0.8], keyAmt: 0.4, near: 0.15, strength: 1 },
  dunesRestored:  { sun: [1.36, 0.96, 0.6], anti: [0.82, 0.82, 1.34], key: [1.18, 0.94, 0.66], keyAmt: 0.45, near: 0.15, strength: 1 },
};

const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const tmp = new Float64Array(12);
function put(o, p, w) {
  const ls = lum(p.sun), la = lum(p.anti), lk = lum(p.key);
  for (let i = 0; i < 3; i++) { o[i] += w * p.sun[i] / ls; o[4 + i] += w * p.anti[i] / la; o[8 + i] += w * p.key[i] / lk; }
  o[3] += w * p.strength; o[7] += w * p.near; o[11] += w * p.keyAmt;
}

/**
 * Blend the presets into out (Float32Array(12), AtmoParams art0..art2).
 * @param {Float32Array} out
 * @param {{ frost: number, meadow: number, dunes: number }} w  biome weights at the camera
 * @param {{ frost: number, meadow: number, dunes: number }} r  restoration 0..1 of each
 * @param {number} night 0 day … 1 night (the directional colour fades: there is no sun to lean to)
 * @param {boolean} on
 */
export function blendArt(out, w, r, night, on) {
  tmp.fill(0);
  const sum = Math.max(w.frost + w.meadow + w.dunes, 1e-3);
  const pairs = [['frost', ART.frostStilled, ART.frostRestored], ['meadow', ART.meadowStilled, ART.meadowRestored], ['dunes', ART.dunesStilled, ART.dunesRestored]];
  for (const [k, a, b] of pairs) {
    const wk = w[k] / sum; if (wk <= 0) continue;
    put(tmp, a, wk * (1 - r[k])); put(tmp, b, wk * r[k]);
  }
  for (let i = 0; i < 12; i++) out[i] = tmp[i];
  out[3] = on ? tmp[3] * (1 - 0.6 * night) : 0;
}
