import { describe, it, expect } from 'vitest';
import { villageLayout } from '../src/world/village.js';

// A fake world: a gentle plane, a meandering stream band west of the village (the real one is at
// x ~ -8), and the real hill ellipse (centre 300,1000; semi-axes 170 x 210).
const streamX = (z) => 4 + 5 * Math.sin(z / 37);
const fake = {
  height: (x, z) => 262 + 0.035 * (x - 60) + 0.02 * (z - 990) + 0.6 * Math.sin(x / 23) * Math.cos(z / 31),
  water: (x, z) => Math.abs(x - streamX(z)) < 3.5,
  isHill: (x, z) => Math.hypot((x - 300) / 170, (z - 1000) / 210),
};
const FOOT = [142, 869], HUB = [60, 990];
const opts = { seed: 7, foot: FOOT, hub: HUB };
const L = villageLayout(fake, opts);

const corners = (p, grow = 0) => {
  const s = Math.sin(p.facing), c = Math.cos(p.facing), out = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) out.push([p.at[0] + c * (p.w + grow) * a + s * (p.d + grow) * b, p.at[1] - s * (p.w + grow) * a + c * (p.d + grow) * b]);
  return out;
};
const segD = (x, z, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
  const t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
  return { d: Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t), x: a[0] + dx * t, z: a[1] + dz * t };
};
const nearest = (x, z) => {
  let best = { d: 1e9 };
  for (const r of L.roads) for (let i = 0; i < r.pts.length - 1; i++) { const q = segD(x, z, r.pts[i], r.pts[i + 1]); if (q.d < best.d) best = q; }
  return best;
};
const sat = (a, b, pad) => { // separating-axis test on inflated rects
  const ax = (p) => [[Math.cos(p.facing), -Math.sin(p.facing)], [Math.sin(p.facing), Math.cos(p.facing)]];
  const A = ax(a), B = ax(b), dx = b.at[0] - a.at[0], dz = b.at[1] - a.at[1];
  for (const u of [...A, ...B]) {
    const ra = (a.w + pad) * Math.abs(A[0][0] * u[0] + A[0][1] * u[1]) + (a.d + pad) * Math.abs(A[1][0] * u[0] + A[1][1] * u[1]);
    const rb = (b.w + pad) * Math.abs(B[0][0] * u[0] + B[0][1] * u[1]) + (b.d + pad) * Math.abs(B[1][0] * u[0] + B[1][1] * u[1]);
    if (Math.abs(dx * u[0] + dz * u[1]) >= ra + rb) return false;
  }
  return true;
};

describe('village layout', () => {
  it('is deterministic for a seed and varies with it', () => {
    expect(JSON.stringify(villageLayout(fake, opts))).toBe(JSON.stringify(L));
    expect(JSON.stringify(villageLayout(fake, { ...opts, seed: 8 }))).not.toBe(JSON.stringify(L));
  });
  it('is fast', () => {
    const t = performance.now();
    villageLayout(fake, opts);
    expect(performance.now() - t).toBeLessThan(400);
  });
  it('has the expected counts', () => {
    const k = (n) => L.plots.filter((p) => p.kind === n).length;
    const buildings = L.plots.filter((p) => p.kind !== 'stall' && p.kind !== 'well').length;
    expect(buildings).toBeGreaterThanOrEqual(110);
    expect(buildings).toBeLessThanOrEqual(175);
    expect(k('stall')).toBeGreaterThanOrEqual(6);
    expect(k('stall')).toBeLessThanOrEqual(10);
    expect(k('well')).toBeGreaterThanOrEqual(2);
    expect(k('well')).toBeLessThanOrEqual(3);
    expect(k('chapel')).toBe(1);
    expect(k('hall')).toBe(1);
    expect(k('farm')).toBeGreaterThanOrEqual(3);
    expect(L.roads.some((r) => r.kind === 'lane')).toBe(true);
    expect(L.roads.some((r) => r.kind === 'path')).toBe(true);
    expect(L.greens.length).toBeGreaterThanOrEqual(1);
    for (const d of ['centre', 'lower', 'edge', 'farm']) expect(L.plots.some((p) => p.district === d)).toBe(true);
    expect(new Set(L.plots.map((p) => p.id)).size).toBe(L.plots.length);
  });
  it('has no overlapping plots (1 m gap, except party walls within one frontage)', () => {
    for (let i = 0; i < L.plots.length; i++) for (let j = i + 1; j < L.plots.length; j++) {
      const a = L.plots[i], b = L.plots[j];
      if (Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]) > 40) continue;
      expect(sat(a, b, a.row === b.row ? -0.02 : 0.5), `${a.id}/${b.id}`).toBe(false);
    }
  });
  it('keeps plots off water (+4 m), the hill and the stair apron', () => {
    for (const p of L.plots) {
      for (const [x, z] of corners(p, 4)) expect(fake.water(x, z), p.id).toBe(false);
      expect(fake.water(p.at[0], p.at[1])).toBe(false);
      for (const [x, z] of corners(p)) expect(fake.isHill(x, z), p.id).toBeGreaterThan(1.0);
      expect(Math.hypot(p.at[0] - FOOT[0], p.at[1] - FOOT[1]) - Math.hypot(p.w, p.d)).toBeGreaterThanOrEqual(24.9);
    }
  });
  it('puts every plot within 30 m of a road, facing it', () => {
    for (const p of L.plots) {
      const q = nearest(p.at[0], p.at[1]);
      expect(q.d, p.id).toBeLessThanOrEqual(30);
      const toRoad = Math.atan2(q.x - p.at[0], q.z - p.at[1]);
      let da = Math.abs(toRoad - p.facing) % (2 * Math.PI);
      if (da > Math.PI) da = 2 * Math.PI - da;
      expect(da, p.id).toBeLessThanOrEqual((40 * Math.PI) / 180);
    }
  });
  it('keeps plots off the roads', () => {
    for (const p of L.plots) for (const [x, z] of corners(p)) {
      const r = L.roads.reduce((m, rd) => { let d = 1e9; for (let i = 0; i < rd.pts.length - 1; i++) d = Math.min(d, segD(x, z, rd.pts[i], rd.pts[i + 1]).d); return Math.min(m, d - rd.width / 2); }, 1e9);
      expect(r, p.id).toBeGreaterThan(0.3);
    }
  });
  it('keeps the last 120 m of the main road clear of tall buildings (12 m corridor)', () => {
    const cor = L.meta.corridor;
    for (const p of L.plots) {
      if (p.kind === 'stall' || p.kind === 'well') continue;
      for (const [x, z] of [...corners(p), p.at]) {
        let d = 1e9;
        for (let i = 0; i < cor.length - 1; i++) d = Math.min(d, segD(x, z, cor[i], cor[i + 1]).d);
        expect(d, p.id).toBeGreaterThanOrEqual(6);
      }
    }
  });
  it('runs the main road from the entry to the stair foot, bridging water at most once', () => {
    const main = L.roads.filter((r) => r.kind === 'main');
    const eq = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.5;
    let cur = main.find((r) => eq(r.pts[0], L.meta.entry));
    expect(cur).toBeTruthy();
    const chain = [cur];
    while (!eq(cur.pts[cur.pts.length - 1], FOOT)) {
      const e = cur.pts[cur.pts.length - 1];
      cur = main.find((r) => !chain.includes(r) && eq(r.pts[0], e));
      expect(cur).toBeTruthy();
      chain.push(cur);
    }
    expect(chain.length).toBe(main.length);
    expect(main.filter((r) => r.bridge).length).toBeLessThanOrEqual(1);
    expect(main.some((r) => r.bridge)).toBe(true); // the fake stream lies across the entry
    expect(main.every((r) => r.width >= 6)).toBe(true);
    for (const r of main) if (r.pts.length >= 2) expect(r.surface).toMatch(/^(cobble|earth|grass)$/);
  });
  it('keeps every other road off water and the hill; only bridges cross', () => {
    for (const r of L.roads) for (const [x, z] of r.pts) {
      expect(fake.isHill(x, z), r.id).toBeGreaterThan(1.0);
      if (!r.bridge) expect(fake.water(x, z), r.id).toBe(false);
    }
    for (const r of L.roads) if (r.kind !== 'main' && r.route !== 'bridgest') expect(r.bridge).toBeUndefined();   // the stream street is the only other bridge
  });
  it('has cobbles in the centre, grass at the edges, and no ring road', () => {
    const [mx, mz] = L.meta.market;
    for (const r of L.roads) {
      const mid = r.pts[r.pts.length >> 1], d = Math.hypot(mid[0] - mx, mid[1] - mz);
      if (r.kind === 'path') expect(r.surface).toBe('grass');
      else if (d < 15 && !r.bridge) expect(r.surface).toBe('cobble');
    }
    const arcs = new Set(L.roads.filter((r) => r.route.startsWith('arc')).map((r) => r.route));
    expect(arcs.size).toBeLessThanOrEqual(4);
    // no road encircles the hill: the angular coverage of non-main roads about its centre stays < 300 deg
    const bins = new Set();
    for (const r of L.roads) if (r.kind !== 'path') for (const [x, z] of r.pts) if (fake.isHill(x, z) < 1.4) bins.add(Math.floor(((Math.atan2(z - 1000, x - 300) + Math.PI) / (2 * Math.PI)) * 36));
    expect(bins.size).toBeLessThan(30);
  });
  it('spaces lamps ~14-18 m along main and street roads, and lights the square and the stair foot', () => {
    const by = {};
    for (const l of L.lights) { expect(l.kind).toBe('lamp'); if (l.road) (by[l.road] ||= []).push(l.s); }
    expect(Object.keys(by).length).toBeGreaterThan(2);
    for (const ss of Object.values(by)) for (let i = 1; i < ss.length; i++) { expect(ss[i] - ss[i - 1]).toBeGreaterThanOrEqual(10); expect(ss[i] - ss[i - 1]).toBeLessThanOrEqual(45); }
    expect(L.lights.filter((l) => l.why === 'square').length).toBeGreaterThanOrEqual(2);
    expect(L.lights.filter((l) => l.why === 'stair-foot').length).toBeGreaterThanOrEqual(1);
    for (const l of L.lights) { expect(fake.water(l.at[0], l.at[1])).toBe(false); expect(fake.isHill(l.at[0], l.at[1])).toBeGreaterThan(1.0); }
  });
  it('bridges the stream: a straight bridge record per bridge road, spanning the wet run with abutments, with baked heights', () => {
    const bridges = L.bridges, pieces = L.roads.filter((r) => r.bridge);
    expect(bridges.length).toBe(pieces.length);
    expect(bridges.length).toBeGreaterThanOrEqual(1);
    for (const br of bridges) {
      expect(br.len).toBeGreaterThanOrEqual(br.wet[1] - br.wet[0] + 6.5);
      expect(br.width).toBeGreaterThan(5); expect(Number.isFinite(br.seatY)).toBe(true);
      expect(br.eA).toBeLessThanOrEqual(0); expect(br.eB).toBeLessThanOrEqual(0);
      const road = pieces.find((r) => r.id === br.road);
      // the road piece is straight (its points lie on the chord) and runs along the bridge yaw
      const a = road.pts[0], z = road.pts[road.pts.length - 1];
      expect(Math.abs(Math.sin(Math.atan2(z[0] - a[0], z[1] - a[1]) - br.yaw))).toBeLessThan(0.02);
      for (const p of road.pts) expect(segD(p[0], p[1], a, z).d).toBeLessThan(0.05);
      // water lies only between the abutments
      const s = Math.sin(br.yaw), c = Math.cos(br.yaw);
      for (let t = -br.len / 2; t <= br.len / 2; t += 0.5) {
        const x = br.at[0] + s * t, zz = br.at[1] + c * t;
        if (fake.water(x, zz)) expect(Math.abs(t)).toBeLessThan(br.len / 2 - 2.5);
      }
    }
  });
  it('makes the chapel a landmark with its churchyard: a big plot (>= 2x the old one), room kept around it', () => {
    const ch = L.plots.find((p) => p.kind === 'chapel');
    expect(ch.w * ch.d).toBeGreaterThanOrEqual(7.8 * 10.8);
    expect(ch.dh).toBeLessThanOrEqual(1.5);
  });
  it('places at most one windmill, on a footpath, with its baked top height', () => {
    const mills = L.plots.filter((p) => p.kind === 'mill');
    expect(mills.length).toBeLessThanOrEqual(1);
    for (const m of mills) { expect(Number.isFinite(m.yt)).toBe(true); expect(m.district).toBe('farm'); expect(L.roads.some((r) => r.id === 'pathmill')).toBe(true); }
  });
  it('reserves back gardens that overlap no other plot', () => {
    const g = L.plots.filter((p) => p.garden);
    expect(g.length).toBeGreaterThanOrEqual(10);
    for (const p of g) {
      expect(p.garden).toBeGreaterThanOrEqual(2.8); expect(p.garden).toBeLessThanOrEqual(7);
      const c = p.d + p.garden / 2 + 0.1, A = { at: [p.at[0] - Math.sin(p.facing) * c, p.at[1] - Math.cos(p.facing) * c], facing: p.facing, w: p.w, d: p.garden / 2 };
      for (const q of L.plots) if (q !== p && Math.hypot(q.at[0] - p.at[0], q.at[1] - p.at[1]) < 40) expect(sat(A, q, 0.1), `${p.id} garden / ${q.id}`).toBe(false);
      for (const [x, z] of corners(A)) expect(fake.water(x, z), p.id).toBe(false);
    }
  });
  it('walls the farm fields: wall runs and field rects stay off water, the hill, plots and roads', () => {
    expect(L.walls.length).toBeGreaterThanOrEqual(1);
    for (const w of L.walls) {
      expect(L.plots.some((p) => p.id === w.farm && p.kind === 'farm')).toBe(true);
      for (const run of w.runs) {
        expect(run.length).toBeGreaterThanOrEqual(2);
        for (const [x, z, y] of run) {
          expect(fake.water(x, z)).toBe(false); expect(fake.isHill(x, z)).toBeGreaterThan(1.05);
          expect(y).toBeGreaterThanOrEqual(0);
          for (const p of L.plots) if (Math.hypot(p.at[0] - x, p.at[1] - z) < 20) expect(sat({ at: [x, z], facing: p.facing, w: 0.1, d: 0.1 }, p, 0.5), `${w.id} vs ${p.id}`).toBe(false);
        }
      }
    }
    expect(L.fields.length).toBeGreaterThanOrEqual(2);
    for (const f of L.fields) { expect(['crop', 'pasture', 'orchard']).toContain(f.kind); expect(fake.water(f.at[0], f.at[1])).toBe(false); }
  });
});
