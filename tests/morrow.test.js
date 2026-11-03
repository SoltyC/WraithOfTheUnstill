import { describe, it, expect } from 'vitest';
import { addMorrowSystem } from '../src/systems/morrow.js';
import { GASH, SLUMP, soundingSites } from '../src/world/jetty.js';

// A stand-in NPC API: the figure and its view, nothing drawn.
function boot() {
  const npc = { xf: { ox: 0, oy: 0, oz: 0, s: 1 }, view: { wraith: { performance: null } } };
  const g = { npcApi: { make: () => npc, put: (n, x, z) => { n.x = x; n.z = z; } } };
  return { m: addMorrowSystem(g), npc };
}

describe('Morrow and the knife', () => {
  it('keeps the gash shut until the opening stroke, opens it behind the blade during that slash, and leaves it open', () => {
    const { m, npc } = boot();
    m.show(true, undefined, null, 0.3); expect(npc.gash).toBe(0);
    m.show(true, undefined, null, 0.599); expect(npc.gash).toBe(0);
    const seen = [];
    for (let c = 0.6; c < 0.7; c += 0.002) { m.show(true, undefined, null, c); seen.push(npc.gash); }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(seen[0]).toBeLessThan(GASH); expect(seen.some((o) => o >= GASH && o < GASH + 1)).toBe(true); expect(seen.at(-1)).toBe(GASH + SLUMP - 1);
    m.show(true, undefined, null, 0.9); expect(npc.gash).toBe(GASH + SLUMP - 1);
  });
  it('shows exactly one bladder at every point of the cut, and the gash only once opened', () => {
    const props = soundingSites().filter((s) => s.show);
    for (const o of [0, 0.5, 3, GASH, GASH + 0.5, GASH + 1.2, GASH + 2.5, GASH + SLUMP - 1]) {
      expect(props.filter((p) => p.id.includes('bladder') && p.show(o)).length).toBe(1);
      expect(props.some((p) => p.id.includes('gash') && p.show(o))).toBe(o > 0);
    }
  });
  it('raises the knife well clear of the Lung on the way back, and presses it to the seam on the slash', () => {
    const { m, npc } = boot();
    m.show(true, undefined, null, 0.81); const slash = npc.view.wraith.performance.handT[4];
    m.show(true, undefined, null, 0.92); const back = npc.view.wraith.performance.handT[4];
    expect(back - slash).toBeGreaterThan(0.15);   // (both on the slumped bladder: a later stroke)
  });
});
