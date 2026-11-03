import { describe, it, expect } from 'vitest';
import { Surf, surfTuning } from '../src/character/surf.js';
import { skimTuning } from '../src/character/skimTuning.js';
import { createNoise, noiseStep, NOISE } from '../src/game/noise.js';

// Run a surf on flat ground (normal up) with a tuning, steering s, for t seconds from speed v0; returns { speed, heading turned }.
function run(T, { v0 = 12, steer = 0, t = 3, shoal = 0 } = {}) {
  const sf = new Surf(); sf.tuning = T; sf.canSurf = true; sf.want = true; sf.grounded = true; sf.shoal = shoal;
  sf.enterVX = 0; sf.enterVZ = v0; sf.enterFacing = 0;
  const h = 1 / 120;
  for (let k = 0; k < t / h; k++) { sf.engageQ(); sf.dt = h; sf.nx = 0; sf.ny = 1; sf.nz = 0; sf.steer = steer; sf.throttle = 0; sf.stepQ(); sf.enterVX = sf.vx; sf.enterVZ = sf.vz; sf.enterFacing = sf.heading; }
  return { speed: sf.speed, turned: Math.abs(sf.heading) };
}

describe('the water-skim', () => {
  it('bleeds little in a carve: holds more of its cruise through a hard turn than a snow surf', () => {
    const k = (T) => run(T, { v0: T.cruise, steer: 1, t: 3 }).speed / T.cruise;
    expect(k(skimTuning)).toBeGreaterThan(k({ ...surfTuning, gravity: 0 }));
  });
  it('turns wider than a snow surf at speed (the least grip)', () => {
    expect(run(skimTuning, { steer: 1, t: 1.5 }).turned).toBeLessThan(run(surfTuning, { steer: 1, t: 1.5 }).turned);
  });
  it('bleeds speed in the shallows and keeps it in deep water', () => {
    const deep = run(skimTuning, { t: 4, shoal: 0 }).speed, shallow = run(skimTuning, { t: 4, shoal: 1 }).speed;
    expect(deep - shallow).toBeGreaterThan(5);
  });
  it('is loud: the loudest way to move', () => {
    const n = noiseStep(createNoise(), { x: 0, y: 0, z: 0, speed: 12, grounded: true, skimming: true }, 1 / 60);
    expect(n.level).toBeCloseTo(NOISE.skim, 6);
    expect(NOISE.skim).toBeGreaterThan(NOISE.walk);
  });
});
