import { describe, it, expect } from 'vitest';
import { KITS, kitPreviewSites, Builder, rot } from '../src/world/villageKits.js';
import { buildArchitecture, MAT } from '../src/world/architecture.js';

const PLOTS = { house: [4.5, 4.5], house2: [5, 5.5], shop: [5, 5.5], workshop: [6, 5.5], barn: [7, 9], chapel: [5, 8], hall: [6, 8], well: [2, 2], stall: [2.4, 2], farm: [8, 11] };
const BUDGET = { house: 9000, house2: 14000, shop: 14000, workshop: 14000, barn: 20000, chapel: 20000, hall: 14000, farm: 14000, well: 6000, stall: 3000 };
const FRAMED = ['house', 'house2', 'shop', 'workshop', 'barn', 'chapel', 'hall', 'farm'];
const SEEDS = Array.from({ length: 24 }, (_, i) => i * 37 + 1);

const build = (kind, seed, facing = 0, w = PLOTS[kind][0], d = PLOTS[kind][1]) => {
  const b = new Builder(); b.site = 0;
  const fn = KITS[kind]({ kind, w, d, seed, district: 'core' });
  fn(b, facing, () => 0.5);
  return { b, fn, n: b.pos.length / 3 };
};
const mats = (b) => { const s = new Set(); for (let i = 0; i < b.pos.length / 3; i++) s.add(b.info[i * 4 + 1]); return s; };

describe('village building kits', () => {
  it('exports every kind', () => {
    expect(Object.keys(KITS).sort()).toEqual(['barn', 'chapel', 'farm', 'hall', 'house', 'house2', 'shop', 'stall', 'well', 'workshop']);
  });

  it('builds finite, well-formed geometry for many seeds, facings and plot sizes', () => {
    for (const kind of Object.keys(KITS)) for (const seed of SEEDS.slice(0, 12)) for (const [facing, k] of [[0, 1], [2.3, 0.75]]) {
      const [w, d] = PLOTS[kind];
      const { b, n } = build(kind, seed, facing, Math.max(2.2, w * k), Math.max(2.2, d * k));
      expect(n, kind).toBeGreaterThan(100);
      for (const arr of [b.pos, b.nrm, b.uv, b.info]) for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) throw new Error(`${kind} seed ${seed}: NaN in vertex data`);
      let maxI = 0; for (const i of b.idx) maxI = Math.max(maxI, i);
      expect(maxI).toBeLessThan(n);
      expect(b.idx.length % 3).toBe(0);
      for (const o of b.blockers) for (const key of ['x', 'z', 'y0', 'y1']) if (o.kind === 'box' || key !== 'y0' || true) expect(Number.isFinite(o[key])).toBe(true);
      for (const l of b.lights) expect([l.x, l.y, l.z, l.radius].every(Number.isFinite)).toBe(true);
    }
  });

  it('stays inside the vertex budgets', () => {
    for (const kind of Object.keys(KITS)) {
      let max = 0;
      for (const seed of SEEDS) max = Math.max(max, build(kind, seed).n);
      expect(max, `${kind} max vertices`).toBeLessThanOrEqual(BUDGET[kind]);
    }
  });

  it('is deterministic per seed and varies between seeds', () => {
    for (const kind of Object.keys(KITS)) {
      const a = build(kind, 77), a2 = build(kind, 77);
      expect(a.n).toBe(a2.n);
      expect(Array.from(a.b.pos)).toEqual(Array.from(a2.b.pos));
      expect(a.b.blockers).toEqual(a2.b.blockers);
      if (kind === 'stall') continue;
      const sigs = new Set(SEEDS.slice(0, 8).map((s) => build(kind, s).n));
      expect(sigs.size, `${kind} varies`).toBeGreaterThan(1);
    }
  });

  it('frames timber on plaster: WOOD stands 3 cm proud of the PLASTER infill', () => {
    for (const kind of ['house', 'house2', 'shop', 'hall', 'farm']) for (const seed of [5, 41, 99]) {
      const { b, fn } = build(kind, seed);
      const m = mats(b);
      expect(m.has(MAT.PLASTER) && m.has(MAT.WOOD), kind).toBe(true);
      // The front wall's outer face is at f = oz + D (+J for the jettied upper floor): plaster there, studs 3 cm out.
      const { D, J, oz } = fn.meta, face = (f) => { let pl = 0, wd = 0;
        for (let i = 0; i < b.pos.length / 3; i++) {
          const z = b.pos[i * 3 + 2], mt = b.info[i * 4 + 1];
          if (mt === MAT.PLASTER && Math.abs(z - f) < 1e-3) pl++;
          if (mt === MAT.WOOD && Math.abs(z - (f + 0.03)) < 1e-3) wd++;
        } return [pl, wd]; };
      const top = oz + D + J, [pl, wd] = face(top);
      expect(pl, `${kind} plaster on the front face`).toBeGreaterThan(3);
      expect(wd, `${kind} studs 3 cm proud`).toBeGreaterThanOrEqual(12);
      if (J > 0) { const [pg, wg] = face(oz + D); expect(pg + wg, `${kind} ground wall`).toBeGreaterThan(3); }
    }
  });

  it('every framed kind has glass, a roof material, plank doors with iron, and a stone footing', () => {
    for (const kind of FRAMED) for (const seed of [3, 8, 60]) {
      const m = mats(build(kind, seed).b);
      expect(m.has(MAT.GLASS), kind).toBe(true);
      expect(m.has(MAT.WOOD) && m.has(MAT.PLANK) && m.has(MAT.IRON) && m.has(MAT.STONE), kind).toBe(true);
      expect([MAT.THATCH, MAT.SLATE, MAT.TILE, MAT.SHINGLE].some((x) => m.has(x)), `${kind} roof`).toBe(true);
    }
    expect(mats(build('shop', 4).b).has(MAT.CANVAS)).toBe(true);        // the awning
    expect(mats(build('chapel', 4).b).has(MAT.SLATE)).toBe(true);
    expect(mats(build('barn', 4).b).has(MAT.SHINGLE) || mats(build('barn', 4).b).has(MAT.PLANK)).toBe(true);
  });

  it('varies roof material and keeps steep pitches (house 40-55 deg)', () => {
    const roofs = new Set(), pitches = [];
    for (const seed of SEEDS) { const { fn } = build('house', seed); roofs.add(fn.meta.roofMat); pitches.push(fn.meta.pitch); }
    expect(roofs.size).toBeGreaterThanOrEqual(2);
    for (const p of pitches) { expect(p).toBeGreaterThanOrEqual(40 * Math.PI / 180 - 0.01); expect(p).toBeLessThanOrEqual(55 * Math.PI / 180 + 0.01); }
    for (const seed of SEEDS.slice(0, 6)) expect(build('house2', seed).fn.meta.pitch).toBeGreaterThan(0.75);
    const patterns = new Set(SEEDS.map((s) => build('house', s).fn.meta.pattern)); expect(patterns.size).toBe(3);
  });

  it('jettied kinds overhang the street side by 0.4-0.6 m', () => {
    for (const kind of ['house2', 'shop']) for (const seed of SEEDS.slice(0, 8)) {
      const { fn, b } = build(kind, seed), J = fn.meta.J;
      expect(J).toBeGreaterThanOrEqual(0.4); expect(J).toBeLessThanOrEqual(0.6);
      let maxZ = -1e9; for (let i = 0; i < b.pos.length / 3; i++) if (b.info[i * 4 + 1] === MAT.PLASTER) maxZ = Math.max(maxZ, b.pos[i * 3 + 2]);
      expect(maxZ).toBeCloseTo(fn.meta.D + J, 2);
    }
  });

  // Door gaps: no solid blocker (that a standing Wraith would meet) across the opening, 1.1 m wide, 2.1 m tall.
  const inBlocker = (o, x, y, z) => {
    if (o.cam) return false;
    if (!(y > o.y0 && y < o.y1)) return false;
    if (o.kind === 'circle') return Math.hypot(x - o.x, z - o.z) < o.r;
    const dx = x - o.x, dz = z - o.z, lx = dx * o.cos - dz * o.sin, lz = dx * o.sin + dz * o.cos;
    return Math.abs(lx) < o.hx && Math.abs(lz) < o.hz;
  };
  it('leaves the door open: 1.1 m wide, 2.1 m tall, nothing solid across it', () => {
    for (const kind of FRAMED) for (const seed of SEEDS.slice(0, 10)) for (const facing of [0, 0.9, 3.4]) {
      const { b, fn } = build(kind, seed, facing), { door, D, ox, oz } = fn.meta;
      expect(door, kind).toBeTruthy();
      expect(door.w, `${kind} door width`).toBeGreaterThanOrEqual(1.1);
      expect(door.y1 - 0.25, `${kind} door height`).toBeGreaterThanOrEqual(2.1);
      const P = rot(facing);
      for (let ds = -0.5; ds <= 0.501; ds += 0.25) for (let f = -0.5; f <= 0.9; f += 0.1) for (let y = 0.3; y <= 2.0; y += 0.35) {
        const p = P(ox + door.a + ds, 0, oz + D + f);        // f < 0 runs inside the door, f > 0 out onto the step
        for (const o of b.blockers) if (inBlocker(o, p[0], y, p[2])) throw new Error(`${kind} seed ${seed} facing ${facing}: blocker ${JSON.stringify(o)} across the door at ds ${ds} f ${f} y ${y}`);
      }
    }
  });

  it('has a walkable plank floor (platform) filling the interior and walls that block', () => {
    for (const kind of FRAMED) for (const seed of SEEDS.slice(0, 6)) {
      const { b, fn } = build(kind, seed), { W, D } = fn.meta;
      const floors = b.platforms.filter((p) => Math.abs(p.top - 0.25) < 1e-6 && p.hx >= W - 0.6 && p.hz >= D - 0.6);
      expect(floors.length, `${kind} floor`).toBe(1);
      const walls = b.blockers.filter((o) => o.kind === 'box' && !o.cam && o.y1 - o.y0 > 1.8 && Math.max(o.hx, o.hz) > 0.8);
      expect(walls.length, `${kind} walls`).toBeGreaterThanOrEqual(4);
      // Roofs are camera-only.
      const cams = b.blockers.filter((o) => o.cam);
      expect(cams.length, `${kind} roof camera blocker`).toBeGreaterThanOrEqual(1);
      for (const c of cams) expect(c.y1).toBeGreaterThan(3);
    }
  });

  it('lights lanterns: all shops, halls and chapels, about half the houses', () => {
    for (const kind of ['shop', 'hall', 'chapel']) for (const seed of SEEDS.slice(0, 8)) {
      const lamps = build(kind, seed).b.lights.filter((l) => l.kind === 'lamp');
      expect(lamps.length, kind).toBeGreaterThanOrEqual(1);
    }
    for (const kind of ['house', 'farm']) {
      let lit = 0; const N = 60;
      for (let s = 0; s < N; s++) lit += build(kind, s * 13 + 2).b.lights.length ? 1 : 0;
      expect(lit / N, `${kind} share lit`).toBeGreaterThan(0.25); expect(lit / N).toBeLessThan(0.75);
    }
  });

  it('keeps the building inside the plot', () => {
    for (const kind of FRAMED) for (const seed of SEEDS.slice(0, 6)) {
      const [w, d] = PLOTS[kind], { fn } = build(kind, seed);
      expect(fn.meta.W).toBeLessThanOrEqual(w); expect(fn.meta.D).toBeLessThanOrEqual(d);
    }
  });

  it('exposes a dev row: one of each kind, 14 m apart, buildable by buildArchitecture', () => {
    const sites = kitPreviewSites([100, 200]);
    expect(sites.map((s) => s.id.replace('kit-', '')).sort()).toEqual(Object.keys(KITS).sort());
    sites.forEach((s, i) => { expect(s.at[0]).toBeCloseTo(100 + 14 * i, 6); expect(s.at[1]).toBe(200); expect(typeof s.build).toBe('function'); expect(s.windows).toBe(true); });
    const built = buildArchitecture(sites);
    expect(built.positions.length / 3).toBeGreaterThan(40000);
    for (let i = 0; i < built.positions.length; i++) if (!Number.isFinite(built.positions[i])) throw new Error('NaN');
    expect(built.ranges.length).toBe(sites.length);
    expect(new Set(built.lights.map((l) => l.site)).size).toBeGreaterThanOrEqual(5);
  });
});
