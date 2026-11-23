// Directed scenes (game/scenes.js): live rigs on their subjects, kept off the ground and in sight of what they film.
import { describe, it, expect } from 'vitest';
import { evalBeat, pickVariant, sceneSpots, sceneLength } from '../src/game/scenes.js';

const flat = () => 0;
const at = (p) => () => p;
const out = new Float64Array(8);

describe('scene rigs', () => {
  it('looks at its subject and sits where the rig puts it', () => {
    evalBeat({ subject: {}, rig: 'static', dist: 10, height: 3, yaw: 0, drift: 0 }, 0.5, 0, at([5, 0, 5]), flat, out);
    expect([out[3], out[5]]).toEqual([5, 5]);
    expect(Math.hypot(out[0] - 5, out[2] - 5)).toBeCloseTo(10);
    expect(out[1]).toBeCloseTo(3);
    expect(out[7]).toBeGreaterThan(9);
  });
  it('follows a moving subject (the camera is worked out from where it is now)', () => {
    const b = { subject: {}, rig: 'orbit', dist: 8, drift: 0 };
    evalBeat(b, 0.3, 0, at([0, 0, 0]), flat, out); const x0 = out[3];
    evalBeat(b, 0.3, 0, at([40, 0, 0]), flat, out);
    expect(out[3] - x0).toBeCloseTo(40);
  });
  it('push closes in, crane rises', () => {
    const r = at([0, 0, 0]);
    evalBeat({ subject: {}, rig: 'push', from: 20, to: 5, drift: 0 }, 0, 0, r, flat, out); const d0 = Math.hypot(out[0], out[2]);
    evalBeat({ subject: {}, rig: 'push', from: 20, to: 5, drift: 0 }, 1, 0, r, flat, out); const d1 = Math.hypot(out[0], out[2]);
    expect(d1).toBeLessThan(d0);
    evalBeat({ subject: {}, rig: 'crane', height: 2, height2: 20, drift: 0 }, 1, 0, r, flat, out);
    expect(out[1]).toBeGreaterThan(15);
  });
  it('never goes under the ground, and climbs to see over a hill between it and the subject', () => {
    const hill = (x, z) => (Math.abs(z - 5) < 2 ? 12 : 0);
    evalBeat({ subject: {}, rig: 'static', dist: 10, height: 1, yaw: 0, drift: 0 }, 0.5, 0, at([0, 0, 0]), hill, out);
    // The sight line from the camera to the look-at passes over the hill at z = 5.
    const f = (10 - 5) / 10, y = out[1] + (out[4] - out[1]) * f;
    expect(y).toBeGreaterThan(12);
    const under = () => 50;
    evalBeat({ subject: {}, rig: 'static', dist: 10, height: 1, drift: 0 }, 0.5, 0, at([0, 0, 0]), under, out);
    expect(out[1]).toBeGreaterThanOrEqual(51);
  });
  it('frames two subjects from beside the line between them', () => {
    const r = (s) => (s.a ? [0, 0, 0] : [10, 0, 0]);
    evalBeat({ subject: { a: 1 }, target: { b: 1 }, rig: 'two', drift: 0 }, 0.5, 0, r, flat, out);
    expect(out[3]).toBeCloseTo(5);
    expect(Math.abs(out[2])).toBeGreaterThan(4);
  });
});

describe('scene variants', () => {
  const scene = { variants: [{ when: (c) => c.stayed, beats: [{ dur: 4, subject: { a: 1 } }, { dur: 3, local: true, subject: { b: 1 } }] }, { beats: [{ dur: 2, subject: {} }] }] };
  it('picks the first variant whose condition holds', () => {
    expect(pickVariant(scene, { stayed: true })).toBe(scene.variants[0]);
    expect(pickVariant(scene, {})).toBe(scene.variants[1]);
  });
  it('lists where it will film (not the local beats) and its length', () => {
    expect(sceneSpots(scene.variants[0], () => [1, 2, 3]).length).toBe(1);
    expect(sceneLength(scene.variants[0])).toBe(7);
  });
});
