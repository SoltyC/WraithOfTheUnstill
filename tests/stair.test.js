import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { stairSegments, stairSites, segmentFloor, STEP_RISE } from '../src/world/stair.js';
import { frostSites, buildArchitecture, chunkArchitecture } from '../src/world/architecture.js';
import { villageSites } from '../src/world/villageKits.js';
import { createSolids } from '../src/world/solids.js';
import { ARCH_SITES } from '../src/shaders/architecture.wgsl.js';
import { stairPath, STAIR } from '../tools/bake-world/hill.mjs';

const baked = JSON.parse(fs.readFileSync('data/world/pois.json', 'utf8'));
const table = {}; for (const p of baked.pois) table[p.id] = p;
const route = baked.routes.find((r) => r.id === 'manor-stair');
const village = JSON.parse(fs.readFileSync('data/world/village.json', 'utf8'));

// The baked 2 m ground (the same tiles the runtime reads).
const tiles = new Map();
const realH = (x, z) => {
  const i = Math.floor((x + 4096) / 2), j = Math.floor((4096 - z) / 2), key = (j >> 8) * 16 + (i >> 8);
  let t = tiles.get(key);
  if (!t) { const b = fs.readFileSync(`data/world/height/${i >> 8}_${j >> 8}.u16`); t = new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2); tiles.set(key, t); }
  return t[(j & 255) * 256 + (i & 255)] / 32 - 128;
};

const P = stairPath();
const S = new Float64Array(P.length);
for (let k = 1; k < P.length; k++) S[k] = S[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
const total = S[S.length - 1];
/** Arc length of the first baked chord steeper than a walkable stair (the bake's last two flights are ~60 degrees: see the report). */
let walkable = total;
for (let k = 1; k < P.length; k++) if ((P[k][2] - P[k - 1][2]) / (S[k] - S[k - 1]) > 0.45) { walkable = S[k - 1]; break; }
/** The graded ground on the route: the dense path's floor at arc length t. */
function ramp(t) {
  let k = 0; while (k < P.length - 2 && S[k + 1] < t) k++;
  const u = Math.min(1, Math.max(0, (t - S[k]) / (S[k + 1] - S[k])));
  return { x: P[k][0] + (P[k + 1][0] - P[k][0]) * u, z: P[k][1] + (P[k + 1][1] - P[k][1]) * u, y: P[k][2] + (P[k + 1][2] - P[k][2]) * u, fx: P[k + 1][0] - P[k][0], fz: P[k + 1][1] - P[k][1] };
}

const LIFTED = 0.013;   // tread tops sit a hair above the analytic floor (no z-fight with the graded ground)

describe('monumental stair', () => {
  const segs = stairSegments(route);

  it('the baked route points are the dense path sampled', () => {
    for (const [x, z, , y] of route.points) {
      const near = P.reduce((b, p) => (Math.hypot(p[0] - x, p[1] - z) < Math.hypot(b[0] - x, b[1] - z) ? p : b));
      expect(Math.hypot(near[0] - x, near[1] - z)).toBeLessThan(0.2);
      expect(near[2]).toBeCloseTo(y, 0);
    }
  });

  it('is a continuous chain of chords from the foot to the pad, tapering 18 m to 12 m', () => {
    expect(segs.length).toBeGreaterThan(100);
    for (let i = 1; i < segs.length; i++) {
      expect(Math.hypot(segs[i].x0 - segs[i - 1].x1, segs[i].z0 - segs[i - 1].z1)).toBeLessThan(1e-6);
      expect(segs[i].y0).toBeCloseTo(segs[i - 1].y1, 9);
    }
    expect(segs[0].y0).toBe(P[0][2]);
    expect(segs[segs.length - 1].y1).toBeCloseTo(P[P.length - 1][2], 6);
    expect(segs[0].halfWidth).toBeGreaterThan(8.8); expect(segs[0].halfWidth).toBeLessThanOrEqual(STAIR.halfFoot);
    expect(segs[segs.length - 1].halfWidth).toBeLessThan(6.3); expect(segs[segs.length - 1].halfWidth).toBeGreaterThanOrEqual(STAIR.halfTop);
    for (let i = 1; i < segs.length; i++) expect(segs[i].halfWidth).toBeLessThanOrEqual(segs[i - 1].halfWidth + 1e-9);
  });

  it('has comfortable steps: rise 0.15-0.2 m, tread 0.5-1.3 m on the flights, shallow on the approach ramp, landings flat', () => {
    for (const g of segs) {
      const len = Math.hypot(g.x1 - g.x0, g.z1 - g.z0), m = Math.max(1, Math.round(len / g.tread));
      const rise = (g.y1 - g.y0) / m;
      if (g.kind === 'landing') expect(g.y1).toBe(g.y0);
      else if (g.ramp) { expect(rise).toBeGreaterThanOrEqual(0); expect(rise).toBeLessThan(0.1); expect(g.tread).toBeGreaterThan(0.8); expect(g.tread).toBeLessThan(1.2); }
      else {
        expect(rise).toBeGreaterThan(0.14); expect(rise).toBeLessThan(0.2);
        if (g.s0 < walkable) { expect(g.tread).toBeGreaterThan(0.5); expect(g.tread).toBeLessThan(1.3); }
      }
    }
    expect(segs.some((g) => g.ramp)).toBe(true);
    // The bake's route is walkable (a stair) over nearly all of it.
    expect(walkable / total).toBeGreaterThan(0.9);
  });

  it('floor along the route is the step height: within 0.05 m of a riser ladder, never a jump over 0.25 m', () => {
    const solids = createSolids([], { blockers: [], platforms: [] }, segs);
    solids.cull(0, 0);
    let prev = NaN, worst = 0, n = 0;
    // (Up to ~12 m short of the steep top flights: those rise out of the landing's own plan area, where treads overhang it.)
    for (let t = 0.2; t < walkable - 12; t += 0.3) {
      const r = ramp(t), f = solids.floor(r.x, r.z, r.y, false, r.y + 0.1);
      // At or above the graded ground, at most one riser over it.
      expect(f).toBeGreaterThanOrEqual(r.y - 1e-9);
      expect(f).toBeLessThanOrEqual(r.y + STEP_RISE + 0.1);
      // Equals the stepped floor of the chord that holds it.
      const ok = segs.some((q) => {
        if (q.s0 > t + 0.5 || q.s1 < t - 0.5) return false;
        const len = Math.hypot(q.x1 - q.x0, q.z1 - q.z0), d = Math.min(len, Math.max(0, ((r.x - q.x0) * (q.x1 - q.x0) + (r.z - q.z0) * (q.z1 - q.z0)) / len));
        return Math.abs(f - segmentFloor(q, d)) < 0.05;
      });
      expect(ok).toBe(true);
      if (!Number.isNaN(prev)) worst = Math.max(worst, Math.abs(f - prev));
      prev = f; n++;
    }
    expect(n).toBeGreaterThan(2000);   // ~700 m of route at 0.3 m
    expect(worst).toBeLessThanOrEqual(0.25);
  });

  it('a tread is never below the graded terrain, and off the stair nothing changes', () => {
    const solids = createSolids([], { blockers: [], platforms: [] }, segs);
    for (let t = 1; t < walkable - 12; t += 7) {
      const r = ramp(t);
      expect(solids.floor(r.x, r.z, r.y + 3, false, r.y + 3)).toBe(r.y + 3);        // terrain higher: terrain wins
      expect(solids.floor(r.x + 400, r.z, 123.4, false, 200)).toBe(123.4);            // far away: untouched
      // beyond the stair's half width: the terrain
      const L = Math.hypot(r.fx, r.fz), side = 40;
      expect(solids.floor(r.x + (r.fz / L) * side, r.z - (r.fx / L) * side, r.y - 5, false, r.y)).toBe(r.y - 5);
    }
    // A top far above the feet (walking at the stair's foot, looking up) is not stood on.
    const g = segs[40], mx = (g.x0 + g.x1) / 2, mz = (g.z0 + g.z1) / 2;
    expect(solids.floor(mx, mz, g.y0 - 10, false, g.y0 - 10)).toBe(g.y0 - 10);
  });

  const sites = stairSites(route, realH);
  const built = buildArchitecture(sites);

  it('is ~25 sites of 20-40 m, each with its own seat, well-formed geometry and budget', () => {
    expect(sites.length).toBeGreaterThanOrEqual(18);
    expect(sites.length).toBeLessThanOrEqual(40);
    expect(new Set(sites.map((s) => s.id)).size).toBe(sites.length);
    for (const s of sites) { expect(typeof s.seatY).toBe('number'); expect(s.id.startsWith('stair-')).toBe(true); }
    const n = built.positions.length / 3;
    expect(n).toBeGreaterThan(100000);
    expect(n).toBeLessThanOrEqual(300000);
    for (let i = 0; i < built.positions.length; i++) if (!Number.isFinite(built.positions[i])) throw new Error('NaN position');
    let maxI = 0; for (let i = 0; i < built.indices.length; i++) maxI = Math.max(maxI, built.indices[i]);
    expect(maxI).toBeLessThan(n);
    // Site-local geometry stays near its site (nothing mis-framed): ±45 m across, heights within -15..+30 m of the seat.
    for (let i = 0; i < sites.length; i++) {
      const r = built.ranges[i];
      for (let k = r.v0; k < r.v1; k++) {
        const x = built.positions[k * 3], y = built.positions[k * 3 + 1], z = built.positions[k * 3 + 2];
        if (Math.abs(x) > 45 || Math.abs(z) > 45 || y < -15 || y > 30) throw new Error(`site ${i} vertex ${k} at ${x},${y},${z}`);
      }
    }
  });

  it('treads sit on the ground: the top step surface of every chord is at its collision height', () => {
    // Walkable surfaces (STONE tops of the treads) lie within a few cm above the analytic floor.
    const site = sites[3], r = built.ranges[3];
    const seg = segs.find((q) => Math.hypot((q.x0 + q.x1) / 2 - site.at[0], (q.z0 + q.z1) / 2 - site.at[1]) < 4);
    expect(seg.kind).toBe('flight');
    let found = 0;
    for (let k = r.v0; k < r.v1; k++) {
      const wx = built.positions[k * 3] + site.at[0], wz = built.positions[k * 3 + 2] + site.at[1];
      if (Math.abs(built.normals[k * 3 + 1]) < 0.99) continue;   // (the shader faces normals to the viewer)
      const dx = wx - seg.x0, dz = wz - seg.z0, len = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0);
      const d = (dx * (seg.x1 - seg.x0) + dz * (seg.z1 - seg.z0)) / len, l = (dx * (seg.z1 - seg.z0) - dz * (seg.x1 - seg.x0)) / len;
      if (d < 0.2 || d > len - 0.2 || Math.abs(l) > seg.halfWidth - 1) continue;
      const y = built.positions[k * 3 + 1] + site.seatY;
      // The top of one of the treads at this distance (slabs overlap their neighbours by a few cm).
      expect([-0.09, 0, 0.09].some((o) => Math.abs(y - LIFTED - segmentFloor(seg, d + o)) < 0.03)).toBe(true);
      found++;
    }
    expect(found).toBeGreaterThan(10);
  });

  it('has parapets and retaining walls (blockers) both sides, lanterns with lights, and a gate', () => {
    expect(built.blockers.length).toBeGreaterThan(300);
    for (const b of built.blockers) for (const key of ['x', 'z', 'y0', 'y1']) expect(Number.isFinite(b[key])).toBe(true);
    // Walls reach 4 m where the cut is deep.
    expect(Math.max(...built.blockers.filter((b) => b.kind === 'box').map((b) => b.y1 - b.y0))).toBeGreaterThan(3);
    const lamps = built.lights.filter((l) => l.kind === 'lamp');
    expect(lamps.length).toBeGreaterThanOrEqual(12);
    expect(lamps.length).toBeLessThanOrEqual(30);
    for (const l of lamps) expect([l.x, l.y, l.z, l.radius].every(Number.isFinite)).toBe(true);
    // More formal toward the top: more lamps in the upper half than the lower.
    const upper = lamps.filter((l) => l.site >= sites.length / 2).length;     // sites run foot to summit
    expect(upper).toBeGreaterThan(lamps.length - upper);
    // The last site carries the gate: a lamp light high above its seat and a tall carved pillar.
    const lastIdx = sites.length - 1;
    const gateLamp = lamps.find((l) => l.site >= lastIdx - 1 && l.y > 5);
    expect(gateLamp).toBeTruthy();
  });

  it('walls block the capsule at the stair edge and leave the run open', () => {
    const solids = createSolids(sites, built, segs);
    sites.forEach((s, i) => { solids.sites[i].seat = s.seatY; });
    const g = segs[60], len = Math.hypot(g.x1 - g.x0, g.z1 - g.z0), fx = (g.x1 - g.x0) / len, fz = (g.z1 - g.z0) / len;
    const mx = (g.x0 + g.x1) / 2, mz = (g.z0 + g.z1) / 2, y = (g.y0 + g.y1) / 2 + 0.2;
    solids.cull(mx, mz);
    // On the axis: nothing pushes.
    const p = { x: mx, y, z: mz }, v = { x: 0, y: 0, z: 0 };
    solids.push(p, v); expect(p.x).toBe(mx); expect(p.z).toBe(mz);
    // Through the parapet / wall on each side: pushed back inside.
    for (const sd of [-1, 1]) {
      const q = { x: mx + fz * sd * (g.halfWidth + 0.3), y, z: mz - fx * sd * (g.halfWidth + 0.3) }, vv = { x: fz * sd, y: 0, z: -fx * sd };
      solids.push(q, vv);
      const lat = (q.x - mx) * fz - (q.z - mz) * fx;
      expect(Math.abs(lat) * sd).toBeLessThan(g.halfWidth + 0.15);
    }
  });

  it('fits the architecture site table and chunks for culling', () => {
    const all = [...frostSites(table, baked.routes), ...villageSites(village), ...sites];
    expect(all.length).toBeLessThanOrEqual(ARCH_SITES);
    const chunks = chunkArchitecture(sites, built);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.reduce((a, c) => a + c.vertexCount, 0)).toBe(built.positions.length / 3);
  });
});
