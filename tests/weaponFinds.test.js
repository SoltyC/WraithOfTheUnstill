import { describe, it, expect } from 'vitest';
import { weaponFinds } from '../src/game/weapons/finds.js';
import { weaponDefs } from '../src/game/weapons/defs.js';
import pois from '../data/world/pois.json';
import frost from '../data/quests/frost.json';
import side from '../data/quests/meadow-side.json';

const poi = (id) => pois.pois.find((p) => p.id === id).pos;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('weapon finds', () => {
  it('names a real weapon each, once', () => {
    const ids = weaponFinds.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of weaponFinds) expect(weaponDefs[f.id]).toBeTruthy();
  });
  it('places the sickles in the meadow near Hearn and the maul by the monastery', () => {
    const s = weaponFinds.find((f) => f.id === 'sickles'), m = weaponFinds.find((f) => f.id === 'maul');
    expect(dist(s.at, poi('hub'))).toBeLessThan(150);
    expect(dist(m.at, poi('monastery'))).toBeLessThan(80);
  });
  it('places the glaive in the Ring of Nine and the flail by Isolde\'s fire, each behind its quest', () => {
    const g = weaponFinds.find((f) => f.id === 'glaive'), l = weaponFinds.find((f) => f.id === 'flail');
    expect(dist(g.at, side.places['side-stone-ring'].pos)).toBeLessThan(9);              // inside the ring of stones (r = 9)
    expect(dist(l.at, poi('camp-frost'))).toBeLessThan(15);
    expect(g.needs).toBe('meadow:side-stone-thanked'); expect(l.needs).toBe('isolde-sang');
    // The flags are real: the quests set them.
    expect(JSON.stringify(side)).toContain('"meadow:side-stone-thanked"');
    expect(JSON.stringify(frost)).toContain('"isolde-sang"');
  });
  it('seats every find in a slot of its own, and only the quest rewards wait for a flag', () => {
    const slots = weaponFinds.map((f) => f.slot);
    expect(new Set(slots).size).toBe(slots.length);
    expect(weaponFinds.filter((f) => f.needs).map((f) => f.id).sort()).toEqual(['flail', 'glaive']);
  });
  it('lays the finds clear of each other (no two within 20 m)', () => {
    for (let a = 0; a < weaponFinds.length; a++) for (let b = a + 1; b < weaponFinds.length; b++) expect(dist(weaponFinds[a].at, weaponFinds[b].at)).toBeGreaterThan(20);
  });
});
