// Costume parts that do not move as cloth (docs/people-and-cutscenes.md §1.2): rigid meshes carried on a
// Veiled's head or hand, drawn by render/costume.js. Built here from code, at hand-held detail:
//   the Sow's broad straw hat: a crown and drooping brim sewn from one coiled plait (the coils and the
//     plait are the shader's, from uv: u round, v metres along the profile; info.z the radius there),
//     a madder band with its knot tails at the back;
//   an oval willow basket: woven sides (weavers over and under the stakes, real relief), a rolled rim,
//     a twisted handle and a heap of figs.
// Every vertex: position, normal, uv, a tangent (xyz round the part, w unused) and info
// (x = material, y = seed, z = radius or extra, w = 0..1 thinness for transmitted light).
// Local frames: the hat's origin is the middle of its crown's base ring (y up, z the face); the basket's
// is the grip at the top of its handle (the basket hangs below, its long axis along z).

export const COSTUME_MAT = { STRAW: 0, BAND: 1, WICKER: 2, WRAP: 3, FIG: 4, BASE: 5 };

const TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

class Geo {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.tan = []; this.info = []; this.idx = []; }
  get n() { return this.pos.length / 3; }
  /**
   * A grid surface: f(u, v, out) writes the point for u ∈ [0, 1] (round) and v ∈ [0, 1] (along) into out
   * and returns the info z. Normals and tangents by differences; uv = (u, arc length along v in metres).
   * flip turns the normal inward. `wrap` closes u (the seam column is duplicated for the uv).
   */
  grid(nu, nv, f, mat, seed, flip = false, thin = 0, vScale = null) {
    const base = this.n, P = [0, 0, 0], A = [0, 0, 0], B = [0, 0, 0], du = 1e-4, dv = 1e-4;
    // Arc length along v at u = 0.25 (good enough for a lathe: the profile is the same all round).
    const arc = new Float64Array(nv + 1);
    { let prev = [0, 0, 0]; f(0.25, 0, prev);
      for (let j = 1; j <= nv; j++) { const q = [0, 0, 0]; f(0.25, j / nv, q); arc[j] = arc[j - 1] + Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]); prev = q; } }
    for (let j = 0; j <= nv; j++) {
      const v = j / nv;
      for (let i = 0; i <= nu; i++) {
        const u = i / nu;
        const z = f(u, v, P);
        // At a pole (a lathe's axis: the hat's crown, a fig's ends) dP/du vanishes: take the frame a little way off it.
        let tx = 0, ty = 0, tz = 0, sx = 0, sy = 0, sz = 0, nx = 0, ny = 0, nz = 0;
        for (let k = 0; k < 4; k++) {
          const vv = k === 0 ? v : v + (v < 0.5 ? 1 : -1) * 0.004 * k;
          f(u + du, vv, A); f(u - du, vv, B);
          tx = A[0] - B[0]; ty = A[1] - B[1]; tz = A[2] - B[2];
          f(u, Math.min(1, vv + dv), A); f(u, Math.max(0, vv - dv), B);
          sx = A[0] - B[0]; sy = A[1] - B[1]; sz = A[2] - B[2];
          // n = dP/dv × dP/du (outward for a lathe whose v runs down its profile and u anticlockwise from above).
          nx = sy * tz - sz * ty; ny = sz * tx - sx * tz; nz = sx * ty - sy * tx;
          if (Math.hypot(nx, ny, nz) > 1e-14 && Math.hypot(tx, ty, tz) > 1e-9) break;
        }
        let l = Math.hypot(nx, ny, nz); if (!(l > 0)) { nx = 0; ny = 1; nz = 0; l = 1; } if (flip) l = -l;
        let tl = Math.hypot(tx, ty, tz); if (!(tl > 0)) { tx = 1; ty = 0; tz = 0; tl = 1; }
        this.pos.push(P[0], P[1], P[2]);
        this.nrm.push(nx / l, ny / l, nz / l);
        this.uv.push(u, vScale ? v * vScale : arc[j]);
        this.tan.push(tx / tl, ty / tl, tz / tl, 0);
        this.info.push(mat, seed, z ?? 0, thin);
      }
    }
    const row = nu + 1;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * row + i, b = a + 1, c = a + row, d = c + 1;
      if (flip) this.idx.push(a, b, c, b, d, c); else this.idx.push(a, c, b, b, c, d);
    }
  }
  out() {
    return {
      positions: new Float32Array(this.pos), normals: new Float32Array(this.nrm), uvs: new Float32Array(this.uv),
      tangents: new Float32Array(this.tan), info: new Float32Array(this.info), indices: new Uint32Array(this.idx),
    };
  }
}

/** Catmull-Rom through control points [[r, y], …], resampled by arc length: returns s ∈ [0, 1] → [r, y]. */
function profile(pts) {
  const dense = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(pts.length - 1, k + 2)];
    for (let t = 0; t < 1; t += 1 / 32) {
      const t2 = t * t, t3 = t2 * t;
      const c = (a, b, c2, d) => 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3);
      dense.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push(pts[pts.length - 1]);
  const L = [0];
  for (let k = 1; k < dense.length; k++) L.push(L[k - 1] + Math.hypot(dense[k][0] - dense[k - 1][0], dense[k][1] - dense[k - 1][1]));
  const total = L[L.length - 1];
  return (s) => {
    const want = s * total;
    let lo = 0, hi = L.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] < want) lo = m; else hi = m; }
    const t = (want - L[lo]) / Math.max(1e-9, L[hi] - L[lo]);
    return [lerp(dense[lo][0], dense[hi][0], t), lerp(dense[lo][1], dense[hi][1], t)];
  };
}

/**
 * The Sow's straw hat (detail: 1 full, 0.5 for far figures). One closed profile from the crown's top over
 * the brim's edge and back under it to the inside of the crown, so the coils run on unbroken.
 */
export function buildStrawHat(detail = 1) {
  const g = new Geo();
  const prof = profile([
    [0.0, 0.152], [0.05, 0.149], [0.1, 0.138], [0.138, 0.117], [0.158, 0.086], [0.168, 0.05], [0.173, 0.02], [0.178, 0.004],
    [0.198, -0.004], [0.235, -0.012], [0.272, -0.024], [0.302, -0.038], [0.318, -0.047],
    [0.321, -0.053], [0.314, -0.054],                                    // the rolled edge
    [0.285, -0.043], [0.245, -0.028], [0.205, -0.017], [0.18, -0.012],  // under the brim
    [0.168, 0.004], [0.163, 0.04], [0.15, 0.08],                         // the inside of the crown (seen from below)
  ]);
  const EDGE = 0.64;   // s where the outer surface ends at the rolled edge (the rest is the underside)
  g.grid(Math.round(128 * detail), Math.round(150 * detail), (u, s, o) => {
    const th = u * TAU;
    const [r, y] = prof(s);
    // The brim droops a little unevenly (hand-sewn, worn): a slow wave round it, more at the edge.
    const tb = smooth(0.18, 0.32, r);
    const wave = tb * (0.011 * Math.sin(2 * th + 0.7) + 0.006 * Math.sin(3 * th + 2.1) + 0.003 * Math.sin(7 * th + 0.4));
    // The crown is a little oval (a head is longer than it is wide); the brim round.
    const kx = lerp(0.94, 1, tb);
    o[0] = Math.sin(th) * r * kx; o[2] = Math.cos(th) * r; o[1] = y + wave;
    return r;
  }, COSTUME_MAT.STRAW, 0, false, 0);
  // The thinness (for light through the brim) and which side: info.w 0 on the crown, up to 1 at the edge;
  // the underside is marked by a negative thinness (shader: abs, and darker, unbleached).
  {
    const nu = Math.round(128 * detail), nv = Math.round(150 * detail);
    for (let j = 0; j <= nv; j++) {
      const s = j / nv, [r] = prof(s), under = s > EDGE;
      for (let i = 0; i <= nu; i++) { const k = (j * (nu + 1) + i) * 4; g.info[k + 3] = smooth(0.185, 0.3, r) * (under ? -1 : 1) - (under && r < 0.185 ? 0.001 : 0); }
    }
  }
  // The band: a madder strip round the crown's foot, knotted at the back with two tails.
  g.grid(Math.round(96 * detail), 6, (u, v, o) => {
    const th = u * TAU, y = lerp(0.036, 0.003, v), r = lerp(0.1712, 0.1792, smooth(0, 1, (0.036 - y) / 0.033)) + 0.0035 * Math.sin(Math.PI * v);
    o[0] = Math.sin(th) * r * lerp(0.94, 0.95, v); o[2] = Math.cos(th) * r; o[1] = y;
    return 0;
  }, COSTUME_MAT.BAND, 1, false, 0, 0.035);
  for (const side of [-1, 1]) {
    // Each tail: a ribbon from the knot, down and out over the brim, a slight twist and a forked end (alpha in the shader).
    g.grid(4, 14, (u, v, o) => {
      const w = 0.026, len = 0.13;
      const a = Math.PI + side * 0.16 + side * v * 0.12;
      const r = 0.183 + v * 0.06, y = 0.022 - v * len * 0.55 - v * v * 0.02;
      const across = (u - 0.5) * w * (1 - 0.15 * v), tw = side * v * 0.5;
      // Ribbon plane: along the band's tangent, twisting.
      const tx = Math.cos(a), tz = -Math.sin(a);
      o[0] = Math.sin(a) * r + tx * across * Math.cos(tw); o[2] = Math.cos(a) * r + tz * across * Math.cos(tw); o[1] = y + across * Math.sin(tw);
      return v;
    }, COSTUME_MAT.BAND, 2 + (side + 1) / 2, false, 0.6, len());
  }
  function len() { return 0.13; }
  return g.out();
}

/** The Sow's willow basket, oval, carried by its handle; figs heaped inside. */
export function buildBasket(detail = 1) {
  const g = new Geo();
  const RIM = -0.17, DEPTH = 0.2, RX = 0.14, RZ = 0.19, ROWS = 17, STAKES = 28;
  const rowH = DEPTH / ROWS;
  const kOf = (s) => 0.8 + 0.2 * s + 0.07 * Math.sin(Math.PI * s);   // the profile's scale: s 0 bottom → 1 rim
  // The sides: weavers over and under the stakes (real relief, so the silhouette is a basket's).
  const side = (inset) => (u, v, o) => {
    const th = u * TAU, s = v, y = RIM - DEPTH * (1 - s), k = kOf(s);
    const h = (1 - s) * DEPTH, row = Math.floor(h / rowH), f = h / rowH - row;
    const tube = Math.sqrt(Math.max(0, Math.sin(Math.PI * f)));
    const ou = Math.cos(th * STAKES / 2 + Math.PI * row);
    const d = inset ? -0.006 : (0.0034 * tube + 0.0026 * ou * tube - 0.0018);
    const ex = RX * k + d, ez = RZ * k + d;
    o[0] = Math.sin(th) * ex; o[2] = Math.cos(th) * ez; o[1] = y;
    return k;
  };
  g.grid(Math.round(168 * detail), Math.round(ROWS * 4 * detail), side(false), COSTUME_MAT.WICKER, 0, true, 0, DEPTH);
  g.grid(Math.round(56 * detail), Math.round(ROWS * detail), side(true), COSTUME_MAT.WICKER, 1, false, 0, DEPTH);
  // The base: a flat oval underneath, slightly domed in.
  g.grid(Math.round(56 * detail), 8, (u, v, o) => {
    const th = u * TAU, k = kOf(0) * v;
    o[0] = Math.sin(th) * RX * k; o[2] = Math.cos(th) * RZ * k; o[1] = RIM - DEPTH + 0.008 * (1 - v * v);
    return v;
  }, COSTUME_MAT.BASE, 0, false, 0, 0.15);
  // The rim: a rolled oval, wrapped (spiral in the shader).
  const tubeR = 0.0125, rk = kOf(1);
  g.grid(Math.round(168 * detail), Math.round(10 * detail), (u, v, o) => {
    const th = u * TAU, a = v * TAU;
    const ex = RX * rk + 0.002 + tubeR * Math.cos(a), ez = RZ * rk + 0.002 + tubeR * Math.cos(a);
    o[0] = Math.sin(th) * ex; o[2] = Math.cos(th) * ez; o[1] = RIM + 0.004 + tubeR * Math.sin(a);
    return 0;
  }, COSTUME_MAT.WRAP, 0, true, 0, TAU * tubeR);
  // The handle: two twisted rods as one thick wrapped tube, an arch over the long axis from end to end.
  const hz = RZ * rk + 0.002, hr = 0.0105;
  const arch = (t, o) => {   // t ∈ [0, 1] from one end to the other
    const a = (t - 0.5) * Math.PI;
    o[0] = 0; o[2] = Math.sin(a) * hz; o[1] = RIM + 0.004 + (0 - RIM - 0.004) * Math.cos(a);
  };
  const A0 = [0, 0, 0], A1 = [0, 0, 0];
  g.grid(Math.round(64 * detail), Math.round(12 * detail), (u, v, o) => {
    arch(u, A0); arch(Math.min(1, u + 0.002), A1);
    if (u >= 1) { arch(u - 0.002, A1); const t = [A0[0] - A1[0], A0[1] - A1[1], A0[2] - A1[2]]; A1[0] = A0[0] + t[0]; A1[1] = A0[1] + t[1]; A1[2] = A0[2] + t[2]; }
    let tx = A1[0] - A0[0], ty = A1[1] - A0[1], tz = A1[2] - A0[2]; const l = Math.hypot(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
    // Frame: the arch lies in the y-z plane, so x is one normal and (t × x) the other.
    const nx = 1, ny = 0, nz = 0, bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
    const a = v * TAU, c = Math.cos(a) * hr, s = Math.sin(a) * hr;
    o[0] = A0[0] + nx * c + bx * s; o[1] = A0[1] + ny * c + by * s; o[2] = A0[2] + nz * c + bz * s;
    return 1;
  }, COSTUME_MAT.WRAP, 1, false, 0, TAU * hr);
  // Figs: a heap, highest in the middle, under the rim at the ends (where the handle meets it).
  let seed = 3;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const figs = [];
  for (let k = 0; k < 400 && figs.length < Math.round(26 * Math.max(0.5, detail)); k++) {
    const th = rnd() * TAU, rr = Math.sqrt(rnd()) * 0.86;
    const x = Math.sin(th) * RX * rk * rr, z = Math.cos(th) * RZ * rk * rr;
    const mound = 0.03 * (1 - rr * rr);
    const y = RIM - 0.025 + mound + (rnd() - 0.5) * 0.008;
    if (figs.some((f) => Math.hypot(f[0] - x, (f[1] - y) * 1.4, f[2] - z) < 0.038)) continue;
    figs.push([x, y, z, rnd() * TAU, (rnd() - 0.5) * 1.6, 0.85 + rnd() * 0.3, rnd()]);
  }
  for (const [x, y, z, yaw, tilt, sz, sd] of figs) {
    const R = 0.021 * sz, cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
    g.grid(Math.round(14 * Math.max(0.6, detail)), Math.round(10 * Math.max(0.6, detail)), (u, v, o) => {
      // A fig: round below, drawn up to a neck and a stub of stem.
      const th = u * TAU, ph = v * Math.PI;   // ph 0 at the stem
      const neck = Math.pow(Math.sin(ph * 0.5), 0.9);
      const r = R * Math.sin(ph) * (0.55 + 0.45 * neck) * (1 + 0.04 * Math.sin(th * 5 + sd * 9));
      let lx = Math.sin(th) * r, lz = Math.cos(th) * r, ly = R * 1.25 * Math.cos(ph) + (ph < 0.25 ? 0.004 : 0);
      // tilt about x, then yaw
      const y2 = ly * ct - lz * st, z2 = ly * st + lz * ct;
      o[0] = x + lx * cy + z2 * sy; o[2] = z - lx * sy + z2 * cy; o[1] = y + y2;
      return v;
    }, COSTUME_MAT.FIG, sd, false, 0, 1);
  }
  return g.out();
}
