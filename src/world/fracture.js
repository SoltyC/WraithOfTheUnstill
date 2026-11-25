// Pre-fractured buildings (the destruction system: systems/destruction.js, game/collapse.js, render/debris.js). A site is
// built a second time with a FractureBuilder, which records which top-level piece every vertex came from (a wall, a
// roof plane, a dome's ring, a column) — its structural GROUP, the thing that topples as one — and splits what would be
// one big slab into blocks the size a wall breaks into (plaster and timber walls into rough courses, roof planes into
// panels). Every group is then cut into FRAGMENTS: its welded connected pieces (a laid wall's stones are already separate
// blocks), the big shells (dome rings, cones, roof sheets) clustered further into pieces of about a stride. Each fragment
// keeps its vertices relative to its own pivot, its half extents (for the ground contacts) and its volume (its mass).
// Deterministic: the same site always breaks into the same pieces; how they fall is the collapse's (seeded) business.

import { Builder, MAT } from './architecture.js';

/** The largest a piece may be before it is split (m): walls into blocks, shells into clusters. */
export const FRACTURE = { block: 1.25, course: 0.75, shell: 1.3, panel: 1.6, clump: 1.4 };
/** How thick a broken shell of each material is (m; world/architecture.js MAT): cloth stays cloth, metal and glass thin. */
const THICK = { 2: 0, 4: 0.15, 6: 0.03, 7: 0.1, 8: 0.4, 9: 0.28, 10: 0.05, 11: 0.06, 12: 0.06, 13: 0.06, 18: 0.015, 19: 0.04 };

const fract = (v) => v - Math.floor(v);
const hh = (a, b) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);

class FractureBuilder extends Builder {
  constructor() { super(); this.group = []; this.g = -1; this.depth = 0; this.splitting = false; this.fixed = new Set(); this.structOf = new Map(); this.st = -1; this.nst = 0; }
  piece(fn) { this._enter(); const r = fn(); this._leave(); return r; }
  struct(fn) { const was = this.st; this.st = this.nst++; const g0 = this.g + 1; const r = fn(); for (let k = g0; k <= this.g; k++) this.structOf.set(k, this.st); this.st = was; return r; }
  /** Every vertex pushed while a top-level call runs belongs to that call's group. */
  _enter() { if (this.depth++ === 0) this.g++; }
  _leave() { this.depth--; const n = this.pos.length / 3; while (this.group.length < n) this.group.push(this.g); }
  box(x, z, y0, y1, hx, hz, yaw, mat, seed, opt = {}) {
    this._enter();
    const o = { ...opt, drift: false, cap: false, solid: false, platform: false };
    const big = Math.max(hx, hz) > FRACTURE.block || y1 - y0 > FRACTURE.course * 2;
    const layable = (mat === MAT.STONE || mat === MAT.BASALT) && !opt.plain && !opt.tilt && !opt.roll;
    // The hill's own mass (plain ember rock behind a door cut into a face) never moves.
    if (mat === MAT.EMBER && opt.plain && this.depth === 1) { this.fixed.add(this.g); super.box(x, z, y0, y1, hx, hz, yaw, mat, seed, o); this._leave(); return; }
    if (!this.splitting && big && mat !== MAT.CANVAS && !layable) {
      // A slab of plaster, timber, slate, earth or glass — a wall or a roof plane, level or pitched — cut through every way
      // it is bigger than a block: rough courses of staggered blocks (a little irregular, so no two break alike), each a
      // whole closed block of the same stuff, turned with the slab (its tilt and roll about its own middle).
      this.splitting = true;
      const tilt = opt.tilt || 0, roll = opt.roll || 0, ct = Math.cos(tilt), st = Math.sin(tilt), cr = Math.cos(roll), sr = Math.sin(roll), cy = Math.cos(yaw), sy = Math.sin(yaw);
      const ym = (y0 + y1) / 2, hy = (y1 - y0) / 2, gap = 0.012;
      const cuts = (half, size, k, first = 1) => {
        const out = []; let u = -half, c = 0;
        while (u < half - 1e-3) {
          let w = size * (c === 0 ? first : 1) * (0.75 + 0.5 * hh(k, c));
          if (half - (u + w) < size * 0.3) w = half - u;
          out.push([u, u + w]); u += w; c++;
        }
        return out;
      };
      const ys = hy * 2 > FRACTURE.course * 2 ? cuts(hy, FRACTURE.course, seed + 1) : [[-hy, hy]];
      ys.forEach(([ya, yb], r) => {
        const stag = r % 2 ? 0.5 : 1;
        const xs = hx > FRACTURE.block * 0.6 ? cuts(hx, FRACTURE.block, seed * 3 + r, stag) : [[-hx, hx]];
        const zs = hz > FRACTURE.block * 0.6 ? cuts(hz, FRACTURE.block, seed * 5 + r, stag) : [[-hz, hz]];
        xs.forEach(([xa, xb], i) => zs.forEach(([za, zb], j) => {
          const lx = (xa + xb) / 2, ly = (ya + yb) / 2, lz = (za + zb) / 2;
          const ax = lx * cr - ly * sr, ay = lx * sr + ly * cr, by = ay * ct - lz * st, bz = ay * st + lz * ct;
          const wx = x + ax * cy + bz * sy, wy = ym + by, wz = z - ax * sy + bz * cy, h = (yb - ya) / 2;
          super.box(wx, wz, wy - h + gap, wy + h - gap, Math.max(0.01, (xb - xa) / 2 - gap), Math.max(0.01, (zb - za) / 2 - gap), yaw, mat, seed * 13 + r * 7 + i * 3 + j, o);
        }));
      });
      this.splitting = false;
    } else super.box(x, z, y0, y1, hx, hz, yaw, mat, seed, o);
    this._leave();
  }
}
for (const m of ['plinth', 'frustum', 'drum', 'cone', 'grid', 'quad', 'quadN', 'quadSmooth', 'tri']) {
  const base = Builder.prototype[m];
  FractureBuilder.prototype[m] = function (...a) { this._enter(); const r = base.apply(this, a); this._leave(); return r; };
}

/** Union-find over a group's triangles, joined where they share a (welded) vertex position. */
function components(W, I, tris) {
  const key = (v) => W[v];
  const parent = tris.map((_, i) => i), find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const owner = new Map();
  tris.forEach((t, i) => {
    for (let k = 0; k < 3; k++) {
      const kk = key(I[t * 3 + k]);
      if (owner.has(kk)) { const a = find(owner.get(kk)), b = find(i); if (a !== b) parent[a] = b; } else owner.set(kk, i);
    }
  });
  const out = new Map();
  tris.forEach((t, i) => { const r = find(i); if (!out.has(r)) out.set(r, []); out.get(r).push(t); });
  return [...out.values()];
}

/** Split a big shell's triangles into clusters of about `size` m (k-means on their centroids, seeded by a grid). */
function clusters(P, I, tris, size) {
  const c = tris.map((t) => { let x = 0, y = 0, z = 0; for (let k = 0; k < 3; k++) { const v = I[t * 3 + k]; x += P[v * 3]; y += P[v * 3 + 1]; z += P[v * 3 + 2]; } return [x / 3, y / 3, z / 3]; });
  const seeds = new Map();
  c.forEach((p) => { const k = `${Math.floor(p[0] / size)},${Math.floor(p[1] / size)},${Math.floor(p[2] / size)}`; if (!seeds.has(k)) seeds.set(k, p.slice()); });
  const S = [...seeds.values()];
  let lab = new Array(tris.length).fill(0);
  for (let it = 0; it < 4; it++) {
    lab = c.map((p) => { let b = 0, bd = Infinity; S.forEach((s, j) => { const d = (p[0] - s[0]) ** 2 + (p[1] - s[1]) ** 2 + (p[2] - s[2]) ** 2; if (d < bd) { bd = d; b = j; } }); return b; });
    const acc = S.map(() => [0, 0, 0, 0]);
    c.forEach((p, i) => { const a = acc[lab[i]]; a[0] += p[0]; a[1] += p[1]; a[2] += p[2]; a[3]++; });
    acc.forEach((a, j) => { if (a[3]) S[j] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
  }
  const out = S.map(() => []);
  tris.forEach((t, i) => out[lab[i]].push(t));
  return out.filter((o) => o.length);
}

/** Eigenvectors of a symmetric 3×3 (Jacobi): columns of V. */
function eig3(A) {
  const a = A.map((r) => r.slice()), V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 12; sweep++) {
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-12) continue;
      const th = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]), c = Math.cos(th), s = Math.sin(th);
      for (let k = 0; k < 3; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
      for (let k = 0; k < 3; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
      for (let k = 0; k < 3; k++) { const x = V[k][p], y = V[k][q]; V[k][p] = c * x - s * y; V[k][q] = s * x + c * y; }
    }
  }
  return V;
}
/** Quaternion [x, y, z, w] of a rotation matrix (columns = the box's axes). */
function matQuat(m) {
  const tr = m[0][0] + m[1][1] + m[2][2];
  let x, y, z, w;
  if (tr > 0) { const S = Math.sqrt(tr + 1) * 2; w = 0.25 * S; x = (m[2][1] - m[1][2]) / S; y = (m[0][2] - m[2][0]) / S; z = (m[1][0] - m[0][1]) / S; }
  else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { const S = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2; w = (m[2][1] - m[1][2]) / S; x = 0.25 * S; y = (m[0][1] + m[1][0]) / S; z = (m[0][2] + m[2][0]) / S; }
  else if (m[1][1] > m[2][2]) { const S = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2; w = (m[0][2] - m[2][0]) / S; x = (m[0][1] + m[1][0]) / S; y = 0.25 * S; z = (m[1][2] + m[2][1]) / S; }
  else { const S = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2; w = (m[1][0] - m[0][1]) / S; x = (m[0][2] + m[2][0]) / S; y = (m[1][2] + m[2][1]) / S; z = 0.25 * S; }
  const l = Math.hypot(x, y, z, w); return [x / l, y / l, z / l, w / l];
}
/** A piece's box: centre, half extents along its axes, its rotation (identity when the upright box is as tight). */
function orientedBox(P, I, tris, lo, hi) {
  const vs = new Set(); for (const t of tris) for (let k = 0; k < 3; k++) vs.add(I[t * 3 + k]);
  const pts = [...vs].map((v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]);
  const aabb = { c: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], half: [(hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2], q: [0, 0, 0, 1] };
  if (pts.length < 4) return aabb;
  const m = [0, 0, 0]; for (const p of pts) for (let a = 0; a < 3; a++) m[a] += p[a] / pts.length;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += (p[a] - m[a]) * (p[b] - m[b]);
  const V = eig3(C);
  // Right-handed.
  const ax = [0, 1, 2].map((k) => [V[0][k], V[1][k], V[2][k]]);
  const cr = [ax[0][1] * ax[1][2] - ax[0][2] * ax[1][1], ax[0][2] * ax[1][0] - ax[0][0] * ax[1][2], ax[0][0] * ax[1][1] - ax[0][1] * ax[1][0]];
  ax[2] = cr;
  const plo = [Infinity, Infinity, Infinity], phi = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { const d = p[0] * ax[k][0] + p[1] * ax[k][1] + p[2] * ax[k][2]; plo[k] = Math.min(plo[k], d); phi[k] = Math.max(phi[k], d); }
  const half = [0, 1, 2].map((k) => (phi[k] - plo[k]) / 2), mid = [0, 1, 2].map((k) => (phi[k] + plo[k]) / 2);
  if (half[0] * half[1] * half[2] > aabb.half[0] * aabb.half[1] * aabb.half[2] * 0.85) return aabb;
  const c = [0, 1, 2].map((a) => ax[0][a] * mid[0] + ax[1][a] * mid[1] + ax[2][a] * mid[2]);
  const M = [[ax[0][0], ax[1][0], ax[2][0]], [ax[0][1], ax[1][1], ax[2][1]], [ax[0][2], ax[1][2], ax[2][2]]];
  return { c, half, q: matQuat(M) };
}

/**
 * Build a site's debris: its geometry cut into fragments. site: an architecture site ({ build, facing, id }); index: its
 * global site index (the shader's site uniforms); seed: the builder's rng seed (world/architecture.js buildArchitecture).
 * Returns positions relative to each fragment's pivot (site-local pivots), normals, uvs, info (as the architecture's), frag
 * (per vertex: fragment index, the vertex's original local y), indices, and per fragment { pivot, half, vol, group, top }.
 */
export function buildDebris(site, index, rng) {
  const b = new FractureBuilder();
  b.site = index; b.noSnow = true;
  site.build(b, site.facing, rng);
  while (b.group.length < b.pos.length / 3) b.group.push(b.g);
  const P = b.pos, I = b.idx, nT = I.length / 3;
  // Welded vertex ids (one per position, to the half millimetre): which triangles touch, which edges are open.
  const W = new Int32Array(P.length / 3);
  { const ids = new Map(); for (let v = 0; v < W.length; v++) { const k = `${Math.round(P[v * 3] * 500)},${Math.round(P[v * 3 + 1] * 500)},${Math.round(P[v * 3 + 2] * 500)}`; let id = ids.get(k); if (id === undefined) { id = ids.size; ids.set(k, id); } W[v] = id; } }
  const NW = W.length + 1;
  // Triangles by group.
  const byGroup = new Map();
  for (let t = 0; t < nT; t++) { const g = b.group[I[t * 3]]; if (!byGroup.has(g)) byGroup.set(g, []); byGroup.get(g).push(t); }
  const frags = [];
  const ext = (tris) => { let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const t of tris) for (let k = 0; k < 3; k++) { const v = I[t * 3 + k]; for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], P[v * 3 + a]); hi[a] = Math.max(hi[a], P[v * 3 + a]); } } return [lo, hi]; };
  for (const [g, tris] of byGroup) {
    const mine = [];
    for (const comp of components(W, I, tris)) {
      const [lo, hi] = ext(comp), size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
      // (A simple closed block stays whole however big: clustering would open it into loose faces. Shells — drums, domes,
      // cones, cloth, roof sheets — have many triangles and break into pieces.)
      const parts = size > FRACTURE.shell * 1.4 && comp.length > 40 ? clusters(P, I, comp, FRACTURE.shell) : [comp];
      for (const part of parts) mine.push(part);
    }
    // A run of many small stones (a dry-stone wall, a laid course of little blocks): they break away in clumps, a few
    // stones bonded together, not one by one (fewer pieces, and the way rubble walls do go).
    if (mine.length > 12) {
      const cell = FRACTURE.clump, byCell = new Map();
      for (const part of mine) {
        const [lo, hi] = ext(part), c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
        const big = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) > cell;
        const k = big ? 'b' + byCell.size : `${Math.floor(c[0] / cell)},${Math.floor(c[1] / cell)},${Math.floor(c[2] / cell)}`;
        if (!byCell.has(k)) byCell.set(k, []);
        byCell.get(k).push(...part);
      }
      for (const t of byCell.values()) frags.push({ group: g, tris: t });
    } else for (const part of mine) frags.push({ group: g, tris: part });
  }
  // A very big site (a whole town): its runs of small stones in bigger clumps still, so its collapse stays a few thousand pieces.
  if (frags.length > 2500) {
    const merged = [], byKey = new Map();
    for (const f of frags) {
      const [lo, hi] = ext(f.tris), size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
      if (size > 1.2) { merged.push(f); continue; }
      const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], k = `${f.group}|${Math.floor(c[0] / 2.2)},${Math.floor(c[1] / 1.6)},${Math.floor(c[2] / 2.2)}`;
      let m = byKey.get(k); if (!m) { m = { group: f.group, tris: [] }; byKey.set(k, m); merged.push(m); }
      m.tris.push(...f.tris);
    }
    frags.length = 0; frags.push(...merged);
  }
  // Low groups (a yard wall, a terrace's face, a row of stakes, a step): they stay where they are; it is what stands that
  // falls. (Their extent over the whole group.)
  const low = new Set();
  { const gl = new Map(); for (const f of frags) { const [lo, hi] = ext(f.tris), e = gl.get(f.group) || [Infinity, -Infinity]; e[0] = Math.min(e[0], lo[1]); e[1] = Math.max(e[1], hi[1]); gl.set(f.group, e); }
    for (const [gid, e] of gl) if (e[1] - e[0] < 1.7 && e[0] < 1.0 && !b.structOf.has(gid)) low.add(gid); }   // (low and on the ground: a roof on its walls is not)
  // Emit: each fragment's own copy of its vertices, relative to its pivot (the centre of its bounds).
  const pos = [], nrm = [], uv = [], info = [], frag = [], idx = [], out = [];
  frags.forEach((f, fi) => {
    const [lo, hi] = ext(f.tris);
    // Its box for the physics: the tightest of the axis-aligned box and the one along its own principal axes (a roof slab
    // pitched, a fallen column: their upright boxes would be far fatter than they are).
    const ob = orientedBox(P, I, f.tris, lo, hi);
    const pv = ob.c, half = ob.half.map((v) => Math.max(0.05, v));
    const v0 = pos.length / 3;
    const remap = new Map();
    for (const t of f.tris) for (let k = 0; k < 3; k++) {
      const v = I[t * 3 + k];
      if (!remap.has(v)) {
        remap.set(v, pos.length / 3);
        pos.push(P[v * 3] - pv[0], P[v * 3 + 1] - pv[1], P[v * 3 + 2] - pv[2]);
        nrm.push(b.nrm[v * 3], b.nrm[v * 3 + 1], b.nrm[v * 3 + 2]); uv.push(b.uv[v * 2], b.uv[v * 2 + 1]);
        info.push(b.info[v * 4], b.info[v * 4 + 1], b.info[v * 4 + 2], b.info[v * 4 + 3]);
        frag.push(fi, P[v * 3 + 1], 0, 0);
      }
      idx.push(remap.get(v));
    }
    // An open shell (a dome's ring, a drum's wall, a cone, a roof sheet) broken out of its surface would fall as a flat
    // shard: it is given its thickness — the surface again, set in along its normals, raggedly, and the broken edge
    // between (every edge of the piece that only one of its triangles has).
    const mat = b.info[I[f.tris[0] * 3] * 4 + 1], minE = 2 * Math.min(...half);
    // (A pole or a tube, closed round, is thickened only a little into its own hollow; a flat sheet the whole way.)
    // (A broad panel of a drum or a dome is not a pole: its curve gives its box some depth, but it is a wall — full thickness.)
    const T = minE > 0.08 && Math.max(...half) < 0.6 ? Math.min(THICK[mat] ?? 0.2, minE * 0.3) : THICK[mat] ?? 0.2;
    if (T > 0) {
      const key = (v) => W[v];
      const edges = new Map();
      for (const t of f.tris) for (let k = 0; k < 3; k++) {
        const a = I[t * 3 + k], c = I[t * 3 + (k + 1) % 3], ka = W[a], kc = W[c], e = ka < kc ? ka * NW + kc : kc * NW + ka;
        const o = edges.get(e); if (o) o.n++; else edges.set(e, { n: 1, a, c });
      }
      const open = [...edges.values()].filter((e) => e.n === 1);
      // A block (a laid stone with its hidden faces never built): closed instead — each open loop filled with a fan from
      // its middle, facing out from the block's centre.
      if (open.length && minE > 0.22 && open.length < 64) {
        const startAt = new Map();
        for (const e of open) { const t = f.tris.find((q) => { for (let k = 0; k < 3; k++) if (I[q * 3 + k] === e.a && I[q * 3 + (k + 1) % 3] === e.c) return true; return false; }); const a = t !== undefined ? e.a : e.c, c = t !== undefined ? e.c : e.a; startAt.set(W[c], { a, c }); }
        const used = new Set();
        for (const e0 of startAt.values()) {
          if (used.has(e0)) continue;
          const loop = []; let e = e0, guard = 0;
          while (e && !used.has(e) && guard++ < 64) { used.add(e); loop.push(e.c); e = startAt.get(W[e.a]); }
          if (loop.length < 3) continue;
          const cx = loop.reduce((a, v) => a + P[v * 3], 0) / loop.length, cy = loop.reduce((a, v) => a + P[v * 3 + 1], 0) / loop.length, cz = loop.reduce((a, v) => a + P[v * 3 + 2], 0) / loop.length;
          let nx = cx - pv[0], ny = cy - pv[1], nz = cz - pv[2]; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
          const base = pos.length / 3;
          pos.push(cx - pv[0], cy - pv[1], cz - pv[2]); nrm.push(nx, ny, nz); uv.push(0, 0); info.push(b.info[loop[0] * 4], b.info[loop[0] * 4 + 1], b.info[loop[0] * 4 + 2], 0); frag.push(fi, cy, 0, 0);
          loop.forEach((v) => { pos.push(P[v * 3] - pv[0], P[v * 3 + 1] - pv[1], P[v * 3 + 2] - pv[2]); nrm.push(nx, ny, nz); uv.push(P[v * 3] - cx + P[v * 3 + 2] - cz, P[v * 3 + 1] - cy); info.push(b.info[v * 4], b.info[v * 4 + 1], b.info[v * 4 + 2], 0); frag.push(fi, P[v * 3 + 1], 0, 0); });
          for (let k = 0; k < loop.length; k++) idx.push(base, base + 1 + k, base + 1 + (k + 1) % loop.length);
        }
      } else if (open.length) {
        const inner = new Map();
        const inv = (v) => {
          if (inner.has(key(v))) return inner.get(key(v));
          const j = 0.75 + 0.5 * hh(P[v * 3] * 7.1 + P[v * 3 + 2], P[v * 3 + 1] * 3.3), k = pos.length / 3;
          pos.push(P[v * 3] - b.nrm[v * 3] * T * j - pv[0], P[v * 3 + 1] - b.nrm[v * 3 + 1] * T * j - pv[1], P[v * 3 + 2] - b.nrm[v * 3 + 2] * T * j - pv[2]);
          nrm.push(-b.nrm[v * 3], -b.nrm[v * 3 + 1], -b.nrm[v * 3 + 2]); uv.push(b.uv[v * 2], b.uv[v * 2 + 1]);
          info.push(b.info[v * 4], b.info[v * 4 + 1], b.info[v * 4 + 2], 0);
          frag.push(fi, P[v * 3 + 1], 0, 0);
          inner.set(key(v), k); return k;
        };
        for (const t of f.tris) { const a = inv(I[t * 3]), c = inv(I[t * 3 + 1]), d = inv(I[t * 3 + 2]); idx.push(a, d, c); }
        // The broken edge: a strip from the face to its back, its normal out across the break (carve 6: dark like a joint).
        for (const e of open) {
          const A = remap.get(e.a), C = remap.get(e.c), Ai = inner.get(key(e.a)), Ci = inner.get(key(e.c));
          const ex = pos[C * 3] - pos[A * 3], ey = pos[C * 3 + 1] - pos[A * 3 + 1], ez = pos[C * 3 + 2] - pos[A * 3 + 2];
          const nx = b.nrm[e.a * 3], ny = b.nrm[e.a * 3 + 1], nz = b.nrm[e.a * 3 + 2];
          let sx = ey * nz - ez * ny, sy = ez * nx - ex * nz, sz = ex * ny - ey * nx; const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
          const L = Math.hypot(ex, ey, ez), base = pos.length / 3;
          for (const [src, u, w] of [[A, 0, 0], [C, L, 0], [Ci, L, T], [Ai, 0, T]]) {
            pos.push(pos[src * 3], pos[src * 3 + 1], pos[src * 3 + 2]); nrm.push(sx, sy, sz); uv.push(u, w);
            info.push(info[src * 4], info[src * 4 + 1], info[src * 4 + 2], 6); frag.push(fi, frag[src * 4 + 1], 0, 0);
          }
          idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
    // The piece drawn exactly as big as its body in the physics (game/collapse.js shrinks each box a little so neighbours
    // that touched do not start inside each other): otherwise two stones at rest overlap by that much and their faces fight.
    {
      const [qx, qy, qz, qw] = ob.q, sc = half.map((h) => Math.max(0.035, h * 0.96 - 0.012) / h);
      const rot = (x, y, z, inv) => { const sx = inv ? -qx : qx, sy = inv ? -qy : qy, sz = inv ? -qz : qz, tx = 2 * (sy * z - sz * y), ty = 2 * (sz * x - sx * z), tz = 2 * (sx * y - sy * x); return [x + qw * tx + (sy * tz - sz * ty), y + qw * ty + (sz * tx - sx * tz), z + qw * tz + (sx * ty - sy * tx)]; };
      for (let k = v0; k < pos.length / 3; k++) {
        const l = rot(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2], true), w = rot(l[0] * sc[0], l[1] * sc[1], l[2] * sc[2], false);
        pos[k * 3] = w[0]; pos[k * 3 + 1] = w[1]; pos[k * 3 + 2] = w[2];
      }
    }
    // (Thin shells and sheets weigh by their area; blocks by their volume.)
    const vol = Math.max(half[0] * half[1] * half[2] * 8, 0.02 * Math.max(half[0] * half[1], half[1] * half[2], half[0] * half[2]) * 4);
    // Fixed: the hill's mass, and whatever lies under the ground (foundations): they stay where they are.
    out.push({ pivot: pv, half, rot: ob.q, vol, group: f.group, top: hi[1], mat: b.info[I[f.tris[0] * 3] * 4 + 1], fixed: b.fixed.has(f.group) || hi[1] < 0.25 || low.has(f.group), struct: b.structOf.get(f.group) ?? -1 });
  });
  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), uvs: new Float32Array(uv), info: new Float32Array(info), frag: new Float32Array(frag), indices: new Uint32Array(idx), frags: out };
}
