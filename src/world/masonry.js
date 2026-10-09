// Masonry (PLAN.md V4): Shaper stonework laid block by block instead of drawn on a box. A wall is
// courses of blocks of varied length; each block is a chamfered box whose visible faces only are
// emitted (the faces against a neighbour are hidden, the chamfers either side form the joint), so
// walls read as real stonework from any distance with a few vertices per block. Columns are stacks
// of drums with smooth normals and chamfered beds. Ruined tops break off in steps.
//
// Pure geometry on the Builder (world/architecture.js): positions in the site frame, per-block
// seeds (the shader picks the scan, its offset and tint from them). Deterministic.

const TAU = Math.PI * 2;

/** Mulberry-ish hash of two ints → [0, 1). */
export function h2(a, b) {
  let x = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d); x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

/**
 * One chamfered block. Local frame: axes ex (right), ey (up), ez (forward), centre o; half extents
 * a (x), b (y), c (z); chamfer k. `faces`: bit mask of faces to emit: 1 +x, 2 −x, 4 +y, 8 −y,
 * 16 +z, 32 −z. Each emitted face brings its inset face and the chamfer strips and corners round
 * it (a strip shared with another emitted face is emitted once, by the lower bit).
 */
export function chamferBlock(B, o, ex, ey, ez, a, b, c, k, faces, mat, seed, carve = 0, fbOnly = false) {
  const P = (x, y, z) => [o[0] + ex[0] * x + ey[0] * y + ez[0] * z, o[1] + ex[1] * x + ey[1] * y + ez[1] * z, o[2] + ex[2] * x + ey[2] * y + ez[2] * z];
  const H = [a, b, c];
  // Face f: axis i = f >> 1, sign s = f & 1 ? −1 : +1 (bit order +x, −x, +y, −y, +z, −z).
  const pt = (i, s, u, v) => { // a point on face (i, s) with in-plane coordinates (u along j, v along l)
    const j = (i + 1) % 3, l = (i + 2) % 3, q = [0, 0, 0];
    q[i] = s * H[i]; q[j] = u; q[l] = v; return q;
  };
  const emit = (qa, qb, qc, qd, out) => {
    // Order so the quad faces `out` (Builder.quad computes an outward normal as −(ab × ad)).
    const A = P(...qa), Bp = P(...qb), C = P(...qc), D = P(...qd);
    const ux = [Bp[0] - A[0], Bp[1] - A[1], Bp[2] - A[2]], vx = [D[0] - A[0], D[1] - A[1], D[2] - A[2]];
    const n = [ux[1] * vx[2] - ux[2] * vx[1], ux[2] * vx[0] - ux[0] * vx[2], ux[0] * vx[1] - ux[1] * vx[0]];
    const O = [ex[0] * out[0] + ey[0] * out[1] + ez[0] * out[2], ex[1] * out[0] + ey[1] * out[1] + ez[1] * out[2], ex[2] * out[0] + ey[2] * out[1] + ez[2] * out[2]];
    const cv = fbOnly && Math.abs(out[2]) < 0.5 ? 0 : carve;
    if (n[0] * O[0] + n[1] * O[1] + n[2] * O[2] > 0) B.quad(A, Bp, C, D, mat, seed, cv, uvOf(O, A, Bp, C, D));
    else B.quad(A, D, C, Bp, mat, seed, cv, uvOf(O, A, D, C, Bp));
  };
  // Face UVs in metres, consistent across a block: tops in plan, sides along the face (u from the
  // face's left edge seen from outside, v up from the block's foot) — carved bands and symbols sit
  // where the old single-box faces had them.
  const yFoot = o[1] - Math.abs(ey[1]) * b - Math.abs(ex[1]) * a - Math.abs(ez[1]) * c;
  function uvOf(O, ...pts) {
    const out = [];
    if (Math.abs(O[1]) > 0.7) { for (const p of pts) out.push(p[0], p[2]); return out; }
    const l = Math.hypot(O[0], O[2]) || 1, tx = -O[2] / l, tz = O[0] / l;
    const ext = Math.abs(tx * ex[0] + tz * ex[2]) * a + Math.abs(tx * ez[0] + tz * ez[2]) * c;
    for (const p of pts) out.push((p[0] - o[0]) * tx + (p[2] - o[2]) * tz + ext, p[1] - yFoot);
    return out;
  }
  // A chamfer strip is a joint (carve 6: the shader darkens it like recessed mortar).
  const emitJ = (qa, qb, qc, qd, out) => { const c0 = carve; carve = 6; emit(qa, qb, qc, qd, out); carve = c0; };
  const emitTri = (qa, qb, qc, out) => {
    const A = P(...qa), Bp = P(...qb), C = P(...qc);
    const ux = [Bp[0] - A[0], Bp[1] - A[1], Bp[2] - A[2]], vx = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [ux[1] * vx[2] - ux[2] * vx[1], ux[2] * vx[0] - ux[0] * vx[2], ux[0] * vx[1] - ux[1] * vx[0]];
    const O = [ex[0] * out[0] + ey[0] * out[1] + ez[0] * out[2], ex[1] * out[0] + ey[1] * out[1] + ez[1] * out[2], ex[2] * out[0] + ey[2] * out[1] + ez[2] * out[2]];
    if (n[0] * O[0] + n[1] * O[1] + n[2] * O[2] > 0) B.tri(A, Bp, C, mat, seed, 6); else B.tri(A, C, Bp, mat, seed, 6);
  };
  for (let f = 0; f < 6; f++) {
    if (!(faces & (1 << f))) continue;
    const i = f >> 1, s = f & 1 ? -1 : 1, j = (i + 1) % 3, l = (i + 2) % 3;
    const hj = H[j] - k, hl = H[l] - k;
    const out = [0, 0, 0]; out[i] = s;
    // Inset face.
    emit(pt(i, s, -hj, -hl), pt(i, s, hj, -hl), pt(i, s, hj, hl), pt(i, s, -hj, hl), out);
    // Strips toward the four neighbouring faces (axis j at ±, axis l at ±).
    for (const [ax, sg] of [[j, 1], [j, -1], [l, 1], [l, -1]]) {
      const g = ax * 2 + (sg > 0 ? 0 : 1);
      if ((faces & (1 << g)) && g < f) continue; // the other face owns this strip
      const o2 = [0, 0, 0]; o2[i] = s; o2[ax] = sg;
      const qa = [0, 0, 0], qb = [0, 0, 0], qc = [0, 0, 0], qd = [0, 0, 0];
      const other = ax === j ? l : j, ho = H[other] - k;
      // Inner edge on this face, outer edge on the neighbour face at depth k.
      qa[i] = s * H[i]; qa[ax] = sg * (H[ax] - k); qa[other] = -ho;
      qb[i] = s * H[i]; qb[ax] = sg * (H[ax] - k); qb[other] = ho;
      qc[i] = s * (H[i] - k); qc[ax] = sg * H[ax]; qc[other] = ho;
      qd[i] = s * (H[i] - k); qd[ax] = sg * H[ax]; qd[other] = -ho;
      emitJ(qa, qb, qc, qd, o2);
    }
    // Corner triangles (the three chamfers' meeting), owned by this face.
    for (const sj of [1, -1]) for (const sl of [1, -1]) {
      const c1 = [0, 0, 0], c2 = [0, 0, 0], c3 = [0, 0, 0];
      c1[i] = s * H[i]; c1[j] = sj * (H[j] - k); c1[l] = sl * (H[l] - k);
      c2[i] = s * (H[i] - k); c2[j] = sj * H[j]; c2[l] = sl * (H[l] - k);
      c3[i] = s * (H[i] - k); c3[j] = sj * (H[j] - k); c3[l] = sl * H[l];
      const oc = [0, 0, 0]; oc[i] = s; oc[j] = sj; oc[l] = sl;
      emitTri(c1, c2, c3, oc);
    }
  }
}

/**
 * Lay a wall (or pier, plinth course, stele) as coursed blocks, in place of one stone box.
 * Box: centre (x, z), y0..y1, half extents hx (right) and hz (forward) under yaw (as Builder.box).
 * opts.ruin (0..1): how far the top breaks down (in fractions of the height, stepped by block);
 * opts.course: course height (m). Blocks run along the longer horizontal axis through the full
 * thickness (through-stones), ends and the top course are emitted only where exposed.
 */
export function layWall(B, x, z, y0, y1, hx, hz, yaw, mat, seed, { ruin = 0, course = 0.55, carve = 0, outer = false, blockLen = 1 } = {}) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const R = [cy, 0, -sy], F = [sy, 0, cy], U = [0, 1, 0];
  // The run axis is the longer one; `ex` along it, `ez` through the thickness.
  const alongX = hx >= hz;
  const ex = alongX ? R : F, ez = alongX ? F : [-R[0], 0, -R[2]];
  const len = (alongX ? hx : hz) * 2, th = (alongX ? hz : hx);
  const H = y1 - y0;
  // Courses of varied height (a tall course every few), normalised to fill the wall exactly.
  const nCourses = Math.max(1, Math.round(H / course));
  const cw = []; let cs = 0;
  for (let r = 0; r < nCourses; r++) { const w = 0.55 + 0.9 * h2(seed * 53 + r, 17) + (h2(seed, r * 7 + 3) < 0.18 ? 0.7 : 0); cw.push(w); cs += w; }
  const cy0 = [y0]; for (let r = 0; r < nCourses; r++) cy0.push(cy0[r] + cw[r] / cs * H);
  const ch = H / nCourses;
  const k = Math.min(0.045, ch * 0.08, th * 0.25);
  // Ruined top: per stretch along the wall, how many courses survive (stepped, never below half).
  const keepAt = (u) => {
    if (ruin <= 0) return nCourses;
    const t = u / Math.max(len, 1e-3);
    const n = 0.5 + 0.5 * Math.sin(t * 7.3 + seed * 1.7) * Math.cos(t * 3.1 + seed * 0.6);
    const lose = Math.floor(ruin * nCourses * (0.25 + 0.75 * n * n));
    return Math.max(Math.ceil(nCourses * (1 - ruin)), nCourses - lose);
  };
  const rows = [];
  for (let r = 0; r < nCourses; r++) {
    const blocks = [];
    let u = 0, bi = 0;
    // Stagger: each course starts with a different part-block.
    const start = (0.35 + 0.5 * h2(seed * 131 + r, 7)) * (r % 2 ? 1 : 0.55);
    let first = true;
    while (u < len - 1e-3) {
      let L = (first ? start : 0.55 + 1.25 * Math.pow(h2(seed * 977 + r * 31 + bi, 3), 1.6)) * blockLen * (0.8 + 0.5 * cw[r] / (cs / nCourses));
      first = false;
      if (len - (u + L) < 0.35) L = len - u; // no slivers at the end
      blocks.push([u, Math.min(len, u + L)]);
      u += L; bi++;
    }
    rows.push(blocks);
  }
  const present = (r, u0, u1) => r < keepAt((u0 + u1) / 2);
  for (let r = 0; r < nCourses; r++) {
    const yb = cy0[r], yt = cy0[r + 1];
    rows[r].forEach(([u0, u1], bi) => {
      if (!present(r, u0, u1)) return;
      const bs = Math.floor(h2(seed * 7919 + r * 97, bi) * 65535) + 1;
      // Small irregularities: each block stands a few mm proud or shy, and its height varies a hair.
      const proud = (h2(bs, 11) - 0.5) * 0.018;
      const a = (u1 - u0) / 2, b = (yt - yb) / 2, c = th + proud;
      const um = u0 + a - len / 2;
      const o = [x + ex[0] * um, (yb + yt) / 2, z + ex[2] * um];
      // Exposed faces: ±z (both wall faces) always; top if no block above covers it; ends at the
      // wall's ends or a gap; −y never (the course below or the foundation).
      let faces = outer ? 16 : 16 | 32; // outer: only the face that looks out (a plinth's or footing's skin)
      const above = r + 1 < nCourses && present(r + 1, u0, u1);
      if (!above) faces |= 4;
      if (u0 <= 1e-3 || !present(r, u0 - 0.2, u0 - 0.1)) faces |= 2;
      if (u1 >= len - 1e-3 || !present(r, u1 + 0.1, u1 + 0.2)) faces |= 1;
      chamferBlock(B, o, ex, U, ez, a, b, c, k, faces, mat, bs, carve);
    });
  }
  // Rubble at the foot of a ruined wall: a few fallen blocks, tilted.
  if (ruin > 0) {
    const n = Math.round(len * ruin * 1.2);
    for (let i = 0; i < n; i++) {
      const bs = Math.floor(h2(seed * 31 + 5, i) * 65535) + 1;
      const um = (h2(bs, 1) - 0.5) * len, side = h2(bs, 2) < 0.5 ? -1 : 1, off = side * (th + 0.4 + 1.4 * h2(bs, 3));
      const yaw2 = yaw + (h2(bs, 4) - 0.5) * 1.4, sa = 0.3 + 0.35 * h2(bs, 5);
      const ox = x + ex[0] * um + ez[0] * off, oz = z + ex[2] * um + ez[2] * off;
      const c2 = Math.cos(yaw2), s2 = Math.sin(yaw2), tilt = (h2(bs, 6) - 0.5) * 0.7;
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const e1 = [c2, 0, -s2], e2 = [s2 * -st, ct, c2 * -st], e3 = [s2 * ct, st, c2 * ct];
      chamferBlock(B, [ox, y0 + sa * 0.5 - 0.08, oz], e1, e2, e3, sa * (1 + h2(bs, 7)), sa * 0.5, sa * 0.7, 0.035, 63 & ~8, mat, bs);
    }
  }
}

/**
 * A column as stacked drums: radius r0 at the foot to r1 at the head, smooth normals, chamfered
 * beds between drums (a dark joint line), slight per-drum radius and twist variation. The top drum
 * is capped. `broken` (0..1): the column snaps off below its full height, the break rough.
 */
export function columnDrums(B, x, z, y0, y1, r0, r1, n, mat, seed, { broken = 0, carve = 0, solid = true } = {}) {
  const H = y1 - y0;
  const top = broken > 0 ? y0 + H * (1 - broken * (0.4 + 0.5 * h2(seed, 9))) : y1;
  let y = y0, d = 0;
  while (y < top - 1e-3) {
    const hgt = Math.min(top - y, 0.6 + 0.35 * h2(seed * 13 + d, 1));
    const ya = y, yb = y + hgt;
    const ra = (r0 + (r1 - r0) * (ya - y0) / H) * (1 + (h2(seed, d * 3 + 1) - 0.5) * 0.03);
    const rb = (r0 + (r1 - r0) * (yb - y0) / H) * (1 + (h2(seed, d * 3 + 2) - 0.5) * 0.03);
    const tw = h2(seed, d * 3 + 3) * TAU;
    const k = Math.min(0.035, hgt * 0.1);
    const bs = Math.floor(h2(seed * 17 + d, 5) * 65535) + 1;
    const isTop = yb >= top - 1e-3;
    const ring = (yy, rr) => { const p = []; for (let i = 0; i <= n; i++) { const a = tw + (i / n) * TAU; p.push([x + Math.cos(a) * rr, yy, z + Math.sin(a) * rr, Math.cos(a), Math.sin(a), (i / n) * TAU * rr]); } return p; };
    const lo = ring(ya + k, ra), hi = ring(yb - k, rb), loIn = ring(ya, ra - k), hiIn = ring(yb, rb - k);
    const side = (A, Bq, ny0, ny1, cv = 0) => { for (let i = 0; i < n; i++) B.quadSmooth(A[i], A[i + 1], Bq[i + 1], Bq[i], ny0, ny1, mat, bs, cv); };
    side(lo, hi, 0, 0, carve);
    side(loIn, lo, -0.7, 0); // lower bed chamfer
    side(hi, hiIn, 0, 0.7);  // upper bed chamfer
    if (isTop) {
      // Cap (a flat top for a whole column, a jagged break for a snapped one).
      const c = [x, yb + (broken > 0 ? 0.08 * h2(seed, 77) : 0), z];
      for (let i = 0; i < n; i++) {
        const a = hiIn[i], b2 = hiIn[i + 1];
        const ja = broken > 0 ? 0.12 * h2(bs, i) : 0, jb = broken > 0 ? 0.12 * h2(bs, (i + 1) % n) : 0;
        B.tri([a[0], a[1] + ja, a[2]], c, [b2[0], b2[1] + jb, b2[2]], mat, bs);
      }
    }
    y = yb; d++;
  }
  if (solid) B.blockers.push({ site: B.site, kind: 'circle', x, z, r: Math.max(r0, r1) + 0.05, y0, y1: top });
}

/**
 * Snow banked against the foot of a wall or block (frame as layWall: centre, half extents along
 * the run and through, yaw): a smooth drift along each face, its crest rising and falling gently,
 * its profile rounding off into the ground and running below it, so the stone never meets the snow
 * on a hard line. Smooth normals (no facets). Material SNOW (7).
 */
export function snowDrift(B, x, z, y0, hx, hz, yaw, seed, { height = 0.45, reach = 1.4, sides = 15 } = {}) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const R = [cy, 0, -sy], F = [sy, 0, cy];
  const faces = [[R, hx, F, hz, 1], [[-R[0], 0, -R[2]], hx, [-F[0], 0, -F[2]], hz, 2], [F, hz, [-R[0], 0, -R[2]], hx, 4], [[-F[0], 0, -F[2]], hz, R, hx, 8]];
  const ph = h2(seed, 1) * 6.28, ph2 = h2(seed, 2) * 6.28;
  const ROWS = 5;
  for (const [n, dn, t, ht, bit] of faces) {
    if (!(sides & bit)) continue;
    // The surface S(u, v): u along the face (past its corners a little), v from the crest (0) to
    // the foot (1). Height and reach breathe along u; both taper round the corners.
    const U0 = -ht - 0.25, U1 = ht + 0.25, segs = Math.max(3, Math.ceil((U1 - U0) / 0.3));
    const S = (u, v) => {
      const end = Math.max(0, Math.min(1, (ht + 0.25 - Math.abs(u)) / 0.7));
      const e = end * end * (3 - 2 * end);
      const hh = height * (0.8 + 0.2 * Math.sin(u * 1.3 + ph + bit) + 0.1 * Math.sin(u * 3.7 + ph2)) * e;
      const rr = reach * (0.85 + 0.15 * Math.sin(u * 0.9 + ph2 + bit)) * (0.35 + 0.65 * e) + 0.02;
      const d = 0.01 + rr * v;
      // Profile: a rounded shoulder at the wall, easing out flat, then under the ground.
      const y = y0 + hh * (1 - v) * (1 - v) * (1 + 0.6 * v) - 0.22 * v * v * v;
      return [x + n[0] * (dn + d) + t[0] * u, y, z + n[2] * (dn + d) + t[2] * u];
    };
    const Nrm = (u, v) => {
      const e = 1e-3, p = S(u, v), pu = S(u + e, v), pv = S(u, Math.min(1, v + e)), pv2 = S(u, Math.max(0, v - e));
      const du = [pu[0] - p[0], pu[1] - p[1], pu[2] - p[2]], dv = [pv[0] - pv2[0], pv[1] - pv2[1], pv[2] - pv2[2]];
      let c = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
      if (c[1] < 0) c = [-c[0], -c[1], -c[2]];
      const l = Math.hypot(c[0], c[1], c[2]) || 1; return [c[0] / l, c[1] / l, c[2] / l];
    };
    for (let i = 0; i < segs; i++) for (let r = 0; r < ROWS; r++) {
      const ua = U0 + (U1 - U0) * i / segs, ub = U0 + (U1 - U0) * (i + 1) / segs, va = r / ROWS, vb = (r + 1) / ROWS;
      B.quadN(S(ua, va), S(ub, va), S(ub, vb), S(ua, vb), Nrm(ua, va), Nrm(ub, va), Nrm(ub, vb), Nrm(ua, vb), 7, seed);
    }
  }
}
