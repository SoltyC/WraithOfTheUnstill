import { describe, it, expect } from 'vitest';
import { ROOMS, DOORS, FEATURES, LAMPS, WALL, EBB_ORIGIN, room, doorOpening, buildBoxes, createEbbholdSolids, subtractHoles } from '../src/world/ebbhold.js';

const O = EBB_ORIGIN;

describe('Ebbhold grey box', () => {
  it('puts every door in a wall the two rooms share, inside both', () => {
    for (const d of DOORS) {
      const A = room(d.a), B = room(d.b), o = doorOpening(d);
      expect(A && B, d.a + '–' + d.b).toBeTruthy();
      expect(o.w1 - o.w0, `${d.a}–${d.b} wall gap`).toBeCloseTo(WALL, 5);
      const [a0, a1, b0, b1] = o.axis === 'x' ? [A.z0, A.z1, B.z0, B.z1] : [A.x0, A.x1, B.x0, B.x1];
      expect(o.u0, `${d.a}–${d.b} opening start`).toBeGreaterThanOrEqual(Math.max(a0, b0));
      expect(o.u1, `${d.a}–${d.b} opening end`).toBeLessThanOrEqual(Math.min(a1, b1));
      expect(o.y1, `${d.a}–${d.b} under both ceilings`).toBeLessThanOrEqual(Math.min(A.y + A.h, B.y + B.h));
    }
  });

  it('reaches every room from the undercroft (the well by its hole)', () => {
    const seen = new Set(['undercroft']), q = ['undercroft'];
    while (q.length) { const r = q.shift(); for (const d of DOORS) for (const [x, y] of [[d.a, d.b], [d.b, d.a]]) if (x === r && !seen.has(y)) { seen.add(y); q.push(y); } }
    seen.add('greatWell');
    expect([...seen].sort()).toEqual(ROOMS.map((r) => r.id).sort());
  });

  it('has 8–12 rooms and a great hall', () => {
    expect(ROOMS.length).toBeGreaterThanOrEqual(9);
    expect(ROOMS.length).toBeLessThanOrEqual(13);
    expect(ROOMS.some((r) => r.id === 'tideHall' && r.x1 - r.x0 >= 50)).toBe(true);
  });

  it('keeps lamps and features inside their rooms', () => {
    for (const f of FEATURES) { const r = room(f.room); const x = f.x ?? f.x0, z = f.z ?? f.z0; if (x !== undefined) { expect(x, f.type).toBeGreaterThanOrEqual(r.x0 - 1); expect(x).toBeLessThanOrEqual(r.x1 + 1); expect(z).toBeGreaterThanOrEqual(r.z0 - 1); expect(z).toBeLessThanOrEqual(r.z1 + 1); } }
    for (const [x, y, z] of LAMPS) expect(ROOMS.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && y >= r.y && y <= r.y + r.h), `lamp ${x},${y},${z}`).toBe(true);
  });

  it('subtracts door holes from a wall', () => {
    const r = subtractHoles(0, 10, 0, 5, [{ u0: 4, u1: 6, v0: 0, v1: 3 }]);
    const area = r.reduce((a, [u0, u1, v0, v1]) => a + (u1 - u0) * (v1 - v0), 0);
    expect(area).toBeCloseTo(50 - 6, 6);
  });

  it('stands the body on each room floor, the stairs and the decks', () => {
    const S = createEbbholdSolids();
    const at = (x, z, ref) => { S.qx = x + O.x; S.qz = z + O.z; S.ref = ref + O.y; S.floorQ(); return S.h - O.y; };
    expect(at(20, 18, 0.2)).toBeCloseTo(0, 5);                // undercroft sand
    expect(at(8, 8, 0.2)).toBeCloseTo(-3, 5);                 // the pool's bed
    expect(at(51, 12, 3.2)).toBeCloseTo(3, 1);                // half way up the intake
    expect(at(82, 38, 11.5)).toBeGreaterThan(11);             // on the sweeper's stair
    expect(at(82, 51, 18)).toBeCloseTo(18, 5);                // the landing
    expect(at(162, 60, 10)).toBeCloseTo(-30, 5);              // over the great well: its floor
    expect(at(180, 30, 10)).toBeCloseTo(10, 5);               // the Tide Hall
  });

  it('pushes the body out of walls and columns and holds it under ceilings', () => {
    const S = createEbbholdSolids();
    const p = { x: O.x + 29.9, y: O.y, z: O.z + 5 }, v = { x: 2, y: 0, z: 0 };
    S.push(p, v);
    expect(p.x - O.x).toBeLessThanOrEqual(30 - 0.37);       // the undercroft's east wall (no door at z 5)
    expect(v.x).toBe(0);
    const q = { x: O.x + 30.5, y: O.y, z: O.z + 12 }, w = { x: 2, y: 0, z: 0 };
    S.push(q, w);
    expect(q.x - O.x).toBeCloseTo(30.5, 5);                  // through the door: nothing pushes
    const c = { x: O.x + 76, y: O.y + 6, z: O.z + 6 }, cv = { x: 0, y: 0, z: 0 };
    S.push(c, cv);
    expect(Math.hypot(c.x - O.x - 76, c.z - O.z - 6)).toBeGreaterThan(0.79); // a column
    const u = { x: O.x + 100, y: O.y + 6 + 7 - 1, z: O.z + 9 }, uv = { x: 0, y: 3, z: 0 };
    S.push(u, uv);
    expect(u.y - O.y + 1.75).toBeLessThanOrEqual(13 + 1e-6);  // the bakehouse ceiling
  });

  it('gives each room its water, and the pool its own', () => {
    const S = createEbbholdSolids();
    const lv = (x, z, ref) => { S.qx = x + O.x; S.qz = z + O.z; S.ref = ref + O.y; S.levelQ(); return S.lv - O.y; };
    expect(Number.isNaN(lv(20, 20, 0) + O.y)).toBe(true);
    expect(lv(8, 8, -3)).toBeCloseTo(-0.25, 5);
    expect(lv(102, 24, 6)).toBeCloseTo(7.1, 5);
    expect(lv(140, 11, 3)).toBeCloseTo(13, 5);
    expect(lv(162, 60, -20)).toBeCloseTo(11, 5);
  });

  it('lets the camera stay in the rooms', () => {
    const S = createEbbholdSolids();
    const probe = (x, y, z) => { S.qx = x + O.x; S.qy = y + O.y; S.qz = z + O.z; return S.solidQ(); };
    expect(probe(15, 3, 18)).toBe(false);    // undercroft air
    expect(probe(30.5, 2, 18)).toBe(true);   // in its wall
    expect(probe(30.5, 2, 12)).toBe(false);  // its door
    expect(probe(15, 12, 18)).toBe(true);    // above its ceiling
  });

  it('builds boxes with positive extents', () => {
    for (const b of buildBoxes()) { expect(b.x1 - b.x0).toBeGreaterThan(0); expect(b.z1 - b.z0).toBeGreaterThan(0); expect(b.y1 - b.y0).toBeGreaterThan(0); }
  });
});
