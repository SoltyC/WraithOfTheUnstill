import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { villageSites } from '../src/world/villageKits.js';
import { planWindowSpill, spillLevel, lateNight, nightAt, fillLightGrid, LAMP_REACH, SPILL_MAX } from '../src/systems/lights.js';
import { LightGrid, MAX_LIGHTS } from '../src/render/lightGrid.js';

const village = JSON.parse(fs.readFileSync('data/world/village.json', 'utf8'));
const sites = villageSites(village);

describe('window spill lights', () => {
  it('plans a deterministic ~60 % of the lived-in plots, within budget', () => {
    const a = planWindowSpill(sites), b = planWindowSpill(sites);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(20);
    expect(a.length).toBeLessThanOrEqual(SPILL_MAX);
    expect(147 + a.length).toBeLessThanOrEqual(MAX_LIGHTS);
    for (const w of a) expect(Math.hypot(w.fx, w.fz)).toBeCloseTo(1, 6);
  });
  it('level follows night and goes out late, each house at its own hour', () => {
    expect(spillLevel(nightAt(12), 12, 0.5)).toBe(0);
    expect(spillLevel(nightAt(21), 21, 0.5)).toBe(1);
    expect(lateNight(22)).toBe(0); expect(lateNight(24.5)).toBe(1);
    expect(spillLevel(1, 2, 0.01)).toBe(0);
    expect(spillLevel(1, 2, 0.99)).toBeGreaterThan(0.9);
    expect(spillLevel(1, 12 + 11.6, 0.5)).toBe(1);
  });
  it('lamps reach further than their nominal radius', () => {
    const g = new LightGrid(); const mk = (kind) => [{ x: 0, y: 2, z: 0, radius: 10, color: [1, 1, 1], intensity: 1, kind, level: 1, phase: 0 }];
    fillLightGrid(g, mk('lamp'), 0, 0, 0); const rl = g.data[g.data.length - 512 * 8 + 3];
    fillLightGrid(g, mk('candle'), 0, 0, 0); const rc = g.data[g.data.length - 512 * 8 + 3];
    expect(rl).toBeCloseTo(10 * LAMP_REACH, 5); expect(rc).toBe(10);
  });
});
