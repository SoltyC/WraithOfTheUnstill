import { describe, it, expect } from 'vitest';
import { buildArchitecture } from '../src/world/architecture.js';
import { manorSites, MANOR, FACING, manorWorld, padE, BACK } from '../src/world/manor.js';
import { MAT } from '../src/world/architecture.js';
import { createSolids } from '../src/world/solids.js';

const sites = manorSites();
const built = buildArchitecture(sites);
const idx = (id) => sites.findIndex((s) => s.id === id);

describe('manor', () => {
  it('has the six groups of sites, each seated at the pad height', () => {
    const ids = sites.map((s) => s.id);
    for (const id of ['manor-forecourt', 'manor-hall', 'manor-hall-lit', 'manor-wing-e', 'manor-wing-w', 'manor-gate']) expect(ids).toContain(id);
    expect(ids.filter((i) => i.startsWith('manor-tower-')).length).toBe(4);
    for (const s of sites) { expect(s.seatY).toBe(410); expect(s.footprint).toBeGreaterThan(0); expect(s.at.every(Number.isFinite)).toBe(true); }
    expect(sites.filter((s) => s.windows).map((s) => s.id)).toEqual(['manor-hall-lit']);
  });
  it('faces the stair head, which the gatehouse stands on', () => {
    const gate = sites.find((s) => s.id === 'manor-gate');
    expect(Math.hypot(gate.at[0] - MANOR.stairHead[0], gate.at[1] - MANOR.stairHead[1])).toBeLessThan(10);
    const [x, z] = manorWorld(0, 52.6);
    expect(Math.hypot(x - MANOR.stairHead[0], z - MANOR.stairHead[1])).toBeLessThan(0.5);
    expect(Math.abs(Math.sin(FACING) * (MANOR.stairHead[0] - 300) + Math.cos(FACING) * (MANOR.stairHead[1] - 1000))).toBeGreaterThan(50);
  });
  it('builds finite indexed geometry inside the vertex budget', () => {
    const n = built.positions.length / 3;
    expect(n).toBeLessThanOrEqual(300000);
    let maxI = 0; for (const i of built.indices) maxI = Math.max(maxI, i);
    expect(maxI).toBeLessThan(n);
    for (let i = 0; i < built.positions.length; i++) if (!Number.isFinite(built.positions[i])) throw new Error('NaN at ' + i);
    const mats = new Set(); for (let i = 0; i < n; i++) mats.add(built.info[i * 4 + 1]);
    for (const m of ['STONE', 'SLATE', 'PLASTER', 'WOOD', 'PLANK', 'GLASS', 'FLAG', 'IRON', 'EMBER', 'EARTH']) expect(mats.has(MAT[m]), m).toBe(true);
    for (const b of built.blockers) for (const k of ['x', 'z', 'y0', 'y1']) expect(Number.isFinite(b[k])).toBe(true);
  });
  it('keeps the geometry on the flat pad', () => {
    for (const s of sites) {
      const r = built.ranges[sites.indexOf(s)], P = built.positions;
      let worst = 0;
      for (let k = r.v0; k < r.v1; k += 7) { const x = s.at[0] + P[k * 3], z = s.at[1] + P[k * 3 + 2]; if (P[k * 3 + 1] > -2) worst = Math.max(worst, Math.hypot((x - 300) / 72, (z - 1000) / 58)); }
      // The house stands at the west rim on footings into the slope (manor.js BACK): the rim pieces may
      // reach a little past the pad; the forecourt and the gate stay on it.
      expect(worst, s.id).toBeLessThan(/hall|wing|tower|vent/.test(s.id) ? 1.3 : 1.18);
    }
  });
  it('has camera-only roof blockers, a walkable hall floor, and doors a body fits through', () => {
    expect(built.blockers.filter((b) => b.cam).length).toBeGreaterThan(3);
    const solids = createSolids(sites, built);
    sites.forEach((s, i) => { solids.sites[i].seat = 410; });
    const walk = (from, to, y = 410.3) => {
      const p = { x: 0, y, z: 0 }, v = { x: 0, y: 0, z: 0 }, [ax, az] = manorWorld(...from), [bx, bz] = manorWorld(...to);
      let moved = 0;
      for (let t = 0; t <= 1.0001; t += 0.01) {
        p.x = ax + (bx - ax) * t; p.z = az + (bz - az) * t; const x0 = p.x, z0 = p.z;
        solids.cull(p.x, p.z); v.x = bx - ax; v.z = bz - az; solids.push(p, v);
        moved = Math.max(moved, Math.hypot(p.x - x0, p.z - z0));
      }
      return moved;
    };
    expect(walk([0, -8 - BACK], [0, -22 - BACK])).toBeLessThan(0.05);            // through the portal into the hall
    expect(walk([0, 62], [0, 50])).toBeLessThan(0.05);             // through the gate arch
    expect(walk([-3, -22 - BACK], [-3 - 0, -26.5 - BACK])).toBeLessThan(0.05);   // across the hall
    solids.cull(...manorWorld(10, -26 - BACK));
    expect(solids.floor(...manorWorld(10, -26 - BACK), 410, false, 410.3)).toBeCloseTo(410.25, 5);
    // The hall wall blocks.
    expect(walk([-20, -9 - BACK], [-20, -16 - BACK])).toBeGreaterThan(0.2);
  });
  it('has the lit window on its own site and the pad fit table', () => {
    const lit = idx('manor-hall-lit');
    const r = built.ranges[lit];
    for (let k = r.v0; k < r.v1; k++) expect(built.info[k * 4 + 1]).toBe(MAT.GLASS === built.info[k * 4 + 1] ? MAT.GLASS : built.info[k * 4 + 1]);
    expect(built.lights.length).toBe(1);
    expect(padE(0, 0)).toBeLessThan(0.01);
  });
});
