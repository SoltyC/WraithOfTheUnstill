import { describe, it, expect } from 'vitest';
import { weaponFinds } from '../src/game/weapons/finds.js';
import { weaponDefs, weaponList } from '../src/game/weapons/defs.js';
import { buildArchitecture } from '../src/world/architecture.js';
import { bellLedgeSites, bellLedgeHollow, LEDGE } from '../src/world/bellLedge.js';
import { checkEntries, ENTRIES, GROUPS } from '../src/game/remembrance.js';
import { buildWeaponMesh } from '../src/render/weaponGeo.js';
import { SLOT } from '../src/render/weaponBuilder.js';
import { WEAPON_SLOTS } from '../src/shaders/weapon.wgsl.js';
import { ARCH_SITES } from '../src/shaders/architecture.wgsl.js';
import { NOOKS } from '../src/game/nooks.js';
import pois from '../data/world/pois.json';
import spots from '../data/photo-spots.json';

const table = Object.fromEntries(pois.pois.map((p) => [p.id, p]));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('the Bell Ledge', () => {
  const [site] = bellLedgeSites(table), find = weaponFinds.find((f) => f.id === 'mace');
  it('stands behind the monastery, in sight of its yard, with the mace hung in its bell', () => {
    expect(site.id).toBe('bell-ledge');
    expect(dist(site.at, table.monastery.pos)).toBeCloseTo(LEDGE.back, 0);
    expect(find.site).toBe('bell-ledge'); expect(find.lift).toBe(LEDGE.top);
    expect(dist(find.at, site.at)).toBeLessThan(2);                 // the bell hangs over the frame, not off in the snow
    expect(find.visible).toBe(true);                                // the lock is seen before the key
    expect(find.gale).toBe(true);                                   // needs Gale
    expect(find.needs).toBeUndefined();
    expect(weaponDefs[find.id]).toBe(weaponDefs.mace);
  });
  it('builds without NaN; its only walkable top is the ledge, 9.5 m up, and it has walls to the ground', () => {
    const built = buildArchitecture([site]);
    for (const v of built.positions) expect(Number.isFinite(v)).toBe(true);
    const tops = built.platforms.map((p) => p.top);
    expect(Math.max(...tops)).toBeCloseTo(LEDGE.top, 5);
    expect(tops.filter((t) => t > 0.5)).toEqual([LEDGE.top]);       // no stair of ledges to climb: one top
    const wall = built.blockers.filter((b) => b.kind === 'box').sort((a, b) => a.y0 - b.y0);
    expect(wall[0].y0).toBeLessThan(0);                              // walls from the foundations ...
    let top = wall[0].y1;
    for (const b of wall) if (b.y0 <= top + 1e-6 && b.y1 < LEDGE.top + 0.01) top = Math.max(top, b.y1);
    expect(top).toBeCloseTo(LEDGE.top, 5);                           // ... stacked without a gap to the ledge
    expect(built.positions.length / 3).toBeLessThan(60000);
  });
  it('is a place two sleeping hounds lie below, within reach of an Updraft cast from the hollow', () => {
    const h = bellLedgeHollow(site);
    expect(h.hounds.length).toBe(2);
    for (const p of h.hounds) { expect(dist(p, site.at)).toBeGreaterThan(8); expect(dist(p, site.at)).toBeLessThan(14); }
    expect(dist(h.foot, site.at)).toBeLessThan(7);
  });
  it('fits the shader site table and keeps clear of the maul\'s find and the nooks', () => {
    expect(ARCH_SITES).toBeGreaterThanOrEqual(403 + NOOKS.length);
    expect(dist(find.at, weaponFinds.find((f) => f.id === 'maul').at)).toBeGreaterThan(20);
    for (const n of NOOKS) expect(dist(n.pos, site.at)).toBeGreaterThan(20);
  });
  it('is remembered once the mace is taken: rem:bell-ledge, "The bell that fell to ring"', () => {
    expect(checkEntries(ENTRIES, GROUPS)).toEqual([]);
    const e = ENTRIES.find((x) => x.id === 'bell-ledge');
    expect(e.has).toBe('nook:bell-ledge'); expect(e.title.toLowerCase()).toContain('bell that fell to ring');
  });
});

describe('the Bell-mace as a weapon in the game', () => {
  it('is the sixth family, with its own mesh slots (hand and the ledge\'s great bell) inside the shader\'s table', () => {
    expect(weaponList.length).toBe(6);
    expect(weaponList[5].id).toBe('mace');
    expect(SLOT.MACE).toBeLessThan(WEAPON_SLOTS); expect(SLOT.MACE_FIND).toBeLessThan(WEAPON_SLOTS); expect(SLOT.COUNT).toBeLessThanOrEqual(WEAPON_SLOTS);
    const d = buildWeaponMesh(), slots = new Set();
    for (let i = 0; i < d.info.length; i += 4) slots.add(d.info[i]);
    expect(slots.has(SLOT.MACE)).toBe(true); expect(slots.has(SLOT.MACE_FIND)).toBe(true);
    // The bell's glowing material (7) is only on the mace and its great bell.
    for (let i = 0; i < d.info.length; i += 4) if (d.info[i + 1] === 7 || d.info[i + 1] === 8) expect([SLOT.MACE, SLOT.MACE_FIND]).toContain(d.info[i]);
  });
  it('has photo spots for the ledge, the take, the glow at three heights, the toll, the dunk and the star', () => {
    const ids = spots.spots.map((s) => s.id).filter((id) => id.startsWith('p9w-mace-'));
    expect(ids.sort()).toEqual(['p9w-mace-dunk', 'p9w-mace-glow-10', 'p9w-mace-glow-18', 'p9w-mace-glow-4', 'p9w-mace-ledge', 'p9w-mace-star', 'p9w-mace-take', 'p9w-mace-toll']);
  });
});
