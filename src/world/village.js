// The meadow village's LAYOUT: a pure, deterministic generator (no Babylon, no Math.random).
//
//   villageLayout(world, opts) -> { roads, plots, lights, greens, meta }
//
// world = { height(x, z) -> m, water(x, z) -> bool (river/lake within 0 m), isHill(x, z) -> e }
//   (e = hill-ellipse distance: < 1.05 is on the hill).
// opts  = { seed=1, foot:[x,z] (stair foot), hub:[x,z], entry:[x,z], market:[x,z], maxBuildings }
//
// Conventions (world metres, x east, z north):
//   plot.facing is the yaw of the FRONT: front normal = (sin facing, cos facing)  (Babylon rotation.y,
//   +z forward at 0). plot.w is the half-extent along the frontage (right = (cos f, -sin f)), plot.d
//   the half-depth along the front normal.
//
// Algorithm (details in the section comments): a lazy 5 m cost grid (slope^2, water, hill, noise) is
// searched with A* to lay the main road entry -> hub -> market -> stair foot (bridging water once);
// two partial hill-base arcs, contour-following branch streets, cross-links, lanes and farm footpaths
// follow; every polyline is smoothed, clipped off water/hill and split by surface/bridge. Plots are
// then slotted along street frontages (irregular setbacks and gaps, backyards, looser at the edge),
// after the landmarks (hall, chapel, stalls, wells); farmsteads go out in the meadow on footpaths.
// All candidate tests use one rectangle validator (overlap + 1 m gap, water + 4 m, hill, road
// clearance, stair apron, sightline corridor). Lamps go last.

const PI = Math.PI, TAU = PI * 2;

// ---------------------------------------------------------------------------- hashing / noise
function hash32(a, b = 0, c = 0) {
  let h = (a | 0) ^ Math.imul(b | 0, 0x9e3779b1) ^ Math.imul(c | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}
const h01 = (a, b, c) => hash32(a, b, c) / 4294967296;
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const sm = (f) => f * f * (3 - 2 * f);
function vn1(seed, t) { // smooth 1-D value noise in [-1, 1]
  const i = Math.floor(t), f = sm(t - i);
  return (h01(seed, i, 7) * (1 - f) + h01(seed, i + 1, 7) * f) * 2 - 1;
}
function vn2(seed, x, z) { // smooth 2-D value noise in [0, 1]
  const i = Math.floor(x), j = Math.floor(z), fx = sm(x - i), fz = sm(z - j);
  const a = h01(seed, i, j), b = h01(seed, i + 1, j), c = h01(seed, i, j + 1), d = h01(seed, i + 1, j + 1);
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}

// ---------------------------------------------------------------------------- geometry helpers
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
function cumLen(pts) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + dist(pts[i][0], pts[i][1], pts[i - 1][0], pts[i - 1][1]));
  return c;
}
function resample(pts, step) {
  if (pts.length < 2) return pts.slice();
  const c = cumLen(pts), L = c[c.length - 1];
  const n = Math.max(1, Math.round(L / step));
  const out = [];
  let k = 0;
  for (let i = 0; i <= n; i++) {
    const s = (L * i) / n;
    while (k < c.length - 2 && c[k + 1] < s) k++;
    const seg = c[k + 1] - c[k] || 1, t = Math.min(1, Math.max(0, (s - c[k]) / seg));
    out.push([pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t]);
  }
  return out;
}
function chaikin(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function relax(pts, passes) {
  let p = pts;
  for (let k = 0; k < passes; k++) {
    const q = [p[0]];
    for (let i = 1; i < p.length - 1; i++) q.push([(p[i - 1][0] + p[i + 1][0]) * 0.25 + p[i][0] * 0.5, (p[i - 1][1] + p[i + 1][1]) * 0.25 + p[i][1] * 0.5]);
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}
function smoothPath(raw) {
  let p = raw;
  for (let i = 0; i < 2; i++) p = chaikin(p);
  p = resample(p, 4);
  p = relax(p, 4);
  return resample(p, 4);
}
function mkRoute(pts) { return { pts, cum: cumLen(pts) }; }
function pointAt(r, s) {
  const c = r.cum, n = c.length;
  s = Math.min(Math.max(s, 0), c[n - 1]);
  let lo = 0, hi = n - 2;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c[m] <= s) lo = m; else hi = m - 1; }
  const a = r.pts[lo], b = r.pts[lo + 1], seg = c[lo + 1] - c[lo] || 1, t = (s - c[lo]) / seg;
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx: (b[0] - a[0]) / seg, tz: (b[1] - a[1]) / seg };
}
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  const x = ax + dx * t, z = az + dz * t;
  return { d: Math.hypot(px - x, pz - z), x, z };
}
function angDiff(a, b) { let d = (a - b) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return Math.abs(d); }

// oriented rects: centre, w (along right), d (along front normal), facing f
function rectAxes(f) { return { rx: Math.cos(f), rz: -Math.sin(f), nx: Math.sin(f), nz: Math.cos(f) }; }
function rectsOverlap(a, b, pad) {
  const A = rectAxes(a.facing), B = rectAxes(b.facing);
  const aw = a.w + pad, ad = a.d + pad, bw = b.w + pad, bd = b.d + pad;
  const dx = b.at[0] - a.at[0], dz = b.at[1] - a.at[1];
  for (const ax of [[A.rx, A.rz], [A.nx, A.nz], [B.rx, B.rz], [B.nx, B.nz]]) {
    const ra = aw * Math.abs(A.rx * ax[0] + A.rz * ax[1]) + ad * Math.abs(A.nx * ax[0] + A.nz * ax[1]);
    const rb = bw * Math.abs(B.rx * ax[0] + B.rz * ax[1]) + bd * Math.abs(B.nx * ax[0] + B.nz * ax[1]);
    if (Math.abs(dx * ax[0] + dz * ax[1]) >= ra + rb) return false;
  }
  return true;
}
function inRect(p, x, z, pad) {
  const A = rectAxes(p.facing), dx = x - p.at[0], dz = z - p.at[1];
  return Math.abs(dx * A.rx + dz * A.rz) < p.w + pad && Math.abs(dx * A.nx + dz * A.nz) < p.d + pad;
}
function rectSamples(cx, cz, w, d, f) {
  const A = rectAxes(f), out = [[cx, cz]];
  const k = [-1, -1 / 3, 1 / 3, 1];
  for (const a of k) for (const b of k) {
    if (Math.abs(a) < 1 && Math.abs(b) < 1) continue;
    out.push([cx + A.rx * w * a + A.nx * d * b, cz + A.rz * w * a + A.nz * d * b]);
  }
  return out;
}

// ---------------------------------------------------------------------------- surfaces / widths
const WIDTH = { main: 7, street: 4.8, lane: 2.6, path: 1.6 };
function surfaceAt(kind, dM) {
  if (kind === 'path') return 'grass';
  if (kind === 'main') return dM < 58 ? 'cobble' : dM < 115 ? 'earth' : 'grass';
  if (kind === 'street') return dM < 34 ? 'cobble' : dM < 90 ? 'earth' : 'grass';
  return dM < 22 ? 'cobble' : dM < 75 ? 'earth' : 'grass'; // lane
}
const LOW = new Set(['stall', 'well']);

// ---------------------------------------------------------------------------- the generator
export function villageLayout(world, opts = {}) {
  const seed = (opts.seed ?? 1) | 0;
  const F = opts.foot || [142, 869];
  const H = opts.hub || [60, 990];
  const E = opts.entry || [H[0] - 85, H[1] + 50];
  const W = {
    h: (x, z) => world.height(x, z),
    wet: (x, z) => !!world.water(x, z),
    e: (x, z) => world.isHill(x, z),
  };
  const wetNear = (x, z, r) => {
    if (W.wet(x, z)) return true;
    for (let i = 0; i < 8; i++) if (W.wet(x + Math.cos(i * PI / 4) * r, z + Math.sin(i * PI / 4) * r)) return true;
    return false;
  };

  // ---- market square position: 60% of the way hub -> foot, nudged off water and the hill
  let M = opts.market;
  if (!M) {
    const base = [H[0] + (F[0] - H[0]) * 0.6, H[1] + (F[1] - H[1]) * 0.6];
    M = base;
    search: for (let ring = 0; ring < 6; ring++) {
      for (let k = 0; k < 8; k++) {
        const a = k * PI / 4 + 0.3, r = ring * 9;
        const x = base[0] + Math.cos(a) * r, z = base[1] + Math.sin(a) * r;
        if (!wetNear(x, z, 18) && W.e(x, z) > 1.25 && dist(x, z, F[0], F[1]) > 45) { M = [x, z]; break search; }
      }
    }
  }
  const Rsq = 13 + h01(seed, 11, 1) * 2.5;
  const dM = (x, z) => dist(x, z, M[0], M[1]);
  const districtAt = (x, z) => { const d = dM(x, z); return d < 66 ? 'centre' : d < 125 ? 'lower' : d < 165 ? 'edge' : 'farm'; };

  // ---- lazy cost grid for A*
  const CELL = 5, N = 110, GX = M[0] - (N * CELL) / 2, GZ = M[1] - (N * CELL) / 2;
  const st = new Uint8Array(N * N); // 0 unknown, 1 ok, 2 water, 3 hill
  const hh = new Float32Array(N * N);
  const pen = new Float32Array(N * N); // plot / road penalty for A*
  const cellOf = (x, z) => { const i = Math.floor((x - GX) / CELL), j = Math.floor((z - GZ) / CELL); return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i; };
  const cx = (c) => GX + ((c % N) + 0.5) * CELL, cz = (c) => GZ + (Math.floor(c / N) + 0.5) * CELL;
  function info(c) {
    if (st[c]) return st[c];
    const x = cx(c), z = cz(c);
    hh[c] = W.h(x, z);
    let s = 1;
    if (W.e(x, z) < 1.08) s = 3;
    else {
      outer: for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (W.wet(x + a * 2.5, z + b * 2.5)) { s = 2; break outer; }
    }
    st[c] = s;
    return s;
  }
  function nearestFree(x, z, allowWater) {
    const c0 = cellOf(x, z);
    if (c0 < 0) return -1;
    const i0 = c0 % N, j0 = Math.floor(c0 / N);
    let best = -1, bd = 1e9;
    for (let r = 0; r < 12 && best < 0; r++) {
      for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r) continue;
        const c = j * N + i, s = info(c);
        if (s === 3 || (s === 2 && !allowWater)) continue;
        const d = dist(cx(c), cz(c), x, z);
        if (d < bd) { bd = d; best = c; }
      }
    }
    return best;
  }
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  /** A* over the grid; returns a smoothed polyline or null. */
  function route(a, b, o = {}) {
    const allowWater = !!o.water, avoidFoot = !!o.avoidFoot, slopeK = o.slopeK ?? 120, nz = o.noise ?? 0.35;
    const cs = nearestFree(a[0], a[1], allowWater), cg = nearestFree(b[0], b[1], allowWater);
    if (cs < 0 || cg < 0) return null;
    const gx = cx(cg), gz = cz(cg);
    const g = new Float32Array(N * N).fill(Infinity), from = new Int32Array(N * N).fill(-1), done = new Uint8Array(N * N);
    const heapF = [], heapC = [];
    const push = (f, c) => {
      let i = heapF.length; heapF.push(f); heapC.push(c);
      while (i > 0) { const p = (i - 1) >> 1; if (heapF[p] <= f) break; heapF[i] = heapF[p]; heapC[i] = heapC[p]; i = p; }
      heapF[i] = f; heapC[i] = c;
    };
    const pop = () => {
      const c0 = heapC[0], f = heapF.pop(), c = heapC.pop(), n = heapF.length;
      if (n) {
        let i = 0;
        for (;;) {
          let l = 2 * i + 1; if (l >= n) break;
          if (l + 1 < n && heapF[l + 1] < heapF[l]) l++;
          if (heapF[l] >= f) break;
          heapF[i] = heapF[l]; heapC[i] = heapC[l]; i = l;
        }
        heapF[i] = f; heapC[i] = c;
      }
      return c0;
    };
    g[cs] = 0; push(dist(cx(cs), cz(cs), gx, gz), cs);
    let found = false;
    while (heapF.length) {
      const c = pop();
      if (done[c]) continue;
      done[c] = 1;
      if (c === cg) { found = true; break; }
      const ci = c % N, cj = Math.floor(c / N);
      for (const [di, dj] of DIRS) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const n = nj * N + ni;
        if (done[n]) continue;
        const s = info(n);
        if (s === 3 || (s === 2 && !allowWater)) continue;
        if (avoidFoot && dist(cx(n), cz(n), F[0], F[1]) < 30) continue;
        const len = CELL * (di && dj ? 1.4142 : 1), sl = Math.abs(hh[n] - hh[c]) / len;
        const step = len * (1 + slopeK * sl * sl) * (1 + nz * vn2(seed + 5, ni * 0.23, nj * 0.23)) + (s === 2 ? 40 : 0) + pen[n];
        const ng = g[c] + step;
        if (ng < g[n]) { g[n] = ng; from[n] = c; push(ng + dist(cx(n), cz(n), gx, gz), n); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = cg; c >= 0; c = from[c]) cells.push([cx(c), cz(c)]);
    cells.reverse();
    const pts = [[a[0], a[1]], ...cells.slice(1, -1), [b[0], b[1]]];
    return smoothPath(pts);
  }
  function stampRoad(pts) { // discourage later roads from running alongside
    for (let i = 0; i < pts.length; i++) {
      const c0 = cellOf(pts[i][0], pts[i][1]);
      if (c0 < 0) continue;
      const i0 = c0 % N, j0 = Math.floor(c0 / N);
      for (let j = j0 - 1; j <= j0 + 1; j++) for (let k = i0 - 1; k <= i0 + 1; k++) {
        if (k < 0 || j < 0 || k >= N || j >= N) continue;
        pen[j * N + k] = Math.max(pen[j * N + k], 3);
      }
    }
  }

  // ---- roads ---------------------------------------------------------------------------------
  const routes = []; // {id, kind, pts, cum}
  function addRoute(id, kind, pts, clip) {
    if (!pts || pts.length < 3) return null;
    let use = pts;
    if (clip) { // keep the first run clear of water / hill / the stair apron (a street that starts on a road)
      let n = 0;
      while (n < pts.length) {
        const [x, z] = pts[n];
        if (W.wet(x, z) || W.e(x, z) < 1.03 || (kind !== 'main' && dist(x, z, F[0], F[1]) < 27)) break;
        n++;
      }
      use = pts.slice(0, n);
    }
    if (use.length < 3 || cumLen(use)[use.length - 1] < 12) return null;
    const r = { id, kind, pts: use, cum: cumLen(use) };
    routes.push(r);
    stampRoad(use);
    return r;
  }

  // main: entry -> hub -> market -> stair foot (bridging water where it must)
  const legs = [E, H, M, F];
  let mainPts = null;
  for (let i = 0; i < legs.length - 1; i++) {
    const leg = route(legs[i], legs[i + 1], { water: true, slopeK: 160, noise: 0.45 });
    const fallback = [legs[i], legs[i + 1]];
    const p = leg || resample(fallback, 4);
    mainPts = mainPts ? mainPts.concat(p.slice(1)) : p;
  }
  mainPts = resample(relax(mainPts, 3), 4);
  mainPts[0] = [E[0], E[1]];
  mainPts[mainPts.length - 1] = [F[0], F[1]];
  const mainR = addRoute('main', 'main', mainPts, false);
  const mainL = mainR.cum[mainR.cum.length - 1];
  // the approach corridor: the main road's last 120 m
  const corridor = (() => {
    const out = [], c = mainR.cum;
    for (let i = 0; i < mainR.pts.length; i++) if (mainL - c[i] <= 120) out.push(mainR.pts[i]);
    return out;
  })();

  // hill-base arcs: partial curved streets on a ~e=1.15 contour, each joined to the main road by a
  // connector, never meeting each other (no ring).
  const hc = world.hillCentre || opts.hillCentre || [300, 1000], hax = opts.hillAx || 170, haz = opts.hillAz || 210;
  const footAng = Math.atan2((F[1] - hc[1]) / haz, (F[0] - hc[0]) / hax);
  for (let k = 0; k < 2; k++) {
    const dir = k ? -1 : 1, rr = mulberry32(hash32(seed, 31, k));
    const a0 = 0.26 + rr() * 0.12, span = 0.95 + rr() * 0.55; // radians in ellipse parameter space
    const pts = [];
    for (let t = 0; t <= 1.0001; t += 0.04) {
      const a = footAng + dir * (a0 + span * t);
      const e = 1.15 + 0.1 * Math.max(0, 1 - t / 0.4) + 0.035 * vn1(seed + 3 + k, t * 5);
      pts.push([hc[0] + Math.cos(a) * hax * e, hc[1] + Math.sin(a) * haz * e]);
    }
    const okPts = [];
    for (const p of pts) { if (wetNear(p[0], p[1], 3) || dist(p[0], p[1], F[0], F[1]) < 32) { if (okPts.length) break; else continue; } okPts.push(p); }
    if (okPts.length < 4) continue;
    // connector from the nearest main point to the arc start
    let bi = 0, bd = 1e9;
    for (let i = 0; i < mainR.pts.length - 12; i++) { const d = dist(mainR.pts[i][0], mainR.pts[i][1], okPts[0][0], okPts[0][1]); if (d < bd) { bd = d; bi = i; } }
    const con = bd > 8 ? route(mainR.pts[bi], okPts[0], { avoidFoot: true, slopeK: 160 }) : [mainR.pts[bi]];
    if (!con) continue;
    const arc = smoothPath(con.concat(okPts.slice(1).map((p) => p)));
    addRoute('arc' + k, 'street', arc, true);
  }

  // branch streets: leave the main road at irregular points, follow the contours
  const nStreets = 5 + (hash32(seed, 41) % 3);
  const rs = mulberry32(hash32(seed, 43));
  for (let k = 0; k < nStreets; k++) {
    const s = mainL * (0.06 + (0.78 * (k + 0.2 + rs() * 0.6)) / nStreets) - (k === nStreets - 1 ? 0 : 0);
    if (s > mainL - 48) continue;
    const p = pointAt(mainR, s);
    const side = (k % 2 ? 1 : -1) * (rs() < 0.85 ? 1 : -1);
    const ang = Math.atan2(p.tz, p.tx) + side * (PI / 2 + (rs() - 0.5) * 0.9);
    let len = 65 + rs() * 70, tgt = null;
    for (let tries = 0; tries < 6 && !tgt; tries++, len *= 0.85) {
      const x = p.x + Math.cos(ang) * len, z = p.z + Math.sin(ang) * len, c = cellOf(x, z);
      if (c >= 0 && info(c) === 1 && dist(x, z, F[0], F[1]) > 40 && !wetNear(x, z, 6)) tgt = [x, z];
    }
    if (!tgt) continue;
    const path = route([p.x, p.z], tgt, { avoidFoot: true, slopeK: 150 });
    addRoute('street' + k, 'street', path, true);
  }
  // two streets leaving the square sideways, so the market has real street frontage all round
  {
    let bi = 0, bd = 1e9;
    for (let i = 0; i < mainR.pts.length; i++) { const d = dist(mainR.pts[i][0], mainR.pts[i][1], M[0], M[1]); if (d < bd) { bd = d; bi = i; } }
    [1, -1].forEach((sg, k) => {
      const p = pointAt(mainR, Math.min(mainL - 50, Math.max(5, mainR.cum[bi] + (k ? -1 : 1) * (Rsq + 6))));
      const ang = Math.atan2(p.tz, p.tx) + sg * (PI / 2 + (hash32(seed, 47, k) / 4294967296 - 0.5) * 0.5);
      for (let len = 80, tries = 0; tries < 6; tries++, len *= 0.85) {
        const x = p.x + Math.cos(ang) * len, z = p.z + Math.sin(ang) * len, c = cellOf(x, z);
        if (c >= 0 && info(c) === 1 && dist(x, z, F[0], F[1]) > 40 && !wetNear(x, z, 6)) {
          addRoute('cstreet' + k, 'street', route([p.x, p.z], [x, z], { avoidFoot: true, slopeK: 150 }), true);
          break;
        }
      }
    });
  }
  // cross-links between existing streets (no ring: a couple only)
  const streetsNow = routes.filter((r) => r.kind === 'street');
  for (let k = 0, made = 0; k < 8 && made < 2 && streetsNow.length > 1; k++) {
    const A = streetsNow[hash32(seed, 51, k) % streetsNow.length], B = streetsNow[hash32(seed, 53, k) % streetsNow.length];
    if (A === B) continue;
    const pa = pointAt(A, A.cum[A.cum.length - 1] * (0.5 + 0.4 * h01(seed, 55, k))), pb = pointAt(B, B.cum[B.cum.length - 1] * (0.3 + 0.5 * h01(seed, 57, k)));
    const d = dist(pa.x, pa.z, pb.x, pb.z);
    if (d < 40 || d > 110) continue;
    const path = route([pa.x, pa.z], [pb.x, pb.z], { avoidFoot: true, slopeK: 150 });
    if (!path || cumLen(path)[path.length - 1] > d * 1.9) continue;
    if (addRoute('link' + k, 'street', path, true)) made++;
  }

  // lanes: short, wobbly, perpendicular to a street, between houses
  const hostRoutes = routes.slice();
  const rl = mulberry32(hash32(seed, 61));
  const laneStarts = [];
  for (let k = 0; k < 60 && laneStarts.length < 22; k++) {
    const host = hostRoutes[Math.floor(rl() * hostRoutes.length)];
    const L = host.cum[host.cum.length - 1], s = 14 + rl() * (L - 28);
    if (L < 40) continue;
    const p = pointAt(host, s);
    const dm = dM(p.x, p.z);
    if (dm > 125 || dist(p.x, p.z, F[0], F[1]) < 40) continue;
    if (laneStarts.some((q) => dist(q[0], q[1], p.x, p.z) < 19)) continue;
    const side = rl() < 0.5 ? 1 : -1;
    let hd = Math.atan2(p.tx, -p.tz) + 0; // left normal angle in (x,z): (-tz, tx)
    hd = Math.atan2(p.tx * side, -p.tz * side);
    const pts = [[p.x, p.z]];
    let x = p.x, z = p.z, a = hd + (rl() - 0.5) * 0.5;
    const target = 22 + rl() * 20;
    for (let step = 1; step * 4 <= target; step++) {
      a += (rl() - 0.5) * 0.35;
      x += Math.cos(a) * 4; z += Math.sin(a) * 4;
      if (wetNear(x, z, 3) || W.e(x, z) < 1.1 || dist(x, z, F[0], F[1]) < 30) break;
      // stop (joined) if we meet another road
      let hit = null;
      if (step > 3) for (const r of routes) { if (r === host) continue; for (let i = 0; i < r.pts.length - 1; i++) { const q = segDist(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]); if (q.d < 3) { hit = q; break; } } if (hit) break; }
      if (hit) { pts.push([hit.x, hit.z]); break; }
      pts.push([x, z]);
    }
    if (pts.length >= 4) { addRoute('lane' + laneStarts.length, 'lane', pts, true); laneStarts.push([p.x, p.z]); }
  }

  // ---- emit roads (split by surface / bridge) -------------------------------------------------
  const roads = [];
  const roadSegs = []; // for the index: {ax,az,bx,bz,w}
  function emit(r) {
    const w = WIDTH[r.kind], n = r.pts.length;
    const br = new Array(n).fill(false);
    if (r.kind === 'main') {
      for (let i = 0; i < n; i++) if (wetNear(r.pts[i][0], r.pts[i][1], 3.5)) br[i] = true;
      const b2 = br.slice();
      for (let i = 0; i < n; i++) if (br[i]) { if (i > 0) b2[i - 1] = true; if (i < n - 1) b2[i + 1] = true; }
      for (let i = 0; i < n; i++) br[i] = b2[i];
    }
    let pieces = [], cur = null;
    for (let i = 0; i < n - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      const bridge = br[i] && br[i + 1];
      const surface = bridge ? 'cobble' : surfaceAt(r.kind, dM((a[0] + b[0]) / 2, (a[1] + b[1]) / 2));
      if (cur && cur.bridge === bridge && cur.surface === surface) cur.pts.push(b);
      else { cur = { bridge, surface, pts: [a, b] }; pieces.push(cur); }
    }
    pieces.forEach((pc, i) => {
      const road = { id: pieces.length > 1 ? `${r.id}.${i}` : r.id, route: r.id, pts: pc.pts.map((p) => [+p[0].toFixed(2), +p[1].toFixed(2)]), width: w, surface: pc.surface, kind: r.kind };
      if (pc.bridge) road.bridge = true;
      roads.push(road);
      addSegs(road.pts, w);
    });
  }
  // spatial index over road segments
  const SC = 8, segGrid = new Map();
  const gk = (i, j) => i * 73856093 ^ j * 19349663;
  function addSegs(pts, w) {
    const made = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const sg = { ax: pts[i][0], az: pts[i][1], bx: pts[i + 1][0], bz: pts[i + 1][1], w };
      made.push(sg);
      const i0 = Math.floor(Math.min(sg.ax, sg.bx) / SC), i1 = Math.floor(Math.max(sg.ax, sg.bx) / SC);
      const j0 = Math.floor(Math.min(sg.az, sg.bz) / SC), j1 = Math.floor(Math.max(sg.az, sg.bz) / SC);
      for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) {
        const k = gk(a, b);
        let l = segGrid.get(k); if (!l) segGrid.set(k, (l = []));
        l.push(sg);
      }
    }
    return made;
  }
  function removeSegs(list) {
    const set = new Set(list);
    for (const l of segGrid.values()) for (let i = l.length - 1; i >= 0; i--) if (set.has(l[i])) l.splice(i, 1);
  }
  /** nearest road: {d (centre distance), x, z, w} within R, or null */
  function nearestRoad(x, z, R) {
    const i0 = Math.floor((x - R) / SC), i1 = Math.floor((x + R) / SC), j0 = Math.floor((z - R) / SC), j1 = Math.floor((z + R) / SC);
    let best = null;
    for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) {
      const l = segGrid.get(gk(a, b)); if (!l) continue;
      for (const s of l) {
        const q = segDist(x, z, s.ax, s.az, s.bx, s.bz);
        if (q.d <= R && (!best || q.d < best.d)) best = { d: q.d, x: q.x, z: q.z, w: s.w };
      }
    }
    return best;
  }
  /** min over roads of (distance - half width) */
  function clearance(x, z, need) {
    const R = need + 4.5;
    const i0 = Math.floor((x - R) / SC), i1 = Math.floor((x + R) / SC), j0 = Math.floor((z - R) / SC), j1 = Math.floor((z + R) / SC);
    let m = 1e9;
    for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) {
      const l = segGrid.get(gk(a, b)); if (!l) continue;
      for (const s of l) { const q = segDist(x, z, s.ax, s.az, s.bx, s.bz).d - s.w / 2; if (q < m) m = q; }
    }
    return m;
  }
  for (const r of routes) emit(r);

  // ---- greens -------------------------------------------------------------------------------
  const greens = [];
  const rg = mulberry32(hash32(seed, 71));
  const polyAround = (c, R, n, sd, rot) => {
    const out = [];
    for (let i = 0; i < n; i++) { const a = rot + (i * TAU) / n, r = R * (1 + 0.1 * vn1(sd, i * 0.9)); out.push([+(c[0] + Math.cos(a) * r).toFixed(2), +(c[1] + Math.sin(a) * r).toFixed(2)]); }
    return out;
  };
  const sqRot = rg() * TAU;
  greens.push({ id: 'square', kind: 'square', at: [M[0], M[1]], r: Rsq, poly: polyAround(M, Rsq, 14, seed + 9, sqRot) });
  let greenC = null, greenR = 0;
  {
    const hubR = pointAt(mainR, 0), best = { d: 1e9 };
    // a village green beside the main road, between the hub and the square, on the side away from the hill
    let hi = 0, bd = 1e9;
    for (let i = 0; i < mainR.pts.length; i++) { const d = dist(mainR.pts[i][0], mainR.pts[i][1], H[0], H[1]); if (d < bd) { bd = d; hi = i; } }
    const p = pointAt(mainR, mainR.cum[hi]); void hubR; void best;
    for (const off of [26, 32, 38]) for (const sg of [1, -1]) {
      const x = p.x - p.tz * sg * off, z = p.z + p.tx * sg * off;
      const R = 10 + rg() * 3;
      if (!wetNear(x, z, R + 4) && W.e(x, z) > 1.3 && clearance(x, z, R) > 6 && dist(x, z, F[0], F[1]) > 50 && dM(x, z) > Rsq + R + 10) { greenC = [x, z]; greenR = R; break; }
    }
    if (greenC) greens.push({ id: 'green', kind: 'green', at: greenC, r: greenR, poly: polyAround(greenC, greenR, 12, seed + 13, rg() * TAU) });
  }

  // ---- plots ----------------------------------------------------------------------------------
  const plots = [], PG = new Map(), PC = 24;
  const pk = (i, j) => i * 92837111 ^ j * 689287499;
  function nearPlots(x, z) {
    const out = [], i0 = Math.floor(x / PC), j0 = Math.floor(z / PC);
    for (let a = i0 - 1; a <= i0 + 1; a++) for (let b = j0 - 1; b <= j0 + 1; b++) { const l = PG.get(pk(a, b)); if (l) for (const p of l) out.push(p); }
    return out;
  }
  function stampPlot(p) {
    const k = pk(Math.floor(p.at[0] / PC), Math.floor(p.at[1] / PC));
    let l = PG.get(k); if (!l) PG.set(k, (l = []));
    l.push(p);
    const rad = Math.hypot(p.w, p.d);
    const c0 = cellOf(p.at[0], p.at[1]);
    if (c0 < 0) return;
    const R = Math.ceil((rad + 9) / CELL), i0 = c0 % N, j0 = Math.floor(c0 / N);
    for (let j = j0 - R; j <= j0 + R; j++) for (let i = i0 - R; i <= i0 + R; i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const d = dist(GX + (i + 0.5) * CELL, GZ + (j + 0.5) * CELL, p.at[0], p.at[1]);
      const v = d < rad + 2 ? 600 : d < rad + 9 ? 6 : 0;
      if (v > pen[j * N + i]) pen[j * N + i] = v;
    }
  }
  const corridorDist = (x, z) => {
    let m = 1e9;
    for (let i = 0; i < corridor.length - 1; i++) { const d = segDist(x, z, corridor[i][0], corridor[i][1], corridor[i + 1][0], corridor[i + 1][1]).d; if (d < m) m = d; }
    return m;
  };
  const sqG = greens[0];
  /** Validate a candidate; returns the plot (without id) or null. Facing snaps to the nearest road. */
  function candidate(kind, x, z, w, d, jit, district, o = {}) {
    const near = nearestRoad(x, z, 30);
    if (!near) return null;
    let f = Math.atan2(near.x - x, near.z - z) + jit;
    const p = { kind, at: [x, z], facing: f, w, d, district: district || districtAt(x, z), row: o.row || 'u' + plots.length, _base: f - jit, _jit: jit };
    const low = LOW.has(kind);
    if (dist(x, z, F[0], F[1]) - Math.hypot(w, d) < 25) return null; // stair apron
    for (const q of nearPlots(x, z)) if (rectsOverlap(p, q, q.row === p.row ? 0.0005 : 0.5)) return null; // party walls only within one frontage
    const S = rectSamples(x, z, w, d, f);
    const need = o.need ?? (low ? 1.0 : 1.4);
    let hmin = 1e9, hmax = -1e9;
    for (const [sx, sz] of S) {
      if (W.e(sx, sz) < 1.08) return null;
      if (clearance(sx, sz, need) < need) return null;
      if (!low && corridorDist(sx, sz) < 6.5) return null;
      if (low && corridorDist(sx, sz) < 4) return null;
      for (const g of greens) if (!(kind === 'stall' && g === sqG) && kind !== 'well' && dist(sx, sz, g.at[0], g.at[1]) < g.r + 1) return null;
      const hy = W.h(sx, sz); if (hy < hmin) hmin = hy; if (hy > hmax) hmax = hy;
    }
    if (hmax - hmin > 3.2) return null;
    // water + 4 m
    const iw = w + 4.2, id = d + 4.2, A = rectAxes(f);
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) if (W.wet(x + A.rx * iw * a / 3 + A.nx * id * b / 3, z + A.rz * iw * a / 3 + A.nz * id * b / 3)) return null;
    p.y = (hmin + hmax) / 2;
    return p;
  }
  function commit(p) {
    p.id = 'p' + plots.length;
    p.seed = hash32(seed, plots.length, 77);
    delete p._unused;
    plots.push(p); stampPlot(p);
    return p;
  }
  const isBuilding = (p) => !LOW.has(p.kind);
  let nBuildings = 0;
  const cap = opts.maxBuildings ?? 134;
  const place = (p) => { if (!p) return null; commit(p); if (isBuilding(p)) nBuildings++; return p; };
  const SIZE = {
    house: [3.0, 4.4, 3.0, 4.0], house2: [3.6, 5.0, 3.8, 5.0], shop: [2.7, 3.6, 4.2, 5.4], workshop: [4.2, 5.8, 3.8, 5.2],
    barn: [4.6, 6.8, 3.8, 5.0], farm: [5.0, 6.0, 4.0, 4.8],
  };
  const dim = (rr, kind, scale = 1) => { const s = SIZE[kind]; return [(s[0] + rr() * (s[1] - s[0])) * scale, (s[2] + rr() * (s[3] - s[2])) * scale]; };

  // landmarks: hall on the square, then the chapel
  {
    const rr = mulberry32(hash32(seed, 81));
    const a0 = rr() * TAU;
    for (let k = 0; k < 120 && !plots.some((p) => p.kind === 'hall'); k++) {
      const a = a0 + (k * TAU) / 24, w = 8, d = 5.8;
      const rad = Rsq + d + 2.5 + Math.floor(k / 24) * 3;
      place(candidate('hall', M[0] + Math.cos(a) * rad, M[1] + Math.sin(a) * rad, w, d, 0, 'centre'));
    }
    // market stalls: 6-10 on the square
    const nStalls = 6 + (hash32(seed, 85) % 5);
    let n = 0;
    for (let k = 0; k < 260 && n < nStalls; k++) {
      const a = k < 14 ? (k * TAU) / 14 + rr() * 0.3 + a0 : rr() * TAU, r = Rsq * (0.35 + rr() * 0.5);
      if (place(candidate('stall', M[0] + Math.cos(a) * r, M[1] + Math.sin(a) * r, 1.3, 0.95, (rr() - 0.5) * 0.2, 'centre'))) n++;
    }
    // building fronts around the square: shops and tall houses shoulder to shoulder
    for (let pass = 0; pass < 2; pass++) {
      let a = rr() * TAU, swept = 0, guard = 0;
      while (swept < TAU && guard++ < 120) {
        const kind = rr() < 0.55 ? 'shop' : rr() < 0.75 ? 'house2' : 'house', [w, d] = dim(rr, kind);
        const rad = Rsq + 1.8 + d + rr() * 0.8, da = (w * 2) / rad;
        const ang = a + da / 2;
        const pl = place(candidate(kind, M[0] + Math.cos(ang) * rad, M[1] + Math.sin(ang) * rad, w, d, (rr() - 0.5) * 0.08, 'centre', { row: 'sq' + pass, need: 0.35 }));
        const adv = pl ? da + (rr() < 0.15 ? 2.2 / rad : rr() * 1.2 / rad) : 0.07;
        a += adv; swept += adv;
      }
    }
    // chapel: beside a street in the lower village, 45-80 m from the square
    const cands = [];
    for (const r of routes) if (r.kind !== 'lane') for (let s = 20; s < r.cum[r.cum.length - 1] - 16; s += 6) for (const side of [1, -1]) cands.push([r, s, side, hash32(seed, 83, cands.length)]);
    cands.sort((a, b) => a[3] - b[3]);
    for (const [r, s, side] of cands) {
      const q = pointAt(r, s), dm = dM(q.x, q.z);
      if (dm < 45 || dm > 100) continue;
      const w = 4.8, d = 8.5, sb = WIDTH[r.kind] / 2 + 2.4 + d;
      if (place(candidate('chapel', q.x - q.tz * side * sb, q.z + q.tx * side * sb, w, d, 0, districtAt(q.x, q.z)))) break;
    }
  }

  // frontage fill
  const order = routes.filter((r) => r.kind !== 'path');
  const PP = { centre: 1, lower: 1, edge: 0.55 };
  function pickKind(rr, district, rk) {
    const r = rr();
    let k;
    if (district === 'centre') k = r < 0.12 ? 'house' : r < 0.52 ? 'house2' : r < 0.98 ? 'shop' : 'workshop';
    else if (district === 'lower') k = r < 0.5 ? 'house' : r < 0.7 ? 'house2' : r < 0.8 ? 'shop' : r < 0.94 ? 'workshop' : 'barn';
    else k = r < 0.52 ? 'house' : r < 0.6 ? 'house2' : r < 0.74 ? 'workshop' : 'barn';
    if (rk === 'lane' && k === 'shop') k = 'house';
    return k;
  }
  for (const rt of order) {
    const L = rt.cum[rt.cum.length - 1], hw = WIDTH[rt.kind] / 2;
    for (const side of [1, -1]) {
      const rr = mulberry32(hash32(seed, 91, hash32(rt.id.length, rt.id.charCodeAt(rt.id.length - 1), side + 5)));
      let s = 4 + rr() * 5;
      while (s < L - 4 && nBuildings < cap) {
        const q0 = pointAt(rt, s), district = districtAt(q0.x, q0.z);
        if (district === 'farm') { s += 8; continue; }
        if (rr() > PP[district] * (rt.kind === 'lane' ? 0.9 : 1)) { s += 3 + rr() * (district === 'edge' ? 10 : 5); continue; }
        const kind = pickKind(rr, district, rt.kind);
        let placed = null, w = 0;
        const row = rt.id + ':' + side, dense = district !== 'edge';
        for (let att = 0; att < 5 && !placed; att++) {
          const sc = 1 - att * 0.08;
          const dm = dim(rr, kind, sc); w = dm[0]; const d = dm[1];
          const q = pointAt(rt, Math.min(L - 1, s + w + att * 0.3));
          // irregular frontage: a slow drift, a step forward/back of 0.3-1 m, and the odd slanted building
          const step = (rr() < 0.5 ? -1 : 1) * (0.3 + rr() * 0.7) * (rr() < 0.6 ? 1 : 0);
          const jit = att > 2 ? 0 : district === 'centre' ? 0.5 * vn1(seed + 17, s * 0.06) + step : district === 'lower' ? 0.9 * vn1(seed + 17, s * 0.06) + step * 1.3 : 1.5 + rr() * 6;
          let front = district === 'centre' ? 0.5 + rr() * 1.0 : district === 'lower' ? 1.0 + rr() * 2.0 : 2.5 + rr() * 2;
          const cd = rt.kind === 'main' ? corridorDist(q.x, q.z) : 99;
          if (cd < 3) front = Math.max(front, 6.8 - hw); // the sightline corridor: stand back from the main road's last 120 m
          front += att * 0.5;
          const sb = hw + front + d + Math.max(0, jit);
          const x = q.x - q.tz * side * sb, z = q.z + q.tx * side * sb;
          const slant = dense && rr() < 0.15 ? (rr() - 0.5) * 0.3 : (rr() - 0.5) * (dense ? 0.06 : 0.14);
          placed = place(candidate(kind, x, z, w, d, slant, district, { row, need: dense ? 0.35 : 1.4 }));
          const pb = district === 'centre' ? 0.6 : district === 'lower' ? 0.5 : 0.18;
          if (placed && rr() < pb && nBuildings < cap) {
            // back lot: a second building (or yard outbuilding) behind the frontage
            const bk = district === 'centre' ? (rr() < 0.5 ? 'house' : 'house2') : district === 'lower' ? (rr() < 0.5 ? 'house' : rr() < 0.6 ? 'workshop' : 'barn') : 'barn';
            const w2 = Math.min(w, 2.6 + rr() * 1.6), d2 = 2.4 + rr() * 1.3, gap = 1.2 + rr() * 1.8;
            const bx = x + (-q.tz * side) * (d + d2 + gap), bz = z + q.tx * side * (d + d2 + gap);
            place(candidate(bk, bx, bz, w2, d2, (rr() - 0.5) * 0.2, district, { row: row + ':b', need: 0.35 }));
          }
        }
        const alley = dense && rr() < (district === 'centre' ? 0.12 : 0.1);
        const gap = alley ? 2 + rr() * 1.2 : district === 'centre' ? rr() * 1.5 : district === 'lower' ? 0.3 + rr() * 2.2 : 3 + rr() * 11;
        s += placed ? w * 2 + gap : dense ? 1.5 : 3;
      }
    }
  }

  // wells: square, green (or a street), and an edge junction
  {
    const rr = mulberry32(hash32(seed, 95));
    const tryWell = (x, z) => place(candidate('well', x, z, 1.1, 1.1, 0, districtAt(x, z)));
    for (let k = 0; k < 20; k++) { const a = rr() * TAU; if (tryWell(M[0] + Math.cos(a) * (Rsq * 0.7), M[1] + Math.sin(a) * (Rsq * 0.7))) break; }
    if (greenC) for (let k = 0; k < 20; k++) { const a = rr() * TAU; if (tryWell(greenC[0] + Math.cos(a) * (greenR - 2.5), greenC[1] + Math.sin(a) * (greenR - 2.5))) break; }
    const hosts = routes.filter((r) => r.kind === 'street' || r.kind === 'lane');
    for (let k = 0; k < 60 && plots.filter((p) => p.kind === 'well').length < 3 && hosts.length; k++) {
      const r = hosts[Math.floor(rr() * hosts.length)], q = pointAt(r, rr() * r.cum[r.cum.length - 1]), side = rr() < 0.5 ? 1 : -1;
      const dm = dM(q.x, q.z);
      if (dm < 40) continue;
      tryWell(q.x - q.tz * side * (WIDTH[r.kind] / 2 + 2.6), q.z + q.tx * side * (WIDTH[r.kind] / 2 + 2.6));
    }
  }

  // farmsteads out in the meadow, each on its own footpath
  {
    const rr = mulberry32(hash32(seed, 101));
    const want = 5 + (hash32(seed, 103) % 3), farms = [];
    for (let k = 0; k < 90 && farms.length < want; k++) {
      const a = rr() * TAU, r = 100 + rr() * 85, x = M[0] + Math.cos(a) * r, z = M[1] + Math.sin(a) * r;
      if (farms.some((q) => dist(q[0], q[1], x, z) < 50)) continue;
      const c = cellOf(x, z);
      if (c < 0 || info(c) !== 1 || W.e(x, z) < 1.25) continue;
      const near = nearestRoad(x, z, 200);
      if (!near || near.d < 22) continue;
      const [w, d] = dim(rr, 'farm');
      const f = Math.atan2(near.x - x, near.z - z) + (rr() - 0.5) * 0.5;
      // path end: just in front of the farmhouse
      const ex = x + Math.sin(f) * (d + 3.5), ez = z + Math.cos(f) * (d + 3.5);
      if (wetNear(ex, ez, 3)) continue;
      const path = route([near.x, near.z], [ex, ez], { avoidFoot: true, slopeK: 90, noise: 0.5 });
      if (!path) continue;
      const pl = cumLen(path); if (pl[pl.length - 1] > near.d * 2.2 + 30) continue;
      // clip at water/hill: reject the farm instead
      if (path.some((p) => W.wet(p[0], p[1]) || W.e(p[0], p[1]) < 1.03)) continue;
      // the farmhouse is validated against the road set WITH its path
      const pr = { id: 'path' + farms.length, kind: 'path', pts: path, cum: pl };
      const before = roads.length;
      routes.push(pr);
      const pc = { id: pr.id, route: pr.id, pts: path.map((p) => [+p[0].toFixed(2), +p[1].toFixed(2)]), width: WIDTH.path, surface: 'grass', kind: 'path' };
      roads.push(pc); const pathSegs = addSegs(pc.pts, WIDTH.path);
      const farm = place(candidate('farm', x, z, w, d, 0, 'farm'));
      if (!farm) { roads.length = before; routes.pop(); removeSegs(pathSegs); continue; }
      farms.push([x, z]);
      stampRoad(path);
      const right = [Math.cos(farm.facing), -Math.sin(farm.facing)], nrm = [Math.sin(farm.facing), Math.cos(farm.facing)];
      let nb = 0;
      for (let b = 0; b < 6 && nb < 2; b++) {
        const kind = nb === 0 || rr() < 0.6 ? 'barn' : 'house';
        const [bw, bd] = dim(rr, kind), sg = nb === 0 ? (rr() < 0.5 ? 1 : -1) : -Math.sign(plots[plots.length - 1].at[0] - x || 1);
        const lat = (w + bw + 3 + rr() * 5) * sg, dep = (rr() - 0.3) * 6;
        if (place(candidate(kind, x + right[0] * lat + nrm[0] * dep, z + right[1] * lat + nrm[1] * dep, bw, bd, (rr() - 0.5) * 0.4, 'farm'))) nb++;
      }
    }
    // a few outlying cottages along the footpaths
    for (let k = 0; k < 14 && plots.filter((p) => p.district === 'farm' && p.kind === 'house').length < 3; k++) {
      const paths = routes.filter((r) => r.kind === 'path');
      if (!paths.length) break;
      const r = paths[Math.floor(rr() * paths.length)], L = r.cum[r.cum.length - 1];
      const q = pointAt(r, L * (0.2 + 0.6 * rr())), side = rr() < 0.5 ? 1 : -1, [w, d] = dim(rr, 'house');
      place(candidate('house', q.x - q.tz * side * (d + 3.5), q.z + q.tx * side * (d + 3.5), w, d, (rr() - 0.5) * 0.2, 'farm'));
    }
  }

  // final pass: faces re-snapped to the nearest road if a late path changed it; drop what no longer fits
  {
    const kept = [];
    for (const p of plots) {
      const near = nearestRoad(p.at[0], p.at[1], 30);
      if (!near) continue;
      const base = Math.atan2(near.x - p.at[0], near.z - p.at[1]);
      if (angDiff(p.facing, base) > 0.55) {
        const nf = base + p._jit;
        const t = { ...p, facing: nf };
        let ok = true;
        for (const o of nearPlots(p.at[0], p.at[1])) if (o !== p && rectsOverlap(t, o, o.row === p.row ? 0.0005 : 0.5)) { ok = false; break; }
        if (ok && corridorDist(p.at[0], p.at[1]) > 0) p.facing = nf; else continue;
      }
      kept.push(p);
    }
    plots.length = 0;
    kept.forEach((p, i) => { p.id = 'p' + i; delete p._base; delete p._jit; p.at = [+p.at[0].toFixed(2), +p.at[1].toFixed(2)]; p.facing = +p.facing.toFixed(4); if (/^u\d+$/.test(p.row)) p.row = p.id; p.w = +p.w.toFixed(2); p.d = +p.d.toFixed(2); p.y = +p.y.toFixed(2); plots.push(p); });
  }

  // ---- lights ---------------------------------------------------------------------------------
  const lights = [];
  const lampOk = (x, z) => {
    if (W.wet(x, z) || W.e(x, z) < 1.03) return false;
    for (const p of nearPlots(x, z)) if (inRect(p, x, z, 0.1)) return false;
    return true;
  };
  for (const rt of routes) {
    if (rt.kind !== 'main' && rt.kind !== 'street') continue;
    const rr = mulberry32(hash32(seed, 111, rt.id.length * 31 + rt.id.charCodeAt(rt.id.length - 1)));
    const L = rt.cum[rt.cum.length - 1], hw = WIDTH[rt.kind] / 2;
    let s = 6 + rr() * 6, side = rr() < 0.5 ? 1 : -1;
    while (s < L - 4) {
      for (const dl of [0, 2, -2]) {
        const q = pointAt(rt, s + dl);
        const x = q.x - q.tz * side * (hw + 0.2), z = q.z + q.tx * side * (hw + 0.2);
        if (dist(x, z, F[0], F[1]) < 5) continue;
        if (lampOk(x, z)) { lights.push({ at: [+x.toFixed(2), +z.toFixed(2)], kind: 'lamp', road: rt.id, s: +(s + dl).toFixed(1) }); break; }
      }
      side = -side;
      s += 14 + rr() * 4;
    }
  }
  // square corners
  {
    const poly = sqG.poly;
    for (let i = 0; i < 4; i++) {
      const v = poly[Math.round((i * poly.length) / 4) % poly.length];
      const a = Math.atan2(v[1] - M[1], v[0] - M[0]);
      const x = M[0] + Math.cos(a) * (Rsq + 1.5), z = M[1] + Math.sin(a) * (Rsq + 1.5);
      if (lampOk(x, z) && clearance(x, z, 0) > 0.8) lights.push({ at: [+x.toFixed(2), +z.toFixed(2)], kind: 'lamp', road: null, why: 'square' });
    }
  }
  // the stair foot: a lamp either side of the approach
  {
    const q = pointAt(mainR, mainL - 0.01), back = pointAt(mainR, mainL - 8);
    void back;
    for (const side of [1, -1]) {
      const x = F[0] - q.tz * side * 6 - q.tx * 3, z = F[1] + q.tx * side * 6 - q.tz * 3;
      if (lampOk(x, z)) lights.push({ at: [+x.toFixed(2), +z.toFixed(2)], kind: 'lamp', road: null, why: 'stair-foot' });
    }
  }

  return {
    roads, plots, lights, greens,
    meta: {
      seed, market: M.slice(), marketRadius: Rsq, foot: F.slice(), hub: H.slice(), entry: E.slice(),
      corridor: corridor.map((p) => [+p[0].toFixed(2), +p[1].toFixed(2)]),
      mainLength: +mainL.toFixed(1),
      buildings: plots.filter(isBuilding).length,
    },
  };
}
