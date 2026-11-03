import { describe, it, expect } from 'vitest';
import { buildArchitecture } from '../src/world/architecture.js';
import { listenerSites, LISTENER } from '../src/world/listener.js';
import { aimAt, LISTEN } from '../src/systems/listener.js';
import { PILLARS, HALL, buildCity } from '../src/world/ebbhold.js';

describe('the Listener', () => {
  it('builds its plinth and its two ears', () => {
    const sites = listenerSites();
    expect(sites.filter((s) => s.prop).map((s) => s.kind).sort()).toEqual(['earL', 'earR']);
    expect(buildArchitecture(sites).indices.length).toBeGreaterThan(1000);
  });
  it('stands in the open well: clear of the causeway, the pillars and the galleries; its head seen over the causeway\'s edge', () => {
    expect(LISTENER.z - 7).toBeGreaterThan(6);   // its body (≈7 m about) clear of the causeway's edge
    expect(LISTENER.z + 7).toBeLessThan(33);     // and of the walk gallery
    // From an eye at the rail (z 5.8, 1.6 m up), the line to its head (about 6.5 m in front of it, 31 m above its feet) clears the slab's edge (z 6, y 0).
    const hz = LISTENER.z - 6.5, hy = LISTENER.base + 31, t = (6 - 5.8) / (hz - 5.8);
    expect(1.6 + (hy - 1.6) * t).toBeGreaterThan(0);
    for (const px of PILLARS.x) expect(Math.hypot(LISTENER.x - px, LISTENER.z - PILLARS.z) - PILLARS.s / 2).toBeGreaterThan(11);
    expect(Math.abs(LISTENER.base + 0.88 * 20 - HALL.water)).toBeLessThan(1.5);
  });
  it('turns its head toward a sound, within what a neck can do', () => {
    const out = [0, 0];
    // Facing -z (yaw π): a sound straight ahead and level → no turn; to its left (+x seen from behind? its left is +x) → turned.
    aimAt(0, 0, 0, Math.PI, 0, 0, -10, out); expect(Math.abs(out[0])).toBeLessThan(1e-9); expect(Math.abs(out[1])).toBeLessThan(1e-9);
    aimAt(0, 0, 0, Math.PI, 10, 0, 0, out); expect(Math.abs(out[0])).toBeCloseTo(LISTEN.yawMax, 6);
    aimAt(0, 0, 0, Math.PI, 0, 40, -10, out); expect(out[1]).toBeCloseTo(-LISTEN.pitchUp, 6);   // far above: up, as far as it goes
  });
  it('has the strand\'s light in the water between its hands', () => {
    const c = buildCity(), hx = LISTENER.x, hz = LISTENER.z - 7;
    expect(c.glows.some(([x, y, z]) => Math.hypot(x - hx, z - hz) < 1.5 && Math.abs(y - HALL.water) < 2)).toBe(true);
  });
});
