// Points of interest (BRIEF §4.1 placement). Phase 1 places the story anchors and shrines;
// rocks, vegetation density, ruins and cave mouths arrive with the phases that render them.
// Deterministic: candidates come from a fixed grid scored by rules, ties broken by position.

import { jitter } from './geography.mjs';

// Math.hypot is not guaranteed to round identically across engines; sqrt is.
const dist = (ax, az, bx, bz) => Math.sqrt((ax - bx) * (ax - bx) + (az - bz) * (az - bz));

/**
 * @param {{ sample: (x: number, z: number) => { h: number, slope: number, biome: number, river: number, lake: number } }} world
 * @param {number} seed
 */
export function placePOIs(world, seed) {
  const pois = [];
  const best = (filter, score, near) => {
    let top = null, topScore = -Infinity;
    for (let z = -3900; z <= 3900; z += 32) for (let x = -3900; x <= 3900; x += 32) {
      if (near && dist(x, z, near[0], near[1]) > near[2]) continue;
      const s = world.sample(x, z);
      if (!filter(s, x, z)) continue;
      const v = score(s, x, z) + jitter(x, z, seed) * 1e-3;
      if (v > topScore) { topScore = v; top = { x, z, h: s.h }; }
    }
    return top;
  };
  const flat = (s) => s.slope < 0.12 && s.h > 2 && s.river === 0 && s.lake === 0;
  const add = (id, kind, biome, p) => { if (p) pois.push({ id, kind, biome, pos: [p.x, p.z], h: Math.round(p.h * 10) / 10 }); };

  // The Shapers' monastery: high on the frost plateau, flat, near the ranges, overlooking south.
  add('monastery', 'monastery', 'frost', best((s) => flat(s) && s.biome === 0 && s.h > 500, (s, x, z) => s.h * 0.01 + z * 0.001 - Math.abs(x) * 0.0006));
  // Hub settlement of the Veiled: centre of the meadow, near water.
  add('hub', 'settlement', 'meadow', best((s) => flat(s) && s.biome === 1, (s, x, z) => -dist(x, z, -200, 200) * 0.001 + s.riverNear * 2));
  // Warden arenas: a large flat-ish site deep in each biome.
  const BIOME_NAMES = ['frost', 'meadow', 'mire', 'dunes', 'ember', 'coast'];
  for (let b = 0; b < 6; b++) {
    add('warden-' + BIOME_NAMES[b], 'warden-arena', BIOME_NAMES[b], best((s) => s.slope < 0.25 && s.biomeWeight[b] > 0.85 && (b === 5 ? s.h > -2 && s.h < 6 : s.h > 2), (s) => s.biomeWeight[b] - s.slope));
  }
  // Shrines: 5 per biome, spread out (greedy farthest-point over scored candidates).
  for (let b = 0; b < 6; b++) {
    const chosen = [];
    for (let k = 0; k < 5; k++) {
      const p = best((s, x, z) => flat(s) && s.biomeWeight[b] > 0.6 && chosen.every((c) => dist(c.x, c.z, x, z) > 700) && pois.every((q) => dist(q.pos[0], q.pos[1], x, z) > 300), (s, x, z) => {
        let d = 1e9;
        for (const c of chosen) d = Math.min(d, dist(c.x, c.z, x, z));
        return (chosen.length ? Math.min(d, 2500) / 2500 : 0) + s.biomeWeight[b] * 0.3 - s.slope;
      });
      if (!p) break;
      chosen.push(p);
      add('shrine-' + BIOME_NAMES[b] + '-' + (k + 1), 'shrine', BIOME_NAMES[b], p);
    }
  }
  return pois;
}
