// Irregular rounded stones for the nooks (world/nookSites.js): a lumpy ellipsoid, smooth-shaded, built
// as one grid into the architecture mesh. `b.drum` and `b.box` make squat drums and chamfered blocks,
// which read as turned columns; a fieldstone is a lump. Pure geometry (build time only).

const NU = 12, NV = 10;   // segments round, and rings from the buried base to the crown

/** A hash in [0, 1) from small integers (a per-stone shape, no state). */
function h01(a, b, c) { let x = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2147483647); x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; }

/**
 * @param {import('./architecture.js').Builder} b
 * @param {number} x @param {number} z  centre on the ground (site-local)
 * @param {number} y0  the base (it may sit below ground: the stone is partly buried), y1 the crown
 * @param {number} rx @param {number} rz  half extents along the yaw's right and forward
 * @param {number} yaw @param {number} mat @param {number} seed
 * @param {{ solid?: boolean, lump?: number }} [o] lump: how irregular (0.12 default)
 */
export function blob(b, x, z, y0, y1, rx, rz, yaw, mat, seed, { solid = false, lump = 0.12 } = {}) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), ry = (y1 - y0) / 2, mid = (y0 + y1) / 2;
  const s1 = h01(seed, 1, 7) * 6.283, s2 = h01(seed, 2, 7) * 6.283, s3 = h01(seed, 3, 7) * 6.283;
  const pts = [], nrm = [];
  for (let j = 0; j <= NV; j++) {
    const phi = -0.9 + (j / NV) * (Math.PI / 2 + 0.9);          // from a flattened underside up to the crown
    const cp = Math.cos(phi), sp = Math.sin(phi);
    for (let i = 0; i <= NU; i++) {
      const th = (i % NU) / NU * Math.PI * 2;
      // Low-frequency lumps: a few bumps round, a few up and down.
      const w = 1 + lump * (Math.sin(th * 2 + s1) * 0.6 + Math.sin(th * 3 + phi * 2 + s2) * 0.4 + Math.sin(phi * 3 + s3) * 0.3);
      const ex = cp * Math.cos(th), ez = cp * Math.sin(th);
      const lx = ex * rx * w, lz = ez * rz * w, ly = mid + sp * ry * w;
      pts.push([x + lx * cy + lz * sy, ly, z - lx * sy + lz * cy]);
      // The ellipsoid's own normal (the lumps are gentle, so it shades them smoothly).
      let nx = ex / rx, nz = ez / rz; const ny = sp / ry;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; nz /= nl;
      nrm.push([nx * cy + nz * sy, ny / nl, -nx * sy + nz * cy]);
    }
  }
  b.grid(pts, nrm, NU, NV, mat, seed);
  if (solid) b.blockers.push({ site: b.site, kind: 'circle', x, z, r: Math.max(rx, rz) + 0.05, y0, y1 });
}
