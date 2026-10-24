// The monumental stair up the meadow's great hill (docs/village/brief.md §4): real stone steps,
// paved landings, parapets and retaining walls, stone lanterns that grow more formal toward the
// top, and a carved gate at the summit. Pure geometry on the architecture Builder, in sites of
// ~30 m each (so chunk culling works), plus the analytic run segments that collision uses
// (world/solids.js: a stepped floor along each segment).
//
//   stairSegments(route)      -> [{ x0, z0, x1, z1, halfWidth, y0, y1, tread, ... }]  (pure)
//   stairSites(route, h)      -> architecture sites (appended after the village's)
//   loadBakedHeight(base, route) -> h(x, z) from the baked 2 m height tiles (for the wall heights)
//
// The bake grades the terrain to the route (tools/bake-world/hill.mjs carveHill: flights a constant
// ramp, landings flat, floor = the dense path's height at the nearest route point), so a tread
// stands on the graded ground: every tread top is at or above the ramp under it (quantised up).
// Each site is seated at an explicit absolute height (`seatY`, systems/architecture.js), not by a
// ground query — on a slope a site's centre height is the wrong seat for its ends.

import { chamferBlock, layWall, h2 } from './masonry.js';
import { MAT, NS } from './architecture.js';
import { stairPath, STAIR } from '../../tools/bake-world/hill.mjs';

/** Target riser height (m); a flight's actual rise is its height change over a whole number of steps. */
export const STEP_RISE = 0.18;
/** Treads per collision/render chord. */
const CHORD_STEPS = 4;
/** Landing chord length (m). */
const LAND_CHORD = 5.5;
/** Site length target (m). */
const SITE_LEN = 28;
/** Visual lift of walking surfaces over the analytic ones (m): the terrain graded beneath never z-fights. */
const LIFT = 0.012;
/** Flights gentler than this (rise per metre) are ramps: shallow paved steps of RAMP_TREAD. */
const RAMP_SLOPE = 0.1, RAMP_TREAD = 0.9;

const sq = (v) => v * v;

/**
 * The stair as straight chords with a stepped floor each: flights are cut into chords of up to
 * four treads (equal treads and rises inside a chord), landings into flat chords ~5 m long.
 * Floor at distance d along a chord (within halfWidth of its axis): y0 + (y1 − y0) · ceil(d / tread) / m,
 * m = round(length / tread) (a landing: m = 1 and y0 = y1).
 * Extra fields: kind ('flight' | 'landing'), run (index), s0 / s1 (route arc length at the ends).
 */
export function stairSegments(route) {
  return analyse(route).segs;
}

function analyse(route) {
  const P = route && route.path ? route.path : stairPath();
  const n = P.length, s = new Float64Array(n);
  for (let k = 1; k < n; k++) s[k] = s[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
  const total = s[n - 1];
  const halfAt = (arc) => STAIR.halfFoot + (STAIR.halfTop - STAIR.halfFoot) * (arc / total);
  // Runs: consecutive chords of the dense path of one kind. A chord's kind is its end point's (flight / landing);
  // a "flight" chord gentler than RAMP_SLOPE (the approach from the street) is a ramp, paved with shallow steps.
  const runs = [];
  for (let k = 1; k < n; k++) {
    const len = s[k] - s[k - 1], slope = (P[k][2] - P[k - 1][2]) / (len || 1);
    const kind = P[k][3] !== 0 ? 'landing' : slope < RAMP_SLOPE ? 'ramp' : 'flight';
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.b = k; else runs.push({ kind, a: k - 1, b: k });
  }
  /** Position along the dense path at arc length t. */
  let hint = 0;
  const at = (t) => {
    if (t <= 0) return [P[0][0], P[0][1], P[0][2]];
    if (t >= total) return [P[n - 1][0], P[n - 1][1], P[n - 1][2]];
    if (s[hint] > t) hint = 0;
    while (hint < n - 2 && s[hint + 1] < t) hint++;
    const u = (t - s[hint]) / (s[hint + 1] - s[hint] || 1);
    return [P[hint][0] + (P[hint + 1][0] - P[hint][0]) * u, P[hint][1] + (P[hint + 1][1] - P[hint][1]) * u, P[hint][2] + (P[hint + 1][2] - P[hint][2]) * u];
  };
  const segs = [];
  let flightNo = 0, landingNo = 0;
  runs.forEach((run, ri) => {
    const sa = s[run.a], sb = s[run.b], ya = P[run.a][2], yb = P[run.b][2];
    run.s0 = sa; run.s1 = sb; run.y0 = ya; run.y1 = yb;
    if (run.kind === 'flight') {
      run.no = flightNo++;
      const steps = Math.max(1, Math.round((yb - ya) / STEP_RISE)), rise = (yb - ya) / steps;
      run.steps = steps; run.rise = rise;
      // Where the ramp crosses each riser height.
      const edge = new Float64Array(steps + 1);
      edge[0] = sa; edge[steps] = sb;
      let k = run.a;
      for (let i = 1; i < steps; i++) {
        const y = ya + i * rise;
        while (k < run.b - 1 && P[k + 1][2] < y) k++;
        const dy = P[k + 1][2] - P[k][2];
        edge[i] = s[k] + (s[k + 1] - s[k]) * (dy > 1e-9 ? (y - P[k][2]) / dy : 0);
      }
      const nCh = Math.ceil(steps / CHORD_STEPS);
      for (let c = 0; c < nCh; c++) {
        const i0 = Math.round(c * steps / nCh), i1 = Math.round((c + 1) * steps / nCh), m = i1 - i0;
        if (m < 1) continue;
        const p0 = at(edge[i0]), p1 = at(edge[i1]), len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        segs.push({ x0: p0[0], z0: p0[1], x1: p1[0], z1: p1[1], halfWidth: halfAt((edge[i0] + edge[i1]) / 2), y0: ya + i0 * rise, y1: ya + i1 * rise, tread: len / m, kind: 'flight', run: ri, s0: edge[i0], s1: edge[i1] });
      }
    } else if (run.kind === 'ramp') {
      const nCh = Math.max(1, Math.round((sb - sa) / LAND_CHORD));
      for (let c = 0; c < nCh; c++) {
        const t0 = sa + (sb - sa) * c / nCh, t1 = sa + (sb - sa) * (c + 1) / nCh, p0 = at(t0), p1 = at(t1);
        const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), m = Math.max(1, Math.round(len / RAMP_TREAD));
        segs.push({ x0: p0[0], z0: p0[1], x1: p1[0], z1: p1[1], halfWidth: halfAt((t0 + t1) / 2), y0: p0[2], y1: p1[2], tread: len / m, kind: 'flight', ramp: true, run: ri, s0: t0, s1: t1 });
      }
    } else {
      run.no = landingNo++;
      const nCh = Math.max(1, Math.round((sb - sa) / LAND_CHORD));
      for (let c = 0; c < nCh; c++) {
        const t0 = sa + (sb - sa) * c / nCh, t1 = sa + (sb - sa) * (c + 1) / nCh, p0 = at(t0), p1 = at(t1);
        const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        segs.push({ x0: p0[0], z0: p0[1], x1: p1[0], z1: p1[1], halfWidth: halfAt((t0 + t1) / 2), y0: ya, y1: ya, tread: Math.max(len, 0.1), kind: 'landing', run: ri, s0: t0, s1: t1 });
      }
    }
  });
  return { segs, runs, total, halfAt };
}

/** Stepped floor of a segment at distance d along it (pure; the same formula as solids.js). */
export function segmentFloor(g, d) {
  const len = Math.hypot(g.x1 - g.x0, g.z1 - g.z0), m = Math.max(1, Math.round(len / g.tread));
  const i = Math.min(m, Math.max(0, Math.ceil(d / g.tread - 1e-9)));
  return g.y0 + (g.y1 - g.y0) * i / m;
}

// ───────────────────────────────────────────────────────────────────────────────── baked height
/** h(x, z) from the baked 2 m height tiles around the stair (u16: h = v / 32 − 128; tiles are 512 m squares from the north-west). */
export async function loadBakedHeight(base, route, margin = 60) {
  const P = route && route.path ? route.path : stairPath();
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of P) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  const HALF = 4096, tiles = new Map(), want = [];
  for (let tz = Math.floor((HALF - (z1 + margin)) / 2 / 256); tz <= Math.floor((HALF - (z0 - margin)) / 2 / 256); tz++) {
    for (let tx = Math.floor((x0 - margin + HALF) / 2 / 256); tx <= Math.floor((x1 + margin + HALF) / 2 / 256); tx++) want.push([tx, tz]);
  }
  await Promise.all(want.map(async ([tx, tz]) => {
    try { tiles.set(tz * 16 + tx, new Uint16Array(await fetch(base + `height/${tx}_${tz}.u16`).then((r) => r.arrayBuffer()))); } catch (e) { /* walls fall back to parapets */ }
  }));
  return (x, z) => {
    const i = Math.floor((x + HALF) / 2), j = Math.floor((HALF - z) / 2), t = tiles.get((j >> 8) * 16 + (i >> 8));
    return t ? t[(j & 255) * 256 + (i & 255)] / 32 - 128 : -Infinity;
  };
}

// ───────────────────────────────────────────────────────────────────────────────── geometry
const UP = [0, 1, 0];

/** A stone lantern: plinth, shaft, lamp house with an ember, cap. `rank` 0 plain … 2 formal. Local frame. */
function lantern(b, x, y, z, yaw, rank, seed) {
  const sc = 1 + 0.18 * rank, post = 1.25 + 0.5 * rank;
  b.box(x, z, y - 0.3, y + 0.34, 0.34 * sc, 0.34 * sc, yaw, MAT.STONE, seed, { solid: false, ...NS });
  if (rank >= 1) b.box(x, z, y + 0.34, y + 0.62, 0.27 * sc, 0.27 * sc, yaw, MAT.STONE, seed + 1, { solid: false, ...NS });
  const y1 = y + 0.34 + post;
  b.box(x, z, y + (rank >= 1 ? 0.62 : 0.34), y1, 0.14 * sc, 0.14 * sc, yaw, rank >= 2 ? MAT.GLYPH : MAT.STONE, seed + 2, { solid: false, ...NS });
  b.box(x, z, y1, y1 + 0.1, 0.3 * sc, 0.3 * sc, yaw, MAT.STONE, seed + 3, { solid: false, ...NS });
  const ly = y1 + 0.1;
  b.box(x, z, ly, ly + 0.34, 0.12 * sc, 0.12 * sc, yaw, MAT.EMBER, seed + 4, { solid: false, ...NS });
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const c = Math.cos(yaw), s = Math.sin(yaw), ox = 0.15 * sc * sx, oz = 0.15 * sc * sz;
    b.box(x + ox * c + oz * s, z - ox * s + oz * c, ly, ly + 0.34, 0.035, 0.035, yaw, MAT.STONE, seed + 5, { solid: false, ...NS });
  }
  b.box(x, z, ly + 0.34, ly + 0.46, 0.34 * sc, 0.34 * sc, yaw, MAT.STONE, seed + 6, { solid: false, ...NS });
  b.box(x, z, ly + 0.46, ly + 0.66, 0.2 * sc, 0.2 * sc, yaw, MAT.STONE, seed + 7, { solid: false, ...NS });
  b.box(x, z, ly + 0.66, ly + 0.8, 0.07 * sc, 0.07 * sc, yaw, MAT.STONE, seed + 8, { solid: false, ...NS });
  b.blockers.push({ site: b.site, kind: 'circle', x, z, r: 0.42 * sc, y0: y - 0.3, y1: ly + 0.8 });
  b.light(x, ly + 0.17, z, 8 + 2 * rank, 1.0, 0.62, 0.3, 0.85 + 0.2 * rank, 'lamp');
}

/** A newel post at a flight's end. */
function newel(b, x, y, z, yaw, rank, seed) {
  const w = 0.3 + 0.05 * rank, hgt = 1.15 + 0.2 * rank, mat = rank >= 2 ? MAT.GLYPH : MAT.STONE;
  b.box(x, z, y - 0.5, y + hgt, w, w, yaw, mat, seed, { solid: true, carve: rank >= 2 ? 1 : 0, ...NS });
  b.box(x, z, y + hgt, y + hgt + 0.14, w + 0.07, w + 0.07, yaw, MAT.STONE, seed + 1, { solid: false, ...NS });
}

/** The summit gate: two pillars with carved faces, a lintel across them, GLYPH bands. Local frame. */
function gate(b, x, y, z, yaw, hw, seed) {
  const c = Math.cos(yaw), s = Math.sin(yaw), at = (u, f) => [x + u * c + f * s, z - u * s + f * c];
  const pu = hw - 0.9, H = 7.4;
  for (const side of [-1, 1]) {
    const [px, pz] = at(side * pu, 0);
    b.box(px, pz, y - 1.2, y + 0.9, 1.15, 1.15, yaw, MAT.STONE, seed + side, { solid: true, ...NS });                        // plinth
    b.box(px, pz, y + 0.9, y + H, 0.82, 0.82, yaw, MAT.GLYPH, seed + 3 + side, { solid: true, carve: 1, ...NS });           // shaft, bands
    b.box(px, pz, y + H, y + H + 0.35, 1.0, 1.0, yaw, MAT.STONE, seed + 6 + side, { solid: false, ...NS });                 // capital
    const [ax, az] = at(side * (pu + 1.5), 0);
    b.box(ax, az, y - 1.0, y + 1.9, 0.4, 0.8, yaw, MAT.STONE, seed + 9 + side, { solid: true, ...NS });                      // low cheek wall
  }
  const [lx, lz] = at(0, 0), span = pu + 1.0;
  b.box(lx, lz, y + H + 0.35, y + H + 1.75, span, 0.95, yaw, MAT.GLYPH, seed + 12, { solid: false, carve: 1, ...NS });      // lintel
  b.box(lx, lz, y + H + 1.75, y + H + 2.05, span - 0.5, 0.75, yaw, MAT.STONE, seed + 13, { solid: false, ...NS });
  b.light(lx, y + H - 0.5, lz, 12, 1.0, 0.64, 0.32, 1.1, 'lamp');
}

/**
 * Sites for the stair. `h(x, z)` is the terrain height (the baked ground; tests may fake it): it
 * decides where the hill stands above the stair (retaining walls, up to 4 m) and where it falls away
 * (parapets on a footing down to the ground). Each site carries its own `seatY` (see the header).
 */
export function stairSites(route, h) {
  const { segs, runs, total } = analyse(route);
  const hh = h || (() => -Infinity);
  const N = segs.length;
  // Per chord: frame and walls.
  const info = segs.map((g, i) => {
    const dx = g.x1 - g.x0, dz = g.z1 - g.z0, len = Math.hypot(dx, dz), fx = dx / len, fz = dz / len;
    return { g, i, len, fx, fz, rx: fz, rz: -fx, yaw: Math.atan2(fx, fz), mx: (g.x0 + g.x1) / 2, mz: (g.z0 + g.z1) / 2, lo: Math.min(g.y0, g.y1), hi: Math.max(g.y0, g.y1), m: Math.max(1, Math.round(len / g.tread)) };
  });
  for (const c of info) {
    c.wall = [-1, 1].map((sd) => {
      const hw = c.g.halfWidth, mid = (c.g.y0 + c.g.y1) / 2;
      const at = (off) => hh(c.mx + c.rx * sd * off, c.mz + c.rz * sd * off);
      const out = Math.max(at(hw + 1.0), at(hw + 1.8)), foot = Math.min(at(hw + 0.5), at(hw + 1.4));
      const cut = Number.isFinite(out) ? out - mid : 0;
      return { H: cut > 0.9 ? Math.min(4, Math.max(1.3, cut + 0.4)) : 0.9, foot: Number.isFinite(foot) ? foot : c.lo };
    });
  }
  // Smooth the retaining heights along the run (only ever upward: the wall must reach the cut).
  for (let sd = 0; sd < 2; sd++) {
    const H0 = info.map((c) => c.wall[sd].H);
    info.forEach((c, i) => {
      const a = H0[Math.max(0, i - 1)], d = H0[Math.min(N - 1, i + 1)];
      c.wall[sd].H = Math.round(Math.max(H0[i], (a + d) / 2) * 10) / 10;
    });
  }
  // Landings' ranks (formality 0..2 by height up the stair), lantern positions, gate.
  const landingRuns = runs.filter((r) => r.kind === 'landing' && r.s1 - r.s0 > 10);
  const flightRuns = runs.filter((r) => r.kind === 'flight');   // (ramps carry no newels)
  const rankAt = (s) => (s / total < 0.34 ? 0 : s / total < 0.7 ? 1 : 2);
  const extras = info.map(() => ({ lanterns: [], newels: [], gate: null }));
  const chordAt = (arc) => { let best = 0; for (let i = 0; i < N; i++) if (segs[i].s0 <= arc + 1e-6) best = i; return best; };
  landingRuns.forEach((r, li) => {
    const mid = (r.s0 + r.s1) / 2, rk = rankAt(mid), nL = landingRuns.length;
    const place = (arc, side, rank) => { const ci = chordAt(arc); extras[ci].lanterns.push({ arc, side, rank }); };
    if (rk === 0) place(mid, li % 2 ? -1 : 1, 0);
    else if (rk === 1) { place(mid, -1, 1); place(mid, 1, 1); }
    else { for (const t of [r.s0 + 4, r.s1 - 4]) { place(t, -1, 2); place(t, 1, 2); } }
    if (li === nL - 1) { /* the last landing before the pad also carries the gate below */ }
  });
  // Newel posts at every flight's ends (larger and carved higher up); the gate at the last flight's head.
  flightRuns.forEach((r, fi) => {
    const rk = rankAt((r.s0 + r.s1) / 2);
    for (const arc of [r.s0 + 0.3, r.s1 - 0.3]) extras[chordAt(Math.min(arc, r.s1 - 1e-3))].newels.push({ arc, rank: rk });
  });
  const lastFlight = flightRuns[flightRuns.length - 1];
  // On the flight, 6 m short of its head: spanning the stair, walked through. At the head (+1 m) it stood
  // across the turn into the manor's gatehouse, a pillar in the passage's mouth (bot playtest 2026-10-24:
  // the Wraith wedged between it and the west tower and could not reach the forecourt).
  const gateArc = Math.max(lastFlight.s0 + 2, lastFlight.s1 - 6);
  extras[chordAt(gateArc)].gate = { arc: gateArc };

  // Sites: consecutive chords up to SITE_LEN.
  const groups = [];
  let cur = [], acc = 0;
  for (let i = 0; i < N; i++) {
    cur.push(i); acc += info[i].len;
    if (acc >= SITE_LEN && i < N - 1) { groups.push(cur); cur = []; acc = 0; }
  }
  if (cur.length) { if (groups.length && acc < SITE_LEN * 0.4) groups[groups.length - 1].push(...cur); else groups.push(cur); }

  return groups.map((idxs, gi) => {
    const first = info[idxs[0]], lastc = info[idxs[idxs.length - 1]];
    const ax = (first.g.x0 + lastc.g.x1) / 2, az = (first.g.z0 + lastc.g.z1) / 2;
    const seatY = Math.round(((first.g.y0 + lastc.g.y1) / 2) * 100) / 100;
    let rad = 0;
    for (const i of idxs) { const c = info[i]; rad = Math.max(rad, Math.hypot(c.g.x0 - ax, c.g.z0 - az), Math.hypot(c.g.x1 - ax, c.g.z1 - az)); }
    const hasLamp = idxs.some((i) => extras[i].lanterns.length > 0 || extras[i].gate);
    const hasGate = idxs.some((i) => extras[i].gate);
    const build = (b) => {
      const seedBase = 1000 + gi * 211;
      const X = (v) => v - ax, Z = (v) => v - az, Y = (v) => v - seatY;
      for (const i of idxs) buildChord(b, info[i], extras[i], seedBase + i * 23, { X, Y, Z, ax, az, seatY, total, rankAt, runs });
    };
    return { id: 'stair-' + gi, at: [ax, az], facing: 0, build, footprint: rad + 14, seatAt: 'center', seatY, lamp: hasLamp, glow: hasGate ? 0.35 : 0, stair: true };
  });
}

/** One chord's treads or paving, walls, newels, lanterns (and the gate). */
function buildChord(b, c, ex, seed, F) {
  const { g } = c, hw = g.halfWidth, W = 2 * hw, { X, Y, Z } = F;
  const R = [c.rx, 0, c.rz], Fv = [c.fx, 0, c.fz];
  // Local point at distance d along the chord, u across (right positive).
  const pt = (d, u) => [X(g.x0 + c.fx * d + c.rx * u), Z(g.z0 + c.fz * d + c.rz * u)];
  const across = (i) => { // slab edges across the width, staggered per step
    const nS = Math.max(2, Math.round(W / 6)), cuts = [-hw - 0.5], off = (h2(seed + i * 7, 1) - 0.5) * (W / nS) * 0.8;
    for (let j = 1; j < nS; j++) cuts.push(-hw + (W * j) / nS + off * (j % 2 ? 1 : -0.7) + (h2(seed + i, j) - 0.5) * 0.5);
    cuts.push(hw + 0.5);
    return cuts;
  };
  if (g.kind === 'flight') {
    const m = c.m, rise = (g.y1 - g.y0) / m, tread = c.len / m;
    for (let i = 1; i <= m; i++) {
      const top = g.y0 + i * rise + LIFT + ((seed + i) & 1) * 0.002, cuts = across(i);
      for (let j = 0; j + 1 < cuts.length; j++) {
        const bs = Math.floor(h2(seed + i * 131 + j, 5) * 65535) + 1, u0 = cuts[j], u1 = cuts[j + 1];
        const chip = h2(bs, 6) < 0.13, jy = (h2(bs, 7) - 0.5) * 0.008, jyaw = (h2(bs, 8) - 0.5) * 0.012;
        const back = chip ? 0.05 + 0.07 * h2(bs, 9) : 0, depth = tread / 2 + 0.05 - back / 2;
        const um = (u0 + u1) / 2, d = (i - 0.5) * tread + back / 2;
        const cy = Math.cos(jyaw), sy = Math.sin(jyaw);
        const ex2 = [R[0] * cy + Fv[0] * sy, 0, R[2] * cy + Fv[2] * sy], ez2 = [Fv[0] * cy - R[0] * sy, 0, Fv[2] * cy - R[2] * sy];
        const [px, pz] = pt(d, um), hy = (rise + 0.3) / 2;
        const k = chip ? 0.05 + 0.04 * h2(bs, 10) : 0.018 + 0.03 * h2(bs, 11);
        chamferBlock(b, [px, Y(top + jy) - hy, pz], ex2, UP, ez2, (u1 - u0) / 2 + 0.02, hy, depth, k, 4 | 32, MAT.STONE, bs);
      }
    }
  } else {
    // Paving: flagstones in staggered rows, a border of dressed stone along both edges.
    const top = g.y0 + LIFT + ((seed >> 1) & 1) * 0.01, rows = Math.max(1, Math.round(c.len / 2.1)), rd = c.len / rows, bw = 0.55;
    for (let r = 0; r < rows; r++) {
      const inner = W - 2 * bw, cols = Math.max(2, Math.round(inner / 2.6)), cw = inner / cols, o = r % 2 ? 0.5 : 0, lo = -hw + bw, hi = hw - bw;
      for (let q = 0; q <= cols; q++) {
        const u0 = Math.max(lo, lo + (q - o) * cw), u1 = Math.min(hi, lo + (q + 1 - o) * cw);
        if (u1 - u0 < 0.2) continue;
        const bs = Math.floor(h2(seed + r * 77 + q, 12) * 65535) + 1, sink = h2(bs, 4) < 0.07 ? -0.025 : 0;
        const [px, pz] = pt((r + 0.5) * rd, (u0 + u1) / 2);
        chamferBlock(b, [px, Y(top + sink) - 0.12, pz], R, UP, Fv, (u1 - u0) / 2 - 0.015, 0.12, rd / 2 + 0.01, 0.02, 4, MAT.FLAG, bs);
      }
    }
    for (const sd of [-1, 1]) {
      const [px, pz] = pt(c.len / 2, sd * (hw - bw / 2));
      const bs = Math.floor(h2(seed + sd, 14) * 65535) + 1;
      chamferBlock(b, [px, Y(top + 0.015) - 0.14, pz], R, UP, Fv, bw / 2, 0.14, c.len / 2 + 0.01, 0.03, 4 | (sd < 0 ? 1 : 2), MAT.STONE, bs);
    }
  }
  // Walls on both sides: a raked parapet where the hill falls away (on a footing down to the
  // ground), a laid retaining wall where it stands above the stair.
  [-1, 1].forEach((sd, wi) => {
    const w = c.wall[wi], off = hw + 0.4, [wx, wz] = pt(c.len / 2, sd * off), yaw = c.yaw;
    const seedW = seed + 400 + wi * 50;
    if (w.H > 1.2) {
      const yb = Y(Math.min(c.lo, w.foot) - 0.5), yt = Y(c.hi + w.H);
      // Laid block by block on the formal upper stair; elsewhere a battered face the shader draws courses on (cheap).
      if (F.rankAt(g.s0) === 2 && w.H < 2.8) layWall(b, wx, wz, yb, yt, 0.42, c.len / 2 + 0.03, yaw, MAT.STONE, seedW, { course: 0.9, blockLen: 2.3, cap: false });
      else b.frustum(wx, wz, yb, yt, 0.6, c.len / 2 + 0.03, 0.42, c.len / 2 + 0.03, yaw, MAT.STONE, seedW);
      b.box(wx, wz, yt, yt + 0.16, 0.54, c.len / 2 + 0.05, yaw, MAT.STONE, seedW + 1, { solid: false, ...NS });
      b.blockers.push({ site: b.site, kind: 'box', x: wx, z: wz, hx: 0.47, hz: c.len / 2 + 0.05, cos: Math.cos(yaw), sin: Math.sin(yaw), y0: yb, y1: yt + 0.16 });
    } else {
      // Raked parapet block along the ramp, coping on top, a battered footing under it.
      const slope = (g.y1 - g.y0) / c.len, ang = Math.atan(slope), cs = Math.cos(ang), sn = Math.sin(ang);
      const ey = [-c.fx * sn, cs, -c.fz * sn], ez = [c.fx * cs, sn, c.fz * cs];
      const my = Y((g.y0 + g.y1) / 2), L2 = c.len / 2 / cs + 0.03, bs = Math.floor(h2(seedW, 3) * 65535) + 1;
      chamferBlock(b, [wx, my + 0.35, wz], R, ey, ez, 0.3, 0.55, L2, 0.04, 63 & ~8, MAT.STONE, bs);
      const fb = Y(Math.min(c.lo, w.foot) - 0.5), ft = Y(c.hi) - 0.02;
      if (ft - fb > 0.45) b.frustum(wx, wz, fb, ft, 0.55, c.len / 2 + 0.02, 0.38, c.len / 2 + 0.02, yaw, MAT.STONE, seedW + 2);
      b.blockers.push({ site: b.site, kind: 'box', x: wx, z: wz, hx: 0.35, hz: c.len / 2 + 0.05, cos: Math.cos(yaw), sin: Math.sin(yaw), y0: fb, y1: Y(c.hi) + 0.95 });
    }
  });
  // Newel posts (at the edge lines), lanterns (inside the border), the gate.
  for (const nw of ex.newels) for (const sd of [-1, 1]) {
    const d = Math.min(c.len, Math.max(0, nw.arc - g.s0)), [px, pz] = pt(d, sd * (hw + 0.4));
    newel(b, px, Y(segmentFloor(g, d)), pz, c.yaw, nw.rank, seed + 600 + (sd + 1) * 5);
  }
  for (const L of ex.lanterns) {
    const d = Math.min(c.len, Math.max(0, L.arc - g.s0)), [px, pz] = pt(d, L.side * (hw - 1.1));
    lantern(b, px, Y(g.y0 + LIFT), pz, c.yaw, L.rank, seed + 700 + (L.side + 1) * 11);
  }
  if (ex.gate) {
    const d = Math.min(c.len, Math.max(0, ex.gate.arc - g.s0)), [px, pz] = pt(d, 0);
    gate(b, px, Y(g.y1), pz, c.yaw, hw, seed + 800);
    for (const sd of [-1, 1]) { const [lx, lz] = pt(d, sd * (hw - 2.6)); lantern(b, lx, Y(g.y1 + LIFT), lz, c.yaw, 2, seed + 900 + sd); }
  }
}

/**
 * The stair's footprint for the village ground mask (tools/bake-world/villageMask.mjs extraPaving): paved within each
 * chord's half width (a 0.6 m soft edge), so the meadow grass does not grow up through the treads and landings.
 * @returns {{ bounds: { x0: number, z0: number, x1: number, z1: number }, paved: (x: number, z: number) => number }}
 */
export function stairPaving(route) {
  const segs = stairSegments(route), CELL = 16, grid = new Map();
  const bounds = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  for (const s of segs) {
    const r = s.halfWidth + 1;
    const ax = Math.min(s.x0, s.x1) - r, bx = Math.max(s.x0, s.x1) + r, az = Math.min(s.z0, s.z1) - r, bz = Math.max(s.z0, s.z1) + r;
    bounds.x0 = Math.min(bounds.x0, ax); bounds.x1 = Math.max(bounds.x1, bx); bounds.z0 = Math.min(bounds.z0, az); bounds.z1 = Math.max(bounds.z1, bz);
    for (let cz = Math.floor(az / CELL); cz <= Math.floor(bz / CELL); cz++) for (let cx = Math.floor(ax / CELL); cx <= Math.floor(bx / CELL); cx++) {
      const k = cx + ',' + cz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s);
    }
  }
  function paved(x, z) {
    const list = grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)); if (!list) return 0;
    let best = 0;
    for (const s of list) {
      const dx = s.x1 - s.x0, dz = s.z1 - s.z0, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.x0) * dx + (z - s.z0) * dz) / L2));
      const d = Math.hypot(x - (s.x0 + dx * t), z - (s.z0 + dz * t));
      const k = Math.max(0, Math.min(1, (s.halfWidth + 0.3 - d) / 0.6));
      if (k > best) best = k;
    }
    return best;
  }
  return { bounds, paved };
}
