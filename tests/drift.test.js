import { describe, it, expect } from 'vitest';
import { placeRobes, robeTemplate, ROBES } from '../src/game/drift.js';
import { SOUNDING } from '../src/world/sounding.js';

describe('the robes on the Sounding', () => {
  it('are thousands, inside the pit, never overlapping, the same every time', () => {
    const P = placeRobes();
    expect(P.length).toBe(ROBES.count);
    for (const p of P) expect(Math.hypot(p.x - SOUNDING.x, p.z - SOUNDING.z)).toBeLessThan(SOUNDING.r);
    const near = P.filter((p) => p.near);
    expect(near.length).toBeGreaterThan(100);
    for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) expect(Math.hypot(near[i].x - near[j].x, near[i].z - near[j].z)).toBeGreaterThanOrEqual(ROBES.spacing - 1e-9);
    expect(JSON.stringify(placeRobes().slice(0, 5))).toBe(JSON.stringify(P.slice(0, 5)));
  });
  it('lie face down with the sleeves spread wider than the body', () => {
    const t = robeTemplate(1), xs = [];
    for (let i = 0; i < t.pos.length; i += 3) xs.push(Math.abs(t.pos[i]));
    expect(Math.max(...xs)).toBeGreaterThan(0.7);
    expect(robeTemplate(0).idx.length).toBeLessThan(t.idx.length / 8);
  });
});
