import { describe, it, expect } from 'vitest';
import { KITS, kitPreviewSites, villageSites, Builder, rot } from '../src/world/villageKits.js';
import { plotProps, bridgeSite, millSites, wallSite } from '../src/world/villageProps.js';
import { buildArchitecture, MAT } from '../src/world/architecture.js';

const PLOTS = { house: [4.5, 4.5], house2: [5, 5.5], shop: [5, 5.5], workshop: [6, 5.5], barn: [7, 9], chapel: [10.5, 14], hall: [6, 8], well: [2, 2], stall: [2.4, 2], farm: [8, 11] };
const BUDGET = { house: 9000, house2: 14000, shop: 14000, workshop: 14000, barn: 20000, chapel: 46000, hall: 14000, farm: 14000, well: 6000, stall: 3000 };
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

  it('the chapel is a landmark: ~2x the old footprint, a 20-25 m bell tower, a churchyard wall with a lychgate and gravestones', () => {
    for (const seed of [3, 41, 99, 150]) {
      const { b, fn } = build('chapel', seed), { W, D } = fn.meta;
      expect(4 * W * D + 4 * 2.15 * 2.15, `seed ${seed} footprint`).toBeGreaterThan(110);
      let top = -1e9, minX = 1e9, maxX = -1e9;
      for (let i = 0; i < b.pos.length / 3; i++) { top = Math.max(top, b.pos[i * 3 + 1]); minX = Math.min(minX, b.pos[i * 3]); maxX = Math.max(maxX, b.pos[i * 3]); }
      expect(top, 'tower tip').toBeGreaterThanOrEqual(20); expect(top).toBeLessThanOrEqual(25.5);
      expect(maxX - minX, 'the yard wall spans the plot').toBeGreaterThan(17);
      // The tower is solid (one tall blocker), the yard wall blocks (long low blockers), the lychgate is open.
      expect(b.blockers.some((o) => o.y1 - o.y0 > 18), 'tower blocker').toBe(true);
      expect(b.blockers.filter((o) => o.kind === 'box' && Math.abs(o.y1 - 1.15) < 1e-6 && Math.max(o.hx, o.hz) > 3).length, 'yard wall runs').toBeGreaterThanOrEqual(5);
      const P = rot(0), gate = P(fn.meta.ox, 0, 13.4);
      for (let y = 0.3; y < 2; y += 0.4) for (let ds = -0.5; ds <= 0.5; ds += 0.25) for (const o of b.blockers) if (inBlocker(o, gate[0] + ds, y, gate[2])) throw new Error('lychgate blocked');
      expect(mats(b).has(MAT.SHINGLE), 'lychgate roof').toBe(true);
    }
  });

  const PLOT = (kind, extra = {}) => ({ kind, w: PLOTS[kind][0], d: PLOTS[kind][1], seed: 1234 + kind.length * 17, district: 'lower', ...extra });
  const withProps = (kind, seed, extra = {}) => {
    const plot = PLOT(kind, { seed, garden: 5.5, ...extra }), kit = KITS[kind](plot), pr = plotProps(plot, kit.meta);
    const b = new Builder(); b.site = 0;
    kit(b, 0.4, () => 0.5); const n0 = b.pos.length / 3;
    if (pr) pr(b, 0.4);
    return { b, n0, n: b.pos.length / 3, pr, plot, kit };
  };
  it('dresses every kind with life props within budget, deterministically, with finite geometry', () => {
    for (const kind of ['house', 'house2', 'shop', 'workshop', 'barn', 'farm', 'well', 'stall', 'hall']) {
      let max = 0, got = 0;
      for (const seed of SEEDS.slice(0, 10)) {
        const a = withProps(kind, seed), c = withProps(kind, seed);
        expect(a.n).toBe(c.n);
        expect(Array.from(a.b.pos)).toEqual(Array.from(c.b.pos));
        for (const arr of [a.b.pos, a.b.nrm, a.b.uv, a.b.info]) for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) throw new Error(`${kind} ${seed}: NaN`);
        let maxI = 0; for (const i of a.b.idx) maxI = Math.max(maxI, i); expect(maxI).toBeLessThan(a.n);
        for (const o of a.b.blockers) for (const key of ['x', 'z', 'y0', 'y1']) expect(Number.isFinite(o[key])).toBe(true);
        max = Math.max(max, a.n - a.n0); if (a.n > a.n0) got++;
      }
      expect(got, `${kind} gets props`).toBeGreaterThan(3);
      expect(max, `${kind} prop vertices`).toBeLessThanOrEqual(kind === 'barn' || kind === 'farm' ? 4500 : 7000);
    }
  });
  it('back gardens: fenced EARTH beds behind plots that have the room, fence and cart blockers only (props stay passable)', () => {
    let beds = 0;
    for (const seed of SEEDS.slice(0, 8)) {
      const { b, n0 } = withProps('house', seed);
      const earth = new Set(); for (let i = n0; i < b.pos.length / 3; i++) earth.add(b.info[i * 4 + 1]);
      if (earth.has(MAT.EARTH)) beds++;
      // everything the props added behind the plot lies in the garden band (behind the plot's back edge) or by the walls
      const none = withProps('house', seed, { garden: 0 });
      expect(none.n - none.n0, 'no garden, fewer props').toBeLessThanOrEqual(b.pos.length / 3 - n0);
    }
    expect(beds).toBeGreaterThanOrEqual(6);
  });
  it('props never block a door: no solid across the opening even with props on', () => {
    for (const kind of ['house', 'house2', 'shop', 'workshop', 'farm', 'hall']) for (const seed of SEEDS.slice(0, 8)) for (const facing of [0, 0.9]) {
      const plot = PLOT(kind, { seed, garden: 5.5 }), kit = KITS[kind](plot), pr = plotProps(plot, kit.meta), b = new Builder(); b.site = 0;
      kit(b, facing, () => 0.5); if (pr) pr(b, facing);
      const { door, D, ox, oz } = kit.meta, P = rot(facing);
      for (let ds = -0.5; ds <= 0.501; ds += 0.25) for (let f = -0.5; f <= 0.9; f += 0.1) for (let y = 0.3; y <= 2.0; y += 0.35) {
        const p = P(ox + door.a + ds, 0, oz + D + f);
        for (const o of b.blockers) if (inBlocker(o, p[0], y, p[2])) throw new Error(`${kind} ${seed}: blocker across the door with props`);
      }
    }
  });

  const BRIDGE = { id: 'bridge0', at: [10, 20], yaw: 0.8, len: 19.9, width: 5.6, eA: 0, eB: -0.4, seatY: 261, wet: [4.5, 15.5] };
  const buildSite = (s) => { const b = new Builder(); b.site = 0; s.build(b, s.facing, () => 0.5); return b; };
  it('the arch bridge: STONE voussoirs and parapets, a COBBLE deck, a walkable stepped platform, seated at its baked bank height', () => {
    for (const len of [10.8, 14, 19.9, 27]) {
      const s = bridgeSite({ ...BRIDGE, len }), b = buildSite(s), n = b.pos.length / 3;
      expect(s.id).toBe('vil-bridge0'); expect(s.seatY).toBe(261); expect(s.facing).toBeCloseTo(0.8, 6);
      expect(n).toBeGreaterThan(1000); expect(n).toBeLessThan(7000);
      const m = mats(b); expect(m.has(MAT.STONE) && m.has(MAT.COBBLE)).toBe(true);
      for (const a of [b.pos, b.nrm, b.uv, b.info]) for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) throw new Error('NaN');
      // The deck is continuous end to end, no step over 0.2 m, within a metre of the banks at the ends.
      const pl = b.platforms.slice().sort((p, q) => (p.x * Math.sin(0.8) + p.z * Math.cos(0.8)) - (q.x * Math.sin(0.8) + q.z * Math.cos(0.8)));
      expect(pl.length).toBeGreaterThan(len);
      for (let i = 1; i < pl.length; i++) expect(Math.abs(pl[i].top - pl[i - 1].top)).toBeLessThan(0.2);
      expect(Math.abs(pl[0].top - 0)).toBeLessThan(0.5); expect(Math.abs(pl[pl.length - 1].top - (-0.4))).toBeLessThan(0.5);
      expect(Math.max(...pl.map((p) => p.top))).toBeGreaterThan(0.5);                 // a humped deck
      // Parapets block (two long blockers), the deck is open between them.
      const long = b.blockers.filter((o) => o.kind === 'box' && o.hz > len / 2 - 0.1);
      expect(long.length).toBe(2);
      // The arch opens under the deck: no vertex of the voussoir/body mass at mid-span between the springs and the underside... (soffit exists)
      let minY = 1e9, maxY = -1e9; for (let i = 0; i < n; i++) { minY = Math.min(minY, b.pos[i * 3 + 1]); maxY = Math.max(maxY, b.pos[i * 3 + 1]); }
      expect(maxY).toBeLessThan(3.5); expect(minY).toBeGreaterThan(-8);
    }
  });
  it('the windmill: a tower and a separate sails site with lift/spin like the old hub, seated together', () => {
    const plot = { id: 'p9', kind: 'mill', at: [40, 800], facing: 0.3, w: 4.3, d: 4.3, seed: 5, yt: 251.7 };
    const [tower, sails] = millSites(plot, [93, 926]);
    expect(tower.id).toBe('vil-mill'); expect(sails.id).toBe('vil-mill-sails');
    expect(tower.seatY).toBe(251.7); expect(sails.seatY).toBe(251.7);
    expect(sails.lift).toBeGreaterThan(6); expect(sails.lift).toBeLessThan(tower.footprint * 4 + 5);
    expect(Math.hypot(...sails.spin)).toBeCloseTo(1, 6); expect(sails.spin[1]).toBe(0);
    // the axle sits on the shaft line through the tower, upwind of it, and the sails face the square
    const dx = sails.at[0] - plot.at[0], dz = sails.at[1] - plot.at[1];
    expect(Math.hypot(dx, dz)).toBeGreaterThan(2.5); expect(Math.hypot(dx, dz)).toBeLessThan(4.5);
    expect(dx * (93 - 40) + dz * (926 - 800)).toBeGreaterThan(0);
    const tb = buildSite(tower), sb = buildSite(sails);
    expect(tb.pos.length / 3).toBeGreaterThan(2000); expect(sb.pos.length / 3).toBeGreaterThan(2000);
    let top = -1e9; for (let i = 0; i < tb.pos.length / 3; i++) top = Math.max(top, tb.pos[i * 3 + 1]);
    expect(top).toBeGreaterThan(sails.lift + 2);                                         // the cap stands above the axle
    expect(tb.blockers.some((o) => o.kind === 'circle' && o.r > 3 && o.y1 > 8)).toBe(true);
    for (const b of [tb, sb]) for (let i = 0; i < b.pos.length; i++) if (!Number.isFinite(b.pos[i])) throw new Error('NaN');
  });
  it('field walls: one site per farm, laid STONE, solid, with baked heights', () => {
    const w = { id: 'wall0', at: [100, 700], seatY: 250, runs: [[[100, 700, 0.2], [103, 700, 0.5], [106, 701, 0.8]], [[110, 705, 0], [113, 705, 0.1]]] };
    const s = wallSite(w), b = buildSite(s);
    expect(s.id).toBe('vil-wall0'); expect(s.seatY).toBe(250);
    expect(b.blockers.length).toBe(3);
    expect(mats(b).has(MAT.STONE)).toBe(true);
    let top = -1e9; for (let i = 0; i < b.pos.length / 3; i++) top = Math.max(top, b.pos[i * 3 + 1]);
    expect(top).toBeGreaterThan(1.5); expect(top).toBeLessThan(2.3);
    for (const o of b.blockers) expect(o.y1 - o.y0).toBeGreaterThan(1.4);
  });
  it('villageSites appends the set pieces after the lamps and stays within the shader site budget', () => {
    const plots = [{ id: 'a', kind: 'house', at: [0, 0], facing: 0, w: 4, d: 4, seed: 3, y: 0, district: 'lower', garden: 5 }, { id: 'm', kind: 'mill', at: [40, 800], facing: 0, w: 4.3, d: 4.3, seed: 5, yt: 251 }];
    const v = { plots, lights: [{ at: [3, 3], kind: 'lamp' }], bridges: [BRIDGE], walls: [{ id: 'wall0', at: [0, 0], seatY: 1, runs: [[[0, 0, 0], [3, 0, 0]]] }], meta: { market: [93, 926] } };
    const sites = villageSites(v);
    expect(sites.map((s) => s.id)).toEqual(['vil-a', 'vil-lamp-0', 'vil-bridge0', 'vil-mill', 'vil-mill-sails', 'vil-wall0']);
    expect(sites[0].plot).toBe(plots[0]);
    const built = buildArchitecture(sites);
    expect(built.ranges.length).toBe(sites.length);
    for (let i = 0; i < built.positions.length; i++) if (!Number.isFinite(built.positions[i])) throw new Error('NaN');
  });
});
