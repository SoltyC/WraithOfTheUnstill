// The manor on the summit of the meadow's great hill (docs/village/plan-manor-boss.md, brief.md §5).
// Run down and very grand: nobody has gone up for decades. The manor IS the Bellwether — a creature
// lay down on the hill an age ago and a family built over it: the great hall is its ribcage (the
// roof trusses are the ribs, open to the sky over half their length), the chimney stacks are its
// vents (capped with turf), the towers its spine ridges. Its neck will rise from the west wing, so
// that wing's end is left open and ruined.
//
// Everything is built in the MANOR FRAME, a rotation of the world about the pad centre: u runs to the
// right, f forward — toward the stair, which arrives from the south-west along the axis (the last
// point of route `manor-stair`). The forecourt and the main facade face +f; the hall stands at the
// back. Each site is a builder like architecture.js's: site-local metres, y = 0 is the pad (410 m,
// every site has an explicit `seatY`).
//
//   hall      u ±35, f -40..-12   walls 17 m, ridge 30 m, trusses every 5 m, 3 turf-capped stacks
//   wings     u ±35..49           stone ground floor, timber-framed upper floor; east scorched, west open-ended
//   towers    4 (42-55 m)         round, laid stone below and drawn courses above; one leans 4 deg, one roofless
//   gatehouse f 53.6..59.6        two towers and an arch on the stair head
//   forecourt f -12..52, u ±45    FLAG paving (clipped to the pad), broken patches, edge walls, statues, a dry fountain
//   hall-lit  the single warm window: GLASS with the village night glow, the only site with `windows: true`
//
// Collision: walls block (door gaps are 3 m or more), the hall and wing floors are platforms, roofs are
// camera-only blockers (`cam: true`). No ivy: there is no foliage material (CANVAS is undyed wool); the
// turf caps are EARTH. Scorch is IRON (near black) and EMBER (char, unlit: the site has no glow).

import { MAT, NS, rot, Builder } from './architecture.js';
import { layWall, h2 } from './masonry.js';
import { stick } from './camp.js';

export { Builder };

const PI = Math.PI;
const S_ = MAT.STONE;

/** How far (m) the house stands back from the pad centre toward the west rim (manorSites). */
export const BACK = 13;
export const MANOR = { centre: [300, 1000], y: 410, pad: [72, 58], stairHead: [346.7, 976.1] };
export const FACING = Math.atan2(MANOR.stairHead[0] - MANOR.centre[0], MANOR.stairHead[1] - MANOR.centre[1]);
const PM = rot(FACING);
/** Manor frame (u right, f toward the stair) to world x, z. */
export function manorWorld(u, f) { const p = PM(u, 0, f); return [MANOR.centre[0] + p[0], MANOR.centre[1] + p[2]]; }
/** Pad ellipse coordinate of a manor-frame point (1 at the pad's edge). */
export function padE(u, f) { const p = PM(u, 0, f); return Math.hypot(p[0] / MANOR.pad[0], p[2] / MANOR.pad[1]); }

/** A site's view of the manor frame: positions given in manor metres, emitted site-local. */
class Fr {
  constructor(b, facing, org) { this.b = b; this.facing = facing; this.org = org; this.P = rot(facing); }
  pt(u, y, f) { return this.P(u - this.org[0], y, f - this.org[1]); }
  xz(u, f) { const p = this.pt(u, 0, f); return [p[0], p[2]]; }
  /** Oriented box about (uc, fc), yawed dy from the manor axes (not solid unless asked). */
  obox(uc, fc, y0, y1, hx, hz, dy, mat, seed, o = {}) {
    const [x, z] = this.xz(uc, fc);
    this.b.box(x, z, y0, y1, hx, hz, this.facing + dy, mat, seed, { solid: false, ...NS, ...o });
  }
  /** Axis-aligned box u0..u1, f0..f1 (solid by default). */
  box(u0, u1, y0, y1, f0, f1, mat, seed, o = {}) {
    this.obox((u0 + u1) / 2, (f0 + f1) / 2, y0, y1, (u1 - u0) / 2, (f1 - f0) / 2, 0, mat, seed, { solid: true, ...o });
  }
  blocker(u0, u1, y0, y1, f0, f1, extra = {}) {
    const [x, z] = this.xz((u0 + u1) / 2, (f0 + f1) / 2);
    this.b.blockers.push({ site: this.b.site, kind: 'box', x, z, hx: (u1 - u0) / 2, hz: (f1 - f0) / 2, cos: Math.cos(this.facing), sin: Math.sin(this.facing), y0, y1, ...extra });
  }
  platform(u0, u1, f0, f1, top) {
    const [x, z] = this.xz((u0 + u1) / 2, (f0 + f1) / 2);
    this.b.platforms.push({ site: this.b.site, x, z, hx: (u1 - u0) / 2, hz: (f1 - f0) / 2, cos: Math.cos(this.facing), sin: Math.sin(this.facing), top });
  }
  /** A flat quad from manor points [u, y, f]. */
  quad(a, b, c, d, mat, seed, carve = 0, uvs = null) { this.b.quad(this.pt(...a), this.pt(...b), this.pt(...c), this.pt(...d), mat, seed, carve, uvs); }
  tri(a, b, c, mat, seed) { this.b.tri(this.pt(...a), this.pt(...b), this.pt(...c), mat, seed); }
  st(p, q, ra, rb, mat, seed, n = 6) { stick(this.b, this.pt(...p), this.pt(...q), ra, rb, n, mat, seed); }
}

// ---- walls, windows, arches ---------------------------------------------------------------------

/** A stone (or other) wall run along `ax` ('u' or 'f') from A0 to A1, between c0 and c1 across it, y0..y1,
 *  with openings ops [{ a0, a1, y0, y1 }] cut out. o: { mat, course, ruin, plain, solid }. */
function wall(F, ax, A0, A1, c0, c1, y0, y1, ops, seed, o = {}) {
  const mat = o.mat ?? S_;
  let n = 0;
  const put = (a0, a1, ya, yb) => {
    if (a1 - a0 < 0.04 || yb - ya < 0.04) return;
    if (o.laidTo !== undefined && ya < o.laidTo - 0.3 && yb > o.laidTo + 0.3) { put(a0, a1, ya, o.laidTo); put(a0, a1, o.laidTo, yb); return; }
    const top = yb >= y1 - 1e-6, drawn = o.laidTo !== undefined && ya >= o.laidTo - 0.3;
    const opt = { solid: o.solid !== false, course: o.course ?? 1.5, ruin: top ? (o.ruin || 0) : 0 };
    if (o.plain || drawn || mat !== S_) { opt.plain = true; if (mat === S_) opt.carve = 5; }
    const s = seed * 211 + n++;
    if (ax === 'u') F.box(a0, a1, ya, yb, c0, c1, mat, s, opt); else F.box(c0, c1, ya, yb, a0, a1, mat, s, opt);
  };
  const cuts = ops.filter((w) => w.y0 < y1 && w.y1 > y0 && w.a1 > A0 && w.a0 < A1).sort((p, q) => p.a0 - q.a0);
  let a = A0;
  for (const w of cuts) {
    const wa0 = Math.max(w.a0, A0), wa1 = Math.min(w.a1, A1);
    if (wa0 > a) put(a, wa0, y0, y1);
    if (w.y0 > y0) put(Math.max(wa0, a), wa1, y0, w.y0);
    if (w.y1 < y1) put(Math.max(wa0, a), wa1, w.y1, y1);
    a = Math.max(a, wa1);
  }
  if (a < A1) put(a, A1, y0, y1);
}

const A_ = (F, ax, a, y, c) => (ax === 'u' ? F.pt(a, y, c) : F.pt(c, y, a));

/** Leaded glass in an opening: a grid of 0.7 x 1.2 m panes in the plane c; state 0 whole, 1 half gone, 2 mostly gone. */
function glaze(F, ax, a0, a1, y0, y1, c, state, seed, fixedSeed = 0) {
  const np = Math.max(1, Math.round((a1 - a0) / 0.7)), nv = Math.max(1, Math.round((y1 - y0) / 1.2));
  const keep = state === 0 ? 0.94 : state === 1 ? 0.42 : 0.08, da = (a1 - a0) / np, dv = (y1 - y0) / nv;
  for (let i = 0; i < np; i++) for (let j = 0; j < nv; j++) {
    if (!fixedSeed && h2(seed * 37 + i, j * 13 + 5) > keep) continue;
    const aa = a0 + i * da, yy = y0 + j * dv;
    F.b.quad(A_(F, ax, aa, yy, c), A_(F, ax, aa + da, yy, c), A_(F, ax, aa + da, yy + dv, c), A_(F, ax, aa, yy + dv, c), MAT.GLASS, fixedSeed || (seed * 7 + i * 3 + j));
  }
}

/** A stone-dressed window on a wall: sill, mullion and transom, glass (state), a pointed hood mould. dir = outward (+1: face at c1). */
function window(F, ax, a, c0, c1, dir, y0, y1, w, state, seed, { hood = true, glass = true, mullion = true } = {}) {
  const cOut = dir > 0 ? c1 : c0, cMid = (c0 + c1) / 2, dy = ax === 'u' ? 0 : PI / 2, sg = ax === 'u' ? 1 : -1;
  const ob = (ac, cc, ya, yb, ha, hc, dyy, mat, sd, o = {}) => (ax === 'u' ? F.obox(ac, cc, ya, yb, ha, hc, dyy, mat, sd, o) : F.obox(cc, ac, ya, yb, ha, hc, dyy, mat, sd, o));
  ob(a, cOut + dir * 0.2, y0 - 0.32, y0, w / 2 + 0.3, 0.3, dy, S_, seed + 1, { plain: true, carve: 5 });
  if (glass) glaze(F, ax, a - w / 2, a + w / 2, y0, y1, cMid, state, seed);
  if (mullion && w > 1.9) {
    ob(a, cMid, y0, y1, 0.11, (c1 - c0) / 2 * 0.8, dy, S_, seed + 2, { plain: true, carve: 5 });
    ob(a, cMid, y0 + (y1 - y0) * 0.62, y0 + (y1 - y0) * 0.62 + 0.2, w / 2, 0.14, dy, S_, seed + 3, { plain: true, carve: 5 });
  }
  if (hood) {
    const hw = w / 2 + 0.35, phi = 0.85, L = hw / Math.cos(phi), rise = hw * Math.tan(phi);
    for (const s of [-1, 1]) {
      ob(a + s * hw / 2, cOut + dir * 0.18, y1 + 0.2 + rise / 2 - 0.1, y1 + 0.2 + rise / 2 + 0.1, L / 2, 0.22, dy, S_, seed + 4 + s, { plain: true, carve: 5, roll: -s * sg * phi });
    }
  }
}

/** Voussoirs round a semicircle (centre a, y) on the face c of a 'u' wall, projecting `depth` toward dir. */
function archRing(F, a, c, dir, y, rIn, rOut, depth, n, seed, skip = () => false) {
  const rm = (rIn + rOut) / 2, hy = (rOut - rIn) / 2, hx = rm * (PI / n) / 2 * 1.03;
  for (let k = 0; k < n; k++) {
    if (skip(k)) continue;
    const phi = PI * (k + 0.5) / n, yc = y + rm * Math.sin(phi);
    F.obox(a + rm * Math.cos(phi), c + dir * depth / 2, yc - hy, yc + hy, hx, depth / 2, 0, S_, seed + k, { roll: phi - PI / 2 });
  }
}

/** A buttress against a 'u' wall: a wide foot, a narrower shaft and a sloped cap. dir = outward. */
function buttress(F, a, cFace, dir, w, proj, h, seed) {
  const lo = (c, p) => (dir > 0 ? [c, c + p] : [c - p, c]);
  const [f0, f1] = lo(cFace, proj), [g0, g1] = lo(cFace, proj * 0.62);
  F.box(a - w / 2, a + w / 2, -1.2, 3.5, f0, f1, S_, seed, { course: 2.2 });
  F.box(a - w / 2, a + w / 2, 3.5, h * 0.58, f0, f1, S_, seed + 3, { plain: true, carve: 5 });
  F.box(a - w / 2 + 0.2, a + w / 2 - 0.2, h * 0.58, h, g0, g1, S_, seed + 1, { plain: true, carve: 5 });
  F.obox(a, cFace + dir * proj * 0.31, h, h + 0.42, w / 2 - 0.05, proj * 0.31 + 0.1, 0, S_, seed + 2, { plain: true, carve: 5, tilt: dir * 0.5 });
}

/** Rubble: n small stone blocks scattered around (cu, cf), up to `spread` m. */
function rubble(F, cu, cf, spread, n, seed, y = 0) {
  for (let i = 0; i < n; i++) {
    const s = seed * 91 + i, a = h2(s, 1) * 2 * PI, r = spread * Math.sqrt(h2(s, 2)), sz = 0.3 + 0.7 * h2(s, 3);
    F.obox(cu + Math.cos(a) * r, cf + Math.sin(a) * r, y - 0.05, y + sz * 0.9, sz * (0.7 + h2(s, 4)), sz * 0.6, h2(s, 5) * PI, S_, s, { tilt: (h2(s, 6) - 0.5) * 0.5, roll: (h2(s, 7) - 0.5) * 0.4, plain: sz < 0.55 });
  }
}

/** A conical or domed turf cap (EARTH): n facets, radius r, height h. */
function turf(F, u, y, f, r, h, seed, n = 8) {
  for (let k = 0; k < n; k++) {
    const a0 = k / n * 2 * PI, a1 = (k + 1) / n * 2 * PI, e = 0.9 + 0.2 * h2(seed, k);
    const p0 = [u + Math.cos(a0) * r * e, y, f + Math.sin(a0) * r * e], p1 = [u + Math.cos(a1) * r, y, f + Math.sin(a1) * r];
    F.tri(p1, [u + 0.15 * (h2(seed, 40 + k) - 0.5), y + h, f], p0, MAT.EARTH, seed + k);
  }
}

/** Flagstone paving quads (top faces only) over u0..u1 x f0..f1 at height y. keep(u, f) clips; patches [[u, f, r]] break it up. */
function pave(F, u0, u1, f0, f1, y, size, seed, keep, patches = [], mat = MAT.FLAG) {
  let row = 0;
  for (let f = f0; f < f1 - 0.05; row++) {
    const d = Math.min(f1 - f, size * (0.75 + 0.5 * h2(seed + row, 1)));
    let u = u0 + (row % 2 ? size * 0.45 : 0) - size * 0.5, col = 0;
    while (u < u1 - 0.05) {
      const w = size * (0.8 + 0.5 * h2(seed * 3 + row, col + 7)), ua = Math.max(u, u0), ub = Math.min(u + w, u1);
      u += w; col++;
      if (ub - ua < 0.3) continue;
      const uc = (ua + ub) / 2, fc = f + d / 2;
      if (!keep(uc, fc)) continue;
      let p = 0; for (const [pu, pf, pr] of patches) p = Math.max(p, 1 - Math.hypot(uc - pu, fc - pf) / pr);
      const r = h2(seed * 17 + row, col * 5 + 1);
      if (p > 0 && r < p * 0.6) continue;                 // a slab gone: the ground shows (turf comes through)
      const sink = p > 0 && r < p * 0.95 ? -0.05 - 0.1 * h2(r * 977, 3) : (h2(row * 31 + seed, col) - 0.5) * 0.012;
      const tl = p > 0 && r >= p * 0.6 && r < p * 0.95 ? 0.1 + 0.2 * h2(r * 311, 4) : 0;
      const g = 0.012, ya = y + sink, bs = Math.floor(h2(seed + row * 13, col * 7 + 3) * 65535) + 1, o1 = h2(bs, 1) * 9, o2 = h2(bs, 2) * 9;
      F.quad([ua + g, ya, f + g], [ub - g, ya + tl * 0.5, f + g], [ub - g, ya + tl, f + d - g], [ua + g, ya, f + d - g], mat, bs, 0, [o1, o2, o1 + (ub - ua), o2, o1 + (ub - ua), o2 + d, o1, o2 + d]);
    }
    f += d;
  }
}

// ---- sloped roofs -------------------------------------------------------------------------------

/** Slate (or other) strips over one slope. o: { alongU, cm (ridge, across), yR, run, rise (ridge to the eave tip), descend (+1/-1),
 *  r0, r1 (along the ridge), strips: boolean per strip (0 at the ridge), th, mat, seed }. */
function slopeSlabs(F, o) {
  const al = Math.atan2(o.rise, o.run), L = Math.hypot(o.run, o.rise), n = o.strips.length, th = o.th ?? 0.22;
  const nx = o.descend * Math.sin(al), ny = Math.cos(al);
  o.strips.forEach((on, k) => {
    if (!on) return;
    const t0 = k / n, t1 = Math.min(1, (k + 1) / n + 0.02), t = (t0 + t1) / 2;
    const cr = o.cm + o.descend * o.run * t - nx * th / 2, cy = o.yR - o.rise * t - ny * th / 2, hz = L * (t1 - t0) / 2;
    const along = (o.r0 + o.r1) / 2, hx = (o.r1 - o.r0) / 2 + 0.04, mat = o.mat ?? MAT.SLATE, sd = o.seed * 29 + k;
    if (o.alongU) F.obox(along, cr, cy - th / 2, cy + th / 2, hx, hz, 0, mat, sd, { plain: true, tilt: o.descend * al });
    else F.obox(cr, along, cy - th / 2, cy + th / 2, hx, hz, PI / 2, mat, sd, { plain: true, tilt: o.descend * al });
  });
}
/** Strip pattern for a damage state: 0 whole, 1 patchy, 2 gone, 3 only the eave strip. */
function stripsFor(state, n, seed) {
  if (state === 0) return Array(n).fill(true);
  if (state === 2) return Array(n).fill(false);
  if (state === 3) return Array.from({ length: n }, (_, k) => k === n - 1);
  return Array.from({ length: n }, (_, k) => h2(seed, k * 3 + 1) > 0.45);
}

// ---- the great hall -----------------------------------------------------------------------------

const HU = 35, HF0 = -40, HF1 = -12, HT = 1.8, EAVE = 17, RIDGE = 30, FM = (HF0 + HF1) / 2, HALF = (HF1 - HF0) / 2;
const SLOPE = RIDGE - EAVE;             // rise over the half-span
const OVER = 1.3;                       // eave overhang (horizontal)
const BAY = 5;
// Roof damage by bay (index 0 = east end ... 13 = west end): the west half is down, open to the sky.
const ROOF_FRONT = [0, 0, 0, 0, 0, 1, 1, 2, 2, 1, 2, 2, 2, 3];
const ROOF_BACK = [0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 2, 2];

function hall(F) {
  const WU = [-28.6, -19, -9.5, 9.5, 19, 28.6], WS_F = [1, 0, 0, 1, 2, 2], WS_B = [0, 1, 2, 0, 1, 2];
  // Front: portal, tall windows between buttresses, the lit lancet above the portal.
  const opsF = [{ a0: -2.7, a1: 2.7, y0: -3, y1: 6 }, { a0: -0.7, a1: 0.7, y0: 12, y1: 16.8 }];
  WU.forEach((u) => opsF.push({ a0: u - 1.4, a1: u + 1.4, y0: 4.2, y1: 11.4 }));
  wall(F, 'u', -HU, HU, HF1 - HT, HF1, -1.2, EAVE, opsF, 1, { course: 2.0, laidTo: 7 });
  // Back: windows, a service door.
  const opsB = [{ a0: -21.6, a1: -18.4, y0: -3, y1: 3.8 }];
  WU.forEach((u, i) => { if (u !== -19) opsB.push({ a0: u - 1.4, a1: u + 1.4, y0: 5, y1: 12.2 }); });
  wall(F, 'u', -HU, HU, HF0, HF0 + HT, -1.2, EAVE, opsB, 2, { course: 2.2, laidTo: 3 });
  // Ends: a doorway into each wing, stepped gables, an oculus lancet high up.
  const opsE = [{ a0: -27.6, a1: -24.4, y0: -3, y1: 4.4 }, { a0: FM - 0.7, a1: FM + 0.7, y0: 20.2, y1: 25 }];
  for (const s of [-1, 1]) {
    const c0 = s > 0 ? HU - HT : -HU, c1 = s > 0 ? HU : -HU + HT;
    wall(F, 'f', HF0 + HT, HF1 - HT, c0, c1, -1.2, EAVE, opsE, 3 + (s > 0 ? 1 : 0), { course: 2.2, laidTo: 5 });
    for (let k = 0; k < 6; k++) {
      const w = HALF - HT - 0.4 - k * 2.0;
      wall(F, 'f', FM - w, FM + w, c0, c1, EAVE + k * 2, EAVE + k * 2 + 2, opsE, 10 + k + (s > 0 ? 8 : 0), { course: 2.0, plain: true, ruin: 0 });
    }
    window(F, 'f', FM, c0, c1, s, 20.2, 25, 1.4, 1, 60 + s, { hood: false, mullion: false });
  }
  // Front windows and buttresses.
  WU.forEach((u, i) => {
    window(F, 'u', u, HF1 - HT, HF1, 1, 4.2, 11.4, 2.8, WS_F[i], 100 + i * 10);
    window(F, 'u', u, HF0, HF0 + HT, -1, 5, 12.2, 2.8, WS_B[i], 200 + i * 10, { hood: i % 2 === 0 });
  });
  for (const u of [-33.9, -23.75, -14.25, 14.25, 23.75, 33.9]) {
    const wide = Math.abs(u) > 30 ? 2.8 : 2.2;
    buttress(F, u, HF1, 1, wide, 1.9, 14.5, 300 + u);
    buttress(F, u, HF0, -1, wide, 1.9, 14.5, 330 + u);
  }
  // The portal: jamb columns, two archivolts over a solid tympanum, heavy doors (one hanging, one down).
  for (const s of [-1, 1]) {
    F.b.drum(...F.xz(s * 3.35, HF1 + 0.55), 0, 6.3, 0.34, 0.3, 10, S_, 400 + s, { solid: false });
    F.obox(s * 3.35, HF1 + 0.55, 6.3, 6.7, 0.5, 0.5, 0, S_, 402 + s, { plain: true, carve: 5 });
  }
  archRing(F, 0, HF1, 1, 6, 3.0, 4.1, 0.6, 9, 410);
  archRing(F, 0, HF1, 1, 6, 4.25, 5.3, 0.45, 11, 430, (k) => k === 3 || k === 8);
  F.obox(0, HF1 - 0.05, 0, 0.3, 3.0, 1.0, 0, S_, 450, { plain: true, carve: 5 }); // threshold
  const hinge = (hu, hf, dy, roll, sd) => {
    const w = 2.65, d = [Math.cos(dy), -Math.sin(dy)], cu = hu + d[0] * w / 2, cf = HF1 + hf + d[1] * w / 2;
    F.obox(cu, cf, 0.05, 5.95, w / 2, 0.11, dy, MAT.PLANK, sd, { plain: true, roll });
    for (const y of [1.3, 3.0, 4.7]) F.obox(cu, cf, y, y + 0.22, w / 2, 0.15, dy, MAT.IRON, sd + 1, { plain: true });
  };
  hinge(-2.7, 0.1, -0.95, 0.06, 460);              // hanging off its upper hinge, ajar
  hinge(2.7, -0.3, PI - 1.4, 0, 470);               // the other swung in and sagged against the nave
  // Interior: the floor (FLAG, broken under the open roof), the platform to walk on.
  const fkeep = () => true;
  pave(F, -HU + HT, HU - HT, HF0 + HT, HF1 - HT, 0.25, 1.1, 17, fkeep, [[10, -22, 6], [24, -18, 5], [28, -33, 6], [18, -34, 4]]);
  F.platform(-HU + HT, HU - HT, HF0 + HT, HF1 - HT, 0.25);
  // The roof: slate bays over trusses. Ribs (the creature's) every 5 m, open where the slate is gone.
  const rf = HALF + OVER, rise = SLOPE * (rf / HALF), bw = (2 * HU + 1.6) / 14;
  for (let j = 0; j < 14; j++) {
    const r0 = -HU - 0.8 + j * bw;
    for (const [desc, st, sd] of [[1, ROOF_FRONT[j], 500], [-1, ROOF_BACK[j], 600]]) {
      slopeSlabs(F, { alongU: true, cm: FM, yR: RIDGE + 0.1, run: rf, rise, descend: desc, r0, r1: r0 + bw, strips: stripsFor(st, 3, sd + j * 7), seed: sd + j });
    }
  }
  for (let j = 0; j < 5; j++) F.obox(-HU - 0.8 + (j + 0.5) * bw, FM, RIDGE + 0.2, RIDGE + 0.7, bw / 2 - 0.05, 0.45, 0, MAT.SLATE, 700 + j, { plain: true });
  F.blocker(-HU - 0.8, -10, 16, RIDGE + 1, HF0 - OVER, HF1 + OVER, { cam: true });
  // Trusses: curved ribs bowing into the nave, collars, king posts, snapped tie beams in the west half.
  const sag = (x) => -0.8 * Math.sin(PI * Math.min(1, Math.abs(x) / HALF));
  const TU = (k) => -33.4 + k * (66.8 / 13);
  for (let j = 0; j <= 13; j++) {
    const u = TU(j), west = j >= 7;
    for (const s of [-1, 1]) {
      let prev = null;
      for (let k = 0; k <= 4; k++) {
        const t = k / 4, x = s * (HALF - 0.4) * (1 - t), y = EAVE - 0.2 + (SLOPE - 0.5) * t + sag(x) * 0.8;
        const p = [u, y, FM + x];
        if (prev) {
          const gone = west && j >= 9 && k === 4 && h2(j, s + 5) < 0.6;       // the ribs' crowns snapped off
          if (!gone) F.st(prev, p, 0.4 - 0.1 * t, 0.4 - 0.1 * (t + 0.25), MAT.WOOD, 800 + j * 9 + k + s, 6);
        }
        prev = p;
      }
    }
    const tieY = EAVE + 0.25;
    if (!west || h2(j, 3) < 0.3) F.obox(u, FM, tieY, tieY + 0.55, 0.28, HALF - 0.6, PI / 2, MAT.WOOD, 900 + j, { plain: true });
    else for (const s of [-1, 1]) { const L = 2.5 + 3 * h2(j, s + 9); F.obox(u, FM + s * (HALF - 0.6 - L / 2), tieY - (s > 0 ? 0.3 : 0), tieY + 0.55 - (s > 0 ? 0.3 : 0), 0.28, L / 2, PI / 2, MAT.WOOD, 920 + j + s, { plain: true }); }
    if (!west || j < 10) {
      F.obox(u, FM, 25.2, 25.7, 0.25, 5.2, PI / 2, MAT.WOOD, 940 + j, { plain: true });
      F.st([u, 25.2, FM], [u, 29.4, FM], 0.22, 0.2, MAT.WOOD, 960 + j, 6);
    }
  }
  // Purlins and the ridge beam, by bay.
  for (let j = 0; j < 13; j++) {
    const a = TU(j) + 0.1, c = TU(j + 1) - 0.1;
    const lines = [[FM, 29.5], [FM + 6.6, 23.2], [FM - 6.6, 23.2]];
    for (const [f, y] of lines) if (j < 9 || h2(j * 5, f) < 0.65) F.st([a, y, f], [c, y, f], 0.17, 0.17, MAT.WOOD, 980 + j * 3, 5);
  }
  // Chimney stacks on the ridge (the creature's vents), capped with turf.
  [-22, -6, 13].forEach((u, i) => {
    F.box(u - 1.6, u + 1.6, 28.4, 33.4, FM - 1.6, FM + 1.6, S_, 1000 + i, { course: 1.4, solid: false });
    F.box(u - 1.1, u + 1.1, 33.4, 38, FM - 1.1, FM + 1.1, S_, 1010 + i, { course: 1.5, solid: false });
    F.obox(u, FM, 38, 38.6, 1.45, 1.45, 0, S_, 1020 + i, { plain: true, carve: 5 });
    // The turf cap is its own site (manor-vent-N, see ventCap / manorSites) so the fight can blow it off.
  });
  // Under the open roof: fallen slate and timbers, rubble heaps.
  for (let i = 0; i < 14; i++) {
    const s = 1100 + i, u = 3 + 30 * h2(s, 1), f = HF0 + 3 + (HF1 - HF0 - 6) * h2(s, 2);
    F.obox(u, f, 0.3, 0.46, 1.3 + h2(s, 3), 0.7, h2(s, 4) * PI, MAT.SLATE, s, { plain: true, tilt: (h2(s, 5) - 0.5) * 0.5, roll: (h2(s, 6) - 0.5) * 0.4 });
  }
  for (let i = 0; i < 6; i++) {
    const s = 1200 + i, u = 5 + 28 * h2(s, 1), f = HF0 + 4 + (HF1 - HF0 - 8) * h2(s, 2), a = h2(s, 3) * 2 * PI, L = 4.5 + 3 * h2(s, 4);
    F.st([u, 0.55, f], [u + Math.cos(a) * L, 0.55 + 2.2 * h2(s, 5), f + Math.sin(a) * L], 0.26, 0.26, MAT.WOOD, s, 6);
  }
  [[12, -22], [26, -20], [29, -33], [18, -35], [6, -30]].forEach(([u, f], i) => rubble(F, u, f, 3.2, 7, 1300 + i, 0.25));
  // A leaning rib that has not yet fallen: leans from the north wall top to the floor.
  F.st([24, 0.4, -37], [25.4, 15.6, -39.2], 0.34, 0.3, MAT.WOOD, 1400, 6);
  // Rubble at the foot of the exterior, west end.
  [[30, -10], [34, -8], [22, -11]].forEach(([u, f], i) => rubble(F, u, f, 2.5, 5, 1500 + i, 0));
}

/** The one warm window: a GLASS lancet in the hall's facade, lit by the village night glow (a site of its own: the glow is per site). */
function hallLit(F) {
  glaze(F, 'u', -0.7, 0.7, 12, 16.8, HF1 - HT * 0.55, 0, 1, 1);
  F.obox(0, HF1 - HT * 0.55, 11.8, 12, 0.85, 0.2, 0, S_, 1, { plain: true, carve: 5 });
  const [lx, lz] = F.xz(0, HF1 - 3);
  F.b.light(lx, 14.2, lz, 14, 1.0, 0.6, 0.28, 1.3, 'lamp');
}

// ---- the wings ------------------------------------------------------------------------------------

const WALL_T = 1.0, GH = 5.4, UH = 10.4;
/** A timber-framed wall: PLASTER infill (IRON when burnt), WOOD posts, rails, studs and braces on the outer face. */
function framed(F, ax, A0, A1, c0, c1, y0, y1, ops, seed, { dir, burnt = false, hs = 1 }) {
  const cOut = dir > 0 ? c1 : c0, dy = ax === 'u' ? 0 : PI / 2, sg = ax === 'u' ? 1 : -1;
  const ob = (ac, cc, ya, yb, ha, hc, dyy, mat, sd, o = {}) => (ax === 'u' ? F.obox(ac, cc, ya, yb, ha, hc, dyy, mat, sd, o) : F.obox(cc, ac, ya, yb, ha, hc, dyy, mat, sd, o));
  const panel = (a0, a1, ya, yb, sd) => (ax === 'u' ? F.box(a0, a1, ya, yb, c0, c1, burnt ? MAT.IRON : MAT.PLASTER, sd, { plain: true }) : F.box(c0, c1, ya, yb, a0, a1, burnt ? MAT.IRON : MAT.PLASTER, sd, { plain: true }));
  const wood = burnt ? MAT.EMBER : MAT.WOOD;
  const free = (ya, yb) => { // intervals along a free of openings at this height
    let iv = [[A0, A1]];
    for (const w of ops) { if (!(w.y0 < yb && w.y1 > ya)) continue; const n = []; for (const [s, e] of iv) { if (w.a1 <= s || w.a0 >= e) { n.push([s, e]); continue; } if (w.a0 > s) n.push([s, w.a0]); if (w.a1 < e) n.push([w.a1, e]); } iv = n; }
    return iv.filter(([s, e]) => e - s > 0.1);
  };
  const N = Math.max(1, Math.round((A1 - A0) / 1.1)), sp = (A1 - A0) / N;
  if (!burnt) wall(F, ax, A0, A1, c0, c1, y0, y1, ops, seed, { mat: MAT.PLASTER });
  else for (let k = 0; k < N; k++) {                                      // burnt: panels at ragged heights, some gone
    const a0 = A0 + k * sp, a1 = a0 + sp, hf = h2(seed, k) < 0.3 ? 0 : 0.35 + 0.65 * h2(seed + 5, k);
    if (hf <= 0) continue;
    wall(F, ax, a0, a1, c0, c1, y0, y0 + (y1 - y0) * hf, ops, seed * 7 + k, { mat: MAT.IRON });
  }
  const top = (a) => (burnt ? y0 + (y1 - y0) * (h2(seed + 5, Math.min(N - 1, Math.max(0, Math.floor((a - A0) / sp)))) * 0.65 + 0.35) : y1);
  const pr = 0.05; // posts and rails stand proud of the infill
  for (const [s, e] of free(y0, y0 + 0.2)) ob((s + e) / 2, cOut + dir * pr / 2, y0, y0 + 0.2, (e - s) / 2, pr / 2 + 0.01, dy, wood, seed + 1, { plain: true });
  if (!burnt) {
    for (const [s, e] of free(y1 - 0.22, y1)) ob((s + e) / 2, cOut + dir * pr / 2, y1 - 0.22, y1, (e - s) / 2, pr / 2 + 0.01, dy, wood, seed + 2, { plain: true });
    for (const [s, e] of free(y0 + 2.3, y0 + 2.45)) ob((s + e) / 2, cOut + dir * pr / 2, y0 + 2.3, y0 + 2.45, (e - s) / 2, pr / 2 + 0.01, dy, wood, seed + 3, { plain: true });
  }
  for (let k = 0; k <= N; k++) {
    const a = A0 + k * sp, ht = k === 0 || k === N ? 0.2 : 0.07, yt = Math.min(top(a), y1);
    if (burnt && h2(seed + 9, k) < 0.25) continue;
    for (const [s, e] of free(y0 + 0.2, yt)) if (a > s - 0.05 && a < e + 0.05 && yt - y0 > 0.5) ob(a, cOut + dir * pr / 2, y0 + 0.2, yt - (burnt ? 0 : 0.22), ht, pr / 2 + 0.01, dy, wood, seed + 10 + k, { plain: true });
  }
  if (!burnt) for (const e of [0, 1]) {   // corner braces
    const a = e ? A1 - 0.25 : A0 + 0.25, sgn = e ? -1 : 1, len = 1.5;
    if (free(y1 - 1.2 - 0.3, y1 - 0.25).some(([s, t]) => a > s - 0.05 && a + sgn * len < t + 0.05 && a + sgn * len > s - 0.05)) {
      ob(a + sgn * len / 2, cOut + dir * pr / 2, y1 - 0.25 - len / 2 - 0.05, y1 - 0.25 - len / 2 + 0.05, len * 0.72, pr / 2 + 0.01, dy, wood, seed + 30 + e, { plain: true, roll: -sgn * sg * PI / 4 });
    }
  }
  for (const w of ops) {   // window frames and glass
    if (w.y0 < y0 || w.y1 > y1 || w.a0 < A0 || w.a1 > A1 || w.nofit) continue;
    const wa = (w.a0 + w.a1) / 2, ww = w.a1 - w.a0;
    ob(wa, cOut + dir * 0.02, w.y1, w.y1 + 0.12, ww / 2 + 0.1, 0.07, dy, wood, seed + 40, { plain: true });
    ob(wa, cOut + dir * 0.06, w.y0 - 0.1, w.y0, ww / 2 + 0.15, 0.1, dy, wood, seed + 41, { plain: true });
    for (const s of [-1, 1]) ob(wa + s * (ww / 2 + 0.05), cOut + dir * 0.02, w.y0, w.y1, 0.07, 0.07, dy, wood, seed + 42 + s, { plain: true });
    if (!burnt) glaze(F, ax, w.a0, w.a1, w.y0, w.y1, (c0 + c1) / 2, w.state ?? 1, seed + 50);
    if (w.shutter) ob(wa + (ww / 2 + 0.4), cOut + dir * 0.5, w.y0, w.y1, 0.4, 0.04, dy + dir * 0.8 * sg, MAT.PLANK, seed + 44, { plain: true });
  }
}

function wing(F, sgn, burnt) {
  const ulo = sgn > 0 ? 35 : -49, uhi = sgn > 0 ? 49 : -35, uIn = sgn * 35, uOut = sgn * 49, uc = sgn * 42;
  const f0 = -34, f1 = -2, openEnd = !burnt;
  const cr = (a, w) => (a < a + sgn * w ? [a, a + sgn * w] : [a + sgn * w, a]);
  const outC = cr(uOut, -WALL_T), inC = cr(uIn, WALL_T);
  const sd = burnt ? 2000 : 3000;
  // Ground floor, stone. Windows on the outer wall, doors toward the forecourt and the hall.
  const opsOut = []; for (let f = f0 + 5; f < f1 - 3; f += 6) opsOut.push({ a0: f - 0.6, a1: f + 0.6, y0: 1.9, y1: 3.7 });
  const brk = openEnd ? -14 : f1 - 1;
  wall(F, 'f', f0 + WALL_T, brk, outC[0], outC[1], -1.2, GH, opsOut, sd + 1, { course: 1.6, laidTo: 4 });
  if (openEnd) wall(F, 'f', brk, f1 - WALL_T, outC[0], outC[1], -1.2, GH, [], sd + 2, { course: 1.6, laidTo: 4, ruin: 0.75 });
  wall(F, 'u', ulo, uhi, f0, f0 + WALL_T, -1.2, GH, [{ a0: uc - 0.6, a1: uc + 0.6, y0: 1.9, y1: 3.7 }], sd + 3, { course: 1.6, laidTo: 4 });
  wall(F, 'u', ulo, uhi, f1 - WALL_T, f1, -1.2, GH, [{ a0: uc - 1.6, a1: uc + 1.6, y0: -3, y1: 3.9 }, { a0: uc - 5, a1: uc - 3.6, y0: 1.9, y1: 3.7 }, { a0: uc + 3.6, a1: uc + 5, y0: 1.9, y1: 3.7 }], sd + 4, { course: 1.6, laidTo: 4, ruin: openEnd ? 0.8 : 0 });
  wall(F, 'f', -12, f1 - WALL_T, inC[0], inC[1], -1.2, GH, [{ a0: -8.6, a1: -5.4, y0: -3, y1: 3.9 }, { a0: -3.9, a1: -2.7, y0: 1.9, y1: 3.7 }], sd + 5, { course: 1.6, laidTo: 4, ruin: openEnd ? 0.35 : 0 });
  // Stone sills and surrounds on the dressed openings (plain: cheap), a door leaf ajar.
  [f0 + 5, f0 + 11, f0 + 17, f0 + 23].forEach((f, i) => { if (f < f1 - 3) F.obox(uOut + sgn * 0.22, f, 1.6, 1.9, 0.3, 0.9, 0, S_, sd + 10 + i, { plain: true, carve: 5 }); });
  { const dyL = openEnd ? -1.3 : -0.7, cu2 = uc - 1.6 + Math.cos(dyL) * 0.8, cf2 = f1 + 0.1 - Math.sin(dyL) * 0.8;
    F.obox(cu2, cf2, 0.05, 3.7, 0.8, 0.1, dyL, MAT.PLANK, sd + 20, { plain: true });
    F.obox(cu2, cf2, 1.1, 1.3, 0.8, 0.13, dyL, MAT.IRON, sd + 21, { plain: true }); }
  // Floor of the ground storey and the upper floor; collision.
  const fa = f0 + WALL_T, fb = f1 - WALL_T, ua = Math.min(ulo, uhi) + WALL_T, ub = Math.max(ulo, uhi) - WALL_T;
  pave(F, ua, ub, fa, fb, 0.25, 2.2, sd + 30, () => true, burnt ? [[uc, -10, 5]] : [[uc, -6, 5]], MAT.PLANK);
  F.platform(ua, ub, fa, fb, 0.25);
  F.obox(uc, (fa + fb) / 2 + (openEnd ? -6 : 0), GH - 0.25, GH + 0.1, (ub - ua) / 2, (fb - fa) / 2 - (openEnd ? 6 : 0), 0, MAT.WOOD, sd + 31, { plain: true });
  // Upper storey: timber framing on the stone.
  const opsU = (list) => list.map((a) => ({ a0: a - 0.7, a1: a + 0.7, y0: GH + 1.3, y1: GH + 2.9, state: h2(sd + a, 3) < 0.3 ? 0 : h2(sd + a, 4) < 0.6 ? 1 : 2, shutter: h2(sd + a, 5) < 0.4 }));
  const fo = []; for (let f = f0 + 5; f < f1 - 3; f += 5) fo.push(f);
  const upper = (ax, A0, A1, cc, dir, ops, s, o = {}) => {
    const c = ax === 'f' ? (dir > 0 ? [cc - 0.45, cc] : [cc, cc + 0.45]) : (dir > 0 ? [cc - 0.45, cc] : [cc, cc + 0.45]);
    framed(F, ax, A0, A1, c[0], c[1], GH, UH, ops, s, { dir, burnt, ...o });
  };
  const uOutFace = uOut - sgn * 0.0;
  upper('f', f0 + WALL_T, openEnd ? -14 : f1 - WALL_T, uOutFace, sgn, opsU(fo.filter((f) => !openEnd || f < -15)), sd + 40);
  upper('u', ulo, uhi, f0, -1, opsU([uc]), sd + 41);
  upper('f', -12, openEnd ? -9 : f1 - WALL_T, uIn, -sgn, [], sd + 42);
  if (!openEnd) upper('u', ulo, uhi, f1, 1, opsU([uc - 3.5, uc, uc + 3.5]), sd + 43);
  // Roof along f: slate bays on the west wing, charred rafters on the burnt east wing.
  const run = 7.9, rise = 7.7, yR = UH + 6.8;
  if (!burnt) {
    const nb = 6, bl = (f1 - f0 + 1.6) / nb, stateW = [0, 0, 1, 1, 2, 2];
    for (let k = 0; k < nb; k++) for (const desc of [1, -1]) {
      slopeSlabs(F, { alongU: false, cm: uc, yR, run, rise, descend: desc, r0: f0 - 0.8 + k * bl, r1: f0 - 0.8 + (k + 1) * bl, strips: stripsFor(stateW[k], 3, sd + k * 5 + (desc > 0 ? 1 : 0)), seed: sd + 60 + k });
    }
    F.blocker(Math.min(uc - 8.5, uc + 8.5), Math.max(uc - 8.5, uc + 8.5), UH - 0.2, yR + 0.4, f0 - 0.8, f0 - 0.8 + 2 * bl, { cam: true });
    for (let k = 0; k <= nb; k++) {
      const f = f0 - 0.8 + k * bl;
      if (f > f1 - 8 && k > 4) continue;
      for (const s of [-1, 1]) F.st([uc + s * (run - 0.3), UH - 0.2, f], [uc, yR - 0.2, f], 0.22, 0.18, MAT.WOOD, sd + 70 + k * 2 + s, 6);
      F.obox(uc, f, UH - 0.1, UH + 0.35, run - 0.5, 0.2, 0, MAT.WOOD, sd + 90 + k, { plain: true });
    }
    // Back gable.
    F.tri([uc - 7.1, UH, f0 + 0.1], [uc + 7.1, UH, f0 + 0.1], [uc, yR - 0.6, f0 + 0.1], MAT.PLASTER, sd + 100);
    for (const du of [-4.8, -2.4, 0, 2.4, 4.8]) F.obox(uc + du, f0 + 0.17, UH, UH + (7.1 - Math.abs(du)) * 0.93 - 0.6, 0.07, 0.07, 0, MAT.WOOD, sd + 101, { plain: true });
  } else {
    // Rafters burnt to stumps and a few spars; the roof gone.
    for (let f = f0; f <= f1 - 1; f += 1.9) for (const s of [-1, 1]) {
      const r = h2(sd + f * 3, s + 3);
      if (r < 0.35) continue;
      const t = 0.3 + 0.7 * r;
      F.st([uc + s * (run - 0.3), UH - 0.1, f], [uc + s * (run - 0.3) * (1 - t), UH - 0.1 + (yR - UH) * t, f], 0.17, 0.12, MAT.EMBER, sd + 110 + f, 5);
    }
    F.st([uc, yR - 0.3, f0 + 2], [uc, yR - 0.3, f0 + 11], 0.2, 0.2, MAT.EMBER, sd + 120, 5);
    F.tri([uc - 7.1, UH, f0 + 0.1], [uc, yR - 0.6, f0 + 0.1], [uc - 2.6, UH, f0 + 0.1], MAT.IRON, sd + 121);
    // Soot above every window of the ground floor: dark streaks up the stone, fire damage round the openings.
    for (const f of fo) { const x = uOut - sgn * 0.0; F.quad([x + sgn * 0.03, 3.7, f - 0.9], [x + sgn * 0.03, 3.7, f + 0.9], [x + sgn * 0.03, GH + 0.6, f + 0.5], [x + sgn * 0.03, GH + 0.6, f - 0.5], MAT.IRON, sd + 130 + f); }
    for (const f of [-8.5, -4]) F.quad([uIn - sgn * 0.03, 3.9, f - 1], [uIn - sgn * 0.03, 3.9, f + 1], [uIn - sgn * 0.03, GH + 0.5, f + 0.7], [uIn - sgn * 0.03, GH + 0.5, f - 0.7], MAT.IRON, sd + 140 + f);
    // Charred beams fallen across the interior.
    for (let i = 0; i < 7; i++) { const s = sd + 150 + i, f = f0 + 3 + 28 * h2(s, 1), u = uc + (h2(s, 2) - 0.5) * 8; F.st([u - 3, 0.5, f], [u + 3, 0.5 + 1.3 * h2(s, 3), f + 2 * (h2(s, 4) - 0.5)], 0.2, 0.2, MAT.EMBER, s, 5); }
    rubble(F, uc, -12, 4, 6, sd + 160, 0.25);
  }
  if (openEnd) {
    // The open end: the front gable down in a fan of rubble and charred...no: fallen slate and broken timbers.
    rubble(F, uc, f1 + 1, 6, 14, sd + 170, 0);
    rubble(F, uc, -12, 4, 8, sd + 171, 0.25);
    for (let i = 0; i < 5; i++) { const s = sd + 180 + i, f = -20 + 16 * h2(s, 1), u = uc + (h2(s, 2) - 0.5) * 8; F.st([u, 0.4, f], [u + 3.5 * (h2(s, 3) - 0.5), 1.6, f + 3.5], 0.22, 0.2, MAT.WOOD, s, 6); }
    for (let i = 0; i < 6; i++) { const s = sd + 190 + i; F.obox(uc + (h2(s, 1) - 0.5) * 9, -16 + 13 * h2(s, 2), 0.3, 0.42, 1.0 + h2(s, 3) * 0.4, 0.55, h2(s, 4) * PI, MAT.SLATE, s, { plain: true, tilt: (h2(s, 5) - 0.5) * 0.4 }); }
  }
}

// ---- towers ---------------------------------------------------------------------------------------

/** A round tower at (cu, cf): a polygon of n facets, outer radius Rc, to height H. Laid stone to LAY m and above the last
 *  TOP m, drawn courses between (carve 5); lean (rad, toward leanDir in the manor frame) steps each 4 m section; the roof is a
 *  slate cone (coneH) or gone (ruin 0..1 of the crown). */
function tower(F, cu, cf, Rc, H, o = {}) {
  const n = o.n ?? 12, sd = o.seed, lean = o.lean || 0, ld = o.leanDir || [0, 1], T = 1.6, LAY = o.lay ?? 8, TOP = o.top ?? 5;
  const ap = Rc * Math.cos(PI / n), hl = Rc * Math.sin(PI / n) + 0.12, b = F.b;
  const off = (y) => [ld[0] * Math.tan(lean) * y, ld[1] * Math.tan(lean) * y];
  const facet = (i, y0, y1, laid, ruin, k) => {
    const a = (i + 0.5) / n * 2 * PI + (o.phase || 0), dy = PI / 2 - a, [ou, of] = off((y0 + y1) / 2);
    const rc = ap - T / 2, [x, z] = F.xz(cu + ou + Math.cos(a) * rc, cf + of + Math.sin(a) * rc), yaw = F.facing + dy;
    if (laid) {
      layWall(b, x, z, y0, y1, hl, T / 2, yaw, S_, sd * 97 + i * 13 + k, { outer: true, course: 2.8, blockLen: 2.4, ruin });
      b.blockers.push({ site: b.site, kind: 'box', x, z, hx: hl + 0.05, hz: T / 2 + 0.05, cos: Math.cos(yaw), sin: Math.sin(yaw), y0, y1 });
    } else b.box(x, z, y0, y1, hl, T / 2, yaw, S_, sd * 97 + i * 13 + k, { plain: true, carve: 5, ...NS });
  };
  // Footing: a battered drum into the slope.
  for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * 2 * PI, [x, z] = F.xz(cu + Math.cos(a) * (ap - 0.6), cf + Math.sin(a) * (ap - 0.6)); b.box(x, z, -12, 0.5, hl + 0.3, 1.1, F.facing + PI / 2 - a, S_, sd + i, { plain: true, carve: 5, solid: false, ...NS }); }
  const secs = []; // [y0, y1, laid]
  for (const [ra, rb, laid] of [[0, Math.min(LAY, H), true], [LAY, H - TOP, false], [H - TOP, H, true]]) {
    if (rb <= ra + 1e-3) continue;
    const st = lean ? 4 : rb - ra;
    for (let y = ra; y < rb - 1e-3; y += st) secs.push([y, Math.min(rb, y + st), laid]);
  }
  secs.forEach(([y0, y1, laid], k) => { for (let i = 0; i < n; i++) facet(i, y0, y1, laid, laid && y1 >= H - 1e-3 && o.ruinTop ? o.ruinTop : 0, k); });
  // Slits and belfry openings: dark recesses with a stone surround.
  const slitAt = (i, y, wd, ht, rec = true) => {
    const a = (i + 0.5) / n * 2 * PI + (o.phase || 0), [ou, of] = off(y + ht / 2), rr = ap + 0.03;
    const cx = cu + ou + Math.cos(a) * rr, cz = cf + of + Math.sin(a) * rr, tx = -Math.sin(a), tz = Math.cos(a);
    F.quad([cx - tx * wd, y, cz - tz * wd], [cx + tx * wd, y, cz + tz * wd], [cx + tx * wd, y + ht, cz + tz * wd], [cx - tx * wd, y + ht, cz - tz * wd], MAT.IRON, sd + i);
    const dy = PI / 2 - a;
    F.obox(cx + Math.cos(a) * 0.1, cz + Math.sin(a) * 0.1, y + ht, y + ht + 0.3, wd + 0.25, 0.22, dy, S_, sd + i * 3, { plain: true, carve: 5 });
    F.obox(cx + Math.cos(a) * 0.1, cz + Math.sin(a) * 0.1, y - 0.28, y, wd + 0.3, 0.26, dy, S_, sd + i * 3 + 1, { plain: true, carve: 5 });
  };
  [[4, 6, 0.28, 2.0], [10, 8, 0.28, 2.0], [1, 13, 0.3, 2.2], [7, 20, 0.3, 2.2], [3, 26, 0.3, 2.2], [9, 31, 0.3, 2.2]].forEach(([i, y, w, h]) => { if (y + h < H - 4) slitAt(i, y, w, h); });
  if (H > 30) for (const i of [0, 3, 6, 9]) slitAt(i, H - TOP + 1.5, 0.7, 3.0);
  // Cornice and the roof.
  const [ou, of] = off(H);
  if (o.coneH) {
    const E = Rc + 1.0;
    for (let i = 0; i < n; i++) {
      const a0 = i / n * 2 * PI + (o.phase || 0), a1 = (i + 1) / n * 2 * PI + (o.phase || 0);
      const P0 = [cu + ou + Math.cos(a0) * (Rc + 0.35), H - 0.2, cf + of + Math.sin(a0) * (Rc + 0.35)], P1 = [cu + ou + Math.cos(a1) * (Rc + 0.35), H - 0.2, cf + of + Math.sin(a1) * (Rc + 0.35)];
      const Q0 = [cu + ou + Math.cos(a0) * E, H - 0.9, cf + of + Math.sin(a0) * E], Q1 = [cu + ou + Math.cos(a1) * E, H - 0.9, cf + of + Math.sin(a1) * E];
      const m0 = [cu + ou + Math.cos(a0) * E * 0.5, H + o.coneH * 0.48, cf + of + Math.sin(a0) * E * 0.5], m1 = [cu + ou + Math.cos(a1) * E * 0.5, H + o.coneH * 0.48, cf + of + Math.sin(a1) * E * 0.5];
      const ap_ = [cu + ou, H + o.coneH, cf + of];
      const gone = o.coneGone && o.coneGone(i);
      if (!gone || gone === 2) F.quad(Q1, Q0, m0, m1, MAT.SLATE, sd * 3 + i);
      if (!gone || gone === 1) F.tri(m1, m0, ap_, MAT.SLATE, sd * 3 + i + 40);
      F.obox(cu + ou + Math.cos((a0 + a1) / 2) * (Rc + 0.15), cf + of + Math.sin((a0 + a1) / 2) * (Rc + 0.15), H - 1.3, H - 0.1, hl + 0.1, 0.4, PI / 2 - (a0 + a1) / 2, S_, sd + i * 5, { plain: true, carve: 5 });
    }
    F.st([cu + ou, H + o.coneH - 0.4, cf + of], [cu + ou + 0.2, H + o.coneH + 2.6, cf + of], 0.09, 0.03, MAT.IRON, sd + 77, 5);
    F.b.blockers.push({ site: F.b.site, kind: 'circle', ...(() => { const [x, z] = F.xz(cu + ou, cf + of); return { x, z }; })(), r: E, y0: H - 1, y1: H + o.coneH, cam: true });
  } else {
    // Roofless: the crown is ragged, a few spars of the old roof stand, the floor timbers show.
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * 2 * PI + 0.4, r = Rc - 1.2;
      F.st([cu + ou + Math.cos(a) * r, H - 0.8, cf + of + Math.sin(a) * r], [cu + ou + Math.cos(a + 0.5) * r * 0.35, H + 2.5 + 3 * h2(sd, k), cf + of + Math.sin(a + 0.5) * r * 0.35], 0.24, 0.16, MAT.WOOD, sd + 200 + k, 6);
    }
    F.obox(cu + ou, cf + of, H - 2.6, H - 2.2, Rc - 1.3, 0.28, 0.5, MAT.WOOD, sd + 210, { plain: true });
    F.obox(cu + ou, cf + of, H - 2.2, H - 1.8, 0.28, Rc - 1.3, 0.5, MAT.WOOD, sd + 211, { plain: true });
  }
  rubble(F, cu, cf, Rc + 2.5, 7, sd + 300, 0);
}

// ---- gatehouse, forecourt ---------------------------------------------------------------------------

const GF0 = 53.6, GF1 = 59.6, GU = 5;
function gatehouse(F) {
  // Two square towers with slit windows, an arch between them carrying a wall-walk.
  const tw = (u0, u1, sd, roofState) => {
    wall(F, 'u', u0, u1, GF0, GF0 + 1.2, -1.2, 17, [{ a0: (u0 + u1) / 2 - 0.3, a1: (u0 + u1) / 2 + 0.3, y0: 6.5, y1: 9 }], sd, { course: 1.8, laidTo: 6 });
    wall(F, 'u', u0, u1, GF1 - 1.2, GF1, -1.2, 17, [{ a0: (u0 + u1) / 2 - 0.3, a1: (u0 + u1) / 2 + 0.3, y0: 6.5, y1: 9 }, { a0: (u0 + u1) / 2 - 0.3, a1: (u0 + u1) / 2 + 0.3, y0: 12, y1: 14.4 }], sd + 1, { course: 1.8, laidTo: 6 });
    wall(F, 'f', GF0 + 1.2, GF1 - 1.2, u0, u0 + 1.2, -1.2, 17, [{ a0: 56.2, a1: 57, y0: 8, y1: 10.5 }], sd + 2, { course: 1.8, laidTo: 6, ruin: roofState ? 0.3 : 0 });
    wall(F, 'f', GF0 + 1.2, GF1 - 1.2, u1 - 1.2, u1, -1.2, 17, [{ a0: 56.2, a1: 57, y0: 8, y1: 10.5 }], sd + 3, { course: 1.8, laidTo: 6, ruin: roofState ? 0.3 : 0 });
    F.obox((u0 + u1) / 2, (GF0 + GF1) / 2, 16.6, 17.2, (u1 - u0) / 2 + 0.7, (GF1 - GF0) / 2 + 0.7, 0, S_, sd + 4, { plain: true, carve: 5 });
    const uc = (u0 + u1) / 2, fc = (GF0 + GF1) / 2, hw = (u1 - u0) / 2 + 0.9, hd = (GF1 - GF0) / 2 + 0.9, y0 = 17.2, ap = [uc, y0 + 8.5, fc];
    const cs = [[uc - hw, y0, fc - hd], [uc + hw, y0, fc - hd], [uc + hw, y0, fc + hd], [uc - hw, y0, fc + hd]];
    for (let k = 0; k < 4; k++) {
      const a = cs[k], c = cs[(k + 1) % 4], m = (a2, c2, t) => [a2[0] + (ap[0] - a2[0]) * t, a2[1] + (ap[1] - a2[1]) * t, a2[2] + (ap[2] - a2[2]) * t];
      if (roofState === 1 && k === 1) { F.tri(m(a, a, 0.55), m(c, c, 0.55), ap, MAT.SLATE, sd + 10 + k); continue; }   // lower half of this facet gone
      if (roofState === 2) continue;
      F.quad(c, a, m(a, a, 0.55), m(c, c, 0.55), MAT.SLATE, sd + 10 + k);
      F.tri(m(c, c, 0.55), m(a, a, 0.55), ap, MAT.SLATE, sd + 14 + k);
    }
    if (roofState === 2) {
      for (let k = 0; k < 4; k++) F.st([cs[k][0] * 0.85 + uc * 0.15, 17, cs[k][2] * 0.85 + fc * 0.15], [uc + (k - 1.5) * 0.7, 17 + 4 + 2 * h2(sd, k), fc], 0.2, 0.15, MAT.WOOD, sd + 20 + k, 6);
    }
    F.b.blockers.push({ site: F.b.site, kind: 'box', ...(() => { const [x, z] = F.xz(uc, fc); return { x, z }; })(), hx: hw, hz: hd, cos: Math.cos(F.facing), sin: Math.sin(F.facing), y0: 16.6, y1: 26, cam: true });
  };
  tw(-14, -GU, 4000, 0);
  tw(GU, 14, 4100, 1);
  // The arch: a wall over the passage (soffit at 8 m), voussoirs on both faces, the wall-walk parapet broken.
  for (const [c0, c1, dir] of [[GF0 + 0.8, GF0 + 2.2, -1], [GF1 - 2.2, GF1 - 0.8, 1]]) wall(F, 'u', -GU, GU, c0, c1, 8, 16.2, [], 4200 + dir, { course: 1.8, laidTo: 6 });
  F.box(-GU, GU, 8, 8.5, GF0 + 2.2, GF1 - 2.2, S_, 4210, { solid: false, plain: true, carve: 5 });
  archRing(F, 0, GF0, -1, 8, 4.4, 5.4, 0.5, 11, 4220);
  archRing(F, 0, GF1, 1, 8, 4.4, 5.4, 0.5, 11, 4240, (k) => k === 6);
  for (let i = 0; i < 6; i++) { if (h2(4300, i) < 0.35) continue; const u = -GU + 0.9 + i * 1.62; F.box(u - 0.5, u + 0.5, 16.2, 17.2, GF1 - 1.0, GF1 - 0.4, S_, 4300 + i, { solid: false }); }
  // Gates: one leaf hanging on its strap, the other fallen across the passage floor (low, not solid).
  F.obox(-GU + 1.1, GF1 - 1.9, 0.05, 6.8, 1.1, 0.12, -1.2, MAT.PLANK, 4400, { plain: true, roll: 0.05 });
  F.obox(-GU + 1.1, GF1 - 1.9, 1.5, 1.72, 1.1, 0.16, -1.2, MAT.IRON, 4401, { plain: true });
  F.obox(2.4, 56.4, 0.1, 0.38, 2.2, 1.1, 0.5, MAT.PLANK, 4402, { plain: true, tilt: 0.1 });
  rubble(F, 6.5, GF1 + 2.5, 3, 6, 4500, 0); rubble(F, -9, GF0 - 2.5, 3, 5, 4510, 0);
}

const fcKeep = (u, f) => Math.abs(u) < 45 && f > -11.8 && f < 52.5 && !(Math.abs(u) > 35 && f < -2) && padE(u, f) < 0.975 && !(Math.hypot(u, f - 26) < 5.6) && !(Math.abs(u) < GU + 0.5 && f > 52.5);
const FC_PATCHES = [[-12, 8, 6], [18, 14, 7], [-26, 30, 6], [8, 38, 7], [30, 40, 5], [0, 50, 5], [-3, 3, 4], [25, 0, 5]];
/** 0..1 how paved the forecourt is at world (x, z): 1 on whole slabs, falling to 0 in the broken patches
 *  (turf comes through) and off the paving. The bake paints it into the village mask (paved: no grass
 *  through the slabs; tools/bake-world/villageMask.mjs). */
export function forecourtPaving(x, z) {
  const dx = x - MANOR.centre[0], dz = z - MANOR.centre[1], c = Math.cos(FACING), s = Math.sin(FACING);
  const u = dx * c - dz * s, f = dx * s + dz * c;
  if (!fcKeep(u, f)) return 0;
  let p = 0; for (const [pu, pf, pr] of FC_PATCHES) p = Math.max(p, 1 - Math.hypot(u - pu, f - pf) / pr);
  return 1 - Math.min(1, Math.max(0, (p - 0.15) / 0.45));
}
/** The forecourt's extent in world space (for the mask's bounds). */
export function forecourtBounds() {
  const pts = [[-45, -12], [45, -12], [-45, 52.5], [45, 52.5]].map(([u, f]) => manorWorld(u, f));
  return { x0: Math.min(...pts.map((q) => q[0])), x1: Math.max(...pts.map((q) => q[0])), z0: Math.min(...pts.map((q) => q[1])), z1: Math.max(...pts.map((q) => q[1])) };
}

function forecourt(F) {
  pave(F, -45, 45, -11.8, 52.5, 0.03, 1.0, 51, fcKeep, FC_PATCHES);
  // A band of different slab (the processional way) is just the patches' absence: keep it plain.
  // Edge wall: a low parapet along the pad's edge with a retaining wall below, broken in places, open at the gate.
  const pts = [];
  for (let a = 0; a < 360; a += 2.5) {
    const r = a * PI / 180, dx = MANOR.pad[0] * 0.972 * Math.cos(r), dz = MANOR.pad[1] * 0.972 * Math.sin(r);
    const s = Math.sin(FACING), c = Math.cos(FACING), u = dx * c - dz * s, f = dx * s + dz * c;
    pts.push([u, f, f > -3 && f < 56 && !(Math.abs(u) < 17 && f > 40)]);
  }
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    if (!p[2] || !q[2]) continue;
    const du = q[0] - p[0], df = q[1] - p[1], len = Math.hypot(du, df), uc = (p[0] + q[0]) / 2, fc = (p[1] + q[1]) / 2, dyw = Math.atan2(-df, du);
    F.obox(uc, fc, -9, 0, len / 2 + 0.05, 0.55, dyw, S_, 5000 + i, { plain: true, carve: 5 });
    if (h2(5100, i) < 0.18) continue;
    F.obox(uc, fc, 0, 1.5, len / 2 + 0.05, 0.4, dyw, S_, 5100 + i, { solid: true, ruin: h2(5200, i) < 0.4 ? 0.5 : 0.1, course: 1.5 });
  }
  // Plinths and statues down the approach: some standing, one headless, some toppled.
  const statue = (u, f, kind, sd) => {
    F.box(u - 1.1, u + 1.1, 0, 1.5, f - 1.1, f + 1.1, S_, sd, { course: 0.75 });
    F.obox(u, f, 1.5, 1.8, 1.3, 1.3, 0, S_, sd + 1, { plain: true, carve: 5 });
    const [x, z] = F.xz(u, f);
    if (kind === 'stand' || kind === 'headless') {
      F.b.drum(x, z, 1.8, 4.2, 0.62, 0.42, 10, S_, sd + 2, { solid: false });
      F.obox(u, f, 4.2, 4.7, 0.55, 0.3, 0.3, S_, sd + 3, { plain: true, carve: 5 });
      if (kind === 'stand') F.b.drum(x, z, 4.7, 5.25, 0.27, 0.25, 8, S_, sd + 4, { solid: false });
      F.obox(u + 0.5, f + 0.1, 3.3, 4.5, 0.12, 0.12, 0, S_, sd + 5, { plain: true, roll: -0.5 });
    } else {                       // toppled: the figure lies on the paving beside the plinth, its head apart
      F.b.drum(x + 1.8, z + 0.6, 0.02, 2.6, 0.5, 0.36, 9, S_, sd + 2, { lie: 1, yaw: F.facing + 0.8, solid: false });
      F.b.drum(x + 3.2, z + 2.1, 0.02, 0.55, 0.26, 0.26, 8, S_, sd + 4, { lie: 1, yaw: F.facing + 2.0, solid: false });
      F.obox(u, f, 1.8, 2.2, 0.8, 0.8, 0.3, S_, sd + 6, { plain: true, tilt: 0.08 });
    }
  };
  [[-17, 6, 'stand'], [17, 6, 'topple'], [-24, 22, 'topple'], [24, 22, 'headless'], [-15, 40, 'stand'], [15, 40, 'topple']].forEach(([u, f, k], i) => statue(u, f, k, 5300 + i * 20));
  // The dry fountain: an octagonal basin, a pedestal and a bowl half gone.
  const R = 5.6, nF = 10;
  for (let i = 0; i < nF; i++) {
    if (i === 3) continue;
    const a = (i + 0.5) / nF * 2 * PI, hl = R * Math.sin(PI / nF) + 0.15;
    F.obox(Math.cos(a) * R, 26 + Math.sin(a) * R, -0.1, 1.1 - (i === 4 ? 0.5 : 0), hl, 0.45, PI / 2 - a, S_, 5600 + i, { solid: true, course: 0.5, ruin: i % 3 === 0 ? 0.3 : 0 });
  }
  { const [x, z] = F.xz(0, 26);
    F.b.drum(x, z, 0.05, 0.4, 3.6, 3.6, 16, S_, 5620, { solid: false });
    F.b.drum(x, z, 0.4, 2.1, 0.9, 0.55, 12, S_, 5621);
    F.b.drum(x, z, 2.1, 2.9, 0.5, 1.8, 14, S_, 5622, { solid: false, broken: 0.35 });
    F.obox(1.5, 27.2, 0.4, 1.0, 0.7, 0.5, 0.7, S_, 5623, { plain: true, tilt: 0.2 }); }
  rubble(F, 0, 26, 4.5, 6, 5630, 0.1);
  // Dead lamp posts along the way (no light): iron, a few leaning, a cage each.
  [[-8, 4], [8, 4], [-8, 18], [8, 18], [-8, 34], [8, 34], [-8, 47], [8, 47]].forEach(([u, f], i) => {
    const lean = (h2(5700, i) - 0.5) * 0.35, hh = 3.6 - (i % 3 === 0 ? 1.2 : 0);
    F.st([u, 0, f], [u + lean * hh, hh, f], 0.1, 0.07, MAT.IRON, 5700 + i, 6);
    F.obox(u + lean * hh, f, hh, hh + 0.5, 0.2, 0.2, 0.3, MAT.IRON, 5710 + i, { plain: true });
  });
  // Weeds of rubble beside the way, and fallen masonry from the hall's front.
  rubble(F, -22, -6, 3, 6, 5800, 0); rubble(F, 10, -9, 3.5, 7, 5810, 0); rubble(F, 28, -5, 3, 5, 5820, 0);
}

/** The turf cap that seals chimney stack i (u = VENT_U[i]) in the hall's frame: a site of its own, hidden when stripped. */
export const VENT_U = [-22, -6, 13];
export const VENT_Y = 38.6;
function ventCap(F, i) {
  const u = VENT_U[i];
  turf(F, u, VENT_Y, FM, 1.35, 1.1 + 0.5 * h2(i, 2), 1030 + i * 10);
  F.obox(u + 0.5, FM - 0.3, VENT_Y, 39.4, 0.35, 0.35, 0.4, MAT.EARTH, 1040 + i, { plain: true });
}

// ---- the sites ------------------------------------------------------------------------------------------

/** The manor's sites, to be appended after the village's (each seated at MANOR.y). */
export function manorSites() {
  // The house stands back on the west rim (BACK m behind the pad centre), so its back wall and towers
  // rise straight above the slope the village looks up at, on battered footings running down into the
  // hill (nothing floats where the rim falls away); the gate and the forecourt stay at the stair.
  const mk = (id, ou, of, footprint, build, extra = {}) => {
    const back = extra.back ? BACK : 0; // drawn in the manor frame as before, the site moved back
    return { id, at: manorWorld(ou, of - back), facing: FACING, footprint, seatAt: 'center', seatY: MANOR.y,
      build: (b, facing) => { const F = new Fr(b, facing, [ou, of]); build(F, b); if (extra.footing) extra.footing(F); }, ...extra };
  };
  return [
    mk('manor-forecourt', 0, 20, 62, forecourt),
    mk('manor-hall', 0, -26,  42, hall, { back: true, footing: (F) => F.obox(0, -26, -40, 0.2, 36.5, 15, 0, MAT.STONE, 900, { plain: true, carve: 5 }) }),
    mk('manor-hall-lit', 0, -26,  4, hallLit, { windows: true, back: true }),
    mk('manor-wing-e', -42, -20,  22, (F) => wing(F, -1, true), { back: true, footing: (F) => F.obox(-42, -20, -40, 0.2, 9, 22, 0, MAT.STONE, 901, { plain: true, carve: 5 }) }),
    mk('manor-wing-w', 42, -18,  22, (F) => wing(F, 1, false), { back: true, footing: (F) => F.obox(42, -18, -40, 0.2, 9, 22, 0, MAT.STONE, 902, { plain: true, carve: 5 }) }),
    mk('manor-tower-1', -36, -43,  12, (F) => tower(F, -36, -43, 6.2, 58, { seed: 11, coneH: 12.5, coneGone: (i) => (i === 3 ? 1 : 0) }), { back: true, footing: (F) => F.b.drum(...F.xz(-36, -43), -40, 0.3, 8.4, 6.7, 14, MAT.STONE, 903, { solid: false }) }),
    mk('manor-tower-2', 37, -42,  12, (F) => tower(F, 37, -42, 6.2, 64, { seed: 12, lean: 4 * PI / 180, leanDir: [0.8, 0.6], ruinTop: 0.45, lay: 8, top: 7 }), { back: true, footing: (F) => F.b.drum(...F.xz(37, -42), -40, 0.3, 8.4, 6.7, 14, MAT.STONE, 904, { solid: false }) }),
    mk('manor-tower-3', -46, -1,  11, (F) => tower(F, -46, -1, 5.2, 46, { seed: 13, coneH: 10.5, lay: 8, top: 5, coneGone: (i) => (i === 8 ? 2 : 0) }), { back: true, footing: (F) => F.b.drum(...F.xz(-46, -1), -40, 0.3, 6.6, 5.1, 14, MAT.STONE, 905, { solid: false }) }),
    mk('manor-tower-4', 31, -9,  11, (F) => tower(F, 31, -9, 5.2, 50, { seed: 14, coneH: 11, lay: 8, top: 5 }), { back: true, footing: (F) => F.b.drum(...F.xz(31, -9), -40, 0.3, 6.6, 5.1, 14, MAT.STONE, 906, { solid: false }) }),
    mk('manor-gate', 0, 56.6, 20, gatehouse),
    // The three chimney turf caps (appended: the sites above keep their indices).
    ...VENT_U.map((u, i) => mk('manor-vent-' + i, u, -26, 4, (F) => ventCap(F, i), { back: true, vent: true })),
  ];
}
