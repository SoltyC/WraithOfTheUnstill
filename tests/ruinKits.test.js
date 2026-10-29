// The erg's ruins (world/ruinKits.js): architecture sites in Shaper stone, half buried.
import { describe, it, expect } from 'vitest';
import { ruinSites } from '../src/world/ruinKits.js';
import { buildArchitecture, NO_SNOW } from '../src/world/architecture.js';
import { ARCH_SITES } from '../src/shaders/architecture.wgsl.js';

const sites = ruinSites({}, (x, z) => 150 + 6 * Math.sin(x / 37));
const built = buildArchitecture(sites);

describe('erg ruins', () => {
  it('has every ruin of the plan, uniquely named, sand not snow', () => {
    const ids = sites.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of ['ruin-sunken-temple', 'ruin-colonnade-0', 'ruin-obelisk-gnomon', 'ruin-gate-sun', 'ruin-colossus-head', 'ruin-aqueduct-']) expect(ids.some((i) => i.startsWith(p)), p).toBe(true);
    for (const id of ids) expect(NO_SNOW.test(id), id).toBe(true);
  });
  it('builds finite geometry with collision, within the site budget', () => {
    for (const v of built.positions) expect(Number.isFinite(v)).toBe(true);
    expect(built.blockers.length).toBeGreaterThan(40);
    expect(464 + sites.length).toBeLessThanOrEqual(ARCH_SITES);
  });
  it('levels the aqueduct channel on the ground it crosses (absolute seats)', () => {
    const aq = sites.filter((s) => s.id.startsWith('ruin-aqueduct-'));
    expect(aq.length).toBeGreaterThan(5);
    for (const s of aq) expect(typeof s.seatY).toBe('number');
  });
});
