import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { frostSites, meadowSites, buildArchitecture, MAT, HUB } from '../src/world/architecture.js';
import { ARCH_SITES } from '../src/shaders/architecture.wgsl.js';
import { createSolids } from '../src/world/solids.js';

const baked = JSON.parse(fs.readFileSync('data/world/pois.json', 'utf8'));
const table = {};
for (const p of baked.pois) table[p.id] = p;

describe('Shaper architecture', () => {
  const sites = frostSites(table, baked.routes);
  const built = buildArchitecture(sites);
  it('builds every frost site into one indexed mesh with unit normals', () => {
    const ids = sites.filter((s) => !s.prop).map((s) => s.id);
    // monastery, camp, spring, watching stone, den; 5 shrines; 6 Echo stones; 3 verb stones; 3 braziers; 9 gates.
    expect(ids.length).toBe(5 + 5 + 6 + 3 + 3 + 9 + 6 + 16);   // … + the arena's pillars and cover walls
    expect(new Set(ids).size).toBe(ids.length);
    for (let k = 1; k <= 9; k++) expect(ids).toContain('run-gate-' + k);
    expect(sites.length).toBeLessThanOrEqual(64); // ARCH_SITES
    const n = built.positions.length / 3;
    expect(built.indices.length % 3).toBe(0);
    let maxI = 0; for (let i = 0; i < built.indices.length; i++) if (built.indices[i] > maxI) maxI = built.indices[i];
    expect(maxI).toBeLessThan(n);
    // Laid masonry (world/masonry.js): block by block, but bounded (one static draw, PERF.md).
    expect(n).toBeLessThan(700000);
    for (let i = 0; i < n; i++) expect(Number.isFinite(built.positions[i * 3 + 1])).toBe(true);
    // Normals are unit length (the shader faces them to the viewer; materials are double-sided).
    for (let i = 0; i < n; i += 97) expect(Math.hypot(built.normals[i * 3], built.normals[i * 3 + 1], built.normals[i * 3 + 2])).toBeCloseTo(1, 4);
    const mats = new Set(); for (let i = 0; i < n; i++) mats.add(built.info[i * 4 + 1]);
    for (const m of [MAT.STONE, MAT.GLYPH, MAT.CANVAS, MAT.WOOD, MAT.ICE, MAT.EMBER, MAT.METAL]) expect(mats.has(m)).toBe(true);
  });
  it('blocks walls and columns, and stands the capsule on platforms', () => {
    const solids = createSolids(sites, built);
    solids.sites[0].seat = 100;
    const m = sites[0].at;
    solids.cull(m[0], m[1]);
    // On the plinth: the floor is its top, above lower terrain.
    expect(solids.floor(m[0] + 1, m[1] + 1, 99, false, 100.2)).toBeCloseTo(100.35, 5);
    // A top far above the feet (walking at the citadel's foot) is not stood on.
    expect(solids.floor(m[0] + 1, m[1] + 1, 60, false, 60)).toBe(60);
    // On the platform over a 40 m drop (the citadel's edge): still its top.
    expect(solids.floor(m[0] + 14, m[1] + 1, 60, false, 100.35)).toBeCloseTo(100.35, 5);
    // Walk into the hall's back wall from inside: pushed back out.
    const f = sites[0].facing, fx = Math.sin(f), fz = Math.cos(f);
    const rx = Math.cos(f), rz = -Math.sin(f);
    const p = { x: m[0] - fx * 4.8 - rx * 4, y: 100.35, z: m[1] - fz * 4.8 - rz * 4 }, v = { x: -fx, y: 0, z: -fz };
    solids.push(p, v);
    const back = -((p.x - m[0]) * fx + (p.z - m[1]) * fz); // (beside the bier, clear of it)
    expect(back).toBeLessThan(4.6 - 0.37);
    expect(v.x * -fx + v.z * -fz).toBeLessThanOrEqual(1e-9);
    // Unknown seat: nothing collides.
    solids.sites[0].seat = NaN; solids.cull(m[0], m[1]);
    expect(solids.floor(m[0], m[1], 5)).toBe(5);
  });
  it('returns point lights: the monastery hall has a brazier, four candles and the moon bounce', () => {
    expect(Array.isArray(built.lights)).toBe(true);
    const mi = sites.findIndex((s) => s.id === 'monastery');
    const ls = built.lights.filter((l) => l.site === mi);
    expect(ls.length).toBe(6);
    const kinds = (k) => ls.filter((l) => l.kind === k).length;
    expect([kinds('fire'), kinds('candle'), kinds('bounce')]).toEqual([1, 4, 1]);
    for (const l of ls) {
      expect(l.radius).toBeGreaterThan(0);
      expect(l.intensity).toBeGreaterThan(0);
      expect(l.color.length).toBe(3);
      expect(Math.hypot(l.x, l.z)).toBeLessThan(9);
      expect(l.y).toBeGreaterThan(0.35);
    }
  });
  it('builds deterministically', () => {
    const again = buildArchitecture(frostSites(table, baked.routes));
    expect(again.positions.length).toBe(built.positions.length);
    expect(Array.from(again.positions)).toEqual(Array.from(built.positions));
    expect(again.lights).toEqual(built.lights);
  });
  it('leaves the frost sites exactly as they were when the meadow hub is added', () => {
    // Snapshot taken before the hub existed: counts and a position checksum of the frost build.
    let sum = 0; for (let i = 0; i < built.positions.length; i++) sum += built.positions[i] * ((i % 7) + 1);
    let isum = 0; for (let i = 0; i < built.indices.length; i++) isum = (isum + built.indices[i] * ((i % 5) + 1)) % 1000003;
    expect([sites.length, built.positions.length / 3, built.indices.length, built.blockers.length, built.platforms.length, built.lights.length]).toEqual([58, 517471, 752553, 217, 13, 6]);
    expect(sum).toBeCloseTo(-8679120.897, 2);
    expect(isum).toBe(477281);
    // The frost sites come first in a combined list, so every frost index (and its dice) stays put.
    const all = [...sites, ...meadowSites()], again = buildArchitecture(all);
    expect(Array.from(again.positions.subarray(0, built.positions.length))).toEqual(Array.from(built.positions));
  });
});

describe('The meadow hub', () => {
  const frost = frostSites(table, baked.routes), hub = meadowSites(), all = [...frost, ...hub];
  const built = buildArchitecture(all), first = frost.length;
  it('has houses, a mill with separate sails, a market, a shrine and a green, all prefixed hub-', () => {
    const ids = hub.map((s) => s.id);
    expect(ids.every((i) => i.startsWith('hub-'))).toBe(true);
    for (const id of ['hub-green', 'hub-house-1', 'hub-house-2', 'hub-house-3', 'hub-house-4', 'hub-mill', 'hub-mill-sails', 'hub-market', 'hub-shrine']) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of hub) { expect(s.at.every(Number.isFinite)).toBe(true); expect(Number.isFinite(s.facing)).toBe(true); expect(typeof s.build).toBe('function'); expect(s.footprint).toBeGreaterThan(0); expect(s.seatAt).toBe(/^hub-(house|mill)$/.test(s.id.replace(/-\d+$/, '')) ? 'top' : 'center'); }
    // The sails turn about the axle: the site origin, lifted to the axle height, on the upwind side of the tower.
    const sails = hub.find((s) => s.id === 'hub-mill-sails'), mill = hub.find((s) => s.id === 'hub-mill');
    expect(sails.lift).toBe(HUB.axleLift);
    expect(Math.hypot(sails.at[0] - mill.at[0], sails.at[1] - mill.at[1])).toBeCloseTo(HUB.axleBack, 5);
    expect(sails.spin[0] * (mill.at[0] - sails.at[0]) + sails.spin[2] * (mill.at[1] - sails.at[1])).toBeGreaterThan(3);
  });
  it('stays within the shader\'s site limit', () => {
    expect(all.length).toBeLessThanOrEqual(ARCH_SITES);
    expect(all.length).toBe(67);
  });
  it('builds without NaN, indexed, with unit normals, and bounded', () => {
    const n = built.positions.length / 3;
    const first_vertex = () => { let i = 0; while (built.info[i * 4] < first) i++; return i; };   // hub sites come last, in order
    let bad = 0;
    for (let i = 0; i < built.positions.length; i++) if (!Number.isFinite(built.positions[i]) || !Number.isFinite(built.normals[i])) bad++;
    expect(bad).toBe(0);
    let maxI = 0; for (let i = 0; i < built.indices.length; i++) if (built.indices[i] > maxI) maxI = built.indices[i];
    expect(maxI).toBeLessThan(n);
    expect(n).toBeLessThan(700000);
    let hubVerts = 0; const perSite = new Array(hub.length).fill(0);
    for (let i = 0; i < n; i++) { const s = built.info[i * 4]; if (s >= first) { hubVerts++; perSite[s - first]++; } }
    expect(hubVerts).toBeLessThan(120000);
    for (const c of perSite) expect(c).toBeGreaterThan(500);
    let nonUnit = 0; for (let i = first_vertex(); i < n; i++) if (Math.abs(Math.hypot(built.normals[i * 3], built.normals[i * 3 + 1], built.normals[i * 3 + 2]) - 1) > 1e-3) nonUnit++;
    expect(nonUnit).toBe(0);
    // No ice, and no snow but the one pillow hidden under the mill's cap (columnDrums lays it on any tower top).
    let snow = 0, ice = 0, snowElsewhere = 0; const millIdx = first + hub.findIndex((s) => s.id === 'hub-mill');
    for (let i = first_vertex(); i < n; i++) { const m = built.info[i * 4 + 1]; if (m === MAT.ICE) ice++; if (m === 7) { snow++; if (built.info[i * 4] !== millIdx) snowElsewhere++; } }
    expect(ice).toBe(0); expect(snowElsewhere).toBe(0);
    expect(snow).toBeLessThan(100);
  });
  it('lights the hamlet: at least four lamps and a hearth fire, all near their sites', () => {
    const ls = built.lights.filter((l) => l.site >= first);
    const kinds = (k) => ls.filter((l) => l.kind === k).length;
    expect(kinds('lamp')).toBeGreaterThanOrEqual(4);
    expect(kinds('fire')).toBe(1);
    const fire = ls.find((l) => l.kind === 'fire');
    expect(hub[fire.site - first].id).toBe('hub-green');
    expect(fire.y).toBeGreaterThan(0.3);
    for (const l of ls) { expect(l.radius).toBeGreaterThan(0); expect(l.intensity).toBeGreaterThan(0); expect(l.color.length).toBe(3); expect(Math.hypot(l.x, l.z)).toBeLessThan(40); expect(l.y).toBeGreaterThan(0.3); }
    // Fires drawn at once are limited to 8 slots: the camp, four braziers, the hall and the hearth.
    expect(1 + 4 + built.lights.filter((l) => l.kind === 'fire').length).toBeLessThanOrEqual(8);
    // The hearth's coals and lamp embers exist.
    let ember = 0; for (let i = 0; i < built.positions.length / 3; i++) if (built.info[i * 4] === first && built.info[i * 4 + 1] === MAT.EMBER) ember++;
    expect(ember).toBeGreaterThan(0);
  });
  it('blocks walls and the tower, leaves the market open to walk through', () => {
    const bl = (id) => built.blockers.filter((b) => b.site === first + hub.findIndex((s) => s.id === id));
    expect(bl('hub-mill').some((b) => b.kind === 'circle' && b.r > 3)).toBe(true);
    expect(bl('hub-house-1').length).toBeGreaterThanOrEqual(8);
    expect(bl('hub-mill-sails').length).toBe(0);
    // The door gap: no blocker covers the doorway of a house (local forward = its facing).
    const h = hub.find((s) => s.id === 'hub-house-1'), i1 = first + hub.indexOf(h);
    const fx = Math.sin(h.facing), fz = Math.cos(h.facing);
    for (const b of built.blockers.filter((b) => b.site === i1 && b.kind === 'box' && b.y1 > 1.5)) {
      const dx = fx * 2.5 - b.x, dz = fz * 2.5 - b.z, lx = dx * b.cos - dz * b.sin, lz = dx * b.sin + dz * b.cos;
      expect(Math.abs(lx) < b.hx && Math.abs(lz) < b.hz && b.y1 - b.y0 > 3 && b.y0 < 0).toBe(false);
    }
    const floors = built.platforms.filter((p) => p.site === i1);
    expect(floors.length).toBe(1);
  });
  it('builds deterministically', () => {
    const again = buildArchitecture([...frostSites(table, baked.routes), ...meadowSites()]);
    expect(Array.from(again.positions)).toEqual(Array.from(built.positions));
    expect(again.lights).toEqual(built.lights);
  });
});
