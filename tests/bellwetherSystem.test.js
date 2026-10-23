import { describe, it, expect } from 'vitest';
import { createBellFight, BFIGHT, BEV, bellTuning } from '../src/game/bellwether/fight.js';
import { B } from '../src/game/bellwether/bellwether.js';
import { manorSites, manorWorld, MANOR, BACK } from '../src/world/manor.js';
import {
  ventPositions, arenaCentre, bellForDirector, createWindReporter, galeFrontDistance, sweepHeading, frontRadius, frontArrival,
  releaseCamPose, pipsLeft, bellSys,
} from '../src/systems/bellwetherFight.js';

describe('bellwether wiring', () => {
  it('puts the vents on the three chimney caps and the arena on the forecourt', () => {
    const v = ventPositions();
    expect(v).toHaveLength(3);
    const sites = manorSites();
    for (let k = 0; k < 3; k++) {
      const s = sites.find((q) => q.id === 'manor-vent-' + k);
      expect(s).toBeTruthy();
      expect(Math.hypot(s.at[0] - v[k].x, s.at[1] - v[k].z)).toBeLessThan(0.01);
      expect(v[k].y).toBeCloseTo(MANOR.y + 38.6);
      expect(s.vent).toBe(true);
    }
    const [x, z] = manorWorld(0, -26 - BACK);
    expect(Math.hypot(x - sites.find((q) => q.id === 'manor-hall').at[0], z - sites.find((q) => q.id === 'manor-hall').at[1])).toBeLessThan(0.01);
    const a = arenaCentre(); const [ax, az] = manorWorld(0, 20);
    expect(a.x).toBe(ax); expect(a.z).toBe(az); expect(a.y).toBe(MANOR.y);
  });

  it('crosses the director\'s angle convention with the body\'s', () => {
    const body = { hx: 1, hy: 2, hz: 3, valves: {}, state: 0, exhaleFrom: 0, exhaleTo: 0 };
    const b = bellForDirector(body);
    b.exhaleFrom = 0.2; b.exhaleTo = 0.6;
    expect(body.exhaleFrom).toBeCloseTo(Math.PI / 2 - 0.2); expect(body.exhaleTo).toBeCloseTo(Math.PI / 2 - 0.6);
    expect(b.exhaleFrom).toBeCloseTo(0.2); expect(b.exhaleTo).toBeCloseTo(0.6);
    // A mouth to the +z of the arena aims the body at atan2(dx, dz) = 0.
    expect(Math.atan2(0, 30)).toBeCloseTo(0);
    expect(Math.PI / 2 - Math.atan2(30, 0)).toBeCloseTo(0);   // director: atan2(dz, dx) -> body: pi/2 - that
  });

  it('reports a Gust once per cast and a held Vortex on its interval', () => {
    const hits = [];
    const fight = { windHit: (x, y, z, r, p) => { hits.push({ x, y, z, r, p }); return 1; } };
    const rep = createWindReporter(fight);
    const gale = { gustActive: [1, 0, 0], gustFX: [5, 0, 0], gustFZ: [6, 0, 0], gustHW: [1, 0, 0], gustId: [7, 0, 0], vortexX: 1, vortexZ: 2, vortexStrength: 0 };
    rep.update(gale, 10, 0.016); rep.update(gale, 10, 0.016); rep.update(gale, 10, 0.016);
    expect(hits).toHaveLength(1);
    expect(hits[0].r).toBeCloseTo(1 + bellSys.gustReach); expect(hits[0].p).toBe(1);
    gale.gustId[0] = 8; rep.update(gale, 10, 0.016);
    expect(hits).toHaveLength(2);
    gale.gustActive[0] = 0; gale.vortexStrength = 1;
    for (let i = 0; i < 100; i++) rep.update(gale, 10, 0.016);   // 1.6 s
    const vx = hits.filter((h) => h.p === bellSys.vortexPower);
    expect(vx.length).toBe(3);
    gale.vortexStrength = 0.2; rep.update(gale, 10, 0.016);
    expect(hits.filter((h) => h.p === bellSys.vortexPower).length).toBe(3);
  });

  it('retries a Gust that missed until its front reaches a vent, then stops', () => {
    let near = false; const hits = [];
    const fight = { windHit: () => { if (near) { hits.push(1); return 1; } return 0; } };
    const rep = createWindReporter(fight);
    const gale = { gustActive: [1], gustFX: [0], gustFZ: [0], gustHW: [1], gustId: [3], vortexStrength: 0 };
    rep.update(gale, 0, 0.016); rep.update(gale, 0, 0.016);
    expect(hits).toHaveLength(0);
    near = true; rep.update(gale, 0, 0.016); rep.update(gale, 0, 0.016);
    expect(hits).toHaveLength(1);
  });

  it('strips three vents with Gusts through the real director, then the neck rises', () => {
    const calls = [];
    const body = {
      state: B.DORMANT, hx: 0, hy: 20, hz: 0, exhaleFrom: 0, exhaleTo: 0, valves: { open: new Uint8Array(3) },
      wake() { this.state = B.WAKE; }, inhale() { calls.push('inhale'); }, exhale() { calls.push('exhale'); }, shake() {}, roar() { calls.push('roar'); },
      release() { calls.push('release'); }, reset() { this.state = B.DORMANT; this.valves.open.fill(0); }, openValve(k) { this.valves.open[k] = 1; },
    };
    const vents = ventPositions(), a = arenaCentre();
    const fight = createBellFight({ bell: bellForDirector(body), B, arena: a, vents, allowed: () => true, sheltered: () => false, nearValve: () => -1, spawn: () => -1, alive: () => false, kill() {}, summonNames: bellSys.summonNames });
    fight.px = a.x; fight.pz = a.z; fight.py = a.y; fight.dt = 1 / 60;
    fight.update();
    expect(fight.phase).toBe(BFIGHT.VENTS);
    const rep = createWindReporter(fight);
    let cast = 0;
    for (let k = 0; k < 3; k++) for (let n = 0; n < bellTuning.ventStrength; n++) {
      const gale = { gustActive: [1], gustFX: [vents[k].x], gustFZ: [vents[k].z], gustHW: [1], gustId: [++cast], vortexStrength: 0 };
      rep.update(gale, vents[k].y, 1 / 60);
    }
    fight.update();
    expect(fight.strippedCount).toBe(3);
    expect(fight.phase).toBe(BFIGHT.CLIMB);
    expect(fight.ev & BEV.NECK_RISES).toBeTruthy();
  });

  it('runs the gale\'s wind wall out to its reach and sweeps the heading', () => {
    expect(galeFrontDistance(0)).toBe(0);
    expect(galeFrontDistance(1)).toBe(bellTuning.galeR);
    expect(galeFrontDistance(0.2)).toBeLessThan(bellTuning.galeR);
    const bell = { exhaleFrom: 1, exhaleTo: 3 };
    expect(sweepHeading(bell, 0)).toBe(1); expect(sweepHeading(bell, 0.5)).toBe(2); expect(sweepHeading(bell, 2)).toBe(3);
  });

  it('rolls the release front out at a steady speed and reaches the village', () => {
    expect(frontRadius(0)).toBe(0); expect(frontRadius(bellSys.frontStart)).toBe(0);
    expect(frontRadius(bellSys.frontStart + 2)).toBeCloseTo(2 * bellSys.frontSpeed);
    expect(frontRadius(1000)).toBe(bellSys.frontMax);
    const market = [93, 926], [ax, az] = manorWorld(0, 20);
    const d = Math.hypot(market[0] - ax, market[1] - az);
    expect(d).toBeLessThan(bellSys.frontMax);
    expect(frontRadius(frontArrival(d))).toBeCloseTo(d);
    expect(frontArrival(d)).toBeLessThan(bellSys.cineEnd);
  });

  it('orbits the manor from above the roofs, looking at the head', () => {
    const out = {}, head = { x: 320, y: MANOR.y + 8, z: 985 };
    let prev = null;
    for (const t of [0, 4, 8, 14]) {
      releaseCamPose(t, 300, 1000, MANOR.y, 1, head, out);
      expect(out.y).toBeGreaterThan(MANOR.y + 17);
      for (const k of ['x', 'y', 'z', 'yaw', 'pitch', 'fov']) expect(Number.isFinite(out[k])).toBe(true);
      const dx = head.x - out.x, dz = head.z - out.z;
      expect(out.yaw).toBeCloseTo(Math.atan2(dx, dz));
      expect(out.pitch).toBeGreaterThan(0);   // looking down at it
      if (prev) expect(Math.hypot(out.x - prev.x, out.z - prev.z)).toBeGreaterThan(1);
      prev = { x: out.x, z: out.z };
    }
  });

  it('shows what is left as pips: vents first, then valves', () => {
    expect(pipsLeft([3, 0, 1], 1)).toEqual([true, false, true, false, true, true]);
    expect(pipsLeft([0, 0, 0], 3)).toEqual([false, false, false, false, false, false]);
  });
});
