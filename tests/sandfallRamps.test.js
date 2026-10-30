import { describe, it, expect } from 'vitest';
import { rampGeometry } from '../src/render/sandfalls.js';
import { createSolids } from '../src/world/solids.js';

// Two tiers of one cascade: lips at 120 and 132 over treads at ~107 and ~120 (the fall's recorded foot is 1.6 m up its riser).
const falls = [[1437.5, 119.95, 922.7, 1, 0.1, 108.6, 0.5, 3], [1425.8, 132, 923.1, 1, 0.2, 121.5, 0.5, 3]];

describe('frozen sandfall ramps', () => {
  it('a ramp and a landing per fall, deterministic, indices in range', () => {
    const a = rampGeometry(falls), b = rampGeometry(falls);
    expect(a.pos).toEqual(b.pos);
    expect(a.ramps.length).toBe(4);
    const n = a.pos.length / 3;
    expect(a.attr.length).toBe(n * 3);
    expect(a.idx.reduce((m, v) => Math.max(m, v), 0)).toBeLessThan(n);
    const [r, l] = a.ramps;
    expect(r[4]).toBeCloseTo(107, 0);                 // foot on the tread
    expect(r[5]).toBeGreaterThan(119.95);              // top over the wall's
    expect((r[5] - r[4]) / r[7]).toBeLessThanOrEqual(0.45);   // steps the feet can take
    expect(l[4]).toBe(r[5]); expect(l[5]).toBe(r[5]);  // the landing is flat at the top
  });
  it('the stepped floor carries the feet from the tread to the top, only while on', () => {
    const so = createSolids([], { blockers: [], platforms: [] });
    const { ramps } = rampGeometry(falls);
    const rp = so.ramps; rp.n = ramps.length;
    ramps.forEach((r, k) => { [rp.x0[k], rp.z0[k], rp.x1[k], rp.z1[k], rp.y0[k], rp.y1[k], rp.hw[k], rp.steps[k]] = r; rp.on[k] = 1; });
    const [x0, z0, x1, z1] = ramps[0];
    let feet = 107.1;
    for (let t = 0; t <= 1.0001; t += 0.01) feet = so.floor(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, 107.1, false, feet);
    expect(feet).toBeCloseTo(ramps[0][5], 3);
    // From the foot a jump to the top is refused (a step at a time).
    expect(so.floor(x1, z1, 107.1, false, 107.1)).toBe(107.1);
    rp.on.fill(0);
    expect(so.floor(x0 + (x1 - x0) * 0.5, z0 + (z1 - z0) * 0.5, 107.1, false, 200)).toBe(107.1);
  });
});
