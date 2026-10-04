// Collision with the architecture (BRIEF §4.2 collision parity for built things): 2D shapes in
// world x/z — circles (columns, tents) and oriented boxes (walls, stones) that push the capsule
// out, and platforms (plinths, floors) whose tops the capsule stands on. Heights are relative to
// each site's seat, known once the ground under the site is (sites with no seat yet are skipped).
// Allocation-free; a handful of sites, each culled by its radius first.

const R = 0.38; // capsule radius (m)

export function createSolids(sites, built) {
  const S = sites.map((s) => ({ x: s.at[0], z: s.at[1], seat: NaN, rad: 0 }));
  const blockers = built.blockers.map((b) => ({ ...b, x: b.x + sites[b.site].at[0], z: b.z + sites[b.site].at[1] }));
  const platforms = built.platforms.map((p) => ({ ...p, x: p.x + sites[p.site].at[0], z: p.z + sites[p.site].at[1] }));
  for (const b of blockers) { const s = S[b.site]; s.rad = Math.max(s.rad, Math.hypot(b.x - s.x, b.z - s.z) + (b.r || Math.hypot(b.hx, b.hz)) + 2); }
  for (const p of platforms) { const s = S[p.site]; s.rad = Math.max(s.rad, Math.hypot(p.x - s.x, p.z - s.z) + Math.hypot(p.hx, p.hz) + 2); }
  const near = new Uint8Array(S.length);

  return {
    sites: S, blockers, platforms,
    /** Mark sites near (x, z) (call once per frame before the substeps). */
    cull(x, z) {
      for (let i = 0; i < S.length; i++) { const s = S[i], dx = x - s.x, dz = z - s.z; near[i] = !Number.isNaN(s.seat) && dx * dx + dz * dz < s.rad * s.rad ? 1 : 0; }
    },
    /** Query fields for floorQ() (no doubles across calls on the substep path): qx, qz, qh → h. */
    qx: 0.5, qz: 0.5, qh: 0.5, h: 0.5,
    floorQ() { this.h = this.floor(this.qx, this.qz, this.qh); },
    /** Ground under (x, z) given the terrain height gy: the highest platform top beneath, if higher. */
    floor(x, z, gy) {
      let h = gy;
      for (let i = 0; i < platforms.length; i++) {
        const p = platforms[i];
        if (!near[p.site]) continue;
        const dx = x - p.x, dz = z - p.z;
        const lx = dx * p.cos - dz * p.sin, lz = dx * p.sin + dz * p.cos;
        if (lx < -p.hx || lx > p.hx || lz < -p.hz || lz > p.hz) continue;
        const top = S[p.site].seat + p.top;
        if (top > h && top - gy < 4) h = top;
      }
      return h;
    },
    /** Push position p (x, y, z) out of every solid it overlaps at its height; v loses its into-wall part. */
    push(p, v) {
      for (let i = 0; i < blockers.length; i++) {
        const b = blockers[i];
        if (!near[b.site]) continue;
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
