import { describe, it, expect } from 'vitest';
import { Glide, glideTuning as T } from '../src/character/glide.js';

const H = 1 / 120;
/** A glide launched at (speed, vy), stepped for `seconds` with the inputs given. */
function fly(seconds, inputs = {}, launch = { vx: 0, vy: -1, vz: 12 }) {
  const g = new Glide();
  Object.assign(g, { want: true, airborne: true, height: 30, steer: 0, throttle: 0, rise: 0, lift: 0 }, inputs);
  g.engage(launch.vx, launch.vy, launch.vz, 0);
  for (let t = 0; t < seconds; t += H) { g.engage(g.vx, g.vy, g.vz, g.heading); g.step(H); }
  return g;
}

describe('glide (feel targets)', () => {
  it('opens only in the air, with height, and with speed, a fall or rising air', () => {
    const g = new Glide();
    Object.assign(g, { want: true, airborne: false, height: 30 });
    g.engage(0, -1, 12, 0); expect(g.active).toBe(false);          // on the ground
    Object.assign(g, { airborne: true, height: 1 });
    g.engage(0, -1, 12, 0); expect(g.active).toBe(false);          // too low
    Object.assign(g, { height: 10 });
    g.engage(0, 0, 2, 0); expect(g.active).toBe(false);            // slow, not falling, still air
    g.engage(0, -4, 2, 0); expect(g.active).toBe(true);            // falling fast enough
    const h = new Glide(); Object.assign(h, { want: true, airborne: true, height: 10, lift: 30 });
    h.engage(0, 0, 0, 0); expect(h.active).toBe(true);              // an Updraft under it
  });

  it('settles near best speed with a glide ratio of about 6–8 : 1', () => {
    const g = fly(20);
    expect(g.speed).toBeGreaterThan(T.best - 3);
    expect(g.speed).toBeLessThan(T.best + 1.5);
    const ratio = g.speed / -g.vy;
    expect(ratio).toBeGreaterThan(5.5);
    expect(ratio).toBeLessThan(9);
  });

  it('a dive gains speed and pays in height; a flare slows and then stalls', () => {
    const cruise = fly(6), dive = fly(6, { throttle: 1 }), flare = fly(6, { throttle: -1 });
    expect(dive.speed).toBeGreaterThan(cruise.speed + 5);
    expect(dive.vy).toBeLessThan(cruise.vy - 2);
    expect(flare.speed).toBeLessThan(T.stall + 1);
    expect(flare.vy).toBeLessThan(cruise.vy - 2);            // the stalled robe drops
  });

  it('banks into a coordinated turn: wide when fast (radius ~20–40 m at best)', () => {
    const g = fly(3, { steer: 1 });
    expect(g.bank).toBeGreaterThan(T.bankMax * 0.9);
    const radius = g.speed / Math.abs(g.turnRate);
    expect(radius).toBeGreaterThan(15);
    expect(radius).toBeLessThan(45);
    const left = fly(3, { steer: -1 });
    expect(left.turnRate).toBeLessThan(0);
  });

  it('rising air lifts it: a ridge wind and an Updraft both climb', () => {
    expect(fly(8, { rise: 4 }).vy).toBeGreaterThan(0.8);
    expect(fly(2, { lift: 42 }).vy).toBeGreaterThan(3);
    expect(fly(4, { lift: 400 }).vy).toBeLessThanOrEqual(T.climbMax + 1e-9);
  });

  it('lets go when the hold is released or on touching down, and the blend eases', () => {
    const g = fly(1);
    expect(g.blend).toBeGreaterThan(0.6);
    expect(g.blend).toBeLessThan(1);
    g.want = false; g.engage(g.vx, g.vy, g.vz, g.heading); expect(g.active).toBe(false);
    const h = fly(1); h.airborne = false; h.engage(h.vx, h.vy, h.vz, h.heading); expect(h.active).toBe(false);
    h.step(H); expect(h.blend).toBeLessThan(1); expect(h.blend).toBeGreaterThan(0.5); // no snap
  });
});
