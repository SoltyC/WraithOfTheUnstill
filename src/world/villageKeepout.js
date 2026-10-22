// Where nothing natural stands in the meadow village: trees and rocks keep off every plot's footprint
// (+ margin) and every road (half its width + margin), and the square. Built once from the baked layout
// (data/world/village.json); the test is a bucketed lookup, cheap enough for the tree and rock placement.

const CELL = 16;

/**
 * @param {{roads?:any[], plots?:any[], greens?:any[]}} village
 * @param {{margin?:number}} [opts]  extra clear distance (default 2 m)
 * @returns {(x:number, z:number, extra?:number) => boolean}  true when (x, z) must stay clear
 */
export function villageKeepout(village, opts = {}) {
  const margin = opts.margin ?? 2;
  const items = [];
  const buckets = new Map();
  const put = (it, x0, z0, x1, z1) => {
    const id = items.push(it) - 1;
    for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) {
      const k = gx + ',' + gz; let a = buckets.get(k); if (!a) buckets.set(k, a = []); a.push(id);
    }
  };
  const REACH = 8; // the largest `extra` a caller may ask for (a big rock's radius)
  for (const r of village.roads || []) {
    if (r.bridge) continue;
    const rad = (r.width || 2) / 2 + margin;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      put({ t: 0, ax, az, bx, bz, rad }, Math.min(ax, bx) - rad - REACH, Math.min(az, bz) - rad - REACH, Math.max(ax, bx) + rad + REACH, Math.max(az, bz) + rad + REACH);
    }
  }
  for (const p of village.plots || []) {
    const hw = p.w / 2 + margin, hd = p.d / 2 + margin, e = Math.hypot(hw, hd) + REACH;
    put({ t: 1, x: p.at[0], z: p.at[1], c: Math.cos(p.facing), s: Math.sin(p.facing), hw, hd }, p.at[0] - e, p.at[1] - e, p.at[0] + e, p.at[1] + e);
  }
  for (const g of village.greens || []) {
    if (g.kind !== 'square' || !g.at) continue;
    const r = g.r + margin;
    put({ t: 2, x: g.at[0], z: g.at[1], r }, g.at[0] - r - REACH, g.at[1] - r - REACH, g.at[0] + r + REACH, g.at[1] + r + REACH);
  }
  return (x, z, extra = 0) => {
    const a = buckets.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
    if (!a) return false;
    for (let k = 0; k < a.length; k++) {
      const it = items[a[k]];
      if (it.t === 0) {
        const sx = it.bx - it.ax, sz = it.bz - it.az, L2 = sx * sx + sz * sz || 1e-9;
        const t = Math.max(0, Math.min(1, ((x - it.ax) * sx + (z - it.az) * sz) / L2));
        const dx = x - it.ax - sx * t, dz = z - it.az - sz * t, r = it.rad + extra;
        if (dx * dx + dz * dz < r * r) return true;
      } else if (it.t === 1) {
        const dx = x - it.x, dz = z - it.z;
        const u = dx * it.c - dz * it.s, v = dx * it.s + dz * it.c; // right = (cos, -sin), front = (sin, cos)
        const ox = Math.max(Math.abs(u) - it.hw, 0), oz = Math.max(Math.abs(v) - it.hd, 0);
        if (ox * ox + oz * oz < extra * extra || (ox === 0 && oz === 0)) return true;
      } else {
        const dx = x - it.x, dz = z - it.z, r = it.r + extra;
        if (dx * dx + dz * dz < r * r) return true;
      }
    }
    return false;
  };
}
