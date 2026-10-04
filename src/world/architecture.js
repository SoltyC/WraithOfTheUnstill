// Shaper architecture (BRIEF §11 shrines, §17 monastery and camp): procedural, no imported meshes
// (user decision, Phase 7). Built once on the CPU from a few primitives — blocks, drums, cones,
// slabs — into one merged mesh, in each site's local frame (origin = the site's anchor; y = 0 is
// its seat, the lowest ground under its footprint, found at runtime). Foundations run 3 m below
// the seat, so a site on a slope never shows a gap. Pure data: testable in Node.
//
// Per vertex: position (site-local, m), normal, uv (face-planar metres), and a 4-vector
// (site index, material, seed, carve) the shader reads. Materials: STONE (Shaper ashlar),
// GLYPH (stone with carved, faintly lit Shaper glyph bands), CANVAS (tents), WOOD, ICE, EMBER.
// Also returns 2D collision shapes (blockers: circles and boxes; platforms: walkable tops).

export const MAT = { STONE: 0, GLYPH: 1, CANVAS: 2, WOOD: 3, ICE: 4, EMBER: 5, METAL: 6 };
const FOUND = 3; // m of foundation below the seat

function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

class Builder {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.info = []; this.idx = []; this.blockers = []; this.platforms = []; this.site = 0; }
  /** One flat quad (a, b, c, d counter-clockwise seen from outside), uv in metres along ab and ad. */
  quad(a, b, c, d, mat, seed, carve = 0) {
    const ux = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], vx = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let n = [ux[1] * vx[2] - ux[2] * vx[1], ux[2] * vx[0] - ux[0] * vx[2], ux[0] * vx[1] - ux[1] * vx[0]];
    const l = -(Math.hypot(n[0], n[1], n[2]) || 1); n = [n[0] / l, n[1] / l, n[2] / l]; // outward
    const lu = Math.hypot(...ux), lv = Math.hypot(...vx);
    const base = this.pos.length / 3;
    for (const [p, u, v] of [[a, 0, 0], [b, lu, 0], [c, lu, lv], [d, 0, lv]]) {
      this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.uv.push(u, v);
      this.info.push(this.site, mat, seed, carve);
    }
    this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  tri(a, b, c, mat, seed) {
    const ux = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], vx = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [ux[1] * vx[2] - ux[2] * vx[1], ux[2] * vx[0] - ux[0] * vx[2], ux[0] * vx[1] - ux[1] * vx[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / l, n[1] / l, n[2] / l];
    const base = this.pos.length / 3, lu = Math.hypot(...ux);
    for (const [p, u, v] of [[a, 0, 0], [b, lu, 0], [c, lu * 0.5, Math.hypot(...vx)]]) {
      this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.uv.push(u, v);
      this.info.push(this.site, mat, seed, 0);
    }
    this.idx.push(base, base + 2, base + 1);
  }
  /**
   * Oriented box: centre (x, z), base y0 to top y1, half extents hx (along yaw's right), hz (along
   * yaw's forward), tilt (rad, about its own x: a leaning slab). `solid` adds a blocker.
   */
  box(x, z, y0, y1, hx, hz, yaw, mat, seed, { tilt = 0, carve = 0, solid = true, platform = false, roll = 0 } = {}) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt), cr = Math.cos(roll), sr = Math.sin(roll);
    const ym = (y0 + y1) / 2, hy = (y1 - y0) / 2;
    const P = (lx, ly, lz) => {
      // roll about forward (z), then tilt about right (x), then yaw.
      let ax = lx * cr - ly * sr, ay = lx * sr + ly * cr, az = lz;
      const by = ay * ct - az * st, bz = ay * st + az * ct;
      return [x + ax * cy + bz * sy, ym + by, z - ax * sy + bz * cy];
    };
    const c = [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), P(-hx, hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), P(-hx, hy, hz)];
    this.quad(c[4], c[5], c[6], c[7], mat, seed, carve);           // top
    this.quad(c[0], c[3], c[2], c[1], mat, seed, carve);           // bottom
    this.quad(c[0], c[1], c[5], c[4], mat, seed, carve);           // back (−z)
    this.quad(c[2], c[3], c[7], c[6], mat, seed, carve);           // front (+z)
    this.quad(c[3], c[0], c[4], c[7], mat, seed, carve);           // left
    this.quad(c[1], c[2], c[6], c[5], mat, seed, carve);           // right
    if (solid && Math.abs(tilt) < 0.6 && Math.abs(roll) < 0.6) this.blockers.push({ site: this.site, kind: 'box', x, z, hx: hx + 0.05, hz: hz + 0.05, cos: cy, sin: sy, y0, y1 });
    if (platform) this.platforms.push({ site: this.site, x, z, hx, hz, cos: cy, sin: sy, top: y1 });
  }
  /** Battered block: a box whose half extents go from (hx0, hz0) at y0 to (hx1, hz1) at y1
   *  (foundations, buttresses that widen toward the ground). Never solid (walls above are). */
  frustum(x, z, y0, y1, hx0, hz0, hx1, hz1, yaw, mat, seed) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const P = (lx, y, lz) => [x + lx * cy + lz * sy, y, z - lx * sy + lz * cy];
    const c = [P(-hx0, y0, -hz0), P(hx0, y0, -hz0), P(hx0, y0, hz0), P(-hx0, y0, hz0), P(-hx1, y1, -hz1), P(hx1, y1, -hz1), P(hx1, y1, hz1), P(-hx1, y1, hz1)];
    this.quad(c[4], c[5], c[6], c[7], mat, seed);
    this.quad(c[0], c[1], c[5], c[4], mat, seed);
    this.quad(c[2], c[3], c[7], c[6], mat, seed);
    this.quad(c[3], c[0], c[4], c[7], mat, seed);
    this.quad(c[1], c[2], c[6], c[5], mat, seed);
  }
  /** Drum (column, altar, bell): n sides, radius r0 at y0 to r1 at y1; capped. */
  drum(x, z, y0, y1, r0, r1, n, mat, seed, { carve = 0, solid = true, lie = 0, yaw = 0 } = {}) {
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

/** Shaper monastery: a cloister crowning the summit where the last Shaper died. The peak is
 *  sharp (the ground falls ~40 m inside the cloister's footprint), so the platform is a citadel:
 *  seated at the summit, its ashlar foundations run 45 m down the slopes. */
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
      if (side === 0 && t === 0) continue; // the stair comes down this face
      const bx = nx * 15.6 + tx * t, bz = nz * 15.6 + tz * t;
      b.frustum(bx + nx * 1.6, bz + nz * 1.6, -CITADEL, -20, 1.5, 3.4, 1.2, 1.2, yaw, MAT.STONE, 7 + side * 3 + t);
      b.frustum(bx + nx * 0.4, bz + nz * 0.4, -20.2, -1.5, 1.2, 1.2, 0.9, 0.5, yaw, MAT.STONE, 8 + side * 3 + t);
    }
  }
  // The stair down the descent face: flights of steps on a ramp of masonry.
  for (let k = 0; k < 14; k++) {
    const f = 15.6 + k * 0.9, top = 0.17 - k * 0.55;
    const [x, z] = at(0, f);
    b.box(x, z, -CITADEL + k * 0.5, top, 2.6, 0.5, facing, MAT.STONE, 2 + k, { solid: false, platform: true });
  }
  // A parapet round the platform's edge, open toward the descent.
  for (let k = 0; k < 4; k++) {
    const yaw = facing + k * Math.PI / 2, ex = Math.sin(yaw) * 14.6, ez = Math.cos(yaw) * 14.6;
    if (k === 0) { for (const s of [-1, 1]) { const ox = Math.cos(facing) * s * 9.5, oz = -Math.sin(facing) * s * 9.5; b.box(ex + ox, ez + oz, 0.35, 1.25, 5.2, 0.35, yaw, MAT.STONE, 120 + s); } }
    else b.box(ex, ez, 0.35, 1.25, 14.6, 0.35, yaw, MAT.STONE, 110 + k);
  }
  // The hall: 14 × 10 m, walls 0.9 m thick and ~6 m tall, a doorway facing the descent, the roof
  // half fallen in.
  const H = 6.2, T = 0.45;
  const wall = (s, f, hx, hz, h = H, seed = 3) => { const [x, z] = at(s, f); b.box(x, z, 0.35, 0.35 + h, hx, hz, facing, MAT.STONE, seed); };
  wall(0, -5, 7, T);                       // back wall
  wall(-7, 0, T, 5, H, 4); wall(7, 0, T, 5, H * 0.72, 5); // side walls (the east one broken down)
  wall(-4.6, 5, 2.4, T, H, 6); wall(4.6, 5, 2.4, T, H, 7); // front, either side of the door
  { const [x, z] = at(0, 5); b.box(x, z, 0.35 + 3.6, 0.35 + H, 2.2, T, facing, MAT.GLYPH, 8, { carve: 1, solid: false }); } // lintel
  // Roof slabs: the west half still spans; the east half lies fallen and leaning in.
  for (let k = 0; k < 4; k++) { const [x, z] = at(-3.6, -3.75 + k * 2.5); b.box(x, z, 0.35 + H, 0.35 + H + 0.4, 3.4, 1.3, facing, MAT.STONE, 20 + k, { solid: false, roll: 0.05 }); }
  { const [x, z] = at(3.6, -1); b.box(x, z, 0.35, 0.35 + 0.5, 3.2, 1.4, facing, MAT.STONE, 30, { roll: -0.55, solid: false }); }
  { const [x, z] = at(4.4, 2.6); b.box(x, z, 0.35, 0.35 + 0.45, 3.0, 1.2, facing + 0.3, MAT.STONE, 31, { roll: 0.4, solid: false }); }
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
    const k = Math.floor(R() * 7);
    b.cone(x, z, -0.1, h, r, 7, MAT.CANVAS, Math.floor(R() * 1e6), { ax: (R() - 0.5) * 0.3, az: (R() - 0.5) * 0.3, open: k });
    b.drum(x, z, -0.1, h + 0.5, 0.05, 0.04, 5, MAT.WOOD, 5, { solid: false });
  }
  // Fire ring and embers.
  for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; b.box(Math.cos(a) * 1.05, Math.sin(a) * 1.05, -0.1, 0.22, 0.22, 0.15, a, MAT.STONE, 40 + k, { solid: false }); }
  b.drum(0, 0, -0.05, 0.12, 0.75, 0.6, 9, MAT.EMBER, 50, { solid: false });
  for (let k = 0; k < 4; k++) { const a = k * 1.6; b.drum(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.05, 0.05 + 1.1, 0.06, 0.06, 5, MAT.WOOD, 51 + k, { lie: 1, yaw: a + 0.4, solid: false }); }
  // Lantern post.
  b.drum(3, -3.5, -0.2, 2.6, 0.07, 0.06, 6, MAT.WOOD, 60);
  b.box(3.35, -3.5, 2.3, 2.34, 0.4, 0.04, 0, MAT.WOOD, 61, { solid: false });
  // Sleds and packs.
  b.box(-5, -5, -0.1, 0.35, 0.6, 1.4, facing + 0.4, MAT.WOOD, 70);
  b.box(-5, -5, 0.35, 0.85, 0.5, 0.8, facing + 0.4, MAT.WOOD, 71, { solid: false }); // packs (hide-wrapped)
  b.box(-3.2, -6.4, -0.1, 0.6, 0.45, 0.45, 0.7, MAT.WOOD, 72);
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
];

/** Every site of the frost chapter: { id, x, z, facing, build, footprint (seat radius, m) }. */
export function frostSites(table) {
  const P = (id) => table[id].pos;
  const mon = P('monastery'), camp0 = P('camp-frost');
  const toward = (a, b) => Math.atan2(b[0] - a[0], b[1] - a[1]);
  const sites = [
    { id: 'monastery', at: mon, facing: toward(mon, camp0), build: monastery, footprint: 16, seatAt: 'top' },
    { id: 'camp-frost', at: camp0, facing: toward(camp0, P('warden-frost')), build: camp, footprint: 12 },
    { id: 'spring-frost', at: P('spring-frost'), facing: 0, build: spring, footprint: 7.5 },
    { id: 'varo-rise', at: P('varo-rise'), facing: toward(P('varo-rise'), P('warden-frost')), build: watchingStone, footprint: 1.5 },
  ];
  for (let k = 1; k <= 5; k++) { const id = 'shrine-frost-' + k; sites.push({ id, at: P(id), facing: k * 1.3, build: shrine, footprint: 4.6 }); }
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
