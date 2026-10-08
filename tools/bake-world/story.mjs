// The frost chapter's layout (BRIEF §2.5: a camp, 4–8 shrines, Echoes hidden in the world, the
// Shapers' monastery) baked into the continent. Story sites sit in one ~1 km cluster around the
// Warden's arena instead of across the whole steppe, and the way between them is a deliberate,
// graded route — the Shapers' Run — not a fall down a cliff.
//
//   • Pads: each site sits on a levelled pad (flat core, smooth skirt), so buildings seat cleanly.
//   • The Run: a banked half-pipe of snow carved down the natural gully from the monastery to the
//     camp (493 m, a 138 m drop, about 16° on average, never steeper than ~19°), found by searching
//     the real terrain for a route needing the least earthwork (worst cut/fill ≈ 7 m).
//
// Determinism (as the rest of the bake): only + − × ÷, comparisons and Math.sqrt/floor/abs/min/max.

import { smooth } from './geography.mjs';

/** Story sites: exact positions, so they never move with other bake changes. pad = [flat radius, skirt radius] (m). */
export const FROST_SITES = [
  { id: 'monastery', kind: 'monastery', pos: [1125, 2750], pad: [24, 78], facing: 3.45 },
  { id: 'camp-frost', kind: 'camp', pos: [880, 2450], pad: [22, 56] },
  { id: 'spring-frost', kind: 'spring', pos: [600, 2470], pad: [12, 34] },
  { id: 'varo-rise', kind: 'overlook', pos: [960, 2350], pad: [5, 24] },
  // The Warden's arena keeps its baked place (a natural flat site): no pad.
  { id: 'warden-frost', kind: 'warden-arena', pos: [1092, 2276], pad: null },
  { id: 'shrine-frost-1', kind: 'shrine', pos: [1190, 2770], pad: [8, 26] },
  { id: 'shrine-frost-2', kind: 'shrine', pos: [990, 2510], pad: [8, 26] },
  { id: 'shrine-frost-3', kind: 'shrine', pos: [640, 2400], pad: [8, 26] },
  { id: 'shrine-frost-4', kind: 'shrine', pos: [760, 2800], pad: [8, 26] },
  { id: 'shrine-frost-5', kind: 'shrine', pos: [1480, 2260], pad: [8, 26] },
  // Echo stones: small standing stones hidden across the steppe (BRIEF §2.4: Echoes in the world).
  { id: 'echo-frost-1', kind: 'echo-stone', pos: [640, 2780], pad: [3, 12] },
  { id: 'echo-frost-2', kind: 'echo-stone', pos: [1450, 2480], pad: [3, 12] },
  { id: 'echo-frost-3', kind: 'echo-stone', pos: [1500, 2700], pad: [3, 12] },
  { id: 'echo-frost-4', kind: 'echo-stone', pos: [400, 2300], pad: [3, 12] },
  { id: 'echo-frost-5', kind: 'echo-stone', pos: [1000, 1980], pad: [3, 12] },
  { id: 'echo-frost-6', kind: 'echo-stone', pos: [1330, 2960], pad: [3, 12] },
  // The hounds' den: an optional encounter (the Shaped come out of the ground there).
  { id: 'den-frost', kind: 'den', pos: [1620, 2560], pad: [14, 34] },
];

/** The Shapers' Run: control points (x, z), from the monastery's sill to the camp pad. */
export const RUN = {
  id: 'shapers-run',
  control: [[1117, 2725], [1155, 2647], [1142, 2557], [1084, 2494], [1020, 2431], [957, 2417], [897, 2454]],
  /** Flat half-width of the floor (m), banking per unit curvature, bank limit (slope), and wall rules. */
  half: 9, bankK: 12, bankMax: 0.2, wallBase: 8, wallPerM: 1.1,
  /** Height the floor starts below the monastery pad (a lip to drop in from). */
  lip: 1.0,
  /** Gates along the run (fractions of its length): arches the Wraith carves through. */
  gates: [0.08, 0.19, 0.3, 0.42, 0.53, 0.64, 0.75, 0.86, 0.95],
};

const sqrt = Math.sqrt;

/** Bilinear sample of the cell-centred grid g (n × n, cell c, world centre origin, row 0 north). */
function sampleGrid(g, n, c, half, x, z) {
  const u = (x + half) / c - 0.5, v = (half - z) / c - 0.5;
  const i = Math.max(0, Math.min(n - 2, Math.floor(u))), j = Math.max(0, Math.min(n - 2, Math.floor(v)));
  const fu = Math.max(0, Math.min(1, u - i)), fv = Math.max(0, Math.min(1, v - j));
  const a = g[j * n + i], b = g[j * n + i + 1], d = g[(j + 1) * n + i], e = g[(j + 1) * n + i + 1];
  return (a + (b - a) * fu) + ((d + (e - d) * fu) - (a + (b - a) * fu)) * fv;
}

/** Catmull-Rom through the control points (polynomial: exact arithmetic), ~2 m apart. */
function densePath(P) {
  const pts = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i > 0 ? i - 1 : 0], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2 < P.length ? i + 2 : P.length - 1];
    const dx = p2[0] - p1[0], dz = p2[1] - p1[1], steps = Math.max(8, Math.floor(sqrt(dx * dx + dz * dz) / 2));
    for (let k = 0; k < steps; k++) {
      const t = k / steps, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  pts.push([P[P.length - 1][0], P[P.length - 1][1]]);
  return pts;
}

/**
 * Carve the story into the 4 m macro grid h4 (in place): pads, then the Run. Returns the Run's
 * data for the game ({ points: [[x, z, s]…every ~12 m, length, drop, gates }).
 * @param {Float32Array} h4  @param {number} n4  @param {number} c4  @param {number} half
 */
export function carveStory(h4, n4, c4, half) {
  const X = (i) => -half + (i + 0.5) * c4, Z = (j) => half - (j + 0.5) * c4;
  const cellRange = (x, z, r) => ({
    i0: Math.max(0, Math.floor((x - r + half) / c4)), i1: Math.min(n4 - 1, Math.floor((x + r + half) / c4)),
    j0: Math.max(0, Math.floor((half - z - r) / c4)), j1: Math.min(n4 - 1, Math.floor((half - z + r) / c4)),
  });

  // 1. Pads: level to the height at the site's centre, smooth skirt.
  const padH = {};
  for (const s of FROST_SITES) {
    const h = sampleGrid(h4, n4, c4, half, s.pos[0], s.pos[1]);
    padH[s.id] = h;
    if (!s.pad) continue;
    const [r0, r1] = s.pad, r = cellRange(s.pos[0], s.pos[1], r1);
    for (let j = r.j0; j <= r.j1; j++) for (let i = r.i0; i <= r.i1; i++) {
      const dx = X(i) - s.pos[0], dz = Z(j) - s.pos[1], d = sqrt(dx * dx + dz * dz);
      if (d >= r1) continue;
      const w = 1 - smooth(r0, r1, d);
      const c = j * n4 + i;
      h4[c] = h4[c] + (h - h4[c]) * w;
    }
  }

  // 2. The Run.
  const pts = densePath(RUN.control), n = pts.length;
  const s = new Float64Array(n);
  for (let i = 1; i < n; i++) { const dx = pts[i][0] - pts[i - 1][0], dz = pts[i][1] - pts[i - 1][1]; s[i] = s[i - 1] + sqrt(dx * dx + dz * dz); }
  const L = s[n - 1];
  const tx = new Float64Array(n), tz = new Float64Array(n), kap = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[i > 0 ? i - 1 : 0], b = pts[i < n - 1 ? i + 1 : n - 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = sqrt(dx * dx + dz * dz) || 1;
    tx[i] = dx / l; tz[i] = dz / l;
  }
  // Signed curvature (+ = turning left), smoothed over ±6 samples so the banking eases.
  const raw = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) {
    const ds = s[i + 1] - s[i - 1] || 1;
    raw[i] = (tx[i - 1] * tz[i + 1] - tz[i - 1] * tx[i + 1]) / ds;
  }
  for (let i = 0; i < n; i++) {
    let a = 0, w = 0;
    for (let k = -6; k <= 6; k++) { const q = i + k; if (q < 0 || q >= n) continue; a += raw[q]; w++; }
    kap[i] = a / w;
  }
  const hS = padH.monastery - RUN.lip, hE = padH['camp-frost'];
  const floor = new Float64Array(n), bank = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = s[i] / L, e = 0.6 * t + 0.4 * (t * t * (3 - 2 * t)); // gentle drop-in, easing out into the camp
    floor[i] = hS + (hE - hS) * e;
    bank[i] = Math.max(-RUN.bankMax, Math.min(RUN.bankMax, kap[i] * RUN.bankK));
  }
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  for (const p of pts) { if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0]; if (p[1] < minz) minz = p[1]; if (p[1] > maxz) maxz = p[1]; }
  const margin = RUN.half + RUN.wallBase + RUN.wallPerM * 40;
  const bi0 = Math.max(0, Math.floor((minx - margin + half) / c4)), bi1 = Math.min(n4 - 1, Math.floor((maxx + margin + half) / c4));
  const bj0 = Math.max(0, Math.floor((half - maxz - margin) / c4)), bj1 = Math.min(n4 - 1, Math.floor((half - minz + margin) / c4));
  const edits = [];
  for (let j = bj0; j <= bj1; j++) for (let i = bi0; i <= bi1; i++) {
    const x = X(i), z = Z(j);
    let best = -1, bd = 1e18;
    for (let q = 0; q < n; q++) { const dx = x - pts[q][0], dz = z - pts[q][1], d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = q; } }
    const d = sqrt(bd);
    if (d > margin) continue;
    const lat = (x - pts[best][0]) * -tz[best] + (z - pts[best][1]) * tx[best]; // + = left of travel
    const side = Math.max(-RUN.half, Math.min(RUN.half, lat));
    const target = floor[best] - side * bank[best];
    const c = j * n4 + i, nat = h4[c], delta = nat - target;
    const wall = RUN.wallBase + RUN.wallPerM * Math.abs(delta);
    const w = d <= RUN.half ? 1 : 1 - smooth(RUN.half, RUN.half + wall, d);
    if (w > 0) edits.push(c, nat + (target - nat) * w);
  }
  for (let q = 0; q < edits.length; q += 2) h4[edits[q]] = edits[q + 1];

  // Output: the centre line every ~12 m, and the gates.
  const points = [];
  let next = 0;
  for (let i = 0; i < n; i++) if (s[i] >= next || i === n - 1) { points.push([Math.round(pts[i][0] * 10) / 10, Math.round(pts[i][1] * 10) / 10, Math.round(s[i] * 10) / 10]); next += 12; }
  const gates = RUN.gates.map((f) => {
    const target = f * L;
    let q = 0; while (q < n - 1 && s[q] < target) q++;
    return { pos: [Math.round(pts[q][0] * 10) / 10, Math.round(pts[q][1] * 10) / 10], s: Math.round(s[q] * 10) / 10, dir: [Math.round(tx[q] * 1000) / 1000, Math.round(tz[q] * 1000) / 1000] };
  });
  return { id: RUN.id, kind: 'run', width: RUN.half * 2, length: Math.round(L * 10) / 10, drop: Math.round((hS - hE) * 10) / 10, points, gates };
}

/** The story's POIs (heights from the carved grid). */
export function storyPOIs(h4, n4, c4, half) {
  return FROST_SITES.map((s) => {
    const poi = { id: s.id, kind: s.kind, biome: 'frost', pos: [s.pos[0], s.pos[1]], h: Math.round(sampleGrid(h4, n4, c4, half, s.pos[0], s.pos[1]) * 10) / 10 };
    if (s.facing !== undefined) poi.facing = s.facing;
    return poi;
  });
}
