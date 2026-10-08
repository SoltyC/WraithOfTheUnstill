// tools/bake-world — deterministic continent bake (BRIEF §4.1).
//   node tools/bake-world/index.mjs [--seed=1] [--out=data/world] [--scale=1] [--verify] [--preview=path.png]
// --scale=2 or 4 bakes a smaller world grid for fast tests (same layout, coarser texels).
// --verify bakes to a temp dir and compares every file hash with the committed manifest.
//
// Pipeline: macro height (4 m) → hydrology (fill, flow, rivers, lakes) → biomes (8 m) →
// surface material + wetness (4 m) → hydro layers (4 m) → wind (32 m) → 2 m height tiles with
// detail → overview (8 m) → POIs → manifest with SHA-256 of every file.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { macroHeight, coastDistance, regions, HALF, WORLD_SIZE } from './geography.mjs';
import { hydrology } from './hydrology.mjs';
import { biomeWeights, material, wind, BIOMES, MATERIALS } from './climate.mjs';
import { placePOIs } from './placement.mjs';
import { carveStory, storyPOIs } from './story.mjs';
import { gfbm } from '../../src/terrain/gnoise.js';
import { encodePng } from './png.mjs';

export const BAKE_VERSION = 1;
export const HEIGHT_OFFSET = 128;   // stored = (h + 128) * 32 as u16 → -128 … 1919.97 m
export const HEIGHT_SCALE = 32;
export const TILE = 256;            // texels per height tile side

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));

const log = (...a) => console.log('[bake]', ...a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Catmull-Rom sample of an n×n cell-centred grid at fractional cell coords (u, v). */
function bicubic(g, n, u, v) {
  const iu = Math.floor(u), iv = Math.floor(v);
  const fu = u - iu, fv = v - iv;
  let out = 0;
  for (let m = -1; m <= 2; m++) {
    const jj = clamp(iv + m, 0, n - 1);
    let row = 0;
    for (let k = -1; k <= 2; k++) {
      const ii = clamp(iu + k, 0, n - 1);
      row += g[jj * n + ii] * cr(fu, k);
    }
    out += row * cr(fv, m);
  }
  return out;
}
function cr(t, k) {
  // Catmull-Rom weights for offsets -1, 0, 1, 2.
  const t2 = t * t, t3 = t2 * t;
  if (k === -1) return 0.5 * (-t3 + 2 * t2 - t);
  if (k === 0) return 0.5 * (3 * t3 - 5 * t2 + 2);
  if (k === 1) return 0.5 * (-3 * t3 + 4 * t2 + t);
  return 0.5 * (t3 - t2);
}

export async function bake({ seed = 1, out, scale = 1, preview } = {}) {
  const t0 = Date.now();
  const n4 = 2048 / scale, c4 = WORLD_SIZE / n4;      // macro + hydrology grid
  const n2 = 4096 / scale, c2 = WORLD_SIZE / n2;      // final height grid
  const n8 = 1024 / scale, c8 = WORLD_SIZE / n8;      // biomes + overview
  const nw = 256 / scale, cw = WORLD_SIZE / nw;       // wind
  const X = (i, cell) => -HALF + (i + 0.5) * cell;
  const Z = (j, cell) => HALF - (j + 0.5) * cell;

  // 1. Macro height.
  const h4 = new Float32Array(n4 * n4);
  for (let j = 0; j < n4; j++) for (let i = 0; i < n4; i++) h4[j * n4 + i] = macroHeight(X(i, c4), Z(j, c4), seed);
  log(`macro ${n4}² @${c4} m`, Date.now() - t0, 'ms');

  // 2. Hydrology (carves rivers into h4).
  const reg = { north: 0, west: 0, east: 0, volcano: 0, centre: 0 };
  const hy = hydrology(h4, n4, c4, {
    riverKm2: 0.8,
    // Region rules: mire keeps every pool, the frost plateau keeps tarns, meadow keeps only
    // larger deep lakes, dunes and the ember waste stay dry (playas and hollows).
    keepLake(c, area, depth) {
      const i = c % n4, j = (c - i) / n4;
      regions(X(i, c4), Z(j, c4), seed, reg);
      if (reg.east > 0.4 || reg.volcano > 0.4) return false;
      if (reg.west > 0.5) return depth > 0.8 && area > 400;
      if (reg.north > 0.5) return depth > 4 && area > 20000 && area < 600000;
      return depth > 4 && area > 40000 && area < 1500000;
    },
    allowRiver(c) {
      const i = c % n4, j = (c - i) / n4;
      regions(X(i, c4), Z(j, c4), seed, reg);
      return reg.east < 0.4 && reg.volcano < 0.5;
    },
  });
  log('hydrology', Date.now() - t0, 'ms');

  // 2b. The frost chapter's layout: levelled pads for its sites and the Shapers' Run, carved after
  // hydrology so the chute is a route, not a river (story.mjs).
  const run = carveStory(h4, n4, c4, HALF);
  log('story', run.length, 'm run,', run.drop, 'm drop', Date.now() - t0, 'ms');

  // Shared lookups on the 4 m grid.
  const at4 = (arr, x, z) => arr[clamp(Math.floor((HALF - z) / c4), 0, n4 - 1) * n4 + clamp(Math.floor((x + HALF) / c4), 0, n4 - 1)];

  // 3. Biome weights (8 m): two RGBA8 maps.
  const bw = new Float64Array(6);
  const biomeA = new Uint8Array(n8 * n8 * 4), biomeB = new Uint8Array(n8 * n8 * 4);
  for (let j = 0; j < n8; j++) for (let i = 0; i < n8; i++) {
    const x = X(i, c8), z = Z(j, c8);
    biomeWeights(x, z, at4(h4, x, z), at4(hy.wet, x, z), seed, bw);
    // Quantise to bytes that sum to exactly 255 (largest-remainder).
    const q = new Array(6), r = new Array(6);
    let sum = 0;
    for (let k = 0; k < 6; k++) { const v = bw[k] * 255; q[k] = Math.floor(v); r[k] = v - q[k]; sum += q[k]; }
    while (sum < 255) { let m = 0; for (let k = 1; k < 6; k++) if (r[k] > r[m]) m = k; q[m]++; r[m] = -1; sum++; }
    const o = (j * n8 + i) * 4;
    biomeA[o] = q[0]; biomeA[o + 1] = q[1]; biomeA[o + 2] = q[2]; biomeA[o + 3] = q[3];
    biomeB[o] = q[4]; biomeB[o + 1] = q[5];
  }
  log('biomes', Date.now() - t0, 'ms');

  // 4. Surface (4 m): R material id, G wetness, B slope (rise/run × 128), A coast distance (m/16, clamped).
  const surface = new Uint8Array(n4 * n4 * 4);
  for (let j = 0; j < n4; j++) for (let i = 0; i < n4; i++) {
    const c = j * n4 + i, x = X(i, c4), z = Z(j, c4);
    const hx = (h4[j * n4 + Math.min(n4 - 1, i + 1)] - h4[j * n4 + Math.max(0, i - 1)]) / (2 * c4);
    const hz = (h4[Math.min(n4 - 1, j + 1) * n4 + i] - h4[Math.max(0, j - 1) * n4 + i]) / (2 * c4);
    const slope = Math.sqrt(hx * hx + hz * hz);
    const coast = coastDistance(x, z, seed);
    const b8i = clamp(Math.floor((x + HALF) / c8), 0, n8 - 1), b8j = clamp(Math.floor((HALF - z) / c8), 0, n8 - 1);
    const o8 = (b8j * n8 + b8i) * 4;
    bw[0] = biomeA[o8]; bw[1] = biomeA[o8 + 1]; bw[2] = biomeA[o8 + 2]; bw[3] = biomeA[o8 + 3]; bw[4] = biomeB[o8]; bw[5] = biomeB[o8 + 1];
    surface[c * 4] = material(bw, slope, h4[c], hy.wet[c], coast);
    surface[c * 4 + 1] = Math.round(clamp(hy.wet[c], 0, 1) * 255);
    surface[c * 4 + 2] = Math.round(clamp(slope * 128, 0, 255));
    surface[c * 4 + 3] = Math.round(clamp(coast / 16, 0, 255));
  }
  log('surface', Date.now() - t0, 'ms');

  // 5. Hydro (4 m): R river, G lake, B/A flow direction (signed, ×127+128). Lake level as u16.
  const hydro = new Uint8Array(n4 * n4 * 4), lakeLevel = new Uint16Array(n4 * n4);
  for (let c = 0; c < n4 * n4; c++) {
    hydro[c * 4] = Math.round(hy.river[c] * 255);
    hydro[c * 4 + 1] = Math.round(hy.lake[c] * 255);
    hydro[c * 4 + 2] = Math.round(clamp(hy.flowX[c], -1, 1) * 127 + 128);
    hydro[c * 4 + 3] = Math.round(clamp(hy.flowZ[c], -1, 1) * 127 + 128);
    lakeLevel[c] = hy.lake[c] > 0 ? Math.round(clamp((hy.lakeLevel[c] + HEIGHT_OFFSET) * HEIGHT_SCALE, 0, 65535)) : 0;
  }

  // 6. Wind (32 m): RG signed direction.
  const windMap = new Uint8Array(nw * nw * 2), wv = new Float64Array(2);
  for (let j = 0; j < nw; j++) for (let i = 0; i < nw; i++) {
    wind(X(i, cw), Z(j, cw), seed, wv);
    windMap[(j * nw + i) * 2] = Math.round(wv[0] * 127 + 128);
    windMap[(j * nw + i) * 2 + 1] = Math.round(wv[1] * 127 + 128);
  }

  // 7. Final 2 m height: bicubic from 4 m + metre-scale detail kept out of water.
  const h2 = new Uint16Array(n2 * n2);
  const ratio = c2 / c4;
  for (let j = 0; j < n2; j++) for (let i = 0; i < n2; i++) {
    const x = X(i, c2), z = Z(j, c2);
    let h = bicubic(h4, n4, (i + 0.5) * ratio - 0.5, (j + 0.5) * ratio - 0.5);
    const water = Math.max(at4(hy.river, x, z), at4(hy.lake, x, z));
    if (h > 1) h += (1 - water) * 0.7 * gfbm(x / 22, z / 22, 3, seed + 401);
    h2[j * n2 + i] = Math.round(clamp((h + HEIGHT_OFFSET) * HEIGHT_SCALE, 0, 65535));
  }
  // Overview (8 m): average of the 2 m grid.
  const k = n2 / n8, ov = new Uint16Array(n8 * n8);
  for (let j = 0; j < n8; j++) for (let i = 0; i < n8; i++) {
    let s = 0;
    for (let b = 0; b < k; b++) for (let a = 0; a < k; a++) s += h2[(j * k + b) * n2 + i * k + a];
    ov[j * n8 + i] = Math.round(s / (k * k));
  }
  log('height', Date.now() - t0, 'ms');

  // 8. POIs (sampled from the baked grids).
  const world = {
    sample(x, z) {
      const i8 = clamp(Math.floor((x + HALF) / c8), 0, n8 - 1), j8 = clamp(Math.floor((HALF - z) / c8), 0, n8 - 1), o = (j8 * n8 + i8) * 4;
      const weights = [biomeA[o], biomeA[o + 1], biomeA[o + 2], biomeA[o + 3], biomeB[o], biomeB[o + 1]].map((v) => v / 255);
      let biome = 0;
      for (let b = 1; b < 6; b++) if (weights[b] > weights[biome]) biome = b;
      let riverNear = 0;
      for (let dz = -48; dz <= 48; dz += 16) for (let dx = -48; dx <= 48; dx += 16) riverNear = Math.max(riverNear, at4(hy.river, x + dx, z + dz));
      const c4i = clamp(Math.floor((HALF - z) / c4), 0, n4 - 1) * n4 + clamp(Math.floor((x + HALF) / c4), 0, n4 - 1);
      return { h: h4[c4i], slope: surface[c4i * 4 + 2] / 128, biome, biomeWeight: weights, river: hy.river[c4i], lake: hy.lake[c4i], riverNear };
    },
  };
  const pois = placePOIs(world, seed, storyPOIs(h4, n4, c4, HALF));
  log('pois', pois.length, Date.now() - t0, 'ms');

  // 9. Write.
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'height'), { recursive: true });
  const files = {};
  const write = (rel, data) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    fs.writeFileSync(path.join(out, rel), buf);
    files[rel] = crypto.createHash('sha256').update(buf).digest('hex');
  };
  const tiles = n2 / TILE;
  const tile = new Uint16Array(TILE * TILE);
  for (let tj = 0; tj < tiles; tj++) for (let ti = 0; ti < tiles; ti++) {
    for (let j = 0; j < TILE; j++) tile.set(h2.subarray((tj * TILE + j) * n2 + ti * TILE, (tj * TILE + j) * n2 + ti * TILE + TILE), j * TILE);
    write(`height/${ti}_${tj}.u16`, tile);
  }
  write('height_overview.u16', ov);
  write('biome_a.rgba8', biomeA);
  write('biome_b.rgba8', biomeB);
  write('surface.rgba8', surface);
  write('hydro.rgba8', hydro);
  write('lake_level.u16', lakeLevel);
  write('wind.rg8', windMap);
  write('pois.json', Buffer.from(JSON.stringify({ version: BAKE_VERSION, pois, routes: [run] }, null, 2) + '\n'));
  const manifest = {
    version: BAKE_VERSION, seed, worldSize: WORLD_SIZE, origin: 'centre; x east, z north; row 0 = north edge; cell-centred texels',
    height: { texel: c2, size: n2, tile: TILE, tiles, encoding: 'u16le: h = v / 32 - 128 (m)', overview: { file: 'height_overview.u16', texel: c8, size: n8 } },
    biome: { files: ['biome_a.rgba8', 'biome_b.rgba8'], texel: c8, size: n8, channels: BIOMES, encoding: 'u8 weights summing to 255: a = frost, meadow, mire, dunes; b = ember, coast' },
    surface: { file: 'surface.rgba8', texel: c4, size: n4, channels: ['material', 'wetness', 'slope×128', 'coastDistance/16 m'], materials: MATERIALS },
    hydro: { file: 'hydro.rgba8', texel: c4, size: n4, channels: ['river', 'lake', 'flowX', 'flowZ'], lakeLevel: 'lake_level.u16 (same encoding as height; 0 = no lake)' },
    wind: { file: 'wind.rg8', texel: cw, size: nw, encoding: 'unit vector the wind blows toward, ×127+128 (x east, z north)' },
    pois: 'pois.json',
    files,
  };
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  log(`wrote ${Object.keys(files).length} files to ${path.relative(ROOT, out) || out} in ${Date.now() - t0} ms`);

  if (preview) writePreview(preview, ov, n8, biomeA, biomeB, hydro, n4, pois, c8);
  return manifest;
}

function writePreview(file, ov, n, biomeA, biomeB, hydro, n4, pois, cell) {
  const h = (i, j) => ov[clamp(j, 0, n - 1) * n + clamp(i, 0, n - 1)] / HEIGHT_SCALE - HEIGHT_OFFSET;
  const pal = [[236, 240, 248], [96, 128, 74], [74, 92, 70], [214, 182, 126], [64, 58, 58], [214, 204, 170]];
  const rgb = new Uint8Array(n * n * 3);
  const r4 = n4 / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = h(i, j), o = (j * n + i) * 4;
    const sx = (h(i + 1, j) - h(i - 1, j)) / (2 * cell), sz = (h(i, j + 1) - h(i, j - 1)) / (2 * cell);
    const shade = clamp(0.62 + 0.9 * (-sx * 0.7 + sz * 0.7), 0.15, 1.25);
    let c = [0, 0, 0];
    const w = [biomeA[o], biomeA[o + 1], biomeA[o + 2], biomeA[o + 3], biomeB[o], biomeB[o + 1]];
    for (let k = 0; k < 6; k++) for (let ch = 0; ch < 3; ch++) c[ch] += (w[k] / 255) * pal[k][ch];
    if (v < 0) c = [24, 52 + v * 0.25, 92 + v * 0.35];
    const hy = (Math.floor(j * r4) * n4 + Math.floor(i * r4)) * 4;
    if (hydro[hy] > 0 || hydro[hy + 1] > 0) c = [40, 90, 150];
    const s = v < 0 ? 1 : shade;
    for (let ch = 0; ch < 3; ch++) rgb[(j * n + i) * 3 + ch] = clamp(Math.round(c[ch] * s), 0, 255);
  }
  for (const p of pois) {
    const pi = Math.floor((p.pos[0] + HALF) / cell), pj = Math.floor((HALF - p.pos[1]) / cell);
    const col = p.kind === 'shrine' ? [255, 230, 120] : p.kind === 'warden-arena' ? [255, 80, 60] : p.kind === 'echo-stone' ? [160, 220, 255] : [255, 255, 255];
    for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
      if (Math.abs(di) + Math.abs(dj) > 4) continue;
      const ii = clamp(pi + di, 0, n - 1), jj = clamp(pj + dj, 0, n - 1);
      rgb.set(col, (jj * n + ii) * 3);
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePng(n, n, rgb));
  log('preview', file);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const seed = Number(args.seed ?? 1), scale = Number(args.scale ?? 1);
  if (args.verify) {
    const committed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/world/manifest.json'), 'utf8'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wraith-bake-'));
    const m = await bake({ seed: committed.seed, out: tmp, scale });
    const diffs = Object.keys(committed.files).filter((f) => committed.files[f] !== m.files[f]);
    fs.rmSync(tmp, { recursive: true, force: true });
    if (diffs.length) { console.error('[bake] VERIFY FAILED: ' + diffs.length + ' file(s) differ, e.g. ' + diffs.slice(0, 5).join(', ')); process.exit(1); }
    log('verify OK: all', Object.keys(committed.files).length, 'files byte-identical');
  } else {
    await bake({ seed, scale, out: path.resolve(ROOT, args.out ?? 'data/world'), preview: args.preview ? path.resolve(ROOT, args.preview) : null });
  }
}
