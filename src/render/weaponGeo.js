// The weapons' geometry (docs §11.2), built once on the CPU in the Shapers' visual language — carved
// stone, oak, iron, wrapped cord — the way world/architecture.js builds its sites: primitives into
// one mesh, each vertex tagged with (slot, material, seed, edge) in `info`. A slot is one placed
// object: the shader moves each slot's vertices by its own transform every frame (render/
// weaponView.js), so a weapon is drawn where the hands are and a find lies where it was left.
//
// Local frames: a held weapon's origin is the grip and its shaft runs along +y; blades curve
// toward +z. Materials: 0 dressed stone, 1 oak, 2 iron, 3 wrapped felt, 4 bronze, 5 pale stone.

export const WMAT = { STONE: 0, OAK: 1, IRON: 2, FELT: 3, BRONZE: 4, PALE: 5 };
/** Slots: 0 staff, 1 right sickle, 2 left sickle, 3 maul, 4 the reaper's stand, 5 the cold forge. */
export const SLOT = { STAFF: 0, SICKLE_R: 1, SICKLE_L: 2, MAUL: 3, STAND: 4, FORGE: 5, COUNT: 6 };

class Builder {
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
  /** Bake into typed arrays. */
  data() {
    return { positions: new Float32Array(this.pos), normals: new Float32Array(this.nrm), uvs: new Float32Array(this.uv), info: new Float32Array(this.info), indices: new Uint32Array(this.idx) };
  }
}

// Builder methods chain (each returns the builder).
for (const k of ['face', 'box', 'tube', 'column', 'blob', 'blade']) { const f = Builder.prototype[k]; Builder.prototype[k] = function (...a) { f.apply(this, a); return this; }; }

function wobble(n, a, seed) { const o = []; for (let i = 0; i < n; i++) o.push(a * Math.sin(i * 1.7 + seed) * Math.cos(i * 0.6 + seed * 2)); return o; }

/** The pilgrim's staff: grip at the origin, butt at −0.7, the crook's bead at +1.3. */
function staff(B) {
  B.slot = SLOT.STAFF;
  // Shaft: a hand-hewn oak pole, a touch thicker at the grip, a gentle bow.
  const ys = [-0.7, -0.4, -0.1, 0.2, 0.5, 0.8, 1.05, 1.18], pts = [], rad = [0.02, 0.022, 0.025, 0.024, 0.023, 0.022, 0.021, 0.019], wb = wobble(ys.length, 0.004, 1.3);
  ys.forEach((y, i) => pts.push(wb[i], y, wb[(i + 3) % ys.length] * 0.7));
  B.use(WMAT.OAK, 0.3).tube(pts, rad, 8);
  // The crook: the pole curls forward over itself.
  const cp = [], cr = [];
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * 2.5; cp.push(0.0, 1.18 + 0.11 * Math.sin(a), 0.11 - 0.11 * Math.cos(a)); cr.push(0.019 - 0.004 * (i / 8)); }
  B.tube(cp, cr, 8);
  // A Shaper stone bead at the end of the crook, with a bronze collar.
  const ex = cp[cp.length - 3], ey = cp[cp.length - 2], ez = cp[cp.length - 1];
  B.use(WMAT.STONE, 0.62).blob(ex, ey - 0.03, ez + 0.01, 0.036, 0.04, 0.036, 8);
  B.use(WMAT.BRONZE, 0.2).column(0, 0, 1.12, 1.15, 0.03, 0.03, 8);
  // Iron ferrule, felt bindings at the grip and halfway, and a tassel of cord from the crook.
  B.use(WMAT.IRON, 0.4).column(0, 0, -0.76, -0.62, 0.026, 0.024, 8);
  B.use(WMAT.FELT, 0.5);
  B.column(wb[2], wb[5] * 0.7, -0.14, 0.12, 0.0275, 0.0275, 8); B.column(wb[4], wb[7] * 0.7, 0.5, 0.58, 0.0255, 0.0255, 8);
  for (const dx of [-0.012, 0.012, 0]) B.tube([dx, 1.12, 0.0, dx * 2, 0.98, -0.01, dx * 3, 0.86, -0.012], [0.006, 0.0055, 0.004], 5, true);
}

/** One sickle, grip at the origin (in `slot`): oak handle, iron collar, a hooked blade curving toward +z. */
function sickle(B, slot) {
  B.slot = slot;
  B.use(WMAT.OAK, 0.2 + slot * 0.1).tube([0, -0.13, 0, 0, 0.05, 0.002, 0, 0.2, 0], [0.019, 0.017, 0.016], 8);
  B.use(WMAT.FELT, 0.4).column(0, 0, -0.1, 0.06, 0.0205, 0.0205, 8);
  B.use(WMAT.IRON, 0.2).column(0, 0, -0.145, -0.12, 0.024, 0.02, 8);         // pommel cap
  B.use(WMAT.IRON, 0.3).column(0, 0, 0.19, 0.235, 0.021, 0.016, 8);           // collar
  B.use(WMAT.IRON, 0.6, 1).blade(0.22, 0.3, 2.0, 0.06, 0.006);
}

/** The Shaper maul: grip at the origin, haft to +1.08, a dressed-stone head along z, iron-capped. */
function maul(B, slot = SLOT.MAUL) {
  B.slot = slot;
  const ys = [-0.45, -0.2, 0.1, 0.4, 0.7, 1.0, 1.14], pts = [], rad = [0.03, 0.032, 0.035, 0.036, 0.036, 0.034, 0.033], wb = wobble(ys.length, 0.004, 2.1);
  ys.forEach((y, i) => pts.push(wb[i], y, wb[(i + 2) % ys.length] * 0.6));
  B.use(WMAT.OAK, 0.7).tube(pts, rad, 10);
  B.use(WMAT.FELT, 0.2).column(0, 0, -0.38, 0.2, 0.0385, 0.0385, 10);
  B.use(WMAT.IRON, 0.5).column(0, 0, -0.5, -0.43, 0.04, 0.036, 10);
  for (const y of [0.45, 0.62]) B.use(WMAT.IRON, 0.3 + y).column(wb[3], 0, y, y + 0.03, 0.039, 0.039, 10);
  // The head: an eight-sided dressed-stone drum lying along z, iron end caps, a bronze band, a collar around the haft.
  B.push(0, 1.14, 0, 0, Math.PI / 2, Math.PI / 8);
  B.use(WMAT.STONE, 0.37).column(0, 0, -0.2, 0.2, 0.14, 0.14, 8);
  B.use(WMAT.IRON, 0.55).column(0, 0, -0.27, -0.2, 0.125, 0.15, 8); B.column(0, 0, 0.2, 0.27, 0.15, 0.125, 8);
  B.use(WMAT.BRONZE, 0.3).column(0, 0, -0.045, 0.045, 0.148, 0.148, 8);
  B.pop();
  B.use(WMAT.IRON, 0.5).column(0, 0, 1.02, 1.26, 0.055, 0.04, 10);
}

/** The reaper's stand: a weathered oak post and crossbar on a stone footing, a pair of sickles hung on it. */
function stand(B) {
  B.slot = SLOT.STAND;
  B.use(WMAT.STONE, 0.15).box(0, 0.09, 0, 0.3, 0.09, 0.26);
  B.use(WMAT.OAK, 0.5).push(0, 0, 0, 0.1, 0.03, -0.02).box(0, 0.8, 0, 0.065, 0.75, 0.06).pop();
  B.use(WMAT.OAK, 0.8).box(0, 1.34, 0, 0.5, 0.05, 0.045);
  B.use(WMAT.IRON, 0.3).box(0, 1.34, 0.05, 0.07, 0.07, 0.01);
  B.use(WMAT.FELT, 0.3).tube([0.3, 1.31, 0.05, 0.3, 1.2, 0.07], [0.012, 0.01], 5, true); B.tube([-0.3, 1.31, 0.05, -0.3, 1.2, 0.07], [0.012, 0.01], 5, true);
  // Two sickles hung by their handles from cords, blades down and swung a little.
  for (const [sx, r] of [[0.3, 0.12], [-0.3, -0.08]]) {
    B.push(sx, 1.2, 0.08, Math.PI, 0, Math.PI + r);
    const keep = B.slot; B.slot = SLOT.STAND;
    B.use(WMAT.OAK, 0.3).tube([0, -0.13, 0, 0, 0.05, 0.002, 0, 0.2, 0], [0.019, 0.017, 0.016], 8);
    B.use(WMAT.IRON, 0.3).column(0, 0, 0.19, 0.235, 0.021, 0.016, 8);
    B.use(WMAT.IRON, 0.6, 1).blade(0.22, 0.3, 2.0, 0.06, 0.006);
    B.slot = keep; B.pop();
  }
  // A bundle of cut straw at the foot.
  B.use(WMAT.FELT, 0.85);
  for (let i = 0; i < 6; i++) B.tube([0.36 + 0.02 * i, 0.02, 0.1 - 0.04 * i, 0.42 + 0.03 * i, 0.3, 0.06 - 0.03 * i], [0.012, 0.004], 4, true);
}

/** The cold forge: a broken anvil-stone and its fallen half, a cracked trough, the maul leaning on it. */
function forge(B) {
  B.slot = SLOT.FORGE;
  B.use(WMAT.STONE, 0.22).box(0, 0.22, 0, 0.42, 0.22, 0.3);
  B.use(WMAT.PALE, 0.31).push(0, 0, 0, 0.12).box(0, 0.55, 0, 0.55, 0.11, 0.3).pop();            // the anvil's face
  B.use(WMAT.PALE, 0.41).push(0.95, 0, 0.1, -0.5, 0, 0.12).box(0, 0.16, 0, 0.3, 0.16, 0.24).pop();   // the broken horn
  B.use(WMAT.STONE, 0.5).push(-1.1, 0, 0.5, 0.4).box(0, 0.12, 0, 0.5, 0.12, 0.2).pop();              // a trough stone
  B.use(WMAT.IRON, 0.35).push(0.2, 0.66, -0.1, 0.5).box(0, 0.015, 0, 0.14, 0.015, 0.06).pop();       // a lump of old iron
  // The maul, leaning against the anvil's flank, head up.
  B.push(-0.52, 0.0, 0.34, -0.35, -0.18, 0.2);
  const keep = B.slot; maul(B, SLOT.FORGE); B.slot = keep; B.pop();
}

/** Build the whole mesh data once. */
export function buildWeaponMesh() {
  const B = new Builder();
  staff(B);
  sickle(B, SLOT.SICKLE_R); sickle(B, SLOT.SICKLE_L);
  maul(B, SLOT.MAUL);
  stand(B); forge(B);
  return B.data();
}
