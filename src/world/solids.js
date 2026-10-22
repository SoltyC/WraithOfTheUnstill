// Collision with the architecture (BRIEF §4.2 collision parity for built things): 2D shapes in
// world x/z — circles (columns, tents) and oriented boxes (walls, stones) that push the capsule
// out, and platforms (plinths, floors) whose tops the capsule stands on. Heights are relative to
// each site's seat, known once the ground under the site is (sites with no seat yet are skipped).
// Allocation-free; a handful of sites, each culled by its radius first.

const R = 0.38; // capsule radius (m)

export function createSolids(sites, built, stairRuns = null) {
  const S = sites.map((s) => ({ x: s.at[0], z: s.at[1], seat: NaN, rad: 0 }));
  const blockers = built.blockers.map((b) => ({ ...b, x: b.x + sites[b.site].at[0], z: b.z + sites[b.site].at[1] }));
  const platforms = built.platforms.map((p) => ({ ...p, x: p.x + sites[p.site].at[0], z: p.z + sites[p.site].at[1] }));
  for (const b of blockers) { const s = S[b.site]; s.rad = Math.max(s.rad, Math.hypot(b.x - s.x, b.z - s.z) + (b.r || Math.hypot(b.hx, b.hz)) + 2); }
  for (const p of platforms) { const s = S[p.site]; s.rad = Math.max(s.rad, Math.hypot(p.x - s.x, p.z - s.z) + Math.hypot(p.hx, p.hz) + 2); }
  const near = new Uint8Array(S.length);
  // The monumental stair's runs (world/stair.js stairSegments): straight segments { x0, z0, x1, z1, halfWidth,
  // y0, y1, tread } with a stepped floor — y0 + (y1 − y0) · ceil(d / tread) / m along the axis (d from the
  // start, m = round(length / tread)), within halfWidth of it. Absolute heights (no site seat). Grouped
  // (16 consecutive segments) under a bounding circle, so a query tests a few circles and one group.
  const ST = buildStairRuns(stairRuns);
  // Rocks near the Wraith (systems/rockSolids.js fills them): an ellipse (half-extents rx, rz in
  // the rock's yawed frame: local x = wx·cos + wz·sin, z = −wx·sin + wz·cos) from its seat y0 to
  // its top y1 (a dome over the ellipse for standing on).
  const MAXR = 96;
  const rk = { n: 0, x: new Float64Array(MAXR), z: new Float64Array(MAXR), c: new Float64Array(MAXR), s: new Float64Array(MAXR),
    rx: new Float64Array(MAXR), rz: new Float64Array(MAXR), y0: new Float64Array(MAXR), y1: new Float64Array(MAXR) };
  /** A rock taller than this above the feet blocks; lower ones are stepped onto (m). */
  const ROCK_STEP = 0.55;

  return {
    sites: S, blockers, platforms, rocks: rk, stair: ST,
    /** False while a site whose footprint covers (x, z) has no seat yet (a landing would miss its floors). */
    seatedNear(x, z) {
      for (let i = 0; i < S.length; i++) { const s = S[i], dx = x - s.x, dz = z - s.z; if (s.rad > 0 && dx * dx + dz * dz < s.rad * s.rad && Number.isNaN(s.seat)) return false; }
      return true;
    },
    /** Mark sites near (x, z) (call once per frame before the substeps). */
    cull(x, z) {
      for (let i = 0; i < S.length; i++) { const s = S[i], dx = x - s.x, dz = z - s.z; near[i] = !Number.isNaN(s.seat) && dx * dx + dz * dz < s.rad * s.rad ? 1 : 0; }
    },
    /** Query fields for floorQ() (no doubles across calls on the substep path): position qx, qz,
     *  terrain height qh, feet height qf (a top higher than a step above the feet is not stood on) → h. */
    qx: 0.5, qz: 0.5, qh: 0.5, qf: 0.5, h: 0.5,
    floorQ() { this.h = this.floor(this.qx, this.qz, this.qh, false, this.qf); },
    /** The same for anyone anywhere (the Veiled, feet, cloth): every seated site, any height. */
    floorAnyQ() { this.h = this.floor(this.qx, this.qz, this.qh, true, Infinity); },
    /** Ground under (x, z) given the terrain height gy: the highest platform top beneath, if higher. */
    floor(x, z, gy, any = false, feet = Infinity) {
      let h = gy;
      for (let i = 0; i < platforms.length; i++) {
        const p = platforms[i];
        if (any ? Number.isNaN(S[p.site].seat) : !near[p.site]) continue;
        const dx = x - p.x, dz = z - p.z;
        const lx = dx * p.cos - dz * p.sin, lz = dx * p.sin + dz * p.cos;
        if (lx < -p.hx || lx > p.hx || lz < -p.hz || lz > p.hz) continue;
        const top = S[p.site].seat + p.top;
        if (top > h && top <= feet + 0.7) h = top;
      }
      if (ST.n > 0) h = ST.floor(x, z, h, feet);
      for (let k = 0; k < rk.n; k++) {
        const dx = x - rk.x[k], dz = z - rk.z[k];
        const lx = (dx * rk.c[k] + dz * rk.s[k]) / rk.rx[k], lz = (-dx * rk.s[k] + dz * rk.c[k]) / rk.rz[k], q = lx * lx + lz * lz;
        if (q >= 1) continue;
        const top = rk.y0[k] + (rk.y1[k] - rk.y0[k]) * Math.sqrt(1 - q);
        if (top > h && top <= feet + 0.7) h = top;
      }
      return h;
    },
    /** Point query fields for insideQ() (the camera): px, py, pz. */
    px: 0.5, py: 0.5, pz: 0.5,
    /** True when (px, py, pz) is inside a solid or under a platform's top (any seated site). */
    insideQ() {
      const x = this.px, y = this.py, z = this.pz, m = 0.25;
      for (let i = 0; i < blockers.length; i++) {
        const b = blockers[i], seat = S[b.site].seat;
        if (Number.isNaN(seat) || y > seat + b.y1 + m || y < seat + b.y0 - m) continue;
        const dx = x - b.x, dz = z - b.z;
        if (b.kind === 'circle') { if (dx * dx + dz * dz < (b.r + m) * (b.r + m)) return true; }
        else {
          const lx = dx * b.cos - dz * b.sin, lz = dx * b.sin + dz * b.cos;
          if (lx > -b.hx - m && lx < b.hx + m && lz > -b.hz - m && lz < b.hz + m) return true;
        }
      }
      for (let i = 0; i < platforms.length; i++) {
        const p = platforms[i], seat = S[p.site].seat;
        if (Number.isNaN(seat) || y > seat + p.top + m) continue;
        const dx = x - p.x, dz = z - p.z, lx = dx * p.cos - dz * p.sin, lz = dx * p.sin + dz * p.cos;
        if (lx > -p.hx && lx < p.hx && lz > -p.hz && lz < p.hz) return true;
      }
      return false;
    },
    /**
     * Line of sight (fields in: segment from a to b; out: the first blocking point's fraction t):
     * true when a solid stands across the segment at the height the line passes it — the Warden's
     * spikes against cover. Every seated site within `segR` of the segment's middle is tested.
     */
    ax: 0.5, ay: 0.5, az: 0.5, bx: 0.5, by: 0.5, bz: 0.5, t: 0.5,
    segBlocked() {
      const ax = this.ax, ay = this.ay, az = this.az, dx = this.bx - ax, dy = this.by - ay, dz = this.bz - az;
      const mx = ax + dx * 0.5, mz = az + dz * 0.5, half = Math.hypot(dx, dz) * 0.5;
      let best = 2;
      for (let i = 0; i < blockers.length; i++) {
        const b = blockers[i], s = S[b.site];
        if (Number.isNaN(s.seat)) continue;
        const sx = s.x - mx, sz = s.z - mz;
        if (sx * sx + sz * sz > (s.rad + half) * (s.rad + half)) continue;
        // 2D entry/exit of the segment through the shape, then the height there.
        let t0 = 0, t1 = 1;
        const px = ax - b.x, pz = az - b.z;
        if (b.kind === 'circle') {
          const A = dx * dx + dz * dz, B = px * dx + pz * dz, C = px * px + pz * pz - b.r * b.r;
          if (A < 1e-9) { if (C > 0) continue; } else {
            const disc = B * B - A * C; if (disc < 0) continue;
            const q = Math.sqrt(disc); t0 = Math.max(0, (-B - q) / A); t1 = Math.min(1, (-B + q) / A);
          }
        } else {
          // Slab test in the box frame (right = (cos, −sin), forward = (sin, cos)).
          const lx = px * b.cos - pz * b.sin, lz = px * b.sin + pz * b.cos;
          const ux = dx * b.cos - dz * b.sin, uz = dx * b.sin + dz * b.cos;
          let ok = true;
          for (let k = 0; k < 2 && ok; k++) {
            const o = k ? lz : lx, u = k ? uz : ux, h = k ? b.hz : b.hx;
            if (Math.abs(u) < 1e-9) { if (o < -h || o > h) ok = false; continue; }
            let e0 = (-h - o) / u, e1 = (h - o) / u; if (e0 > e1) { const tt = e0; e0 = e1; e1 = tt; }
            if (e0 > t0) t0 = e0; if (e1 < t1) t1 = e1; if (t0 > t1) ok = false;
          }
          if (!ok) continue;
        }
        if (t0 > t1) continue;
        // The line's lowest height over [t0, t1] against the solid's top (and above its base).
        const y0 = ay + dy * t0, y1 = ay + dy * t1, lo = Math.min(y0, y1), hi = Math.max(y0, y1);
        if (lo > s.seat + b.y1 || hi < s.seat + b.y0) continue;
        if (t0 < best) best = t0;
      }
      this.t = best;
      return best <= 1;
    },
    /** Push position p (x, y, z) out of every solid it overlaps at its height; v loses its into-wall part. */
    push(p, v) {
      // Rocks: too tall to step onto → pushed out of the ellipse grown by the capsule's radius.
      for (let k = 0; k < rk.n; k++) {
        if (rk.y1[k] - p.y < ROCK_STEP || p.y + 1.7 < rk.y0[k]) continue;
        const dx = p.x - rk.x[k], dz = p.z - rk.z[k], c = rk.c[k], s = rk.s[k], a = rk.rx[k] + R, b = rk.rz[k] + R;
        const lx = dx * c + dz * s, lz = -dx * s + dz * c, q = (lx / a) * (lx / a) + (lz / b) * (lz / b);
        if (q >= 1) continue;
        // Onto the boundary along the ray from the centre; the normal of the ellipse there.
        const f = 1 / Math.sqrt(Math.max(q, 1e-6)), ex = lx * f, ez = lz * f;
        p.x = rk.x[k] + ex * c - ez * s; p.z = rk.z[k] + ex * s + ez * c;
        let nx = ex / (a * a), nz = ez / (b * b); const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
        const wx = nx * c - nz * s, wz = nx * s + nz * c;
        const into = v.x * wx + v.z * wz; if (into < 0) { v.x -= into * wx; v.z -= into * wz; }
      }
      for (let i = 0; i < blockers.length; i++) {
        const b = blockers[i];
        if (!near[b.site] || b.cam) continue; // camera-only (roofs)
        const seat = S[b.site].seat;
        if (p.y > seat + b.y1 - 0.05 || p.y + 1.7 < seat + b.y0) continue;
        const dx = p.x - b.x, dz = p.z - b.z;
        if (b.kind === 'circle') {
          const d = Math.sqrt(dx * dx + dz * dz), m = b.r + R;
          if (d >= m || d < 1e-6) continue;
          const nx = dx / d, nz = dz / d;
          p.x = b.x + nx * m; p.z = b.z + nz * m;
          const into = v.x * nx + v.z * nz; if (into < 0) { v.x -= into * nx; v.z -= into * nz; }
        } else {
          // Box frame: right = (cos, −sin), forward = (sin, cos).
          const lx = dx * b.cos - dz * b.sin, lz = dx * b.sin + dz * b.cos;
          const ex = b.hx + R, ez = b.hz + R;
          if (lx <= -ex || lx >= ex || lz <= -ez || lz >= ez) continue;
          const px = ex - Math.abs(lx), pz = ez - Math.abs(lz);
          let nx, nz, pen;
          if (px < pz) { const sgn = lx < 0 ? -1 : 1; nx = b.cos * sgn; nz = -b.sin * sgn; pen = px; }
          else { const sgn = lz < 0 ? -1 : 1; nx = b.sin * sgn; nz = b.cos * sgn; pen = pz; }
          p.x += nx * pen; p.z += nz * pen;
          const into = v.x * nx + v.z * nz; if (into < 0) { v.x -= into * nx; v.z -= into * nz; }
        }
      }
    },
  };
}

/** A ground query that also stands on built floors (once `solids` is set): for feet and cloth. */
export function flooredGround(ground) {
  return {
    qx: 0.5, qz: 0.5, h: 0.5, solids: null,
    sample() {
      ground.qx = this.qx; ground.qz = this.qz; ground.sample();
      const so = this.solids;
      if (so === null) { this.h = ground.h; return; }
      so.qx = this.qx; so.qz = this.qz; so.qh = ground.h; so.floorAnyQ(); this.h = so.h;
    },
  };
}

/** The stair-run solid (see createSolids): arrays and groups; floor(x, z, h, feet) → the higher of h and the tread under (x, z). */
function buildStairRuns(segs) {
  const n = segs ? segs.length : 0;
  const X0 = new Float64Array(n), Z0 = new Float64Array(n), FX = new Float64Array(n), FZ = new Float64Array(n), LEN = new Float64Array(n),
    HW = new Float64Array(n), Y0 = new Float64Array(n), Y1 = new Float64Array(n), TR = new Float64Array(n), M = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const g = segs[k], dx = g.x1 - g.x0, dz = g.z1 - g.z0, len = Math.hypot(dx, dz) || 1e-6;
    X0[k] = g.x0; Z0[k] = g.z0; FX[k] = dx / len; FZ[k] = dz / len; LEN[k] = len; HW[k] = g.halfWidth; Y0[k] = g.y0; Y1[k] = g.y1; TR[k] = g.tread;
    M[k] = Math.max(1, Math.round(len / g.tread));
  }
  const GROUP = 16, groups = [];
  for (let a = 0; a < n; a += GROUP) {
    const b = Math.min(n, a + GROUP);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, hw = 0;
    for (let k = a; k < b; k++) {
      x0 = Math.min(x0, X0[k], X0[k] + FX[k] * LEN[k]); x1 = Math.max(x1, X0[k], X0[k] + FX[k] * LEN[k]);
      z0 = Math.min(z0, Z0[k], Z0[k] + FZ[k] * LEN[k]); z1 = Math.max(z1, Z0[k], Z0[k] + FZ[k] * LEN[k]); hw = Math.max(hw, HW[k]);
    }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    let r = 0;
    for (let k = a; k < b; k++) r = Math.max(r, Math.hypot(X0[k] - cx, Z0[k] - cz), Math.hypot(X0[k] + FX[k] * LEN[k] - cx, Z0[k] + FZ[k] * LEN[k] - cz));
    r += hw + 1; groups.push({ a, b, cx, cz, r2: r * r });
  }
  return {
    n,
    floor(x, z, h, feet = Infinity) {
      for (let q = 0; q < groups.length; q++) {
        const G = groups[q], gx = x - G.cx, gz = z - G.cz;
        if (gx * gx + gz * gz > G.r2) continue;
        for (let k = G.a; k < G.b; k++) {
          const px = x - X0[k], pz = z - Z0[k], d = px * FX[k] + pz * FZ[k];
          if (d < -0.05 || d > LEN[k] + 0.05) continue;
          const l = px * FZ[k] - pz * FX[k];
          if (l < -HW[k] || l > HW[k]) continue;
          const m = M[k], i = Math.min(m, Math.max(0, Math.ceil(d / TR[k] - 1e-9))), top = Y0[k] + (Y1[k] - Y0[k]) * i / m;
          if (top > h && top <= feet + 0.7) h = top;
        }
      }
      return h;
    },
  };
}
