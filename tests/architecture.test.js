import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { frostSites, buildArchitecture, MAT } from '../src/world/architecture.js';
import { createSolids } from '../src/world/solids.js';

const pois = JSON.parse(fs.readFileSync('data/world/pois.json', 'utf8')).pois;
const places = JSON.parse(fs.readFileSync('data/quests/frost.json', 'utf8')).places;
const table = {};
for (const p of pois) table[p.id] = p;
for (const id in places) table[id] = places[id];

describe('Shaper architecture', () => {
  const sites = frostSites(table);
  const built = buildArchitecture(sites);
  it('builds every frost site into one indexed mesh with outward normals', () => {
    expect(sites.filter((s) => !s.prop).length).toBe(9);
    expect(sites.length).toBeLessThanOrEqual(16); // ARCH_SITES
    const n = built.positions.length / 3;
    expect(built.indices.length % 3).toBe(0);
    expect(Math.max(...built.indices)).toBeLessThan(n);
    expect(n).toBeLessThan(60000);
    for (let i = 0; i < n; i++) expect(Number.isFinite(built.positions[i * 3 + 1])).toBe(true);
    // Box tops face up: the first face written is the monastery plinth's top.
    expect(built.normals[1]).toBeCloseTo(1, 5);
    const mats = new Set(); for (let i = 0; i < n; i++) mats.add(built.info[i * 4 + 1]);
    for (const m of [MAT.STONE, MAT.GLYPH, MAT.CANVAS, MAT.WOOD, MAT.ICE, MAT.EMBER, MAT.METAL]) expect(mats.has(m)).toBe(true);
  });
  it('blocks walls and columns, and stands the capsule on platforms', () => {
    const solids = createSolids(sites, built);
    solids.sites[0].seat = 100;
    const m = sites[0].at;
    solids.cull(m[0], m[1]);
    // On the plinth: the floor is its top, above lower terrain.
    expect(solids.floor(m[0] + 1, m[1] + 1, 99)).toBeCloseTo(100.35, 5);
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
});
