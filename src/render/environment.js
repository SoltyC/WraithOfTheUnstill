// Lighting environment from time of day: key light (sun or moon), sky gradient colours, fog.
// Every lit material holds references to the same Vector3s below (ShaderMaterial.setVector3
// stores the reference), so per-frame updates mutate in place.
//
// Allocation rules applied here (see tools/alloc/alloc-check.mjs): no helper calls that take
// doubles as arguments (V8 boxes them when the call is not inlined, and this function is large
// enough to exhaust the inlining budget); smoothstep is written inline; vectors are written
// through their tiny x/y/z accessors. Recomputes only when an input changes.
//
// Phase 0 analytic model. Phase 1 replaces it with the physically based atmosphere LUTs.

import { Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { params } from '../core/params.js';

export const env = {
  keyDir: new Vector3(0, 1, 0),
  keyColor: new Vector3(1, 1, 1),
  skyZenith: new Vector3(),
  skyHorizon: new Vector3(),
  groundBounce: new Vector3(),
  sunDir: new Vector3(0, 1, 0),
  moonDir: new Vector3(0, 1, 0),
  sunHalo: new Vector3(),
  fogParams: new Vector4(),
  envMisc: new Vector4(),
  /** Art controls read by materials: x = glint intensity. */
  artParams: new Vector4(1, 0, 0, 0),
  /** (render width, height, 1/width, 1/height), set by the owner each frame. */
  screenInfo: new Vector4(1, 1, 1, 1),
  /** 0 = day, 1 = full night. */
  night: 0.5,
  sunElevation: 0.5,
  /** Full recomputes so far (dev overlay / profiling). */
  recomputes: 0,
};

const MAX_ELEV = 0.86; // ~49°
const DEG = Math.PI / 180;

// params.version at the last recompute (an integer compare: no double loads when idle, which
// matters while V8 still runs this rarely-called function in the interpreter).
let lastVersion = -1;

/** Recompute the environment from params if anything changed. Allocation-free. */
export function updateEnvironment() {
  if (params.version === lastVersion) return;
  lastVersion = params.version;
  env.recomputes++;
  const p = params.v;
  const fp = env.fogParams;

  const t = p.timeOfDay;
  const elev = Math.asin(Math.sin(MAX_ELEV) * Math.sin(((t - 6) / 24) * Math.PI * 2));
  const az = p.sunAzimuth * DEG + (t - 12) * 15 * DEG * 0.6;
  env.sunElevation = elev;
  let ce = Math.cos(elev);
  const sd = env.sunDir;
  sd.x = ce * Math.sin(az); sd.y = Math.sin(elev); sd.z = ce * Math.cos(az);
  const me = Math.max(-elev * 0.85, -0.2) + 0.12, maz = az + Math.PI + 0.35;
  ce = Math.cos(me);
  const md = env.moonDir;
  md.x = ce * Math.sin(maz); md.y = Math.sin(me); md.z = ce * Math.cos(maz);

  const s = Math.sin(elev);
  // Kasten–Young relative air mass, clamped below the horizon.
  const eDeg = Math.max(elev / DEG, -2);
  const airmass = Math.min(38, 1 / (Math.max(Math.sin(eDeg * DEG), 0) + 0.50572 * Math.pow(eDeg + 6.07995, -1.6364)));
  let k;
  // sunI: key intensity, tuned so noon snow-clay sits below the tonemapper shoulder.
  k = Math.min(1, Math.max(0, (s + 0.035) / 0.105)); const sunI = 2.1 * k * k * (3 - 2 * k);
  const tr = Math.exp(-airmass * 0.045), tg = Math.exp(-airmass * 0.105), tb = Math.exp(-airmass * 0.23);
  k = Math.min(1, Math.max(0, (s + 0.12) / 0.42)); const day = k * k * (3 - 2 * k);
  k = Math.min(1, Math.max(0, (s + 0.2) / 0.18)); const night = 1 - k * k * (3 - 2 * k);
  k = Math.min(1, Math.max(0, (s + 0.22) / 0.21)); const tw0 = k * k * (3 - 2 * k);
  k = Math.min(1, Math.max(0, (s - 0.02) / 0.28)); const twilight = tw0 * (1 - k * k * (3 - 2 * k));
  env.night = night;

  // Sky gradient (night → day), plus twilight tint.
  const z = env.skyZenith;
  z.x = 0.0075 + (0.11 - 0.0075) * day + twilight * 0.05;
  z.y = 0.0135 + (0.23 - 0.0135) * day + twilight * 0.04;
  z.z = 0.036 + (0.55 - 0.036) * day + twilight * 0.09;
  const hz = env.skyHorizon;
  hz.x = 0.016 + (0.46 - 0.016) * day + twilight * 0.34;
  hz.y = 0.024 + (0.55 - 0.024) * day + twilight * 0.17;
  hz.z = 0.052 + (0.68 - 0.052) * day + twilight * 0.07;
  // Halo around the sun: transmitted sun colour, boosted at twilight.
  k = Math.min(1, Math.max(0, (s + 0.12) / 0.14));
  const haloI = 0.55 * k * k * (3 - 2 * k) * (1 + 1.5 * twilight);
  const sh = env.sunHalo;
  sh.x = tr * haloI; sh.y = tg * haloI; sh.z = tb * haloI;

  // Key light: the sun by day, the moon by night (cross-fade happens at ~zero intensity).
  const kd = env.keyDir, kc = env.keyColor;
  if (s > -0.08) {
    kd.x = sd.x; kd.y = sd.y; kd.z = sd.z;
    kc.x = tr * sunI; kc.y = tg * sunI; kc.z = tb * sunI;
  } else {
    kd.x = md.x; kd.y = md.y; kd.z = md.z;
    k = Math.min(1, Math.max(0, (s + 0.08) / -0.17));
    const mI = 0.22 * k * k * (3 - 2 * k);
    kc.x = 0.42 * mI; kc.y = 0.55 * mI; kc.z = 0.85 * mI;
  }
  // Ground bounce: warm light reflected off pale ground.
  const up = Math.min(1, Math.max(0, kd.y));
  const gb = env.groundBounce;
  gb.x = 0.18 * kc.x * up + z.x * 0.35;
  gb.y = 0.16 * kc.y * up + z.y * 0.35;
  gb.z = 0.13 * kc.z * up + z.z * 0.35;

  // Exposure here is the user bias; eye adaptation is computed on the GPU (atmosphere ambient pass).
  fp.x = p.fogDensity; fp.y = p.fogHeightFalloff; fp.z = p.exposure;
  const em = env.envMisc;
  em.x = night; em.y = day; em.z = twilight; em.w = p.skylight;
  env.artParams.x = p.glintIntensity;
}

/** Bind the shared env vectors to a ShaderMaterial once. */
export function bindEnvironment(mat) {
  mat.setVector3('keyDir', env.keyDir);
  mat.setVector3('keyColor', env.keyColor);
  mat.setVector3('skyZenith', env.skyZenith);
  mat.setVector3('skyHorizon', env.skyHorizon);
  mat.setVector3('groundBounce', env.groundBounce);
  mat.setVector3('sunDir', env.sunDir);
  mat.setVector3('sunHalo', env.sunHalo);
  mat.setVector4('fogParams', env.fogParams);
  mat.setVector4('envMisc', env.envMisc);
  mat.setVector4('artParams', env.artParams);
  mat.setVector4('screenInfo', env.screenInfo);
}
