// Phase 10, F0: the grown fen (docs/phase-10/plan.md). Runs after hydrology on the 4 m grid and writes only inside fenMask, so the
// macro height and every river and lake outside it are byte-identical. The water is set, not found: the ground slopes to the sea and
// hollows would drain (the trials are in the plan), so each basin has one table and low banks hold the steps between them.
import { coastDistance, fenMask, smooth } from './geography.mjs';
import { blur } from './hydrology.mjs';
import { gfbm } from '../../src/terrain/gnoise.js';
import { PINNED } from './pinned.mjs';

/** The sea's marsh at table 0 (its water is the sea), then two basins. Coast distance of each bank and the table behind it (m). */
export const FEN_BANKS = [[620, 1.4], [1900, 3.6]];
const BANK_CORE = 45, BANK_FOOT = 170;
const SITES = PINNED.filter(([id]) => id === 'warden-mire' || id.startsWith('shrine-mire-')).map(([id, , , x, z]) => [x, z, id === 'warden-mire' ? 210 : 120]);

/** Hollows and hummocks round a table (m); about half lies under it. */
function ground(x, z, seed) {
  const broad = gfbm(x / 300, z / 300, 4, seed + 601), fine = gfbm(x / 70, z / 70, 3, seed + 602);
  const mere = smooth(0.3, 0.55, gfbm(x / 800 + 1.7, z / 800, 3, seed + 603));
  return -0.25 + 4.2 * broad + 1.1 * fine - 4.5 * mere;
}

/** @returns {number} km² under a table */
export function carveFen(h, hy, n, cell, half, seed) {
  const { river, lake, lakeLevel, wet } = hy;
  // A channel is wider than the one cell of its river.
  const channel = blur(river.map((r) => (r > 0 ? 1 : 0)), n, 3, 2);
  let under = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -half + (i + 0.5) * cell, z = half - (j + 0.5) * cell, f = fenMask(x, z, seed);
    if (f <= 0) continue;
    const c = j * n + i, coast = coastDistance(x, z, seed), low = f * smooth(95, 30, h[c]) * smooth(-260, 220, coast);
    if (low <= 0) continue;
    const band = coast + 130 * gfbm(x / 340, z / 340, 3, seed + 604);
    let level = 0, bank = -1e9;
    for (let k = 0; k < FEN_BANKS.length; k++) {
      const [at, table] = FEN_BANKS[k];
      if (band >= at) level = table;
      const d = Math.abs(band - at);
      bank = Math.max(bank, table + 0.5 + 0.6 * gfbm(x / 120, z / 120, 3, seed + 605) - 5 * smooth(BANK_CORE, BANK_FOOT, d));
    }
    let g = level + ground(x, z, seed);
    // A river from the meadow runs on as a channel.
    const ch = Math.min(1, channel[c] * 3.5);
    g += (Math.min(g, level - 2) - g) * ch;
    g = Math.max(g, bank);
    for (let k = 0; k < SITES.length; k++) {
      const s = SITES[k], d = Math.sqrt((x - s[0]) * (x - s[0]) + (z - s[1]) * (z - s[1]));
      if (d < s[2] * 2) { const top = level + 2.4; if (g < top) g += (top - g) * smooth(s[2] * 2, s[2] * 0.8, d); }
    }
    h[c] += (g - h[c]) * low;
    // Where a basin meets the open sea, a shore holds it.
    if (level > 0 && low < 0.6) h[c] += (Math.max(h[c], level + 0.4) - h[c]) * smooth(0.1, 0.35, low);
    const wetTo = level > 0 ? level : 0;
    if (level > 0 && low > 0.35 && h[c] < level - 0.05) { lake[c] = Math.min(1, (level - h[c]) / 2); lakeLevel[c] = level; under++; } else { lake[c] = 0; lakeLevel[c] = 0; }
    if (lake[c] > 0 || h[c] < 0) river[c] = 0;
    wet[c] = Math.max(wet[c], smooth(wetTo + 2.2, wetTo, h[c]));
  }
  return under * cell * cell / 1e6;
}
