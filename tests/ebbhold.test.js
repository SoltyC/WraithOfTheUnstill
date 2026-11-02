import { describe, it, expect } from 'vitest';
import { buildCity, createEbbholdSolids, subtractHoles, EBB_ORIGIN, HALL } from '../src/world/ebbhold.js';

const O = EBB_ORIGIN;
const city = buildCity();
const S = createEbbholdSolids(city);
const floorAt = (x, z, ref) => { S.qx = x + O.x; S.qz = z + O.z; S.ref = ref + O.y; S.floorQ(); return S.h - O.y; };
const probe = (x, y, z) => { S.qx = x + O.x; S.qy = y + O.y; S.qz = z + O.z; return S.solidQ(); };
/** Does a body walking from a to b (local, at height y) get pushed back? */
function blocked(ax, az, bx, bz, y) {
  const p = { x: ax + O.x, y: y + O.y, z: az + O.z }, v = { x: 0, y: 0, z: 0 };
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1);
  for (let i = 1; i <= n; i++) {
    const tx = ax + (bx - ax) * i / n + O.x, tz = az + (bz - az) * i / n + O.z;
    p.x = tx; p.z = tz; S.push(p, v);
    if (Math.hypot(p.x - tx, p.z - tz) > 0.05) return true;
  }
  return false;
}

describe('Ebbhold, the Tide Hall', () => {
  it('is huge: one hall of 260 × 90 m and 190 m from its drowned floor to the roof', () => {
    expect(HALL.L).toBeGreaterThanOrEqual(240);
    expect(HALL.HW * 2).toBeGreaterThanOrEqual(80);
    expect(HALL.roof - HALL.floor).toBeGreaterThanOrEqual(180);
    const hall = city.airs.find((a) => a.id === 'tideHall');
    expect((hall.x1 - hall.x0) * (hall.z1 - hall.z0)).toBeGreaterThan(20000);
  });

  it('stands every spawn on a floor', () => {
    for (const [id, [x, y, z]] of Object.entries(city.spawns)) {
      if (id === 'well') continue;
      expect(floorAt(x, z, y), id).toBeCloseTo(y, 1);
    }
  });

  it('builds boxes with positive extents', () => {
    for (const b of city.boxes) { expect(b.x1 - b.x0, b.kind).toBeGreaterThan(0); expect(b.y1 - b.y0, b.kind).toBeGreaterThan(0); expect(b.z1 - b.z0, b.kind).toBeGreaterThan(0); }
  });

  it('subtracts holes from a face', () => {
    const r = subtractHoles(0, 10, 0, 5, [{ u0: 4, u1: 6, v0: 0, v1: 3 }]);
    expect(r.reduce((a, [u0, u1, v0, v1]) => a + (u1 - u0) * (v1 - v0), 0)).toBeCloseTo(44, 6);
  });

  it('climbs the long flights from tier to tier, under clear air', () => {
    // walk → g1 on the north wall: half way up, then at the top, level with the g1 gallery.
    expect(floorAt(56, 43, 11.8)).toBeCloseTo(12, 0);
    expect(floorAt(95.5, 43, 23.5)).toBeCloseTo(24, 0);
    // Nothing solid in the 2.5 m over the flight's line anywhere along it (the slab above is cut where it comes up).
    for (let x = 18; x < 96; x += 2) { const t = floorAt(x, 43, 30); expect(probe(x, t + 1.6, 43), `head room at x ${x}`).toBe(false); }
    expect(floorAt(200, -43, 34.5)).toBeCloseTo(34.8, 1);      // g1 → g2 on the south wall
  });

  it('joins the causeway to the galleries at the platform, and the galleries by the bridges', () => {
    expect(blocked(118, 0, 118, 40, 0)).toBe(false);        // platform → north walk gallery
    expect(blocked(118, 0, 118, -40, 0)).toBe(false);       // → south
    expect(blocked(62, 40, 62, -40, HALL.g1)).toBe(false);  // the west bridge at g1
    expect(blocked(60, 0, 60, 30, 0)).toBe(true);           // the causeway's rail elsewhere
    expect(blocked(80, 38, 80, 28, 0)).toBe(true);          // a gallery's rail
    expect(floorAt(62, 0, HALL.g1)).toBeCloseTo(HALL.g1, 5); // standing on the bridge over the causeway
  });

  it('runs from the undercroft up the intake into the gate and the hall', () => {
    expect(floorAt(-80, 4, -30)).toBeCloseTo(-30, 5);
    expect(blocked(-70, 0, -63.2, 0, -30)).toBe(false);     // the undercroft's east doorway
    expect(floorAt(-47, 0, -15.5)).toBeCloseTo(-15.9, 0);   // half way up the intake
    expect(floorAt(-20, 0, 0)).toBeCloseTo(0, 5);           // the vestibule
    for (let x = -62; x < -2; x += 0.5) expect(floorAt(x, 0, 0) > -100, `no hole at the top of the intake, x ${x}`).toBe(true);
    expect(blocked(-5, 0, 5, 0, 0)).toBe(false);            // the gate
    expect(floorAt(10, 0, 0)).toBeCloseTo(0, 5);            // the causeway
  });

  it('drops the void to the drowned floor, and gives every air its water', () => {
    expect(floorAt(60, 15, 0)).toBeCloseTo(HALL.floor, 5);   // off the causeway: the abyss
    const lv = (x, y, z) => { S.qx = x + O.x; S.qz = z + O.z; S.ref = y + O.y; S.levelQ(); return S.lv - O.y; };
    expect(lv(60, -60, 15)).toBeCloseTo(HALL.water, 5);
    expect(lv(-93, -33, -10)).toBeCloseTo(-30.3, 5);         // the undercroft's pool
    expect(Number.isNaN(lv(-20, 0, 0) + O.y)).toBe(true);    // the vestibule is dry
    expect(floorAt(250, -22, -20)).toBeLessThan(-10);        // the way up out of the water: the landing's flight
  });

  it('keeps the camera in the air, out of pillars and walls', () => {
    expect(probe(20, 10, 0)).toBe(false);
    expect(probe(40, 10, 23)).toBe(true);                    // a pillar
    expect(probe(20, 10, 46)).toBe(true);                    // the north wall
    expect(probe(20, 120, 0)).toBe(true);                    // above the roof
  });

  it('keeps lamps in the air and within the light grid\'s budget', () => {
    const all = [...city.lamps, ...city.glows];
    expect(all.length).toBeLessThan(512);
    for (const [x, y, z] of all) expect(city.airs.some((a) => x >= a.x0 - 1 && x <= a.x1 + 1 && z >= a.z0 - 1 && z <= a.z1 + 1 && y >= a.y0 - 3 && y <= a.y1), `lamp ${x},${y},${z}`).toBe(true);
  });
});
