// The meadow's heart (PLAN.md "The village on the hill", docs/village/): a great hill against the
// eastern foothills, terraced, with a flat summit for the manor; a long ceremonial stair cut into
// its south-west face in switchback flights and landings; and the village ground at its foot —
// a horseshoe on the flat between the lakes and the hill, regraded gently (the stream at x ≈ −8
// is its western edge, left untouched).
//
// Carved after hydrology (like story.mjs), so rivers and lakes keep their courses; the carve stays
// clear of every river and lake cell.
//
// Determinism (as the rest of the bake): only + − × ÷, comparisons, Math.sqrt/floor/abs/min/max
// and integer hashing (Math.imul).

import { smooth } from './geography.mjs';

export const HILL = {
  centre: [300, 1000],
  /** Foot semi-axes (m): x, z. */
  ax: 170, az: 210,
  /** Summit: absolute height (m) and the flat pad's semi-axes (m) — the manor and its forecourt. */
  summit: 410, padX: 72, padZ: 58,
  /** The datum the hill rises from (m), and its terraces. */
  base: 268, terraces: 6,
  /** Village ground: a plane (height at the centre point, slopes per m in x and z) with this much
   *  of the natural relief kept; flat to e = flatTo (hill-ellipse units), faded out by fadeTo. */
  village: { at: [60, 990], h: 262, gx: 0.035, gz: 0.02, keep: 0.3, flatTo: 1.9, fadeTo: 2.5, minX: 6, maxCut: 40 },
};

/** The stair: flights at this rise per run (a ceremonial ~18°), landings this long, widths. */
export const STAIR = {
  id: 'manor-stair', slope: 0.21, landing: 30, halfFoot: 9, halfTop: 6, wall: 7,
  /** Flights' top heights above the foot (the last runs straight up the manor's axis). */
  levels: [6, 30, 52, 72, 90, 106, 120, 142],
  /** The foot: angle from the centre (rad: 0 = +x, π/2 = +z). */
  footAngle: -2.45,
};

const sqrt = Math.sqrt;
// sin/cos by range reduction and polynomials (Math.sin/cos are not bit-identical across engines).
const PI = 3.141592653589793, TAU = 2 * PI;
function sinP(x) {
  x = x - TAU * Math.floor((x + PI) / TAU);                 // [−π, π)
  let s = 1; if (x < 0) { x = -x; s = -1; }
  if (x > PI / 2) x = PI - x;                               // [0, π/2]
  const x2 = x * x;
  return s * x * (1 - x2 / 6 * (1 - x2 / 20 * (1 - x2 / 42 * (1 - x2 / 72 * (1 - x2 / 110)))));
}
const cosP = (x) => sinP(x + PI / 2);

/** Integer hash → [0, 1). */
function hash(i, j, s) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth value noise, cell `size` m, in [−1, 1]. */
function vnoise(x, z, size, s) {
  const u = x / size, v = z / size, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
  const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
  const a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s);
  return 2 * ((a + (b - a) * su) + ((c + (d - c) * su) - (a + (b - a) * su)) * sv) - 1;
}

/** Hill-ellipse distance at (x, z): 1 at the foot, the pad's edge near padE; lobed by noise. */
function ellipseE(x, z) {
  const dx = x - HILL.centre[0], dz = z - HILL.centre[1];
  const e = sqrt((dx / HILL.ax) * (dx / HILL.ax) + (dz / HILL.az) * (dz / HILL.az));
  return e * (1 + 0.07 * vnoise(x, z, 110, 7) + 0.02 * vnoise(x, z, 55, 8));
}
const PAD_E = () => (HILL.padX / HILL.ax + HILL.padZ / HILL.az) / 2;

/** The hill's height above the datum as a fraction of its rise (1 on the pad, 0 at the foot). */
export function hillProfile(e) {
  const pe = PAD_E();
  if (e <= pe) return 1;
  if (e >= 1) return 0;
  const t = (e - pe) / (1 - pe);
  // A smooth dome (steep under the pad: the forecourt's edge falls away; flaring at the foot)…
  const dome = (1 - t) * (1 - t) * (1 + 0.6 * t);
  // …and terraces: benches with steeper faces between them.
  const q = t * HILL.terraces, k = Math.floor(q), fr = q - k;
  const step = (k + smooth(0.05, 0.95, fr)) / HILL.terraces; // broad faces: sharper ones ring on the 4 m grid
  const terr = (1 - step) * (1 - step) * (1 + 0.6 * step);
  // Terraces stay out of the heightfield (a bench's lip, sampled on the 4 m grid, aliases into a
  // scalloped sawtooth): they are built as retaining walls on the hill (stage 4). A trace remains.
  return 0.08 * terr + 0.92 * dome;
}

/** The stair's centreline (≈2 m spacing) with the floor height at each point: flights and landings
 *  wrapping once round the hill as it rises (switchbacks on a face this steep stacked into each
 *  other and combed it into ridges), the last flights straight up to the summit. */
export function stairPath() {
  const [cx, cz] = HILL.centre, rise = HILL.summit - HILL.base;
  // Radius (along the foot angle's direction) where the hill's mean profile reaches height h above
  // the datum: inverse of the dome by bisection.
  const rAt = (h) => {
    let lo = PAD_E(), hi = 1.05;
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (hillProfile(m) * rise > h) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };
  const eScale = (a) => 1 / sqrt((cosP(a) / HILL.ax) * (cosP(a) / HILL.ax) + (sinP(a) / HILL.az) * (sinP(a) / HILL.az));
  const pts = []; // [x, z, floor, kind (0 flight, 1 landing)]
  let a = STAIR.footAngle, h = 0, dir = 1;
  const put = (ang, e, fh, kind) => { const R = eScale(ang) * e; pts.push([cx + cosP(ang) * R, cz + sinP(ang) * R, HILL.base + fh, kind]); };
  // The approach: from just beyond the foot.
  put(a, 1.12, 0, 1);
  const L = STAIR.levels;
  for (let f = 0; f < L.length; f++) {
    const top = L[f], last = f >= L.length - 2;
    // Walk 2 m at a time: rise slope × 2, move toward the radius for the new height, the rest across.
    while (h < top - 1e-6) {
      const nh = Math.min(top, h + STAIR.slope * 2);
      const R0 = eScale(a) * rAt(h), R1 = eScale(a) * rAt(nh), dr = R1 - R0;
      let da = 0;
      if (!last) { const across = Math.max(0, 4 - dr * dr); da = dir * sqrt(across) / Math.max(R1, 1); }
      a += da; h = nh;
      put(a, rAt(h), h, 0);
    }
    if (f === L.length - 1) break;
    // A landing: flat, along the slope; switchback (except into the straight last flights).
    const steps = Math.floor(STAIR.landing / 2);
    for (let k = 0; k < steps; k++) { a += dir * 2 / Math.max(eScale(a) * rAt(h), 1); put(a, rAt(h), h, 1); }
  }
  // Onto the pad, straight on from the last flight.
  put(a, PAD_E() * 0.85, rise, 1);
  return pts;
}

/**
 * Carve the village ground, the hill and the stair into h4 (in place). `wet(i, j)` → true on river
 * or lake cells (left untouched, with a margin). Returns the stair route and the POIs.
 */
export function carveHill(h4, n4, c4, half, wet) {
  const X = (i) => -half + (i + 0.5) * c4, Z = (j) => half - (j + 0.5) * c4;
  const [cx, cz] = HILL.centre, V = HILL.village, rise = HILL.summit - HILL.base;
  const reach = Math.max(HILL.ax, HILL.az) * V.fadeTo + 40;
  const i0 = Math.max(0, Math.floor((cx - reach + half) / c4)), i1 = Math.min(n4 - 1, Math.floor((cx + reach + half) / c4));
  const j0 = Math.max(0, Math.floor((half - cz - reach) / c4)), j1 = Math.min(n4 - 1, Math.floor((half - cz + reach) / c4));
  // Distance (in cells, capped) to the nearest wet cell, for the margin round streams and lakes.
  const W = i1 - i0 + 1, H = j1 - j0 + 1, dw = new Float32Array(W * H).fill(99);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (wet(i0 + i, j0 + j)) dw[j * W + i] = 0;
  for (let pass = 0; pass < 6; pass++) for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    const o = j * W + i; dw[o] = Math.min(dw[o], dw[o - 1] + 1, dw[o + 1] + 1, dw[o - W] + 1, dw[o + W] + 1);
  }
  // 1. Village ground and the hill.
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = X(i), z = Z(j), c = j * n4 + i, nat = h4[c];
    const wd = dw[(j - j0) * W + (i - i0)] * c4; // m to the nearest water
    if (wd < c4 * 0.5) continue;
    const e = ellipseE(x, z);
    let h = nat;
    // The village: a gentle plane with some of the land's own roll; never across the stream.
    const plane = V.h + V.gx * (x - V.at[0]) + V.gz * (z - V.at[1]);
    const ground = plane + V.keep * (nat - plane);
    let wv = 1 - smooth(V.flatTo, V.fadeTo, e);
    wv *= smooth(V.minX, V.minX + 30, x);            // west of the stream: untouched
    wv *= 1 - smooth(V.maxCut * 0.6, V.maxCut, Math.abs(nat - ground)); // the foothills stay
    wv *= smooth(8, 22, wd);                          // banks of streams and lakes stay
    h = h + (ground - h) * wv;
    // The hill, rising out of it (the foothills to the east merge in).
    if (e < 1.05) {
      const hill = HILL.base + rise * hillProfile(e) + 3 * vnoise(x, z, 48, 9) * (1 - hillProfile(e)); // broad lumps only (fine noise striped the faces)
      const t = smooth(0.92, 1.05, e); // the foot blends into the village
      h = Math.max(h, hill * (1 - t) + h * t);
    }
    h4[c] = h;
  }
  // 2. The stair corridor: floor graded to the route (flights a constant ramp, landings flat),
  //    walls blending back into the hill.
  const P = stairPath(), n = P.length;
  const s = new Float64Array(n);
  for (let k = 1; k < n; k++) { const dx = P[k][0] - P[k - 1][0], dz = P[k][1] - P[k - 1][1]; s[k] = s[k - 1] + sqrt(dx * dx + dz * dz); }
  const total = s[n - 1];
  const halfAt = (k) => STAIR.halfFoot + (STAIR.halfTop - STAIR.halfFoot) * (s[k] / total);
  const edits = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = X(i), z = Z(j);
    let best = -1, bd = 1e18;
    for (let k = 0; k < n; k++) { const dx = x - P[k][0], dz = z - P[k][1], d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = k; } }
    const d = sqrt(bd), hw = halfAt(best);
    const c = j * n4 + i, cur = h4[c], target = P[best][2];
    // The cut's sides: capped (a wide blend pulled whole faces toward whichever route point was
    // nearest — it jumps from flight to flight — and combed the hill into a sawtooth). Retaining
    // walls dress the cut (stage 4).
    const wall = Math.min(14, STAIR.wall + 0.25 * Math.abs(cur - target));
    if (d > hw + wall) continue;
    const w = d <= hw ? 1 : 1 - smooth(hw, hw + wall, d);
    edits.push(c, cur + (target - cur) * w);
  }
  for (let q = 0; q < edits.length; q += 2) h4[edits[q]] = edits[q + 1];
  // 3. The summit pad: dead level (the manor's floor).
  const pr = Math.max(HILL.padX, HILL.padZ) + 12;
  for (let j = Math.floor((half - cz - pr) / c4); j <= Math.floor((half - cz + pr) / c4); j++) for (let i = Math.floor((cx - pr + half) / c4); i <= Math.floor((cx + pr + half) / c4); i++) {
    const x = X(i), z = Z(j), dx = (x - cx) / HILL.padX, dz = (z - cz) / HILL.padZ, ep = sqrt(dx * dx + dz * dz);
    const w = 1 - smooth(1, 1.12, ep);
    if (w > 0) { const c = j * n4 + i; h4[c] = h4[c] + (HILL.summit - h4[c]) * w; }
  }
  // Outputs: the route every ~12 m (x, z, s, floor), landings marked; the story POIs.
  const points = [];
  let next = 0;
  for (let k = 0; k < n; k++) if (s[k] >= next || k === n - 1) { points.push([Math.round(P[k][0] * 10) / 10, Math.round(P[k][1] * 10) / 10, Math.round(s[k] * 10) / 10, Math.round(P[k][2] * 10) / 10, P[k][3]]); next += 12; }
  const route = { id: STAIR.id, kind: 'stair', length: Math.round(total * 10) / 10, rise: Math.round(rise * 10) / 10, slope: STAIR.slope, points };
  const vc = [HILL.village.at[0], HILL.village.at[1]];
  const pois = [
    { id: 'hub', kind: 'settlement', biome: 'meadow', pos: vc },
    { id: 'warden-meadow', kind: 'warden-arena', biome: 'meadow', pos: [cx, cz] },
    { id: 'manor', kind: 'manor', biome: 'meadow', pos: [cx, cz] },
    { id: 'stair-foot', kind: 'stair-foot', biome: 'meadow', pos: [Math.round(P[0][0]), Math.round(P[0][1])] },
  ];
  return { route, pois };
}
