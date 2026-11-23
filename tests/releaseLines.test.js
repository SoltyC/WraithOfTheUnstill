import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createCurrents, CURRENT } from '../src/systems/releaseLines.js';

const data = JSON.parse(fs.readFileSync(new URL('../data/world/releaseLines.json', import.meta.url)));
const pois = JSON.parse(fs.readFileSync(new URL('../data/world/pois.json', import.meta.url))).pois;
const at = (id) => pois.find((p) => p.id === id).pos;

describe('The Melt (docs/direction.md M4)', () => {
  const melt = data.lines.find((l) => l.id === 'melt');
  it('runs from the frost Warden to the foot of the Bellwether\'s hill, downhill', () => {
    const a = melt.pts[0], b = melt.pts[melt.pts.length - 1], w = at('warden-frost'), m = at('warden-meadow');
    expect(Math.hypot(a[0] - w[0], a[1] - w[1])).toBeLessThan(180);   // (its head: the lip of the Warden's tarn)
    expect(Math.hypot(b[0] - m[0], b[1] - m[1])).toBeLessThan(180);
    expect(a[3] - b[3]).toBeGreaterThan(200);
    // No step climbs more than 3 m (water spills over a lip; it never climbs a hill).
    for (let k = 1; k < melt.pts.length; k++) expect(melt.pts[k][3] - melt.pts[k - 1][3]).toBeLessThan(3.5);
    expect(melt.after).toBe('frost');
  });
  it('carries downstream only while it runs, strongest in the middle', () => {
    let flow = 0;
    const cur = createCurrents(data.lines, () => flow);
    const [x0, z0] = melt.pts[20], [x1, z1] = melt.pts[21];
    cur.qx = (x0 + x1) / 2; cur.qz = (z0 + z1) / 2;
    expect(cur.query()).toBe(false);
    flow = 1;
    expect(cur.query()).toBe(true);
    expect(cur.a).toBeCloseTo(CURRENT.push, 0);
    const L = Math.hypot(x1 - x0, z1 - z0);
    expect(cur.fx * (x1 - x0) / L + cur.fz * (z1 - z0) / L).toBeGreaterThan(0.99);
    // Off to the side: nothing.
    cur.qx += 60 * (z1 - z0) / L; cur.qz -= 60 * (x1 - x0) / L;
    expect(cur.query()).toBe(false);
  });
});

describe('The Outflow (docs/direction.md M4, the meadow\'s west line)', () => {
  const o = data.lines.find((l) => l.id === 'outflow');
  it('runs from Hearn\'s west edge down to the landing of the Sounding\'s jetty, never climbing', () => {
    const a = o.pts[0], b = o.pts[o.pts.length - 1];
    expect(Math.hypot(a[0] - 60, a[1] - 990)).toBeLessThan(260);                 // Hearn (the hub)
    expect(Math.hypot(b[0] + 2534, b[1] + 1400)).toBeLessThan(80);              // world/jetty.js JETTY_AT
    expect(a[3] - b[3]).toBeGreaterThan(200);
    for (let k = 1; k < o.pts.length; k++) expect(o.pts[k][3] - o.pts[k - 1][3]).toBeLessThan(3);
    expect(o.after).toBe('meadow');
  });
});
