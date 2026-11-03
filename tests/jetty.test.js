import { describe, it, expect } from 'vitest';
import { buildArchitecture } from '../src/world/architecture.js';
import { soundingSites, jettyPoint, JETTY, JETTY_DECK } from '../src/world/jetty.js';
import { SOUNDING } from '../src/world/sounding.js';

describe('the jetty on the Sounding', () => {
  const b = buildArchitecture(soundingSites());
  it('builds, runs out from the rim towards the middle, and is walkable along its length', () => {
    expect(b.indices.length).toBeGreaterThan(1000);
    const land = jettyPoint(0), end = jettyPoint(JETTY.len);
    expect(Math.hypot(land[0] - SOUNDING.x, land[2] - SOUNDING.z)).toBeGreaterThan(SOUNDING.r);
    expect(Math.hypot(end[0] - SOUNDING.x, end[2] - SOUNDING.z)).toBeLessThan(SOUNDING.r - 30);
    expect(b.platforms.length).toBeGreaterThanOrEqual(13);
    expect(JETTY_DECK).toBeGreaterThan(JETTY.water + 1);
    expect(b.lights.length).toBe(1);
  });
  it('is the same every time', () => {
    expect(buildArchitecture(soundingSites()).indices.length).toBe(b.indices.length);
  });
});
