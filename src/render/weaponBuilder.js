// The weapon mesh builder (docs §11.2): primitives into one mesh, each vertex tagged with (slot,
// material, seed, edge) in `info`. Used by weaponGeo.js (staff, sickles, maul and the finds) and
// weaponGeo2.js (glaive, lantern flail). Local frames: a held weapon's origin is the grip and its
// shaft runs along +y; blades curve toward +z.

export const WMAT = { STONE: 0, OAK: 1, IRON: 2, FELT: 3, BRONZE: 4, PALE: 5, FLAME: 6 };
/** Slots: 0 staff, 1 right sickle, 2 left sickle, 3 maul, 4 the reaper's stand, 5 the cold forge, 6 glaive, 7 flail haft, 8-9 its chain, 10 its lantern head, 11 the flame, 12 the glaive's find, 13 the flail's find. */
export const SLOT = { STAFF: 0, SICKLE_R: 1, SICKLE_L: 2, MAUL: 3, STAND: 4, FORGE: 5, GLAIVE: 6, FLAIL: 7, CHAIN1: 8, CHAIN2: 9, HEAD: 10, FLAME: 11, GLAIVE_FIND: 12, FLAIL_FIND: 13, COUNT: 14 };

export class Builder {
  constructor() {
    this.pos = []; this.nrm = []; this.uv = []; this.info = []; this.idx = [];
    this.slot = 0; this.mat = 0; this.seed = 0.5; this.edge = 0;
    // Current transform: 3x3 rotation (row-major) and translation; a stack for nesting.
    this.m = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
    this.stack = [];
  }
  /** Material for what follows: kind, seed (per-piece variation), edge (1 = a bright cutting edge). */
  use(mat, seed = 0.5, edge = 0) { this.mat = mat; this.seed = seed; this.edge = edge; return this; }
  /** Push a local transform: translate (tx, ty, tz) after rotating by ry (yaw), rx (pitch), rz (roll). */
  push(tx, ty, tz, ry = 0, rx = 0, rz = 0) {
    this.stack.push(this.m.slice());
    const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx), cz = Math.cos(rz), sz = Math.sin(rz);
    // R = Ry · Rx · Rz (row-major).
    const rxz = [cz, -sz, 0, cx * sz, cx * cz, -sx, sx * sz, sx * cz, cx];
    const r = [cy * rxz[0] + sy * rxz[6], cy * rxz[1] + sy * rxz[7], cy * rxz[2] + sy * rxz[8],
      rxz[3], rxz[4], rxz[5],
      -sy * rxz[0] + cy * rxz[6], -sy * rxz[1] + cy * rxz[7], -sy * rxz[2] + cy * rxz[8]];
    const a = this.m, o = new Array(12);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * r[j] + a[i * 3 + 1] * r[3 + j] + a[i * 3 + 2] * r[6 + j];
    for (let i = 0; i < 3; i++) o[9 + i] = a[i * 3] * tx + a[i * 3 + 1] * ty + a[i * 3 + 2] * tz + a[9 + i];
    this.m = o;
    return this;
  }
  pop() { this.m = this.stack.pop(); return this; }
  /** Stretch the current frame along its own y axis (a chain segment of any length from one unit-long mesh). */
  scaleY(s) { this.m[1] *= s; this.m[4] *= s; this.m[7] *= s; return this; }
  _v(x, y, z, nx, ny, nz, u, v) {
    const a = this.m;
    this.pos.push(a[0] * x + a[1] * y + a[2] * z + a[9], a[3] * x + a[4] * y + a[5] * z + a[10], a[6] * x + a[7] * y + a[8] * z + a[11]);
    this.nrm.push(a[0] * nx + a[1] * ny + a[2] * nz, a[3] * nx + a[4] * ny + a[5] * nz, a[6] * nx + a[7] * ny + a[8] * nz);
    this.uv.push(u, v); this.info.push(this.slot, this.mat, this.seed, this.edge);
    return this.pos.length / 3 - 1;
  }
  _quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  /** A flat-shaded quad from four corners (counter-clockwise seen from outside), uv in metres. */
  face(p, n, w, h) {
    const i = this._v(p[0], p[1], p[2], n[0], n[1], n[2], 0, 0);
    this._v(p[3], p[4], p[5], n[0], n[1], n[2], w, 0); this._v(p[6], p[7], p[8], n[0], n[1], n[2], w, h); this._v(p[9], p[10], p[11], n[0], n[1], n[2], 0, h);
    this._quad(i, i + 1, i + 2, i + 3);
  }
  /** An axis-aligned box (local frame), half sizes hx, hy, hz at (cx, cy, cz). */
  box(cx, cy, cz, hx, hy, hz) {
    const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
    this.face([x1, y0, z0, x1, y0, z1, x1, y1, z1, x1, y1, z0], [1, 0, 0], hz * 2, hy * 2);
    this.face([x0, y0, z1, x0, y0, z0, x0, y1, z0, x0, y1, z1], [-1, 0, 0], hz * 2, hy * 2);
    this.face([x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1], [0, 1, 0], hx * 2, hz * 2);
    this.face([x0, y0, z1, x1, y0, z1, x1, y0, z0, x0, y0, z0], [0, -1, 0], hx * 2, hz * 2);
    this.face([x1, y0, z1, x0, y0, z1, x0, y1, z1, x1, y1, z1], [0, 0, 1], hx * 2, hy * 2);
    this.face([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0], [0, 0, -1], hx * 2, hy * 2);
  }
  /** A tube along a polyline (x, y, z per point) with a radius per point; smooth normals, optional flat end caps. */
  tube(pts, radii, sides = 8, caps = true) {
    const n = pts.length / 3, base = this.pos.length / 3, rings = [];
    let len = 0;
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      let tx = pts[i1 * 3] - pts[i0 * 3], ty = pts[i1 * 3 + 1] - pts[i0 * 3 + 1], tz = pts[i1 * 3 + 2] - pts[i0 * 3 + 2];
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      // A frame (b, c) around the tangent.
      const ux = Math.abs(ty) > 0.9 ? 1 : 0, uy = Math.abs(ty) > 0.9 ? 0 : 1;
      let bx = ty * 0 - tz * uy, by = tz * ux - tx * 0, bz = tx * uy - ty * ux;
      const bl = Math.hypot(bx, by, bz) || 1; bx /= bl; by /= bl; bz /= bl;
      const cx = by * tz - bz * ty, cy = bz * tx - bx * tz, cz = bx * ty - by * tx;
      if (i > 0) len += Math.hypot(pts[i * 3] - pts[i * 3 - 3], pts[i * 3 + 1] - pts[i * 3 - 2], pts[i * 3 + 2] - pts[i * 3 - 1]);
      const ring = [];
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), r = radii[i];
        const nx = bx * ca + cx * sa, ny = by * ca + cy * sa, nz = bz * ca + cz * sa;
        const x = pts[i * 3] + nx * r, y = pts[i * 3 + 1] + ny * r, z = pts[i * 3 + 2] + nz * r;
        ring.push(x, y, z);
        this._v(x, y, z, nx, ny, nz, (s / sides) * Math.PI * 2 * r, len);
      }
      rings.push(ring, [tx, ty, tz]);
    }
    const row = sides + 1;
    for (let i = 0; i + 1 < n; i++) for (let s = 0; s < sides; s++) this._quad(base + i * row + s, base + i * row + s + 1, base + (i + 1) * row + s + 1, base + (i + 1) * row + s);
    if (!caps) return;
    for (const end of [0, n - 1]) {
      const sgn = end === 0 ? -1 : 1, t = rings[end * 2 + 1], ring = rings[end * 2];
      const c = this._v(pts[end * 3], pts[end * 3 + 1], pts[end * 3 + 2], t[0] * sgn, t[1] * sgn, t[2] * sgn, 0, 0);
      for (let s = 0; s <= sides; s++) this._v(ring[s * 3], ring[s * 3 + 1], ring[s * 3 + 2], t[0] * sgn, t[1] * sgn, t[2] * sgn, 0, 0);
      for (let s = 0; s < sides; s++) { if (end === 0) this.idx.push(c, c + 2 + s, c + 1 + s); else this.idx.push(c, c + 1 + s, c + 2 + s); }
    }
  }
  /** A straight tapered column along y from y0 (radius r0) to y1 (r1) at (cx, cz). */
  column(cx, cz, y0, y1, r0, r1, sides = 8) { this.tube([cx, y0, cz, cx, y1, cz], [r0, r1], sides, true); }
  /** An ellipsoid. */
  blob(cx, cy, cz, rx, ry, rz, seg = 8) {
    const base = this.pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI, st = Math.sin(th), ct = Math.cos(th);
      for (let j = 0; j <= seg; j++) {
        const ph = (j / seg) * Math.PI * 2, nx = st * Math.cos(ph), nz = st * Math.sin(ph);
        this._v(cx + nx * rx, cy + ct * ry, cz + nz * rz, nx / rx, ct / ry, nz / rz, j / seg * rx * 6, i / seg * ry * 3);
      }
    }
    for (let i = 0; i < seg; i++) for (let j = 0; j < seg; j++) this._quad(base + i * (seg + 1) + j, base + i * (seg + 1) + j + 1, base + (i + 1) * (seg + 1) + j + 1, base + (i + 1) * (seg + 1) + j);
  }
  /** A curved blade: an arc of radius R in the y–z plane from angle 0 to A, leaving the handle upward; width tapering to a point. */
  blade(y0, R, A, width, thick, steps = 14) {
    const base = this.pos.length / 3;
    for (let k = 0; k <= steps; k++) {
      const s = k / steps, a = s * A, sa = Math.sin(a), ca = Math.cos(a);
      const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, 0.16 + 0.84 * (1 - s) * 1.0)), 0.6) * (1 - 0.5 * s) + (k === steps ? -width : 0) * 0;
      const wIn = k === steps ? 0 : w, wOut = 0.012 * (1 - s * 0.8);
      const cy = y0, cz = R;
      const oy = cy + (R + wOut) * sa, oz = cz - (R + wOut) * ca, iy = cy + (R - wIn) * sa, iz = cz - (R - wIn) * ca;
      const ny = sa, nz = -ca, t = thick * (1 - 0.6 * s);
      // spine-left, spine-right (thick), edge (thin, bright)
      this._v(-t, oy, oz, 0, ny, nz, s * A * R, 0); this._v(t, oy, oz, 0, ny, nz, s * A * R, 0.02);
      this._v(-0.0008, iy, iz, -1, 0, 0, s * A * R, 0.05); this._v(0.0008, iy, iz, 1, 0, 0, s * A * R, 0.05);
    }
    // Four verts per step: 0 spine-left, 1 spine-right, 2 edge-left, 3 edge-right. Faces: left, right, spine.
    for (let k = 0; k < steps; k++) {
      const a = base + k * 4, b = a + 4;
      this._quad(a, a + 2, b + 2, b);                 // left face
      this._quad(a + 3, a + 1, b + 1, b + 3);          // right face
      this._quad(a + 1, a, b, b + 1);                  // spine
    }
  }
  /** A straight leaf blade standing on the y axis from y0 for `len`: widest at 40 %, a central ridge, both edges bright (edge = 1 on the cutting verts only). */
  leaf(y0, len, hw, thick, steps = 10) {
    const base = this.pos.length / 3, keep = this.edge;
    for (let k = 0; k <= steps; k++) {
      const s = k / steps, y = y0 + len * s;
      const w = hw * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.62)), 0.8) + (k === 0 ? 0.35 * hw : 0), t = thick * (1 - 0.7 * s);
      const sl = (s < 0.4 ? 1 : -0.7) * hw / len;       // the edge's slope, for the face normals
      this.edge = 0; this._v(0, y, t, 0, 0.1, 1, s * len, 0); this._v(0, y, -t, 0, 0.1, -1, s * len, 0);
      this.edge = 1; this._v(-w, y, 0, -1, sl, 0.15, s * len, 0.05); this._v(w, y, 0, 1, sl, 0.15, s * len, 0.05);
    }
    this.edge = keep;
    // Four verts per step: 0 ridge front, 1 ridge back, 2 edge left, 3 edge right.
    for (let k = 0; k < steps; k++) {
      const a = base + k * 4, b = a + 4;
      this._quad(a, a + 2, b + 2, b); this._quad(a + 3, a, b, b + 3);          // front, left then right
      this._quad(a + 2, a + 1, b + 1, b + 2); this._quad(a + 1, a + 3, b + 3, b + 1);   // back
    }
  }
  /** Bake into typed arrays. */
  data() {
    return { positions: new Float32Array(this.pos), normals: new Float32Array(this.nrm), uvs: new Float32Array(this.uv), info: new Float32Array(this.info), indices: new Uint32Array(this.idx) };
  }
}

// Builder methods chain (each returns the builder).
for (const k of ['face', 'box', 'tube', 'column', 'blob', 'blade', 'leaf']) { const f = Builder.prototype[k]; Builder.prototype[k] = function (...a) { f.apply(this, a); return this; }; }

export function wobble(n, a, seed) { const o = []; for (let i = 0; i < n; i++) o.push(a * Math.sin(i * 1.7 + seed) * Math.cos(i * 0.6 + seed * 2)); return o; }
