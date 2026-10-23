// The meadow village's ground mask (docs/village/plan-materials.md §4): the streets, the square and
// the yards painted into one RGBA8 texture the ground, the grass and the ground cover read at run
// time (render/atmosphere.js villageTex, villageAt() in shaders/atmoMaterial.wgsl.js).
//
//   R  paved: cobble (roads of surface 'cobble', the square), a soft ~0.6 m worn edge, ragged border
//   G  packed earth: earth roads (soft ~0.9 m edge), a narrow ring of earth round the cobbles,
//      a faint track on the grass lanes
//   B  yard / trodden: a ring of worn ground 3-6.5 m round every building's footprint, stronger and
//      wider at the front door, plus a little along the grass lanes
//   A  surface variant as a CONTINUOUS ramp (bilinear-safe), 0..255 = t 0..3:
//      0 mossy cobble, 1 setts, 2 river cobble, 3 flagstone. (mossy on lanes far from the market,
//      setts in the centre, river cobbles on the square's edge and in courtyards, flags in the
//      square's middle.) Defined everywhere in the box, so it never blends with a stray zero.
//
// Texel (i, j) covers world x in [x0 + i·texel, +texel), z in [z0 + j·texel, +texel): row 0 is the
// SOUTH edge (z0 = min z), so uv = ((x - x0), (z - z0)) / (size·texel). Deterministic, no RNG.

export const MASK_TEXEL = 0.5;
export const MASK_PAD = 40;
export const VARIANT = { MOSSY: 0, SETTS: 1, RIVER: 2, FLAG: 3 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Integer-hash value noise (deterministic across platforms: Math.imul only), 0..1.
function hash(x, z, s) {
  let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1) ^ Math.imul(s, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, z, s) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, s), b = hash(ix + 1, iz, s), c = hash(ix, iz + 1, s), d = hash(ix + 1, iz + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Border noise in -1..1: a 2.5 m swell plus a 0.8 m grain. */
const border = (x, z, s) => (vnoise(x / 2.5, z / 2.5, s) - 0.5) * 1.3 + (vnoise(x / 0.8, z / 0.8, s + 5) - 0.5) * 0.7;

/** Bounding box of everything the village paints (roads with their widths, plots, greens). */
export function villageBounds(v) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  const add = (x, z, r = 0) => { x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); z0 = Math.min(z0, z - r); z1 = Math.max(z1, z + r); };
  for (const r of v.roads || []) for (const p of r.pts) add(p[0], p[1], (r.width || 0) / 2);
  for (const p of v.plots || []) add(p.at[0], p.at[1], Math.hypot(p.w, p.d) / 2);
  for (const g of v.greens || []) for (const p of g.poly || []) add(p[0], p[1]);
  return { x0, z0, x1, z1 };
}

/**
 * @param {{roads:any[], plots:any[], greens:any[], meta?:any}} village  data/world/village.json
 * @param {{pad?:number, texel?:number}} [opts]
 * @returns {{x0:number, z0:number, size:number, texel:number, data:Uint8Array}}
 */
export function bakeVillageMask(village, opts = {}) {
  const texel = opts.texel ?? MASK_TEXEL, pad = opts.pad ?? MASK_PAD;
  const roads = village.roads || [], plots = village.plots || [], greens = village.greens || [];
  const b = villageBounds(village);
  if (!isFinite(b.x0)) return { x0: 0, z0: 0, size: 8, texel, data: new Uint8Array(8 * 8 * 4) };
  // Extra paving outside the village (the manor's forecourt): { bounds, paved(x, z) -> 0..1 }, flagstone.
  const extra = opts.extraPaving || [];
  for (const e of extra) { b.x0 = Math.min(b.x0, e.bounds.x0); b.x1 = Math.max(b.x1, e.bounds.x1); b.z0 = Math.min(b.z0, e.bounds.z0); b.z1 = Math.max(b.z1, e.bounds.z1); }
  const x0 = Math.floor(b.x0 - pad), z0 = Math.floor(b.z0 - pad);
  const size = Math.ceil((Math.max(b.x1 - b.x0, b.z1 - b.z0) + 2 * pad) / texel / 8) * 8;
  const N = size, data = new Uint8Array(N * N * 4);
  const R = new Float32Array(N * N), G = new Float32Array(N * N), B = new Float32Array(N * N);
  const wx = (i) => x0 + (i + 0.5) * texel, wz = (j) => z0 + (j + 0.5) * texel;
  /** Texel range covering a world rect. */
  const range = (ax, az, bx, bz) => [Math.max(0, Math.floor((ax - x0) / texel)), Math.min(N - 1, Math.floor((bx - x0) / texel)), Math.max(0, Math.floor((az - z0) / texel)), Math.min(N - 1, Math.floor((bz - z0) / texel))];

  // ---- surface variant field (continuous, everywhere) ----------------------------------------------
  const mk = village.meta?.market || (greens[0] && greens[0].at) || [0, 0];
  const sq = greens.find((g) => g.kind === 'square');
  const rsq = sq ? sq.r : (village.meta?.marketRadius || 12);
  const farms = plots.filter((p) => p.kind === 'farm' || p.kind === 'hall' || p.kind === 'barn');
  const VAR = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    const z = wz(j);
    for (let i = 0; i < N; i++) {
      const x = wx(i), dm = Math.hypot(x - mk[0], z - mk[1]), ds = dm / rsq;
      const wob = (vnoise(x / 9, z / 9, 71) - 0.5) * 0.25;
      let t = 1 + smooth(1.25, 0.95, ds + wob * 0.3) + smooth(0.72, 0.42, ds + wob * 0.3);
      t -= smooth(55, 130, dm + wob * 60) * 1.0;
      VAR[j * N + i] = t;
    }
  }
  // Courtyards: river cobbles round the farms, the hall and the barns.
  for (const p of farms) {
    const [i0, i1, j0, j1] = range(p.at[0] - 12, p.at[1] - 12, p.at[0] + 12, p.at[1] + 12);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(wx(i) - p.at[0], wz(j) - p.at[1]);
      const k = smooth(11, 6, d);
      if (k > 0) { const o = j * N + i; VAR[o] += (Math.max(VAR[o], 2) - VAR[o]) * k; }
    }
  }

  // ---- roads and the square, as signed edge fields --------------------------------------------------------
  // E* = the best (largest) "metres inside the surface's border" over every road / green of that kind, so a
  // joint between two segments never shows an edge. Profiles are applied once, after, from these.
  const Ec = new Float32Array(N * N).fill(-9), Ee = new Float32Array(N * N).fill(-9), Eg = new Float32Array(N * N).fill(-9);
  for (const r of roads) {
    if (r.bridge) continue;
    const half = (r.width || 2) / 2, cob = r.surface === 'cobble', earth = r.surface === 'earth';
    const E = cob ? Ec : earth ? Ee : Eg;
    const hw = cob ? half : earth ? half * 0.92 : half * 0.6, nAmp = cob ? 0.35 : earth ? 0.45 : 0.3, ns = cob ? 11 : earth ? 13 : 17;
    const reach = hw + 1.8 + nAmp;
    for (let s = 0; s + 1 < r.pts.length; s++) {
      const [ax, az] = r.pts[s], [bx, bz] = r.pts[s + 1];
      const sx = bx - ax, sz = bz - az, L2 = sx * sx + sz * sz || 1e-9;
      const [i0, i1, j0, j1] = range(Math.min(ax, bx) - reach, Math.min(az, bz) - reach, Math.max(ax, bx) + reach, Math.max(az, bz) + reach);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = wx(i), z = wz(j);
        const t = clamp(((x - ax) * sx + (z - az) * sz) / L2, 0, 1);
        const d = Math.hypot(x - (ax + sx * t), z - (az + sz * t));
        if (d > reach) continue;
        const e = hw + border(x, z, ns) * nAmp - d, o = j * N + i;
        if (e > E[o]) E[o] = e;
      }
    }
  }
  for (const gr of greens) {
    if (!gr.poly || gr.poly.length < 3) continue;
    const pl = gr.poly, n = pl.length, sqr = gr.kind === 'square';
    let ax = Infinity, az = Infinity, bx = -Infinity, bz = -Infinity;
    for (const p of pl) { ax = Math.min(ax, p[0]); bx = Math.max(bx, p[0]); az = Math.min(az, p[1]); bz = Math.max(bz, p[1]); }
    const [i0, i1, j0, j1] = range(ax - 2.5, az - 2.5, bx + 2.5, bz + 2.5);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = wx(i), z = wz(j);
      let inside = false, dmin = Infinity;
      for (let k = 0, m = n - 1; k < n; m = k++) {
        const [px, pz] = pl[k], [qx, qz] = pl[m];
        if ((pz > z) !== (qz > z) && x < ((qx - px) * (z - pz)) / (qz - pz) + px) inside = !inside;
        const sx = qx - px, sz = qz - pz, t = clamp(((x - px) * sx + (z - pz) * sz) / (sx * sx + sz * sz || 1e-9), 0, 1);
        dmin = Math.min(dmin, Math.hypot(x - px - sx * t, z - pz - sz * t));
      }
      const sd = inside ? dmin : -dmin;                // + inside
      const o = j * N + i;
      if (sqr) { const e = sd + border(x, z, 23) * 0.35; if (e > Ec[o]) Ec[o] = e; }
      else { const y = smooth(-0.5, 2.0, sd) * 0.18; if (y > B[o]) B[o] = y; } // the green: grass, lightly trodden
    }
  }
  for (let o = 0; o < N * N; o++) {
    const ec = Ec[o], ee = Ee[o], eg = Eg[o];
    if (ec > -9) {
      R[o] = smooth(0, 0.6, ec);                                                      // soft worn edge
      G[o] = smooth(-1.4, -0.1, ec) * (1 - smooth(-0.1, 0.45, ec)) * 0.85;          // earth just outside the stones
      B[o] = Math.max(B[o], smooth(-0.8, 0.2, ec) * 0.35);
    }
    if (ee > -9) {
      G[o] = Math.max(G[o], smooth(-0.1, 0.9, ee));                                  // earth road, soft edge
      B[o] = Math.max(B[o], smooth(-1.4, 0.3, ee) * 0.45);
    }
    if (eg > -9) {
      G[o] = Math.max(G[o], smooth(-0.2, 0.9, eg) * 0.3);                            // grass lane: a worn track
      B[o] = Math.max(B[o], smooth(-0.9, 0.5, eg) * 0.7);
    }
  }

  // ---- yards: a worn ring round every footprint, strongest at the front door ----------------------------
  for (const p of plots) {
    const small = p.kind === 'stall' || p.kind === 'well';
    const cf = Math.cos(p.facing), sf = Math.sin(p.facing);
    const rx = cf, rz = -sf, nx = sf, nz = cf;          // right and front-normal (village.js rectAxes)
    const hw = p.w, hd = p.d, reach = (small ? 2.2 : 6.5) + 0.5; // w, d are half-extents already
    const [i0, i1, j0, j1] = range(p.at[0] - hw - hd - reach, p.at[1] - hw - hd - reach, p.at[0] + hw + hd + reach, p.at[1] + hw + hd + reach);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = wx(i), z = wz(j), dx = x - p.at[0], dz = z - p.at[1];
      const u = dx * rx + dz * rz, v = dx * nx + dz * nz;
      const sd = Math.hypot(Math.max(Math.abs(u) - hw, 0), Math.max(Math.abs(v) - hd, 0)) + Math.min(Math.max(Math.abs(u) - hw, Math.abs(v) - hd), 0);
      if (sd > reach) continue;
      // Front weight: 1 straight in front of the door, 0 behind.
      const ahead = smooth(-0.3, 1.2, v - hd + 0.9) * (1 - smooth(hw * 0.9, hw * 1.9, Math.abs(u)) * 0.6);
      const rad = small ? 1.4 + 0.8 * ahead : 3.0 + 3.5 * ahead;          // 3-6.5 m: gardens and yards, not hay
      const k = (1 - smooth(rad * 0.25, rad, Math.max(sd, 0) + border(x, z, 31) * 0.35)) * (0.5 + 0.5 * ahead) * (small ? 0.6 : 1);
      const o = j * N + i;
      if (k > B[o]) B[o] = k;
    }
  }

  // ---- extra paving (the manor forecourt: whole slabs paved, the broken patches left to turf) ------------------
  for (const e of extra) {
    const [i0, i1, j0, j1] = range(e.bounds.x0, e.bounds.z0, e.bounds.x1, e.bounds.z1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = e.paved(wx(i), wz(j)); if (!(k > 0)) continue;
      const o = j * N + i;
      if (k > R[o]) R[o] = k;
      VAR[o] = Math.max(VAR[o], 3 * k);
    }
  }

  // ---- pack -----------------------------------------------------------------------------------------------
  for (let o = 0; o < N * N; o++) {
    const p = R[o], e = G[o] * (1 - p * 0.5);
    data[o * 4] = Math.round(clamp(p, 0, 1) * 255);
    data[o * 4 + 1] = Math.round(clamp(e, 0, 1) * 255);
    data[o * 4 + 2] = Math.round(clamp(B[o], 0, 1) * 255);
    data[o * 4 + 3] = Math.round(clamp(VAR[o] / 3, 0, 1) * 255);
  }
  return { x0, z0, size: N, texel, data };
}

/** Test/runtime helper: the texel nearest to world (x, z) as [r, g, b, a] (0s outside the box). */
export function maskAt(m, x, z) {
  const i = Math.floor((x - m.x0) / m.texel), j = Math.floor((z - m.z0) / m.texel);
  if (i < 0 || j < 0 || i >= m.size || j >= m.size) return [0, 0, 0, 0];
  const o = (j * m.size + i) * 4;
  return [m.data[o], m.data[o + 1], m.data[o + 2], m.data[o + 3]];
}
