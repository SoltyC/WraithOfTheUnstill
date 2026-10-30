// The erg's battle glass (Phase 9 D7; docs/phase-9/plan.md "Glass fields from old battles";
// dunes-design.md §5 "The Glass Battle"): sand fused by old blows into glass, in five fields (seats
// glass-1..5, tools/bake-world/seats.mjs). Each field is a centrepiece — a frozen splash, a glass tree
// where lightning struck, or a star of thrown shards — round a glazed crater, with smaller pieces
// scattered round it. Architecture sites (world/architecture.js) in MAT.BATTLE_GLASS: faceted on
// purpose (fused glass breaks in planes), glossy, lit through, glinting (shaders/architecture.wgsl.js).
// Pure geometry on the Builder; deterministic.

import { MAT } from './architecture.js';

const G = MAT.BATTLE_GLASS;
const hh = (a, b) => { let x = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1); x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d); return ((x ^ (x >>> 13)) >>> 0) / 4294967296; };

/** A glazed crater floor: an irregular disc of glass just over the sand, its rim a little raised. */
function crater(b, r, seed) {
  const n = 14, c = [0, 0.04, 0];
  const rim = [];
  for (let k = 0; k <= n; k++) { const a = (k / n) * Math.PI * 2, rr = r * (0.8 + 0.35 * hh(seed, k % n)); rim.push([Math.cos(a) * rr, 0.1 + 0.15 * hh(seed + 1, k % n), Math.sin(a) * rr]); }
  for (let k = 0; k < n; k++) b.tri(c, rim[k + 1], rim[k], G, seed);
}

/** One petal of a frozen splash: a sheet rising from radius r0 at angle a, leaning out and curling
 *  over at the tip, tapering; `h` its height. Two-sided (the material draws both faces). */
function petal(b, a, r0, h, w, curl, seed) {
  const ca = Math.cos(a), sa = Math.sin(a), tx = -sa, tz = ca;
  const N = 5, pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, out = r0 + t * h * 0.35 + curl * t * t * t * h, up = h * Math.sin(t * 1.35) / Math.sin(1.35) - curl * t * t * t * t * h * 0.4;
    const half = w * (1 - 0.85 * t) * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.6 + 0.15)));
    const twist = (hh(seed, i) - 0.5) * 0.15;
    pts.push([[ca * out - tx * half, up, sa * out - tz * half], [ca * out + tx * half + twist, up + twist, sa * out + tz * half]]);
  }
  for (let i = 0; i < N; i++) b.quad(pts[i][0], pts[i][1], pts[i + 1][1], pts[i + 1][0], G, seed + i);
}

/** A frozen splash: a crown of petals round a glazed crater, a few droplets frozen in the air above it. */
function splash(scale, seed) {
  return (b) => {
    crater(b, 4.2 * scale, seed);
    const n = 9 + Math.floor(hh(seed, 1) * 5);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (hh(seed, k + 3) - 0.5) * 0.4;
      petal(b, a, 1.8 * scale, (2.2 + 2.8 * hh(seed, k + 7)) * scale, (0.7 + 0.5 * hh(seed, k + 11)) * scale, 0.35 + 0.4 * hh(seed, k + 13), seed + k * 7);
    }
    // The splash's column, caught as it rose.
    b.drum(0, 0, 0, 2.8 * scale, 0.55 * scale, 0.18 * scale, 7, G, seed + 99, { solid: false });
    for (let k = 0; k < 4; k++) { const a = hh(seed, 50 + k) * 6.28, r = (1.0 + 1.5 * hh(seed, 60 + k)) * scale; b.box(Math.cos(a) * r, Math.sin(a) * r, (3.2 + 1.5 * hh(seed, 70 + k)) * scale, (3.5 + 1.5 * hh(seed, 70 + k)) * scale, 0.14 * scale, 0.22 * scale, a, G, seed + 80 + k, { plain: true, solid: false, tilt: 0.6 }); }
    b.blockers.push({ site: b.site, kind: 'circle', x: 0, z: 0, r: 2.6 * scale, y0: 0, y1: 4 * scale });
  };
}

/** A tapering, faceted glass branch from p0 along dir (unit), length len, radius r0 → r1; branches
 *  again (`depth` more levels) where lightning forked. */
function branch(b, p0, dir, len, r0, r1, depth, seed) {
  const n = 5, segs = 3;
  // A frame round the direction.
  const up = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = [dir[1] * up[2] - dir[2] * up[1], dir[2] * up[0] - dir[0] * up[2], dir[0] * up[1] - dir[1] * up[0]];
  const ul = Math.hypot(...u); u[0] /= ul; u[1] /= ul; u[2] /= ul;
  const v = [dir[1] * u[2] - dir[2] * u[1], dir[2] * u[0] - dir[0] * u[2], dir[0] * u[1] - dir[1] * u[0]];
  const ring = (t) => {
    const r = r0 + (r1 - r0) * t, kink = (hh(seed, Math.round(t * 10)) - 0.5) * 0.25 * len * t;
    const c = [p0[0] + dir[0] * len * t + u[0] * kink, p0[1] + dir[1] * len * t, p0[2] + dir[2] * len * t + u[2] * kink];
    const out = [];
    for (let k = 0; k <= n; k++) { const a = (k / n) * Math.PI * 2 + seed; out.push([c[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r, c[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r, c[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r]); }
    return out;
  };
  let lo = ring(0);
  for (let s = 1; s <= segs; s++) { const hi = ring(s / segs); for (let k = 0; k < n; k++) b.quad(lo[k], lo[k + 1], hi[k + 1], hi[k], G, seed + s); lo = hi; }
  if (depth <= 0) return;
  const end = [p0[0] + dir[0] * len, p0[1] + dir[1] * len, p0[2] + dir[2] * len];
  const forks = 2 + (hh(seed, 3) < 0.4 ? 1 : 0);
  for (let f = 0; f < forks; f++) {
    const a = hh(seed, 10 + f) * 6.28, spread = 0.45 + 0.35 * hh(seed, 20 + f);
    const d = [dir[0] + Math.cos(a) * spread, dir[1] * 0.9 + 0.15, dir[2] + Math.sin(a) * spread]; const dl = Math.hypot(...d);
    branch(b, end, [d[0] / dl, d[1] / dl, d[2] / dl], len * (0.55 + 0.2 * hh(seed, 30 + f)), r1, r1 * 0.45, depth - 1, seed * 3 + f + 1);
  }
}

/** A glass tree where lightning struck: a fused trunk branching three times, its roots glazed in a crater. */
function glassTree(scale, seed) {
  return (b) => {
    crater(b, 3.4 * scale, seed);
    branch(b, [0, -0.6, 0], [0.05, 1, 0.03], 3.2 * scale, 0.42 * scale, 0.24 * scale, 3, seed);
    for (let k = 0; k < 5; k++) { const a = (k / 5) * 6.28 + hh(seed, k) * 0.6; branch(b, [0, 0.1, 0], [Math.cos(a), -0.15, Math.sin(a)], (1.6 + 1.2 * hh(seed, k + 5)) * scale, 0.22 * scale, 0.05 * scale, 1, seed + 40 + k); }
    b.blockers.push({ site: b.site, kind: 'circle', x: 0, z: 0, r: 0.6 * scale, y0: 0, y1: 6 * scale });
  };
}

/** A star of shards thrown out from one blow: tilted blades leaning away from the centre. */
function shardStar(scale, seed, n = 11) {
  return (b) => {
    crater(b, 3.6 * scale, seed);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (hh(seed, k) - 0.5) * 0.5, r = (0.6 + 1.6 * hh(seed, k + 20)) * scale, h = (1.0 + 3.2 * hh(seed, k + 40)) * scale;
      b.box(Math.cos(a) * r, Math.sin(a) * r, -0.3, h, 0.09 * scale + 0.06, (0.3 + 0.5 * hh(seed, k + 60)) * scale, a + Math.PI / 2, G, seed + k, { plain: true, tilt: 0.35 + 0.5 * hh(seed, k + 80), roll: (hh(seed, k + 90) - 0.5) * 0.4, solid: false });
    }
    b.blockers.push({ site: b.site, kind: 'circle', x: 0, z: 0, r: 2.2 * scale, y0: 0, y1: 3 * scale });
  };
}

/** A glazed oval at (cx, cz) in the print's frame (x across, z along heading h), rim a little raised. */
function oval(b, h, cx, cz, rx, rz, seed) {
  const c = Math.cos(h), s = Math.sin(h), P = (x, z, y) => [x * c + z * s, y, -x * s + z * c];
  const n = 12, mid = P(cx, cz, 0.05), rim = [];
  for (let k = 0; k <= n; k++) { const a = (k / n) * Math.PI * 2, j = 0.85 + 0.25 * hh(seed, k % n); rim.push(P(cx + Math.cos(a) * rx * j, cz + Math.sin(a) * rz * j, 0.1 + 0.12 * hh(seed + 3, k % n))); }
  for (let k = 0; k < n; k++) b.tri(mid, rim[k + 1], rim[k], G, seed);
}

/** One of the Long Walker's footprints fossilised in glass (Phase 9 D10, "Follow the Glass"): its
 *  pad and three toes pressed into the sand and fused, a rim of low shards splashed out round the
 *  pad. h: its heading (the way it walked). */
function walkerPrint(h, seed) {
  return (b) => {
    oval(b, h, 0, -0.6, 2.7, 3.4, seed);
    [[-1.9, 3.3, 1.0], [0, 4.0, 1.15], [1.9, 3.3, 1.0]].forEach(([x, z, r], k) => oval(b, h, x, z, r, r * 1.35, seed + 10 + k));
    const c = Math.cos(h), s = Math.sin(h);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + hh(seed, k) * 0.5, lx = Math.cos(a) * 3.0, lz = -0.6 + Math.sin(a) * 3.8;
      b.box(lx * c + lz * s, -lx * s + lz * c, -0.2, 0.35 + 0.5 * hh(seed, k + 20), 0.08, 0.35 + 0.3 * hh(seed, k + 30), h + a + Math.PI / 2, G, seed + 40 + k, { plain: true, tilt: 0.5 + 0.3 * hh(seed, k + 50), solid: false });
    }
  };
}

/** The glass track (game/walker/route.js trackPrints): [x, z, heading, side] each. */
export function walkerTrackSites(prints) {
  return prints.map(([x, z, h], k) => ({ id: `walker-print-${k}`, at: [x, z], facing: h, build: walkerPrint(h, 700 + k * 13), footprint: 4, sink: 0.12, glassR: 4.6 }));
}

/** The five fields' glass sites (`table`: POIs by id; seats glass-1..5). */
export function glassSites(table) {
  const at = (id, fallback) => (table[id] && table[id].pos) || fallback;
  const seats = [[2634, 825], [2762, 707], [2595, 629], [2535, 459], [2680, 560]];
  const centre = [splash(1.4, 11), splash(1.1, 23), splash(1.25, 37), glassTree(1.3, 41), shardStar(1.3, 53)];
  const sites = [];
  seats.forEach((fb, f) => {
    const [x, z] = at('glass-' + (f + 1), fb);
    // glassR: the ground fused round it (m) — the crater's radius and a little more (the terrain
    // state's GLASS transform, systems/glassGround.js).
    sites.push({ id: `glass-${f + 1}-heart`, at: [x, z], facing: 0, build: centre[f], footprint: 5, sink: 0.15, glassR: [5.9, 4.6, 5.25, 4.4, 4.7][f] * 1.3 });  // on the lowest ground under it: the crater sinks into a slope, never floats
    // Scattered round it: small splashes, shard clusters and a lone glass tree or two.
    for (let k = 0; k < 7; k++) {
      const a = hh(f, k) * 6.28, d = 9 + 18 * hh(f, k + 10), kind = hh(f, k + 20);
      const sc = kind < 0.45 ? 0.5 + 0.4 * hh(f, k + 30) : kind < 0.8 ? 0.45 + 0.35 * hh(f, k + 30) : 0.6 + 0.4 * hh(f, k + 30);
      const build = kind < 0.45 ? shardStar(sc, 100 + f * 10 + k, 6) : kind < 0.8 ? splash(sc, 200 + f * 10 + k) : glassTree(sc, 300 + f * 10 + k);
      const glassR = (kind < 0.45 ? 3.6 : kind < 0.8 ? 4.2 : 3.4) * sc * 1.3;
      sites.push({ id: `glass-${f + 1}-${k}`, at: [x + Math.cos(a) * d, z + Math.sin(a) * d], facing: 0, build, footprint: 2.5, sink: 0.1, glassR });
    }
  });
  return sites;
}
