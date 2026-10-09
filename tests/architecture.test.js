import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { frostSites, buildArchitecture, MAT } from '../src/world/architecture.js';
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
});
