// The pilgrims' things (PLAN.md V6): felt tents draped over leaning poles, sticks (poles, ropes,
// logs, staffs) between two points, a stacked hearth. Pure geometry on the architecture Builder,
// smooth normals, deterministic. Materials: CANVAS (felt, the wool scan), WOOD (the timber scan).

import { h2 } from './masonry.js';

const TAU = Math.PI * 2;

/** A round stick from a to b (radius ra at a, rb at b), n sides, smooth normals, capped ends. */
export function stick(B, a, b, ra, rb, n, mat, seed) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]) || 1;
  const t = [d[0] / L, d[1] / L, d[2] / L];
  // A frame round the axis.
  const up = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = [up[1] * t[2] - up[2] * t[1], up[2] * t[0] - up[0] * t[2], up[0] * t[1] - up[1] * t[0]];
  const ul = Math.hypot(u[0], u[1], u[2]); u = [u[0] / ul, u[1] / ul, u[2] / ul];
  const v = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
  const segs = Math.max(1, Math.round(L / 0.6));
  const pts = [], nrm = [];
  for (let j = 0; j <= segs; j++) {
    const f = j / segs, r = ra + (rb - ra) * f;
    // A little crook along a long stick (wood is never straight).
    const bend = Math.sin(f * Math.PI) * L * 0.012 * (h2(seed, 3) - 0.5);
    for (let i = 0; i <= n; i++) {
      const ang = (i / n) * TAU, c = Math.cos(ang), s = Math.sin(ang);
      const nx = u[0] * c + v[0] * s, ny = u[1] * c + v[1] * s, nz = u[2] * c + v[2] * s;
      pts.push([a[0] + d[0] * f + nx * r + u[0] * bend, a[1] + d[1] * f + ny * r + u[1] * bend, a[2] + d[2] * f + nz * r + u[2] * bend]);
      nrm.push([nx, ny, nz]);
    }
  }
  B.grid(pts, nrm, n, segs, mat, seed);
  // Caps (cut ends).
  for (const [p, r, s] of [[a, ra, -1], [b, rb, 1]]) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
      const q0 = [p[0] + (u[0] * Math.cos(a0) + v[0] * Math.sin(a0)) * r, p[1] + (u[1] * Math.cos(a0) + v[1] * Math.sin(a0)) * r, p[2] + (u[2] * Math.cos(a0) + v[2] * Math.sin(a0)) * r];
      const q1 = [p[0] + (u[0] * Math.cos(a1) + v[0] * Math.sin(a1)) * r, p[1] + (u[1] * Math.cos(a1) + v[1] * Math.sin(a1)) * r, p[2] + (u[2] * Math.cos(a1) + v[2] * Math.sin(a1)) * r];
      if (s > 0) B.tri(q0, p, q1, mat, seed); else B.tri(q1, p, q0, mat, seed);
    }
  }
}

/**
 * A felt tent: `ribs` poles leaning to an apex h above (x, z) (leaning by ax, az), the felt drawn
 * over them sagging between, its hem flaring onto the snow; one bay left open as the door (facing
 * `door`, rad). The pole tips cross above the smoke hole; guy ropes to stakes on the windward side.
 */
export function feltTent(B, x, z, r, h, door, seed, { ribs = 7, ax = 0, az = 0, MAT_FELT = 2, MAT_WOOD = 3 } = {}) {
  const th0 = door + Math.PI / ribs; // ribs either side of the door
  const nu = ribs * 6, nv = 12;
  const apex = [x + ax, h, z + az];
  const sag = 0.1 + 0.05 * h2(seed, 1);
  const S = (th, t) => {
    // t = 0 at the apex ring (just below it), 1 at the hem.
    const tt = 0.06 + 0.94 * t;
    const k = ((th - th0) / TAU * ribs) % 1, between = Math.sin(Math.PI * (k < 0 ? k + 1 : k));
    let rr = r * tt * (1 - sag * between * between * Math.pow(Math.sin(Math.PI * tt), 0.7));
    rr *= 1 + 0.05 * Math.max(0, (t - 0.88) / 0.12);                  // the hem flares
    rr *= 1 + 0.012 * Math.sin(th * 23 + seed) * Math.sin(t * 9.0);  // felt is never smooth
    const y = h * (1 - tt) - 0.12 * Math.max(0, (t - 0.9) / 0.1);     // the hem tucked into snow
    return [x + ax * (1 - tt) + Math.cos(th) * rr, y, z + az * (1 - tt) + Math.sin(th) * rr];
  };
  // The door: the bay facing `door` is open over its upper two thirds (a flap tied back).
  const doorBay = (th) => { let d = ((th - door + Math.PI) % TAU + TAU) % TAU - Math.PI; return Math.abs(d) < Math.PI / ribs * 0.8; };
  const pts = [], nrm = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const th = th0 + (i / nu) * TAU, t = j / nv, e = 1e-3;
    const p = S(th, t), pu = S(th + e, t), pv = S(th, Math.min(1, t + e)), pv2 = S(th, Math.max(0, t - e));
    const du = [pu[0] - p[0], pu[1] - p[1], pu[2] - p[2]], dv = [pv[0] - pv2[0], pv[1] - pv2[1], pv[2] - pv2[2]];
    let n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
    const out = [p[0] - x, 0, p[2] - z];
    if (n[0] * out[0] + n[2] * out[2] < 0) n = [-n[0], -n[1], -n[2]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    pts.push(p); nrm.push([n[0] / l, n[1] / l, n[2] / l]);
  }
  // Emit the felt as quads, leaving the door's upper part open.
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const thm = th0 + ((i + 0.5) / nu) * TAU;
    if (doorBay(thm) && j > nv * 0.3 && j < nv - 1) continue;
    const a = j * (nu + 1) + i, b2 = a + 1, c = a + nu + 2, d = a + nu + 1;
    B.quadN(pts[a], pts[b2], pts[c], pts[d], nrm[a], nrm[b2], nrm[c], nrm[d], MAT_FELT, seed);
  }
  // Poles: from the hem along each rib to past the apex (their tips crossing above the smoke hole).
  for (let k = 0; k < ribs; k++) {
    const th = th0 + (k / ribs) * TAU;
    const foot = [x + Math.cos(th) * r * 1.02, -0.15, z + Math.sin(th) * r * 1.02];
    const dir = [apex[0] - foot[0], apex[1] - foot[1], apex[2] - foot[2]];
    const tip = [foot[0] + dir[0] * 1.16, foot[1] + dir[1] * 1.16, foot[2] + dir[2] * 1.16];
    stick(B, foot, tip, 0.045, 0.03, 6, MAT_WOOD, seed * 7 + k);
  }
  // Guy ropes on the two windward ribs (away from the door), to stakes in the snow.
  for (const k of [Math.floor(ribs / 2) - 1, Math.floor(ribs / 2) + 1]) {
    const th = th0 + (k / ribs) * TAU;
    const top = [x + ax * 0.15 + Math.cos(th) * r * 0.2, h * 0.8, z + az * 0.15 + Math.sin(th) * r * 0.2];
    const stake = [x + Math.cos(th) * (r + 1.6), 0.15, z + Math.sin(th) * (r + 1.6)];
    stick(B, top, stake, 0.009, 0.009, 4, MAT_WOOD, seed + k);
    stick(B, [stake[0], -0.3, stake[2]], [stake[0] + 0.03, 0.3, stake[2]], 0.025, 0.02, 5, MAT_WOOD, seed + k + 9);
  }
}
