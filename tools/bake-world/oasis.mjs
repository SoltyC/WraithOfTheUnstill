// The oasis pool beside the Wellhouse (Phase 9 D8; seat oasis-well, tools/bake-world/seats.mjs): a
// gentle basin carved into the playa, its edge wobbling, a shallow shelf round a deeper middle, and a
// lake at a level just under the lowest point of its rim. Cut-only into the 2 m height; the 4 m hydro
// map gets the lake mask and level (render/water.js draws, wades and swims it like any lake).
// Determinism (as the rest of the bake): + − × ÷, comparisons, sqrt/floor/min/max and gnoise.

import { gfbm } from '../../src/terrain/gnoise.js';
import { smooth } from './geography.mjs';
import { OASIS_POOL } from '../../src/world/oasis.js';

export { OASIS_POOL };

export function carveOasis(h2, n2, c2, half, enc, hydro, lakeLevel, n4, c4) {
  const P = OASIS_POOL, sqrt = Math.sqrt;
  const H = (i, j) => h2[j * n2 + i] / enc.scale - enc.offset;
  const cell = (x, z) => [Math.floor((x + half) / c2), Math.floor((half - z) / c2)];
  // The edge: radius by angle, wobbling.
  const edge = (x, z) => P.r * (0.82 + 0.3 * gfbm(Math.atan2(z - P.z, x - P.x) * 1.3, 4.7, 2, 8801));
  // The level: just under the lowest ground round the rim.
  let rimLow = Infinity;
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2, rr = edge(P.x + Math.cos(a), P.z + Math.sin(a)) + 3;
    const [i, j] = cell(P.x + Math.cos(a) * rr, P.z + Math.sin(a) * rr);
    rimLow = Math.min(rimLow, H(i, j));
  }
  const level = rimLow - 0.3;
  const R = P.r * 1.4;
  const [i0, j0] = cell(P.x - R, P.z + R), [i1, j1] = cell(P.x + R, P.z - R);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = -half + (i + 0.5) * c2, z = half - (j + 0.5) * c2, d = sqrt((x - P.x) * (x - P.x) + (z - P.z) * (z - P.z));
    const e = edge(x, z), t = d / e;
    if (t > 1.35) continue;
    // A shelf (0.35 m under the water) round a bowl; the bank eases back up to the playa.
    const bowl = level - 0.35 - (P.depth - 0.35) * (1 - smooth(0, 0.7, t)) * (1 - smooth(0, 0.7, t));
    const target = t <= 1 ? bowl : level - 0.35 + (H(i, j) - (level - 0.35)) * smooth(1, 1.35, t);
    const q = Math.round((target + enc.offset) * enc.scale);
    if (q < h2[j * n2 + i]) h2[j * n2 + i] = q;
  }
  // The lake on the 4 m hydro map: every texel whose centre lies inside the edge.
  const lq = Math.round((level + enc.offset) * enc.scale);
  let n = 0;
  for (let j = Math.floor((half - P.z - R) / c4); j <= Math.floor((half - P.z + R) / c4); j++) for (let i = Math.floor((P.x - R + half) / c4); i <= Math.floor((P.x + R + half) / c4); i++) {
    const x = -half + (i + 0.5) * c4, z = half - (j + 0.5) * c4;
    if (sqrt((x - P.x) * (x - P.x) + (z - P.z) * (z - P.z)) > edge(x, z) - 0.5) continue;
    const c = j * n4 + i;
    hydro[c * 4 + 1] = 255; lakeLevel[c] = lq; n++;
  }
  return { level, texels: n };
}
