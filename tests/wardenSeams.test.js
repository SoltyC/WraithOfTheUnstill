import { describe, it, expect } from 'vitest';
import { createWarden, W } from '../src/game/warden/warden.js';

const flat = { qx: 0, qz: 0, h: 0, sample() { this.h = 0; } };
const ts = { stamp() {} };
const fx = { emit() {} };

describe('the Warden can be broken from the ground', () => {
  it('opens its shoulder and hip seams only as the knees go, and lowers them into reach', () => {
    const w = createWarden({ ts, fx, ground: flat });
    w.place(0, 0, 0); w.dt = 1 / 60; w.px = 0; w.pz = -60;
    for (let k = 0; k < 30; k++) w.update();
    expect([0, 1, 2, 3].map((k) => w.exposed(k))).toEqual([true, true, false, false]);
    // Knees: freeze, then break.
    for (const k of [0, 1]) { w.freezeJoint(k); expect(w.strikeJoint(k)).toBe(true); for (let i = 0; i < 20; i++) w.update(); }
    expect([2, 3].map((k) => w.exposed(k))).toEqual([true, false]);
    // The seam sinks within reach of the snow.
    for (let i = 0; i < 60 * 8; i++) { w.update(); if (w.state !== W.AWAKE && w.state !== W.KNEEL) break; }
    expect(w.jy[2]).toBeLessThan(5);
    expect(w.strikeJoint(2)).toBe(false);          // liquid: must be frozen first
    w.freezeJoint(2); expect(w.strikeJoint(2)).toBe(true);
    for (let i = 0; i < 20; i++) w.update();
    expect(w.exposed(3)).toBe(true);
    w.freezeJoint(3); expect(w.strikeJoint(3)).toBe(true);
    expect(w.state).toBe(W.RELEASE);
  });
  it('a frozen seam holds long enough to line up a second Sweep', () => {
    const w = createWarden({ ts, fx, ground: flat });
    w.place(0, 0, 0); w.dt = 1 / 60; w.px = 0; w.pz = -60;
    for (let k = 0; k < 30; k++) w.update();
    w.freezeJoint(0);
    for (let i = 0; i < 60 * 15; i++) w.update();
    expect(w.joint[0]).toBe(1);
  });
});
