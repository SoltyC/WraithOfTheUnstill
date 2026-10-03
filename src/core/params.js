// Tunable parameters (art sliders, world settings). The dev overlay builds its controls from
// these definitions; systems read `params.v.<key>` each frame (a plain property read).

/** @typedef {{ key: string, label: string, group: string, min: number, max: number, step: number, value: number }} ParamDef */

/** @type {ParamDef[]} */
export const paramDefs = [
  { key: 'timeOfDay', label: 'Time of day (h)', group: 'World', min: 0, max: 24, step: 0.05, value: 16.5 },
  { key: 'dayLengthMin', label: 'Day length (real min)', group: 'World', min: 1, max: 120, step: 1, value: 40 },
  { key: 'timeScale', label: 'Time flow (0 = paused)', group: 'World', min: 0, max: 1, step: 1, value: 0 },
  { key: 'sunAzimuth', label: 'Sun azimuth (deg)', group: 'Art', min: 0, max: 360, step: 1, value: 215 },
  { key: 'fogDensity', label: 'Haze (Mie ×)', group: 'Art', min: 0, max: 10, step: 0.05, value: 4.5 },
  { key: 'fogHeightFalloff', label: 'Fog height falloff', group: 'Art', min: 0.002, max: 0.08, step: 0.001, value: 0.018 },
  { key: 'exposure', label: 'Exposure bias', group: 'Art', min: 0.2, max: 3, step: 0.01, value: 1 },
  { key: 'skylight', label: 'Skylight (ambient ×)', group: 'Art', min: 0.5, max: 3, step: 0.05, value: 1.5 },
  { key: 'windStrength', label: 'Wind strength', group: 'Art', min: 0, max: 2, step: 0.01, value: 0.6 },
  { key: 'glintIntensity', label: 'Glint intensity', group: 'Art', min: 0, max: 2, step: 0.01, value: 1 },
  { key: 'deformDepth', label: 'Deformation depth', group: 'Art', min: 0, max: 2, step: 0.01, value: 1 },
  { key: 'refillRate', label: 'Refill (healing) rate', group: 'Art', min: 0, max: 4, step: 0.01, value: 1 },
  { key: 'gradeStrength', label: 'Grading strength', group: 'Art', min: 0, max: 1, step: 0.01, value: 1 },
  { key: 'renderScale', label: 'Render scale', group: 'Quality', min: 0.5, max: 1, step: 0.05, value: 1 },
];

/**
 * Live values, keyed by param key. Write through setParam() (or bump `version` after a direct
 * write) so systems can detect changes with one integer compare instead of reading doubles.
 */
export const params = { v: /** @type {Record<string, number>} */ ({}), version: 0 };
for (const d of paramDefs) params.v[d.key] = d.value;

/** Quality presets set groups of params at once. */
export const qualityPresets = {
  low: { renderScale: 0.6 },
  medium: { renderScale: 0.8 },
  high: { renderScale: 1 },
  ultra: { renderScale: 1 },
};

export function setParam(key, value) {
  if (!(key in params.v)) throw new Error('unknown param ' + key);
  params.v[key] = value;
  params.version++;
}
