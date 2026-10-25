// Finds places for nooks on the baked world: `node tools/world/nookfind.mjs cx cz radius [step]` lists
// dry, gentle spots near the point with how far each stands above the ground 60 m around it (a crest
// to look from) and how far it sees (the farthest of eight bearings that fall away), best crests first.
import { fileURLToPath } from 'node:url';
import { createWorldSampler } from './sample.mjs';

/** Is (x, z) dry ground, not steep (slope = rise over run) and not in the water's border? */
export function dryLevel(S, x, z, maxSlope = 0.3) {
  for (const [dx, dz] of [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6]]) { const w = S.water(x + dx, z + dz); if (w.lake > 20 || w.river > 20) return false; }
  return S.slope(x, z) <= maxSlope;
}

/** Height of (x, z) above the mean of a ring of radius `r` round it (positive on a crest). */
export function prominence(S, x, z, r = 60) {
  let sum = 0;
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; sum += S.h(x + Math.sin(a) * r, z + Math.cos(a) * r); }
  return S.h(x, z) - sum / 12;
}

/** Can an eye 1.7 m over (x, z) see a point `up` m over the ground at (tx, tz)? Marches the baked height. */
export function sees(S, x, z, tx, tz, up = 8) {
  const y0 = S.h(x, z) + 1.7, y1 = S.h(tx, tz) + up, n = Math.ceil(Math.hypot(tx - x, tz - z) / 6);
  for (let i = 1; i < n; i++) { const t = i / n; if (S.h(x + (tx - x) * t, z + (tz - z) * t) > y0 + (y1 - y0) * t) return false; }
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // usage: cx cz radius [step] [--see x,z]  (only spots that see that point)
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--') && !/^\d+,/.test(a) && !/^-?\d+,/.test(a)), seeArg = process.argv.find((a) => /^-?\d+,-?\d+$/.test(a));
  const [cx, cz, r, step = 12] = args.map(Number), S = createWorldSampler(), out = [];
  const see = seeArg ? seeArg.split(',').map(Number) : null;
  for (let x = cx - r; x <= cx + r; x += step) for (let z = cz - r; z <= cz + r; z += step) {
    if (Math.hypot(x - cx, z - cz) > r || !dryLevel(S, x, z) || (see && !sees(S, x, z, see[0], see[1]))) continue;
    out.push({ x, z, h: +S.h(x, z).toFixed(1), prom: +prominence(S, x, z).toFixed(1), slope: +S.slope(x, z).toFixed(2), d: Math.round(Math.hypot(x - cx, z - cz)) });
  }
  out.sort((a, b) => b.prom - a.prom);
  for (const o of out.slice(0, 12)) console.log(JSON.stringify(o));
}
