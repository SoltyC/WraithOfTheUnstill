import { describe, it, expect } from 'vitest';
import { weaponFinds } from '../src/game/weapons/finds.js';
import { weaponDefs } from '../src/game/weapons/defs.js';
import pois from '../data/world/pois.json';

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
});
