// Read the baked world from node: height (2 m tiles), river/lake (hydro), surface slope, biome weights.
// `node tools/world/sample.mjs map cx cz half step` prints an ASCII map (height relative to the centre,
// ~ water, # steep); `node tools/world/sample.mjs at x z` prints one point. Used to place quest sites
// (data/quests/meadow-side.json) and by tests/sideQuests.test.js to check they stand on dry, level ground.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data/world/');
const HALF = 4096;

export function createWorldSampler() {
  const tiles = new Map();
  const tile = (tx, tz) => {
    const k = tz * 16 + tx;
    if (!tiles.has(k)) { const b = fs.readFileSync(dir + `height/${tx}_${tz}.u16`); tiles.set(k, new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2)); }
    return tiles.get(k);
  };
  let hydro = null, surf = null, biome = null, lakeLvl = null;
  const rd = (f) => { const b = fs.readFileSync(dir + f); return new Uint8Array(b.buffer, b.byteOffset, b.byteLength); };
  const h = (x, z) => {
    const i = Math.floor((x + HALF) / 2), j = Math.floor((HALF - z) / 2);
    return tile(i >> 8, j >> 8)[(j & 255) * 256 + (i & 255)] / 32 - 128;
  };
  return {
    h,
    /** Slope (rise over run) from the 2 m texels round the point. */
    slope(x, z) { const dx = (h(x + 2, z) - h(x - 2, z)) / 4, dz = (h(x, z + 2) - h(x, z - 2)) / 4; return Math.hypot(dx, dz); },
    /** River and lake weights 0..255 at the point (hydro, 4 m texels). */
    water(x, z) {
      hydro ||= rd('hydro.rgba8');
      const i = Math.floor((x + HALF) / 4), j = Math.floor((HALF - z) / 4), o = (j * 2048 + i) * 4;
      return { river: hydro[o], lake: hydro[o + 1] };
    },
    /** Meadow biome weight 0..1. */
    meadow(x, z) { biome ||= rd('biome_a.rgba8'); const i = Math.floor((x + HALF) / 8), j = Math.floor((HALF - z) / 8), o = (j * 1024 + i) * 4; return biome[o + 1] / 255; },
    /** Surface material id at the point (see manifest). */
    material(x, z) { surf ||= rd('surface.rgba8'); const i = Math.floor((x + HALF) / 4), j = Math.floor((HALF - z) / 4); return surf[(j * 2048 + i) * 4]; },
    wetness(x, z) { surf ||= rd('surface.rgba8'); const i = Math.floor((x + HALF) / 4), j = Math.floor((HALF - z) / 4); return surf[(j * 2048 + i) * 4 + 1]; },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , cmd, ...a] = process.argv, S = createWorldSampler();
  if (cmd === 'at') {
    const x = +a[0], z = +a[1];
    console.log(JSON.stringify({ h: +S.h(x, z).toFixed(2), slope: +S.slope(x, z).toFixed(3), ...S.water(x, z), meadow: +S.meadow(x, z).toFixed(2), mat: S.material(x, z), wet: S.wetness(x, z) }));
  } else if (cmd === 'map') {
    const [cx, cz, half, step] = a.map(Number), c = S.h(cx, cz);
    for (let z = cz + half; z >= cz - half; z -= step) {
      let row = String(Math.round(z)).padStart(6) + ' ';
      for (let x = cx - half; x <= cx + half; x += step) {
        const w = S.water(x, z), dh = S.h(x, z) - c;
        row += w.lake > 60 || w.river > 60 ? '~' : S.slope(x, z) > 0.7 ? '#' : dh > 40 ? 'M' : dh > 15 ? 'm' : dh > 4 ? '+' : dh > -4 ? '.' : dh > -15 ? '-' : '_';
      }
      console.log(row);
    }
  }
}
