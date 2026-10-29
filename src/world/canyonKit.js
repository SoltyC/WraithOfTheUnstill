// The ravine wall kit (Phase 9 D7b; docs/phase-9/dunes-design.md §7.2). The canyon walls are 12 m
// strata ledges cut into the 2 m height; a riser 2–3 cells wide is drawn by the grid as sawtooth
// facets. The bake traces every riser as a smoothed contour just above its foot
// (tools/bake-world/ravineWalls.mjs → world/ravines.json); this builds a sandstone cliff along
// each one, standing just in front of the terrain riser (which stays the collision: the face never
// lies behind the ramp, so the Wraith meets the ground before the rock).
//
// The cliff profile, out of the wall (+) or into it (−), at height y over arc length s:
//   - sub-bands of harder and softer rock by world height, the same everywhere in the erg (beds
//     line up across the canyon): each band stands out or is scoured back, making ledges and overhangs;
//   - broad bulges and buttresses along the wall, and vertical joints cut into it;
//   - a lean back with height, never past the line from the riser's foot to its top;
//   - a rounded lip, then a cap back over the riser to the next tread, sinking into its sand.
// Ends taper down into the sand. Three levels of detail per chunk (a spatial cell).
//
// Pure (no Babylon): geometry arrays only. Deterministic.

import { valueNoise, hash2 } from '../terrain/noise.js';

/** Levels of detail: column spacing along the wall, row spacing up it, lip rows, and the camera
 *  distance (m) to the chunk's edge out to which each is drawn. */
export const CANYON_LODS = [
  { ds: 1.5, dy: 0.6, lip: 3, range: 240 },
  { ds: 3.5, dy: 1.6, lip: 1, range: 1000 },
  { ds: 10, dy: 5, lip: 0, range: 4000 },
];
/** The collision lines' sampling (a cheap pass: one row only matters, the profile is evaluated directly). */
const COLLIDE_LOD = { ds: 1.5, dy: 50, lip: 0, range: 0 };
/** Chunk cell (m). */
export const CANYON_CELL = 128;
/** Wall kinds (the `cliff` attribute's z): the Galleries' red strata, the Stride's dark bedrock, a slot's smooth sandstone. */
export const WALL = { canyon: 0, rift: 1, slot: 2 };

const SEED = 0xca7;
/** How far below its contour a face reaches (m): buried in the tread's sand, deep enough to hide a
 *  partial step's foot (the ledges easing out toward a ford). */
const FOOT = 5;
/** A slot wall stands at most this far out from its trench wall (m): the 10 m trench keeps a 2.8 m passage. */
const SLOT_REACH = 3.6;
const n1 = (s, seed) => valueNoise(s, 0.37, seed); // 1D value noise, −1..1

/** Sub-band of the bed at world height y: its index and the protrusion (m, before scaling). */
const BAND = 1.7;
function bandOut(y) {
  const t = y / BAND, k = Math.floor(t), f = t - k;
  const p = (b) => (hash2(b, 7, SEED) - 0.5) * 2;   // −1..1
  // A short transition at each bed's base: harder beds stand out as overhanging lips, softer
  // ones are scoured back into shelves.
  const e = f < 0.14 ? (f / 0.14) * (f / 0.14) * (3 - 2 * f / 0.14) : 1;
  return p(k - 1) + (p(k) - p(k - 1)) * e;
}

/** Catmull-Rom on one coordinate. */
const cr = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);

/**
 * Resample a wall (bake points [x, z, nx, nz, top, depth] every ~2 m) at spacing ds: positions on a
 * Catmull-Rom curve, the rest interpolated and smoothed, arc length and the end taper.
 */
function resampleWall(P, ds, iso0) {
  const xs = [], zs = [], nx = [], nz = [], top = [], depth = [], iso = [];
  const I = (p) => (p.length > 6 ? p[6] : iso0);
  const n = P.length;
  for (let k = 0; k < n - 1; k++) {
    const a = P[Math.max(0, k - 1)], b = P[k], c = P[k + 1], d = P[Math.min(n - 1, k + 2)];
    const len = Math.hypot(c[0] - b[0], c[1] - b[1]), m = Math.max(1, Math.round(len / ds));
    for (let i = 0; i < m; i++) {
      const t = i / m;
      xs.push(cr(a[0], b[0], c[0], d[0], t)); zs.push(cr(a[1], b[1], c[1], d[1], t));
      nx.push(b[2] + (c[2] - b[2]) * t); nz.push(b[3] + (c[3] - b[3]) * t);
      top.push(b[4] + (c[4] - b[4]) * t); depth.push(b[5] + (c[5] - b[5]) * t); iso.push(I(b) + (I(c) - I(b)) * t);
    }
  }
  const e = P[n - 1]; xs.push(e[0]); zs.push(e[1]); nx.push(e[2]); nz.push(e[3]); top.push(e[4]); depth.push(e[5]); iso.push(I(e));
  const N = xs.length, s = new Float64Array(N);
  for (let k = 1; k < N; k++) s[k] = s[k - 1] + Math.hypot(xs[k] - xs[k - 1], zs[k] - zs[k - 1]);
  // Smooth top and depth over ~±4 m (the bake's march is per point), renormalise the normal.
  const w = Math.max(1, Math.round(4 / ds));
  const sm = (arr) => arr.map((_, k) => { let a = 0, c = 0; for (let m = Math.max(0, k - w); m <= Math.min(N - 1, k + w); m++) { a += arr[m]; c++; } return a / c; });
  const T = sm(top), D = sm(depth), Is = sm(iso);
  for (let k = 0; k < N; k++) { const l = Math.hypot(nx[k], nz[k]) || 1; nx[k] /= l; nz[k] /= l; }
  return { N, xs, zs, nx, nz, top: T, depth: D, iso: Is, s, L: s[N - 1] };
}

/**
 * The offset out of the wall (m) at arc length s, height y, for a wall whose riser climbs from
 * `iso` to `top` over `depth` metres back. `seed` varies the bulges per wall.
 */
export function cliffOffset(s, y, iso, top, depth, seed, kind) {
  const rise = Math.max(top - iso, 1);
  // Never behind the terrain ramp (foot at the line, top `depth` back), with a margin.
  const back = y > iso ? (y - iso) * depth / rise - 0.3 : -0.1;
  const smooth = kind === WALL.slot;
  // Out in front of the contour at the foot (the grid's jagged riser zig-zags a metre or two either
  // side of the smoothed line: the face must stand clear of its teeth), leaning back with height.
  if (smooth) {
    // A slot's wind-polished wall: long flowing undercuts and bulges that wander along it, so the
    // passage pinches to under 3 m and opens again; never past SLOT_REACH into the 10 m trench.
    const h = y - iso, ph = 2.6 * n1(s / 23 + seed * 5.1, SEED + 7), ph2 = 3.1 * n1(s / 8.5 + seed * 1.7, SEED + 8);
    let os = 2.0 + 0.6 * n1(s / 31 + seed * 2.3, SEED + 9) + 1.0 * Math.sin(h * 0.32 + ph) + 0.4 * Math.sin(h * 0.9 + ph2);
    os = Math.min(os, SLOT_REACH);
    return Math.max(os, -back);
  }
  let o = 1.6;
  o -= y > iso ? (y - iso) * Math.min(0.24, 0.5 * depth / rise + 1.2 / rise) : (y - iso) * 0.08;
  o += 0.75 * n1(s / 19 + seed * 13.1, SEED + 3) + 0.3 * n1(s / 6.5 + seed * 3.3, SEED + 4); // bulges
  {
    o += 0.55 * bandOut(y) * (0.6 + 0.4 * n1(s / 37 + seed, SEED + 5));      // beds
    // Joints: a vertical crack every 9–17 m, most walls.
    const cell = Math.floor(s / 13), h = hash2(cell, Math.floor(seed * 97), SEED + 6);
    if (h < 0.65) { const cs = (cell + 0.25 + 0.5 * h / 0.65) * 13, d = (s - cs) / 0.9; o -= 0.75 * Math.exp(-d * d); }
  }
  return Math.max(o, -back);
}

/**
 * One wall's geometry at a level of detail, appended to the arrays. Rows: the face from below the
 * tread up to the lip, the lip, the cap and its sink into the next tread's sand.
 */
function buildWall(out, wall, lod, kind, seed, s0 = 0, s1 = Infinity) {
  const r = resampleWall(wall.pts, lod.ds, wall.iso);
  // Columns in [s0, s1] (a chunk's share of the wall; the boundary column is shared, no gap).
  let k0 = 0; while (k0 < r.N - 1 && r.s[k0 + 1] <= s0) k0++;
  let k1 = r.N - 1; while (k1 > k0 && r.s[k1 - 1] >= s1) k1--;
  if (k1 - k0 < 1) return;
  const cols = k1 - k0 + 1;
  // One row count for the whole wall (from its tallest column), so the columns join as a grid.
  const lipR = lod.lip > 0 ? 0.45 : 0;
  let hMax = 0;
  for (let k = k0; k <= k1; k++) hMax = Math.max(hMax, r.top[k] - lipR - (r.iso[k] - FOOT));
  const nf = Math.max(1, Math.ceil(hMax / lod.dy));
  const rows = nf + 1 + lod.lip + 3;
  const base = out.pos.length / 3;
  for (let k = k0; k <= k1; k++) {
    const s = r.s[k], x = r.xs[k], z = r.zs[k], nx = r.nx[k], nz = r.nz[k], iso = r.iso[k], yBot = iso - FOOT;
    // Ends: over the last 20 m the cliff turns back into the slope (it sinks a little and retreats
    // behind the terrain's riser) rather than stopping in a cut edge or a lowered horn.
    const e = Math.max(0, Math.min(1, s / 20, (r.L - s) / 20)), te = e * e * (3 - 2 * e);
    const topR = r.top[k], top = iso + 0.8 + (topR - iso - 0.8) * (0.55 + 0.45 * te), depth = Math.max(1.5, r.depth[k]);
    const retreat = (1 - te) * (depth + 2.2);
    const yFace = Math.max(yBot + 0.2, top - lipR);
    if (out.col) {
      // Collision: the face's reach at the body's heights (the tread up to 2.4 m above it).
      let om = -1e9;
      for (let y = iso - 1.5; y <= iso + 1.0; y += 0.5) om = Math.max(om, cliffOffset(s, y, iso, top, depth, seed, kind) - retreat);
      out.col.push(x + nx * om, z + nz * om, nx, nz, iso - 1.7, top, k === k0 ? 1 : 0);
    }
    for (let i = 0; i <= nf; i++) {
      const y = yBot + (yFace - yBot) * i / nf;
      put(out, x, z, nx, nz, cliffOffset(s, y, iso, top, depth, seed, kind) - retreat, y, s, seed, iso, top, kind, 0);
    }
    const oTop = cliffOffset(s, yFace, iso, top, depth, seed, kind) - retreat;
    // Lip: a quarter round over the edge.
    let oLip = oTop;
    for (let i = 1; i <= lod.lip; i++) {
      const a = (i / lod.lip) * Math.PI / 2; oLip = oTop - lipR + lipR * Math.cos(a);
      put(out, x, z, nx, nz, oLip, yFace + lipR * Math.sin(a), s, seed, iso, top, kind, 1);
    }
    // Cap back over the riser, then down into the tread's sand.
    // The cap reaches back over the riser and the grid's jagged edge behind it (1 m), at most 4.5 m past
    // the lip, then dives into the ground (where the land beyond a rim falls away, a longer cap hung
    // in the air and shadowed it).
    const capBack = Math.min(depth + 1.0, -oLip + 4.5) + retreat;
    put(out, x, z, nx, nz, oLip - 0.35 * (capBack + oLip), top + 0.05, s, seed, iso, top, kind, 1);
    put(out, x, z, nx, nz, -capBack, top - 0.05, s, seed, iso, top, kind, 1);
    put(out, x, z, nx, nz, -capBack - 1.2, top - 3.0, s, seed, iso, top, kind, 1);
  }
  // Triangles (wound so the outward side faces the camera: positions go along +s with +n out).
  for (let c = 0; c < cols - 1; c++) for (let i = 0; i < rows - 1; i++) {
    const a = base + c * rows + i, b = a + rows, cc = b + 1, d = a + 1;
    out.idx.push(a, b, cc, a, cc, d);
  }
  // Smooth normals from the grid (central differences), facing out of the wall.
  for (let c = 0; c < cols; c++) for (let i = 0; i < rows; i++) {
    const v = base + c * rows + i, P = out.pos;
    const cA = base + Math.max(0, c - 1) * rows + i, cB = base + Math.min(cols - 1, c + 1) * rows + i;
    const rA = base + c * rows + Math.max(0, i - 1), rB = base + c * rows + Math.min(rows - 1, i + 1);
    const tx = P[cB * 3] - P[cA * 3], ty = P[cB * 3 + 1] - P[cA * 3 + 1], tz = P[cB * 3 + 2] - P[cA * 3 + 2];
    const ux = P[rB * 3] - P[rA * 3], uy = P[rB * 3 + 1] - P[rA * 3 + 1], uz = P[rB * 3 + 2] - P[rA * 3 + 2];
    let nx = uy * tz - uz * ty, ny = uz * tx - ux * tz, nz = ux * ty - uy * tx;
    const k = Math.min(k1, k0 + c);
    const l = Math.hypot(nx, ny, nz);
    // A degenerate cell (coincident rows): the wall's own outward normal (a zero one is NaN on the GPU).
    if (l < 1e-6) { nx = r.nx[k]; ny = 0; nz = r.nz[k]; } else { nx /= l; ny /= l; nz /= l; }
    if (nx * r.nx[k] + nz * r.nz[k] + ny * 0.3 < 0) { nx = -nx; ny = -ny; nz = -nz; }
    out.nrm[v * 3] = nx; out.nrm[v * 3 + 1] = ny; out.nrm[v * 3 + 2] = nz;
  }
}

function put(out, x, z, nx, nz, o, y, s, seed, iso, top, kind, cap) {
  out.pos.push(x + nx * o, y, z + nz * o);
  out.uv.push(s + seed * 50, y);
  out.cliff.push(iso, top, kind, cap); // w: 1 on the lip and cap
  out.nrm.push(0, 0, 0);
}

/** The kind of wall at a point: a slot's or the rift's only inside its own trench (by the baked
 *  spines: within its half-width plus a margin), the canyon's otherwise. */
function kindAt(spines, x, z) {
  let kind = WALL.canyon, best = 1e18;
  for (const sp of spines) {
    if (sp.kind !== 'slot' && sp.kind !== 'rift') continue;
    const margin = sp.kind === 'slot' ? 8 : 30;
    for (const p of sp.pts) {
      const d = Math.hypot(p[0] - x, p[1] - z) - p[2];
      if (d < margin && d < best) { best = d; kind = sp.kind === 'slot' ? WALL.slot : WALL.rift; }
    }
  }
  return kind;
}

/**
 * Chunks of the whole kit: walls split by the spatial cell of their points. A chunk builds a level
 * of detail on demand (`build(l)`: the near one is heavy and only wanted close by); its bounds come
 * from the coarsest level, widened by the profile's reach.
 * @param {{ walls: { L: number, iso: number, pts: number[][] }[], spines: { kind: string, pts: number[][] }[] }} data
 * @returns {{ key: string, cx: number, cz: number, radius: number, y0: number, y1: number,
 *   build: (l: number) => { positions: Float32Array, normals: Float32Array, uvs: Float32Array, cliff: Float32Array, indices: Uint32Array } }[]}
 */
export function buildCanyonKit(data, cell = CANYON_CELL) {
  const groups = new Map();
  data.walls.forEach((w, wi) => {
    const kind = kindAt(data.spines, w.pts[w.pts.length >> 1][0], w.pts[w.pts.length >> 1][1]);
    const seed = hash2(wi, w.L, SEED);
    // Split the wall where it crosses cells: pieces by arc length (bake points are ~2 m apart).
    let s = 0, start = 0, key = null;
    const keyOf = (p) => Math.floor(p[0] / cell) + '_' + Math.floor(p[1] / cell);
    const push = (k, a, b) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push({ w, kind, seed, s0: a, s1: b }); };
    for (let k = 0; k < w.pts.length; k++) {
      if (k > 0) s += Math.hypot(w.pts[k][0] - w.pts[k - 1][0], w.pts[k][1] - w.pts[k - 1][1]);
      const kk = keyOf(w.pts[k]);
      if (key === null) key = kk;
      if (kk !== key) { push(key, start, s); start = s; key = kk; }
    }
    push(key, start, Infinity);
  });
  const keys = [...groups.keys()].sort();
  return keys.map((key) => {
    const pieces = groups.get(key);
    const build = (l) => {
      const out = { pos: [], nrm: [], uv: [], cliff: [], idx: [] };
      for (const p of pieces) buildWall(out, p.w, CANYON_LODS[l], p.kind, p.seed, p.s0 === 0 ? 0 : p.s0 - 1e-6, p.s1);
      return { positions: new Float32Array(out.pos), normals: new Float32Array(out.nrm), uvs: new Float32Array(out.uv), cliff: new Float32Array(out.cliff), indices: new Uint32Array(out.idx) };
    };
    const far = build(CANYON_LODS.length - 1);
    // Collision lines (one point per 1.5 m column: x, z, out-normal, foot, top, 1 at a wall's start).
    const colOut = { pos: [], nrm: [], uv: [], cliff: [], idx: [], col: [] };
    for (const p of pieces) buildWall(colOut, p.w, COLLIDE_LOD, p.kind, p.seed, p.s0 === 0 ? 0 : p.s0 - 1e-6, p.s1);
    const collision = new Float32Array(colOut.col);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const P = far.positions;
    for (let i = 0; i < P.length; i += 3) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); z0 = Math.min(z0, P[i + 2]); z1 = Math.max(z1, P[i + 2]); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    return { key, cx, cz, y0: y0 - 2, y1: y1 + 2, radius: Math.hypot(x1 - x0, z1 - z0) / 2 + 3, far, collision, build: (l) => (l === CANYON_LODS.length - 1 ? far : build(l)) };
  }).filter((c) => c.far.indices.length > 0);
}
