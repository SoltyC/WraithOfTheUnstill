// Shaper architecture (BRIEF §11 shrines, §17 monastery and camp): procedural, no imported meshes
// (user decision, Phase 7). Built once on the CPU from a few primitives — blocks, drums, cones,
// slabs — into one merged mesh, in each site's local frame (origin = the site's anchor; y = 0 is
// its seat, the lowest ground under its footprint, found at runtime). Foundations run 3 m below
// the seat, so a site on a slope never shows a gap. Pure data: testable in Node.
//
// Per vertex: position (site-local, m), normal, uv (face-planar metres), and a 4-vector
// (site index, material, seed, carve) the shader reads. Materials: STONE (Shaper ashlar),
// GLYPH (stone with carved, faintly lit Shaper glyph bands, or — carve 2/3/4 — one large verb
// symbol: crystal / crescent / wave), CANVAS (tents), WOOD, ICE, EMBER.
// Also returns 2D collision shapes (blockers: circles and boxes; platforms: walkable tops).

import { chamferBlock, layWall, columnDrums, snowDrift, snowPillow, h2 } from './masonry.js';
import { feltTent, stick } from './camp.js';

export const MAT = { STONE: 0, GLYPH: 1, CANVAS: 2, WOOD: 3, ICE: 4, EMBER: 5, METAL: 6, SNOW: 7 };
const FOUND = 3; // m of foundation below the seat

function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

class Builder {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.info = []; this.idx = []; this.blockers = []; this.platforms = []; this.site = 0; }
  /** One flat quad (a, b, c, d counter-clockwise seen from outside), uv in metres along ab and ad. */
  quad(a, b, c, d, mat, seed, carve = 0, uvs = null) {
    const ux = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], vx = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let n = [ux[1] * vx[2] - ux[2] * vx[1], ux[2] * vx[0] - ux[0] * vx[2], ux[0] * vx[1] - ux[1] * vx[0]];
    const l = -(Math.hypot(n[0], n[1], n[2]) || 1); n = [n[0] / l, n[1] / l, n[2] / l]; // outward
    const lu = Math.hypot(...ux), lv = Math.hypot(...vx);
    const base = this.pos.length / 3;
    const U = uvs || [0, 0, lu, 0, lu, lv, 0, lv];
    for (const [p, u, v] of [[a, U[0], U[1]], [b, U[2], U[3]], [c, U[4], U[5]], [d, U[6], U[7]]]) {
      this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.uv.push(u, v);
      this.info.push(this.site, mat, seed, carve);
    }
    this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  /** A smooth grid surface: (nu+1)·(nv+1) points and normals (row-major, u fastest), shared vertices. */
  grid(pts, nrms, nu, nv, mat, seed) {
    const base = this.pos.length / 3;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], n = nrms[i];
      this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.uv.push(p[0], p[2]);
      this.info.push(this.site, mat, seed, 0);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1;
      this.idx.push(a, c, b, a, d, c);
    }
  }
  /** Quad with given per-vertex normals (smooth surfaces). */
  quadN(a, b, c, d, na, nb, nc, nd, mat, seed) {
    const base = this.pos.length / 3;
    for (const [p, n] of [[a, na], [b, nb], [c, nc], [d, nd]]) {
      this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.uv.push(p[0], p[2]);
      this.info.push(this.site, mat, seed, 0);
    }
    this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  /** Quad between two rings of a drum, smooth normals: a, b on the lower ring and c, d on the upper
   *  (points [x, y, z, cos, sin, u]); ny0 / ny1 tilt the radial normal up or down at each ring. */
  quadSmooth(a, b, c, d, ny0, ny1, mat, seed, carve = 0) {
    const base = this.pos.length / 3;
    for (const [p, ny] of [[a, ny0], [b, ny0], [c, ny1], [d, ny1]]) {
      const l = Math.hypot(p[3], ny, p[4]) || 1;
      this.pos.push(p[0], p[1], p[2]); this.nrm.push(p[3] / l, ny / l, p[4] / l); this.uv.push(p[5], p[1]);
      this.info.push(this.site, mat, seed, carve);
    }
    this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  tri(a, b, c, mat, seed, carve = 0) {
    const ux = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], vx = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [ux[1] * vx[2] - ux[2] * vx[1], ux[2] * vx[0] - ux[0] * vx[2], ux[0] * vx[1] - ux[1] * vx[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / l, n[1] / l, n[2] / l];
    const base = this.pos.length / 3, lu = Math.hypot(...ux);
    for (const [p, u, v] of [[a, 0, 0], [b, lu, 0], [c, lu * 0.5, Math.hypot(...vx)]]) {
      this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.uv.push(u, v);
      this.info.push(this.site, mat, seed, carve);
    }
    this.idx.push(base, base + 2, base + 1);
  }
  /**
   * Oriented box: centre (x, z), base y0 to top y1, half extents hx (along yaw's right), hz (along
   * yaw's forward), tilt (rad, about its own x: a leaning slab). `solid` adds a blocker.
   */
  box(x, z, y0, y1, hx, hz, yaw, mat, seed, { tilt = 0, carve = 0, solid = true, platform = false, roll = 0, fb = false, ruin = 0, course = 0.78, plain = false, drift = true, cap = true } = {}) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt), cr = Math.cos(roll), sr = Math.sin(roll);
    // Shaper stone is laid, not boxed (world/masonry.js): plinths get walled sides and paving,
    // walls and piers coursed blocks, everything else one chamfered block.
    if ((mat === MAT.STONE || mat === MAT.GLYPH || mat === MAT.WOOD || mat === MAT.CANVAS) && !plain) {
      const flat = tilt === 0 && roll === 0;
      // Snow banked against whatever stands on the ground (or on a floor) — never a hard line.
      const stone = mat === MAT.STONE || mat === MAT.GLYPH;
      if (drift && stone && flat && y0 > -FOUND - 0.5 && y0 < 0.8 && y1 > 0.3) {
        // On a raised floor (y0 > 0.2) the drift is a small one: it must not hang past the floor's edge.
        const big = Math.min(hx, hz) > 3, onFloor = y0 > 0.2;
        const hgt = Math.min(onFloor ? 0.28 : 0.5, (y1 - Math.max(y0, 0)) * 0.3), reach = onFloor ? 0.55 : Math.min(1.4, 0.5 + Math.max(hx, hz));
        snowDrift(this, x, z, Math.max(y0, 0), hx, hz, yaw, seed * 3 + 1, big ? { height: 0.3, reach: 1.6 } : { height: hgt, reach });
      }
      const R3 = (lx, ly, lz) => { const ax = lx * cr - ly * sr, ay = lx * sr + ly * cr, az = lz; const by = ay * ct - az * st, bz = ay * st + az * ct; return [ax * cy + bz * sy, by, -ax * sy + bz * cy]; };
      if (!stone) {
        // Timber and felt: one piece, lightly arrised.
        chamferBlock(this, [x, (y0 + y1) / 2, z], R3(1, 0, 0), R3(0, 1, 0), R3(0, 0, 1), hx, (y1 - y0) / 2, hz, Math.min(0.02, hx * 0.2, hz * 0.2, (y1 - y0) * 0.2), 63, mat, seed, carve);
      } else if (mat === MAT.STONE && flat && Math.min(hx, hz) > 3) {
        this.plinth(x, z, y0, y1, hx, hz, yaw, mat, seed, course);
      } else if (mat === MAT.STONE && flat && Math.max(hx, hz) > 0.9 && y1 - y0 > 0.8) {
        layWall(this, x, z, y0, y1, hx, hz, yaw, mat, seed, { ruin, course, blockLen: 1.35, cap });
      } else {
        // One block.
        const k = Math.min(0.045, hx * 0.15, hz * 0.15, (y1 - y0) * 0.1);
        chamferBlock(this, [x, (y0 + y1) / 2, z], R3(1, 0, 0), R3(0, 1, 0), R3(0, 0, 1), hx, (y1 - y0) / 2, hz, k, 63, mat, seed, carve, fb);
        // Snow lies on its top when it is near level.
        const up = R3(0, 1, 0);
        if (cap && up[1] > 0.93 && y1 > -0.2) snowPillow(this, [x + up[0] * (y1 - y0) / 2, (y0 + y1) / 2 + up[1] * (y1 - y0) / 2, z + up[2] * (y1 - y0) / 2], R3(1, 0, 0), R3(0, 0, 1), hx, hz, seed);
      }
      if (solid && Math.abs(tilt) < 0.6 && Math.abs(roll) < 0.6) this.blockers.push({ site: this.site, kind: 'box', x, z, hx: hx + 0.05, hz: hz + 0.05, cos: cy, sin: sy, y0, y1 });
      if (platform) this.platforms.push({ site: this.site, x, z, hx, hz, cos: cy, sin: sy, top: y1 });
      return;
    }
    const ym = (y0 + y1) / 2, hy = (y1 - y0) / 2;
    const P = (lx, ly, lz) => {
      // roll about forward (z), then tilt about right (x), then yaw.
      let ax = lx * cr - ly * sr, ay = lx * sr + ly * cr, az = lz;
      const by = ay * ct - az * st, bz = ay * st + az * ct;
      return [x + ax * cy + bz * sy, ym + by, z - ax * sy + bz * cy];
    };
    const c = [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), P(-hx, hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), P(-hx, hy, hz)];
    const side = fb ? 0 : carve; // fb: the symbol only on the two broad faces
    this.quad(c[4], c[5], c[6], c[7], mat, seed, side);            // top
    this.quad(c[0], c[3], c[2], c[1], mat, seed, side);            // bottom
    this.quad(c[0], c[1], c[5], c[4], mat, seed, carve);           // back (−z)
    this.quad(c[2], c[3], c[7], c[6], mat, seed, carve);           // front (+z)
    this.quad(c[3], c[0], c[4], c[7], mat, seed, side);            // left
    this.quad(c[1], c[2], c[6], c[5], mat, seed, side);            // right
    if (solid && Math.abs(tilt) < 0.6 && Math.abs(roll) < 0.6) this.blockers.push({ site: this.site, kind: 'box', x, z, hx: hx + 0.05, hz: hz + 0.05, cos: cy, sin: sy, y0, y1 });
    if (platform) this.platforms.push({ site: this.site, x, z, hx, hz, cos: cy, sin: sy, top: y1 });
  }
  /** A plinth or platform: coursed walls round its edge (outer faces only) and a paved top of
   *  flagstones, each its own chamfered slab, a few cracked or sunk. */
  plinth(x, z, y0, y1, hx, hz, yaw, mat, seed, course) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const T = 0.5, top = y1 - 0.16;
    for (let side = 0; side < 4; side++) {
      const along = side % 2 ? hz : hx, out = side % 2 ? hx : hz, ya2 = side * Math.PI / 2;
      const ox = Math.sin(ya2) * (out - T), oz = Math.cos(ya2) * (out - T);
      layWall(this, x + ox * cy + oz * sy, z - ox * sy + oz * cy, y0, top, along, T, yaw + ya2, mat, seed * 5 + side, { course, outer: true });
    }
    // Paving: flagstones in rows, ~1.1 × 0.8 m, staggered.
    const ex = [cy, 0, -sy], ez = [sy, 0, cy], up = [0, 1, 0];
    let zz = -hz, row = 0;
    while (zz < hz - 1e-3) {
      const d = Math.min(hz - zz, 0.7 + 0.35 * h2(seed * 3 + row, 1));
      let xx = -hx + (row % 2 ? 0.45 : 0), first = true;
      if (row % 2) { this.flag(x, z, ex, ez, up, -hx, -hx + 0.45, zz, zz + d, top, y1, seed, row, -1); }
      while (xx < hx - 1e-3) {
        const w = Math.min(hx - xx, 0.9 + 0.5 * h2(seed * 7 + row, xx * 13 | 0));
        this.flag(x, z, ex, ez, up, xx, xx + (hx - (xx + w) < 0.3 ? hx - xx : w), zz, zz + d, top, y1, seed, row, xx * 7 | 0);
        xx += hx - (xx + w) < 0.3 ? hx - xx : w; first = false;
      }
      zz += d; row++;
    }
  }
  flag(x, z, ex, ez, up, u0, u1, v0, v1, yb, yt, seed, row, col) {
    const bs = Math.floor(h2(seed * 211 + row, col) * 65535) + 1;
    const sink = h2(bs, 4) < 0.08 ? -0.02 - 0.03 * h2(bs, 5) : (h2(bs, 6) - 0.5) * 0.008;
    const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
    const o = [x + ex[0] * um + ez[0] * vm, (yb + yt) / 2 + sink, z + ex[2] * um + ez[2] * vm];
    chamferBlock(this, o, ex, up, ez, (u1 - u0) / 2, (yt - yb) / 2, (v1 - v0) / 2, 0.022, 4, MAT.STONE, bs);
  }
  /** Battered block: a box whose half extents go from (hx0, hz0) at y0 to (hx1, hz1) at y1
   *  (foundations, buttresses that widen toward the ground). Never solid (walls above are). */
  frustum(x, z, y0, y1, hx0, hz0, hx1, hz1, yaw, mat, seed) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    // Battered foundations stay single faces (they are big, mostly far below the player); the
    // shader draws heavy courses on them from the same scans (carve 5: drawn cyclopean courses).
    const P = (lx, y, lz) => [x + lx * cy + lz * sy, y, z - lx * sy + lz * cy];
    const c = [P(-hx0, y0, -hz0), P(hx0, y0, -hz0), P(hx0, y0, hz0), P(-hx0, y0, hz0), P(-hx1, y1, -hz1), P(hx1, y1, -hz1), P(hx1, y1, hz1), P(-hx1, y1, hz1)];
    const dc = mat === MAT.STONE ? 5 : 0;
    this.quad(c[4], c[5], c[6], c[7], mat, seed, dc);
    this.quad(c[0], c[1], c[5], c[4], mat, seed, dc);
    this.quad(c[2], c[3], c[7], c[6], mat, seed, dc);
    this.quad(c[3], c[0], c[4], c[7], mat, seed, dc);
    this.quad(c[1], c[2], c[6], c[5], mat, seed, dc);
  }
  /** Drum (column, altar, bell): n sides, radius r0 at y0 to r1 at y1; capped. */
  drum(x, z, y0, y1, r0, r1, n, mat, seed, { carve = 0, solid = true, lie = 0, yaw = 0, broken = 0 } = {}) {
    if ((mat === MAT.STONE || mat === MAT.GLYPH) && !lie) {
      columnDrums(this, x, z, y0, y1, r0, r1, Math.max(n, Math.min(28, Math.round(Math.max(r0, r1) * 22))), mat, seed, { broken, carve, solid });
      return;
    }
    // lie: lying on its side (fallen column) along yaw, length = y1 − y0, resting at y0.
    const pts = (y, r) => {
      const out = [];
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2;
        if (!lie) out.push([x + Math.cos(a) * r, y, z + Math.sin(a) * r]);
        else {
          const along = y - y0 - (y1 - y0) / 2, ox = Math.cos(a) * r, oy = Math.sin(a) * r;
          out.push([x + Math.sin(yaw) * along + Math.cos(yaw) * ox, y0 + r0 + oy, z + Math.cos(yaw) * along - Math.sin(yaw) * ox]);
        }
      }
      return out;
    };
    const lo = pts(y0, r0), hi = pts(y1, r1);
    for (let k = 0; k < n; k++) this.quad(lo[k], lo[k + 1], hi[k + 1], hi[k], mat, seed, carve);
    const cTop = lie ? [x + Math.sin(yaw) * (y1 - y0) / 2, y0 + r0, z + Math.cos(yaw) * (y1 - y0) / 2] : [x, y1, z];
    const cBot = lie ? [x - Math.sin(yaw) * (y1 - y0) / 2, y0 + r0, z - Math.cos(yaw) * (y1 - y0) / 2] : [x, y0, z];
    for (let k = 0; k < n; k++) { this.tri(hi[k], cTop, hi[k + 1], mat, seed); this.tri(lo[k + 1], cBot, lo[k], mat, seed); }
    if (solid && !lie) this.blockers.push({ site: this.site, kind: 'circle', x, z, r: Math.max(r0, r1) + 0.05, y0, y1 });
    if (solid && lie) this.blockers.push({ site: this.site, kind: 'box', x, z, hx: r0, hz: (y1 - y0) / 2, cos: Math.cos(yaw), sin: Math.sin(yaw), y0, y1: y0 + 2 * r0 });
  }
  /** Cone / tent: n-sided, base radius r at y0, apex at y1 (offset ax, az), skirt flaring out. */
  cone(x, z, y0, y1, r, n, mat, seed, { ax = 0, az = 0, solid = true, open = -1 } = {}) {
    const apex = [x + ax, y1, z + az];
    for (let k = 0; k < n; k++) {
      if (k === open) continue; // a door flap left open
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      const p0 = [x + Math.cos(a0) * r, y0, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, y0, z + Math.sin(a1) * r];
      this.tri(p1, apex, p0, mat, seed);
      this.tri(p0, apex, p1, mat, seed); // inside face (canvas seen from within)
    }
    if (solid) this.blockers.push({ site: this.site, kind: 'circle', x, z, r: r * 0.85, y0, y1 });
  }
}

/** Shaper monastery: a cloister on a levelled shoulder of the frost range, above the gully the
 *  Shapers' Run descends and facing it. The ground falls away on three sides, so the platform is a
 *  citadel: seated on its pad, its ashlar foundations run 45 m down the slopes. */
const CITADEL = 45;
function monastery(b, facing, R) {
  const fx = Math.sin(facing), fz = Math.cos(facing), rx = Math.cos(facing), rz = -Math.sin(facing);
  const at = (s, f) => [rx * s + fx * f, rz * s + fz * f];
  // Platform: a stepped plinth (walkable), foundations into the slope.
  // The platform: a top course, then battered tiers stepping out as they go down, string courses
  // between them, and buttresses down each face.
  b.box(0, 0, -6, 0.35, 15, 15, facing, MAT.STONE, 1, { solid: false, platform: true });
  b.box(0, 0, -6.5, -5.7, 15.35, 15.35, facing, MAT.STONE, 3, { solid: false });          // string course
  b.frustum(0, 0, -22, -6.2, 16.6, 16.6, 15.1, 15.1, facing, MAT.STONE, 4);
  b.box(0, 0, -22.6, -21.8, 16.9, 16.9, facing, MAT.STONE, 5, { solid: false });          // string course
  b.frustum(0, 0, -CITADEL, -22, 19, 19, 16.7, 16.7, facing, MAT.STONE, 6);
  for (let side = 0; side < 4; side++) {
    const yaw = facing + side * Math.PI / 2, nx = Math.sin(yaw), nz = Math.cos(yaw), tx = Math.cos(yaw), tz = -Math.sin(yaw);
    for (const t of [-9.5, 0, 9.5]) {
      if (side === 0 && t === 0) continue; // the sill is on this face
      const bx = nx * 15.6 + tx * t, bz = nz * 15.6 + tz * t;
      b.frustum(bx + nx * 1.6, bz + nz * 1.6, -CITADEL, -20, 1.5, 3.4, 1.2, 1.2, yaw, MAT.STONE, 7 + side * 3 + t);
      b.frustum(bx + nx * 0.4, bz + nz * 0.4, -20.2, -1.5, 1.2, 1.2, 0.9, 0.5, yaw, MAT.STONE, 8 + side * 3 + t);
    }
  }
  // The sill: a low landing where the pad meets the head of the Run (the Run begins 26 m out).
  { const [x, z] = at(0, 17.6); b.box(x, z, -CITADEL, 0.17, 4.6, 2.0, facing, MAT.STONE, 2, { solid: false, platform: true }); }
  // A parapet round the platform's edge, open toward the descent.
  for (let k = 0; k < 4; k++) {
    const yaw = facing + k * Math.PI / 2, ex = Math.sin(yaw) * 14.6, ez = Math.cos(yaw) * 14.6;
    if (k === 0) { for (const s of [-1, 1]) { const ox = Math.cos(facing) * s * 9.5, oz = -Math.sin(facing) * s * 9.5; b.box(ex + ox, ez + oz, 0.35, 1.25, 5.2, 0.35, yaw, MAT.STONE, 120 + s, { drift: false }); } }
    else b.box(ex, ez, 0.35, 1.25, 14.6, 0.35, yaw, MAT.STONE, 110 + k, { drift: false });
  }
  // The hall: 14 × 10 m, walls 0.9 m thick and ~6 m tall, a doorway facing the descent, the roof
  // half fallen in.
  const H = 6.2, T = 0.45;
  const wall = (s, f, hx, hz, h = H, seed = 3, ruin = 0) => { const [x, z] = at(s, f); b.box(x, z, 0.35, 0.35 + h, hx, hz, facing, MAT.STONE, seed, { ruin }); };
  wall(0, -5, 7, T);                       // back wall
  wall(-7, 0, T, 5, H, 4, 0.12); wall(7, 0, T, 5, H * 0.72, 5, 0.45); // side walls (the east one broken down)
  wall(-4.6, 5, 2.4, T, H, 6); wall(4.6, 5, 2.4, T, H, 7); // front, either side of the door
  { const [x, z] = at(0, 5); b.box(x, z, 0.35 + 3.6, 0.35 + H, 2.2, T, facing, MAT.GLYPH, 8, { carve: 1, solid: false }); } // lintel
  // Buttresses: stepped piers against the back and the west wall (each a block pier and a sloped
  // weathering stone on top), and a projecting cornice along the intact back wall.
  for (const sx of [-4.6, 0, 4.6]) {
    const [x, z] = at(sx, -5 - T - 0.55);
    b.box(x, z, 0.35, 0.35 + 4.4, 0.65, 0.55, facing, MAT.STONE, 140 + sx * 3);
    const [x2, z2] = at(sx, -5 - T - 0.35);
    b.box(x2, z2, 0.35 + 4.4, 0.35 + 4.75, 0.66, 0.42, facing, MAT.STONE, 150 + sx * 3, { tilt: 0.42, solid: false, drift: false });
  }
  for (const sf of [-2.6, 2.4]) {
    const [x, z] = at(-7 - T - 0.55, sf);
    b.box(x, z, 0.35, 0.35 + 3.8, 0.55, 0.65, facing, MAT.STONE, 160 + sf * 3);
  }
  { const [x, z] = at(0, -5); b.box(x, z, 0.35 + H, 0.35 + H + 0.32, 7.25, T + 0.16, facing, MAT.STONE, 170, { solid: false, drift: false, plain: false }); }
  // Roof slabs: the west half still spans; the east half lies fallen and leaning in.
  for (let k = 0; k < 4; k++) { const [x, z] = at(-3.6, -3.75 + k * 2.5); b.box(x, z, 0.35 + H, 0.35 + H + 0.4, 3.4, 1.3, facing, MAT.STONE, 20 + k, { solid: false, roll: 0.05 }); }
  { const [x, z] = at(3.6, -1); b.box(x, z, 0.35, 0.35 + 0.5, 3.2, 1.4, facing, MAT.STONE, 30, { roll: -0.55 }); }
  { const [x, z] = at(4.4, 2.6); b.box(x, z, 0.35, 0.35 + 0.45, 3.0, 1.2, facing + 0.3, MAT.STONE, 31, { roll: 0.4 }); }
  // Under the fallen half of the roof: the old roof timbers down among the slabs, and the snow that
  // has blown in through the gap for nine winters, heaped on the floor and against the east wall.
  for (const [sx, sf, len, yawo, lift] of [[2.6, -3.2, 5.2, 0.35, 0.0], [4.8, 0.6, 4.4, -0.5, 0.0], [3.2, 3.4, 3.6, 1.9, 0.0]]) {
    const [x, z] = at(sx, sf);
    b.drum(x, z, 0.35 + lift, 0.35 + lift + len, 0.17, 0.15, 7, MAT.WOOD, 180 + sx, { lie: 1, yaw: facing + yawo, solid: false });
  }
  for (const [sx, sf, ra, rc, hh] of [[4.2, -2.6, 2.4, 1.8, 0.75], [5.6, 1.6, 1.3, 2.4, 0.95], [2.2, 2.2, 1.6, 1.2, 0.45]]) {
    const [x, z] = at(sx, sf);
    snowPillow(b, [x, 0.33, z], [rx, 0, rz], [fx, 0, fz], ra, rc, 190 + sx * 10, { round: true, height: hh });
  }
  // The bier where the Shaper lay (the Wraith wakes beside it), a glyph band round its edge.
  { const [x, z] = at(0, -2.2); b.box(x, z, 0.35, 0.95, 1.1, 1.9, facing, MAT.GLYPH, 40, { carve: 1 }); }
  // Cloister colonnade: 14 columns on a ring, some broken, two fallen.
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + 0.11, cx = Math.cos(a) * 12.4, cz = Math.sin(a) * 12.4;
    const front = (cx * fx + cz * fz) > 9.5 && Math.abs(cx * rx + cz * rz) < 3; // keep the approach open
    if (front) continue;
    const broken = R() < 0.35, fallen = !broken && R() < 0.12;
    if (fallen) { b.drum(cx, cz, 0.35, 0.35 + 5, 0.42, 0.42, 10, MAT.STONE, 50 + k, { lie: 1, yaw: a + 1.2 }); continue; }
    const h = broken ? 1.2 + R() * 2.6 : 5.6;
    b.drum(cx, cz, 0.35, 0.35 + 0.35, 0.62, 0.62, 8, MAT.STONE, 60 + k);
    b.drum(cx, cz, 0.7, 0.7 + h, 0.42, 0.38, 10, MAT.STONE, 70 + k, { carve: R() < 0.3 ? 1 : 0 });
    if (!broken) b.box(cx, cz, 0.7 + h, 0.7 + h + 0.35, 0.62, 0.62, a, MAT.STONE, 80 + k, { solid: false });
  }
  // Bell arch before the doorway, the bell still hanging (Aud: the wind on the bell).
  { const [ax, az] = at(-2.6, 10.5), [bx, bz] = at(2.6, 10.5), [cx, cz] = at(0, 10.5);
    b.box(ax, az, 0.35, 5.4, 0.45, 0.45, facing, MAT.STONE, 90); b.box(bx, bz, 0.35, 5.4, 0.45, 0.45, facing, MAT.STONE, 91);
    b.box(cx, cz, 5.4, 6.1, 3.2, 0.5, facing, MAT.GLYPH, 92, { carve: 1, solid: false });
    b.drum(cx, cz, 3.6, 5.3, 0.62, 0.32, 14, MAT.METAL, 93, { solid: false }); }
  // Steles flanking the approach.
  for (const s of [-1, 1]) { const [x, z] = at(s * 4.2, 13.6); b.box(x, z, 0.35, 4.1, 0.55, 0.28, facing, MAT.GLYPH, 95 + s, { carve: 1 }); }
}

/** A frost shrine: five standing stones round a low altar, a glyph ring, an open gate. */
function shrine(b, facing, R) {
  b.box(0, 0, -FOUND, 0.12, 4.6, 4.6, facing + 0.39, MAT.STONE, 1, { solid: false, platform: true });
  b.drum(0, 0, 0.12, 0.85, 1.05, 0.95, 16, MAT.GLYPH, 2, { carve: 1 });
  b.drum(0, 0, 0.85, 0.95, 0.7, 0.7, 16, MAT.ICE, 3, { solid: false });
  for (let k = 0; k < 5; k++) {
    const a = facing + (k / 5) * Math.PI * 2 + Math.PI / 5;
    const x = Math.sin(a) * 3.9, z = Math.cos(a) * 3.9, h = 2.4 + R() * 1.4;
    b.box(x, z, -0.6, h, 0.42, 0.24, a, MAT.GLYPH, 10 + k, { carve: 1, tilt: (R() - 0.5) * 0.1 });
  }
}

/** The pilgrims' camp: tents round a fire, the lantern post, sleds and packs. */
function camp(b, facing, R) {
  const tents = [[-7, 3, 2.3, 3.1], [-2, 8, 2.6, 3.4], [5.5, 6, 2.1, 2.9], [8, -2, 2.4, 3.2]];
  for (const [x, z, r, h] of tents) {
    const seed = Math.floor(R() * 1e6);
    feltTent(b, x, z, r, h, Math.atan2(-z, -x) + (R() - 0.5) * 0.3, seed, { ribs: 7, ax: (R() - 0.5) * 0.25, az: (R() - 0.5) * 0.25, MAT_FELT: MAT.CANVAS, MAT_WOOD: MAT.WOOD });
    b.blockers.push({ site: b.site, kind: 'circle', x, z, r: r * 0.85, y0: -0.1, y1: h });
  }
  // The hearth: a ring of fire-blackened stones, the embers, a stack of split logs leaning in.
  for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; b.box(Math.cos(a) * 1.05, Math.sin(a) * 1.05, -0.1, 0.22 + 0.06 * R(), 0.22, 0.15, a, MAT.STONE, 40 + k, { solid: false, drift: false, cap: false }); }
  b.drum(0, 0, -0.05, 0.12, 0.75, 0.6, 9, MAT.EMBER, 50, { solid: false });
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2 + 0.3, c = Math.cos(a), s2 = Math.sin(a);
    stick(b, [c * 0.62, 0.02, s2 * 0.62], [c * 0.08, 0.62 + 0.1 * R(), s2 * 0.08], 0.065, 0.05, 7, MAT.WOOD, 51 + k);
  }
  // Lantern post with its arm.
  stick(b, [3, -0.4, -3.5], [3.02, 2.6, -3.5], 0.075, 0.06, 7, MAT.WOOD, 60);
  stick(b, [3, 2.3, -3.5], [3.75, 2.36, -3.5], 0.035, 0.03, 6, MAT.WOOD, 61);
  b.blockers.push({ site: b.site, kind: 'circle', x: 3, z: -3.5, r: 0.12, y0: -0.4, y1: 2.6 });
  // A sled: two runners curled up at the front, slats across, a felt-wrapped load lashed on.
  { const yaw = facing + 0.4, c = Math.cos(yaw), s2 = Math.sin(yaw), P = (u, f, y) => [-5 + c * u + s2 * f, y, -5 - s2 * u + c * f];
    for (const u of [-0.42, 0.42]) {
      stick(b, P(u, -1.3, 0.06), P(u, 1.0, 0.06), 0.04, 0.04, 6, MAT.WOOD, 70 + u * 10);
      stick(b, P(u, 1.0, 0.06), P(u, 1.35, 0.3), 0.04, 0.035, 6, MAT.WOOD, 71 + u * 10);
      for (const f of [-1.0, 0, 0.9]) stick(b, P(u, f, 0.06), P(u, f, 0.3), 0.025, 0.025, 5, MAT.WOOD, 72 + f + u);
    }
    for (let k = 0; k < 7; k++) { const f = -1.15 + k * 0.36; b.box(...P(0, f, 0).filter((_, i) => i !== 1), 0.3, 0.34, 0.5, 0.11, yaw, MAT.WOOD, 80 + k, { solid: false, cap: false, drift: false }); }
    snowPillow(b, P(0, -0.1, 0.34), [c, 0, -s2], [s2, 0, c], 0.42, 0.9, 77, { height: 0.42, mat: MAT.CANVAS }); // the load, under felt
    b.blockers.push({ site: b.site, kind: 'box', x: -5, z: -5, hx: 0.5, hz: 1.4, cos: c, sin: s2, y0: -0.1, y1: 0.8 });
  }
  // A pack and a stack of split wood by the door of the nearest tent.
  // A felt-wrapped pack, lashed (a rounded bundle, not a box), and a second leaning on it.
  snowPillow(b, [-3.2, -0.05, -6.4], [Math.cos(0.7), 0, -Math.sin(0.7)], [Math.sin(0.7), 0, Math.cos(0.7)], 0.45, 0.36, 72, { round: true, height: 0.55, mat: MAT.CANVAS });
  snowPillow(b, [-2.75, -0.05, -6.0], [1, 0, 0], [0, 0, 1], 0.3, 0.26, 73, { round: true, height: 0.38, mat: MAT.CANVAS });
  for (const dy of [0.16, 0.34]) stick(b, [-3.62, dy, -6.75], [-2.8, dy, -6.05], 0.012, 0.012, 4, MAT.WOOD, 74 + dy * 10);
  for (let k = 0; k < 5; k++) stick(b, [-6.6 + k * 0.17, 0.1 + (k % 2) * 0.12, -2.3], [-6.6 + k * 0.17, 0.1 + (k % 2) * 0.12, -1.3], 0.075, 0.07, 7, MAT.WOOD, 90 + k);
  // A low windbreak of stacked stones on the weather side.
  for (let k = 0; k < 7; k++) { const a = facing + Math.PI + (k - 3) * 0.16; b.box(Math.sin(a) * 12, Math.cos(a) * 12, -0.4, 0.9 + R() * 0.3, 0.9, 0.35, a + Math.PI / 2, MAT.STONE, 80 + k); }
}

/** The sleeping spring: a frozen pool in a ring of low stones. */
function spring(b, facing, R) {
  b.drum(0, 0, -0.08, 0.05, 6.5, 6.5, 24, MAT.ICE, 1, { solid: false });
  for (let k = 0; k < 11; k++) { const a = (k / 11) * Math.PI * 2 + R() * 0.2; b.box(Math.cos(a) * 7.2, Math.sin(a) * 7.2, -0.3, 0.3 + R() * 0.5, 0.5, 0.3, a, MAT.STONE, 10 + k); }
}

/** The watching stone: one tall carved monolith on the rise. */
function watchingStone(b, facing) {
  b.box(0, 0, -1.5, 5.2, 0.85, 0.45, facing, MAT.GLYPH, 1, { carve: 1, tilt: 0.06 });
  b.box(1.6, 0.9, -0.5, 0.7, 0.7, 0.6, facing + 0.8, MAT.STONE, 2);
}

/** A verb stone (the monastery's three gestures): a broad carved face showing the verb's symbol
 *  — crystal (Crystallize), crescent (Sweep), wave (Ribbon) — set in a ring of low stones. */
function gestureStone(symbol) {
  return (b, facing, R) => {
    b.drum(0, 0, -FOUND, 0.1, 1.5, 1.5, 12, MAT.STONE, 1, { solid: false });
    b.box(0, 0, 0.1, 2.7, 0.55, 0.3, facing, MAT.GLYPH, 2 + symbol, { carve: 1 + symbol, fb: true });
    b.box(0, 0, 2.7, 2.9, 0.62, 0.36, facing, MAT.STONE, 9, { solid: false });
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + R(); b.box(Math.cos(a) * 1.25, Math.sin(a) * 1.25, 0.1, 0.35 + R() * 0.2, 0.22, 0.16, a, MAT.STONE, 20 + k, { solid: false }); }
  };
}

/** An Echo stone: a tall carved monolith in a ring of low stones, a pale disc of ice at its foot. */
function echoStone(b, facing, R) {
  b.drum(0, 0, -FOUND, 0.08, 2.1, 2.1, 16, MAT.STONE, 1, { solid: false });
  b.drum(0, 0, 0.08, 0.14, 1.5, 1.5, 16, MAT.ICE, 2, { solid: false });
  b.box(0, 0, 0.1, 3.1, 0.5, 0.28, facing, MAT.GLYPH, 3, { carve: 1, tilt: (R() - 0.5) * 0.08 });
  b.box(0, 0, 3.1, 3.3, 0.4, 0.22, facing, MAT.STONE, 4, { solid: false });
  for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2 + R() * 0.4; b.box(Math.cos(a) * 2.3, Math.sin(a) * 2.3, -0.3, 0.3 + R() * 0.55, 0.3, 0.22, a, MAT.STONE, 10 + k, { solid: false }); }
}

/** The hounds' den: a ring of jagged ice spires leaning out of a hollow in the snow. */
function den(b, facing, R) {
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2 + R() * 0.3, r = 7.5 + R() * 2.4, h = 3 + R() * 4.5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    b.box(x, z, -2.5, h, 0.55 + R() * 0.5, 0.4 + R() * 0.3, a + Math.PI / 2, MAT.ICE, 30 + k, { tilt: 0.18 + R() * 0.3, roll: (R() - 0.5) * 0.3, solid: false });
  }
  for (let k = 0; k < 5; k++) { const a = R() * 6.28, r = 3 + R() * 3; b.box(Math.cos(a) * r, Math.sin(a) * r, -0.4, 0.3 + R() * 0.5, 0.7, 0.5, a, MAT.STONE, 60 + k, { solid: false }); }
}

/** A gate of the Shapers' Run: an arch spanning the chute (pillars outside its floor, a glyph
 *  lintel overhead). Local x is across the Run, forward is the way down. */
function gate(b, facing, R) {
  const HALFSPAN = 10.4;
  for (const sgn of [-1, 1]) {
    b.box(sgn * HALFSPAN, 0, -8, 7.4, 0.85, 0.7, 0, MAT.STONE, 1 + sgn);
    b.box(sgn * HALFSPAN, 0, 7.4, 7.7, 1.05, 0.9, 0, MAT.STONE, 4 + sgn, { solid: false });
    b.box(sgn * (HALFSPAN - 1.4), 0, 4.2, 6.0, 0.35, 0.45, 0, MAT.GLYPH, 8 + sgn, { carve: 1, solid: false });
  }
  b.box(0, 0, 6.3, 7.5, HALFSPAN + 0.6, 0.6, 0, MAT.GLYPH, 12, { carve: 1, solid: false });
  b.box(0, 0, 7.5, 7.75, HALFSPAN - 0.4, 0.75, 0, MAT.STONE, 13, { solid: false });
}

/** A brazier: a stone bowl on a pedestal; its coals light when the flame is carried here. */
function brazier(b, facing, R) {
  b.drum(0, 0, -1, 0.9, 0.36, 0.3, 8, MAT.STONE, 1);
  b.drum(0, 0, 0.9, 1.28, 0.36, 0.72, 12, MAT.GLYPH, 2, { carve: 1, solid: false });
  b.drum(0, 0, 1.22, 1.3, 0.64, 0.6, 12, MAT.EMBER, 3, { solid: false });
}

/** A pilgrims' sled, overturned and broken where the hounds caught it: runners in the air, the
 *  load of split wood spilled, a torn felt cover. */
function sledWreck(b, facing, R) {
  const cy = Math.cos(facing), sy = Math.sin(facing);
  const P = (u, f) => [cy * u + Math.sin(facing) * f, -sy * u + Math.cos(facing) * f];
  // The bed, on its side.
  b.box(0, 0, 0, 0.75, 0.08, 1.2, facing, MAT.WOOD, 1, { roll: 1.35 });
  for (const s of [-1, 1]) { const [x, z] = P(s * 0.45, 0); b.box(x, z, 0.1, 0.9 + 0.05 * s, 0.05, 1.35, facing, MAT.WOOD, 2 + s, { roll: 1.2, tilt: 0.1 * s, solid: false }); }
  // The felt cover, torn off and lying in the snow.
  { const [x, z] = P(1.4, 0.6); b.box(x, z, 0, 0.06, 0.8, 0.95, facing + 0.4, MAT.CANVAS, 6, { tilt: 0.05, solid: false }); }
  // Split wood, spilled.
  for (let k = 0; k < 9; k++) {
    const [x, z] = P(-1.2 - R() * 1.6, (R() - 0.5) * 2.6);
    b.drum(x, z, 0, 0.6 + R() * 0.4, 0.07 + R() * 0.04, 0.07, 6, MAT.WOOD, 10 + k, { lie: 1, yaw: facing + R() * 3, solid: false });
  }
}

/** Props the Veiled carry: drawn with the architecture, each its own site that the NPC system
 *  moves to the figure's hand every frame (local origin: the staff's foot, the lantern's ring). */
function staff(len) { return (b) => { b.drum(0, 0, 0, len, 0.032, 0.026, 6, MAT.WOOD, 1, { solid: false }); b.drum(0, 0, len - 0.02, len + 0.06, 0.05, 0.02, 6, MAT.WOOD, 2, { solid: false }); }; }
function lantern(b) {
  b.box(0, 0, -0.34, -0.06, 0.085, 0.085, 0, MAT.METAL, 1, { solid: false });
  b.box(0, 0, -0.3, -0.1, 0.07, 0.07, 0, MAT.EMBER, 2, { solid: false });
  b.drum(0, 0, -0.06, 0, 0.012, 0.012, 4, MAT.METAL, 3, { solid: false });
}
export const PROPS = [
  { id: 'prop-varo', npc: 'varo', kind: 'staff', build: staff(1.95) },
  { id: 'prop-maren', npc: 'maren', kind: 'staff', build: staff(1.05) },
  { id: 'prop-pilgrim-1', npc: 'pilgrim-1', kind: 'staff', build: staff(1.75) },
  { id: 'prop-isolde', npc: 'isolde', kind: 'lantern', build: lantern },
  // The Wraith's own (Carry the Flame): placed at its hand by systems/flame.js while it carries.
  { id: 'prop-wraith', npc: 'wraith', kind: 'lantern', build: lantern },
];

/** Where a verb stone stands in the monastery (local right, forward): a ring round the hall. */
export const GESTURE_STONES = [
  { id: 'gesture-crystal', verb: 'crystal', at: [11, 2.5] },
  { id: 'gesture-sweep', verb: 'sweep', at: [-11, 2.5] },
  { id: 'gesture-ribbon', verb: 'ribbon', at: [0, -9.6] },
];
/** Braziers: beside shrines 2, 3 and 4 (world offsets from the shrine), and one at the edge of the
 *  Warden's arena (lit, the Wraith re-forms beside it). */
export const BRAZIERS = [
  { id: 'brazier-1', shrine: 'shrine-frost-2', off: [6.5, 3.5] },
  { id: 'brazier-2', shrine: 'shrine-frost-3', off: [6.5, 3.5] },
  { id: 'brazier-3', shrine: 'shrine-frost-4', off: [6.5, 3.5] },
  { id: 'brazier-4', shrine: 'warden-brazier', off: [0, 0] },
];

/** The Warden's arena (user design 2026-10-09): six crystal pillars that rise out of the snow when
 *  it wakes, and a ring of broken Shaper walls to shelter behind from its ice-spike barrage. Angles
 *  are measured from the Warden's resting heading; radii in metres from the arena's centre. */
export const ARENA = {
  pillars: 6, pillarR: 34, pillarH: 9, pillarShaft: 1.25, pillarCap: 1.9,
  cover: 10, coverR: 23, coverHalfW: 2.6, coverH: 3.4, outer: 6, outerR: 41,
};
/** World positions of the arena's pillars and cover walls ({ id, at, facing } each). */
export function arenaLayout(centre, heading) {
  const out = { pillars: [], cover: [] };
  for (let k = 0; k < ARENA.pillars; k++) {
    const a = heading + (k + 0.5) / ARENA.pillars * Math.PI * 2;
    out.pillars.push({ id: 'warden-pillar-' + (k + 1), at: [centre[0] + Math.sin(a) * ARENA.pillarR, centre[1] + Math.cos(a) * ARENA.pillarR], facing: a });
  }
  for (let k = 0; k < ARENA.cover; k++) {
    // Alternate a little in and out so the ring reads as ruins, not a fence.
    const a = heading + k / ARENA.cover * Math.PI * 2, r = ARENA.coverR + (k % 2 ? 2 : -1);
    // A wall faces the centre (its broad face toward the Warden).
    out.cover.push({ id: 'warden-cover-' + (k + 1), at: [centre[0] + Math.sin(a) * r, centre[1] + Math.cos(a) * r], facing: a });
  }
  // The outer ring: between the pillars, past them (cover for whoever is out by the pillars).
  for (let k = 0; k < ARENA.outer; k++) {
    const a = heading + k / ARENA.outer * Math.PI * 2;
    out.cover.push({ id: 'warden-cover-' + (ARENA.cover + k + 1), at: [centre[0] + Math.sin(a) * ARENA.outerR, centre[1] + Math.cos(a) * ARENA.outerR], facing: a });
  }
  return out;
}

/** A crystal pillar: a Shaper column of stacked drums with carved glyph bands (the holds the
 *  Wraith climbs by) under a broad capital whose top is a floor. Built from far below its seat:
 *  the arena lowers it into the snow until the Warden wakes. */
function wardenPillar(b, facing, R) { pillarOf(ARENA.pillarH)(b, facing, R); }
/** The seedling by the watching stone: a shorter pillar of the same make (Varo's lesson). */
export const SEEDLING_H = 6;
function seedlingPillar(b, facing, R) { pillarOf(SEEDLING_H)(b, facing, R); }
const pillarOf = (H) => (b, facing, R) => {
  const rs = ARENA.pillarShaft;
  b.drum(0, 0, -H - 1.5, 0.9, 1.75, 1.7, 16, MAT.STONE, 1, { solid: false });
  let y = 0.9;
  for (let k = 0; y < H - 0.75; k++) {
    const h = Math.min(H - 0.75 - y, 1.35 + R() * 0.35);
    b.drum(0, 0, y, y + h, rs + 0.03 * (k % 2), rs, 14, k % 2 ? MAT.GLYPH : MAT.STONE, 10 + k, { carve: k % 2 ? 1 : 0, solid: false });
    y += h;
  }
  b.drum(0, 0, H - 0.75, H - 0.15, rs + 0.1, ARENA.pillarCap, 16, MAT.STONE, 30, { solid: false });
  b.drum(0, 0, H - 0.15, H, ARENA.pillarCap, ARENA.pillarCap - 0.06, 16, MAT.GLYPH, 31, { carve: 1, solid: false });
  // The crystal's seat: a shallow ice basin on the capital.
  b.drum(0, 0, H, H + 0.06, 0.9, 0.82, 12, MAT.ICE, 32, { solid: false });
  b.blockers.push({ site: b.site, kind: 'circle', x: 0, z: 0, r: rs + 0.1, y0: -H - 1.5, y1: H - 0.15 });
  b.platforms.push({ site: b.site, x: 0, z: 0, hx: ARENA.pillarCap * 0.72, hz: ARENA.pillarCap * 0.72, cos: 1, sin: 0, top: H });
};

/** A broken Shaper wall in the arena: two or three heavy courses, the top one broken off, a
 *  fallen block at its foot. Broad enough to shelter behind (its face toward the Warden). */
function wardenCover(b, facing, R) {
  const hw = ARENA.coverHalfW, th = 0.6;
  const yaw = facing;                   // its breadth (local x) runs across the line to the centre
  const cy = Math.cos(yaw), sy = Math.sin(yaw), fx = Math.sin(facing), fz = Math.cos(facing);
  const at = (u, f) => [cy * u + fx * f, -sy * u + fz * f];   // across, outward → local x/z
  b.box(0, 0, -FOUND, 0.45, hw + 0.3, th + 0.25, yaw, MAT.STONE, 1);
  b.box(0, 0, 0.45, 3.0, hw, th, yaw, MAT.STONE, 2);
  // The broken crown: a tall carved stub on one side, a lower one on the other, a gap between.
  const s = R() > 0.5 ? 1 : -1;
  let [x, z] = at(s * hw * 0.48, 0);
  b.box(x, z, 3.0, ARENA.coverH + 0.4, hw * 0.52, th - 0.05, yaw + (R() - 0.5) * 0.05, MAT.GLYPH, 3, { carve: 1 });
  [x, z] = at(-s * hw * 0.62, 0);
  b.box(x, z, 3.0, 3.35 + R() * 0.25, hw * 0.36, th - 0.08, yaw, MAT.STONE, 4);
  // What fell: a block at the foot behind it, a shard of the crown leaning on the wall.
  [x, z] = at(-s * hw * 0.35, 1.5);
  b.box(x, z, 0, 0.8, 0.85, 0.5, yaw + 0.35 * s, MAT.STONE, 5, { tilt: 0.1, roll: 0.12 * s });
  [x, z] = at(s * hw * 1.05, 0.9);
  b.box(x, z, 0, 1.9, 0.32, 0.28, yaw, MAT.STONE, 6, { tilt: -0.3, solid: false });
}

/** Every site of the frost chapter: { id, at, facing, build, footprint (seat radius, m) }.
 *  `table` is the baked POIs by id; `routes` the baked routes (the Run's gates). */
export function frostSites(table, routes = []) {
  const P = (id) => table[id].pos;
  const mon = P('monastery'), camp0 = P('camp-frost');
  const toward = (a, b) => Math.atan2(b[0] - a[0], b[1] - a[1]);
  const mf = table.monastery.facing ?? toward(mon, camp0);
  const sites = [
    { id: 'monastery', at: mon, facing: mf, build: monastery, footprint: 16, seatAt: 'top', box: 15 },
    { id: 'camp-frost', at: camp0, facing: toward(camp0, P('warden-frost')), build: camp, footprint: 12 },
    { id: 'spring-frost', at: P('spring-frost'), facing: 0, build: spring, footprint: 7.5 },
    { id: 'varo-rise', at: P('varo-rise'), facing: toward(P('varo-rise'), P('warden-frost')), build: watchingStone, footprint: 1.5 },
    { id: 'den-frost', at: P('den-frost'), facing: 0, build: den, footprint: 9 },
  ];
  for (let k = 1; k <= 5; k++) { const id = 'shrine-frost-' + k; sites.push({ id, at: P(id), facing: k * 1.3, build: shrine, footprint: 4.6 }); }
  for (let k = 1; k <= 6; k++) { const id = 'echo-frost-' + k; if (table[id]) sites.push({ id, at: P(id), facing: k * 0.9, build: echoStone, footprint: 2.4 }); }
  // The verb stones round the hall (monastery frame).
  const fx = Math.sin(mf), fz = Math.cos(mf), rx = Math.cos(mf), rz = -Math.sin(mf);
  GESTURE_STONES.forEach((g, i) => sites.push({ id: g.id, at: [mon[0] + rx * g.at[0] + fx * g.at[1], mon[1] + rz * g.at[0] + fz * g.at[1]], facing: toward([0, 0], [-(fx * g.at[1] + rx * g.at[0]), -(fz * g.at[1] + rz * g.at[0])]) , build: gestureStone(i), footprint: 1.6, seatAt: 'center' }));
  for (const br of BRAZIERS) if (table[br.shrine]) sites.push({ id: br.id, at: [P(br.shrine)[0] + br.off[0], P(br.shrine)[1] + br.off[1]], facing: 0, build: brazier, footprint: 1, seatAt: 'center' });
  // The Run's gates: arches across the chute (seated on its floor).
  const run = routes.find((r) => r.id === 'shapers-run');
  if (run) run.gates.forEach((gt, i) => sites.push({ id: 'run-gate-' + (i + 1), at: gt.pos, facing: Math.atan2(gt.dir[0], gt.dir[1]), build: gate, footprint: 3, seatAt: 'center' }));
  // Quest places (data/quests/frost.json `places`): the sled the hounds caught; the seedling pillar
  // by the watching stone with two broken walls to shelter behind from it.
  if (table['sled-wreck']) sites.push({ id: 'sled-wreck', at: P('sled-wreck'), facing: 0.7, build: sledWreck, footprint: 1.2, seatAt: 'center' });
  if (table.seedling) {
    const sp = P('seedling');
    sites.push({ id: 'seedling', at: sp, facing: 0, build: seedlingPillar, footprint: 1.8, seatAt: 'center', pillar: true, pillarH: SEEDLING_H });
    for (let k = 0; k < 2; k++) {
      const a = toward(sp, P('varo-rise')) + (k ? 1.1 : -1.1), r = 9.5;
      sites.push({ id: 'seedling-cover-' + (k + 1), at: [sp[0] + Math.sin(a) * r, sp[1] + Math.cos(a) * r], facing: a, build: wardenCover, footprint: 2.6, seatAt: 'center' });
    }
  }
  // The Warden's arena: pillars and cover walls, facing as the Warden waits (toward the monastery).
  if (table['warden-frost']) {
    const ac = P('warden-frost'), lay = arenaLayout(ac, toward(ac, mon));
    for (const pl of lay.pillars) sites.push({ ...pl, build: wardenPillar, footprint: 1.8, seatAt: 'center', pillar: true });
    for (const cv of lay.cover) sites.push({ ...cv, build: wardenCover, footprint: 2.6, seatAt: 'center' });
  }
  for (const p of PROPS) sites.push({ ...p, at: [0, 0], facing: 0, footprint: 0, prop: true });
  return sites;
}

/** Build all sites into one geometry (site-local positions) plus collision shapes. */
export function buildArchitecture(sites) {
  const b = new Builder();
  sites.forEach((s, i) => { b.site = i; s.build(b, s.facing, rng(0x5a17 + i * 977)); });
  return {
    positions: new Float32Array(b.pos), normals: new Float32Array(b.nrm), uvs: new Float32Array(b.uv),
    info: new Float32Array(b.info), indices: new Uint32Array(b.idx), blockers: b.blockers, platforms: b.platforms,
  };
}
