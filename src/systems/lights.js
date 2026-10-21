// World lights (PLAN.md V5/V6, Q5): fires, candles, braziers, lanterns, the moon under a fallen
// roof — registered once by the systems that own them, which move them and set their level. Each
// frame the nearest to the camera fill the shared light slots after the verbs'
// (shaders/common.wgsl.js LIGHT_SLOTS), faded out over the last FADE m of reach, so a light never
// pops as it enters or leaves the set. Allocation-free per frame.

import { LIGHT_SLOTS } from '../shaders/common.wgsl.js';
import { SPELL_LIGHTS } from '../game/bending/frost.js';

const REACH = 90; // m beyond its radius: further from the camera than this, a light is dropped
const FADE = 25;  // m: … faded over the last stretch
/** Flicker per kind: depth, two rates (rad/s). */
const FLICKER = { fire: [0.22, 7.1, 12.7], candle: [0.08, 9.3, 15.1], lamp: [0.04, 5.3, 8.1], bounce: [0, 0, 0] };

/** Night 0 (day) … 1 (night) from the hour, eased across dawn and dusk. */
export function nightAt(tod) {
  const s = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return tod < 12 ? 1 - s(5.5, 7.5, tod) : s(17.4, 19.4, tod);
}

/** @param {any} g  shared boot context */
export function addLightSystem(g) {
  const { loop, camera, clock, params } = g;
  const L = g.content.clipmap.spellLights;
  const list = [];
  const n = LIGHT_SLOTS - SPELL_LIGHTS;
  const pick = new Int32Array(n), pickD = new Float64Array(n);
  g.worldLights = {
    /** 0 by day … 1 at night (this frame). */
    night: 0,
    /** Register { x, y, z, radius, color: [r, g, b], intensity, kind ('fire' | 'candle' | 'lamp' |
     *  'bounce') }; returns the record — its owner moves it and sets `level` (0 = off). */
    add(l) { const r = { level: 1, phase: list.length * 1.7, ...l }; list.push(r); return r; },
  };
  loop.add({ name: 'lights', update: () => {
    g.worldLights.night = nightAt(params.v.timeOfDay);
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    // The nearest n lit lights (by distance less radius), insertion-sorted.
    let m = 0;
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      if (!(l.level > 0)) continue;
      const dx = l.x - cx, dy = l.y - cy, dz = l.z - cz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) - l.radius;
      if (!(d < REACH)) continue; // NaN (not yet placed) falls out here too
      if (m === n && d >= pickD[n - 1]) continue;
      let k = m < n ? m++ : n - 1;
      while (k > 0 && pickD[k - 1] > d) { pickD[k] = pickD[k - 1]; pick[k] = pick[k - 1]; k--; }
      pickD[k] = d; pick[k] = i;
    }
    const t = clock.simTime;
    for (let s = 0; s < n; s++) {
      const o = (SPELL_LIGHTS + s) * 8;
      if (s >= m) { L[o + 7] = 0; continue; }
      const l = list[pick[s]], f = FLICKER[l.kind] || FLICKER.lamp;
      const flick = 1 - f[0] + f[0] * (0.55 + 0.25 * Math.sin(t * f[1] + l.phase) + 0.2 * Math.sin(t * f[2] + l.phase * 2.3));
      const u = Math.min(1, Math.max(0, (pickD[s] - (REACH - FADE)) / FADE));
      L[o] = l.x; L[o + 1] = l.y; L[o + 2] = l.z; L[o + 3] = l.radius;
      L[o + 4] = l.color[0]; L[o + 5] = l.color[1]; L[o + 6] = l.color[2];
      L[o + 7] = l.intensity * l.level * flick * (1 - u * u * (3 - 2 * u));
    }
  } });
}
