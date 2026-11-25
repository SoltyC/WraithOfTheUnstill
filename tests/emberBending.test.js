import { describe, it, expect } from 'vitest';
import { createEmberBending, inFlare, streamDist, fuseTuning } from '../src/game/bending/ember.js';

const fakeTs = () => { const stamps = []; return { stamps, stamp() { stamps.push({ k: this.bk, x: this.bx, z: this.bz, w: this.bw, wet: this.bwet }); } }; };
const flat = { qx: 0, qz: 0, h: 0, sample() { this.h = 0; } };
const mk = () => { const ts = fakeTs(), e = createEmberBending({ ts, ground: flat }); Object.assign(e, { x: 0, y: 0, z: 0, aimX: 0, aimZ: 1, tx: 0, ty: 0, tz: 10, dt: 1 / 60 }); return { e, ts }; };

describe('Ember bending', () => {
  it('Flare: a cone before the hand; it melts the snow it fans over', () => {
    const { e, ts } = mk();
    e.castFlare = true; e.update();
    expect(e.flareEvent).toBe(true);
    expect(inFlare(e.flareX, e.flareZ, e.flareDX, e.flareDZ, 0, 6)).toBe(true);
    expect(inFlare(e.flareX, e.flareZ, e.flareDX, e.flareDZ, 6, 0)).toBe(false);
    expect(ts.stamps.length).toBeGreaterThan(0);
    expect(ts.stamps.every((s) => s.wet === 1)).toBe(true);
  });

  it('Stream: grows while held, reaches out along the aim, cuts a channel; dies away when let go', () => {
    const { e, ts } = mk();
    e.streamHeld = true;
    for (let i = 0; i < 60; i++) e.update();
    expect(e.streamStrength).toBe(1);
    expect(e.streamLen).toBeGreaterThan(10);
    expect(streamDist(0, 0, e.streamDX, e.streamDZ, e.streamLen, 0, 8)).toBeLessThan(0.1);
    expect(ts.stamps.length).toBeGreaterThan(3);
    e.streamHeld = false;
    for (let i = 0; i < 60; i++) e.update();
    expect(e.streamStrength).toBe(0);
  });

  it('Fuse: charges at the aim, then bursts — glass on sand, a sunk wet bowl — once', () => {
    const { e, ts } = mk();
    e.castFuse = true; e.update();
    expect(e.fusePhase).toBe(1);
    let bursts = 0;
    for (let i = 0; i < 200; i++) { e.update(); if (e.fuseEvent) bursts++; }
    expect(bursts).toBe(1);
    expect(e.fusePhase).toBe(0);
    expect(ts.stamps.some((s) => s.k === 10 && Math.abs(s.z - 10) < 0.01)).toBe(true);   // BRUSH.GLASS at the aim
    // (out of reach: pulled in to its range)
    const m = mk(); m.e.tz = 100; m.e.castFuse = true; m.e.update();
    expect(m.e.fuseZ).toBeCloseTo(fuseTuning.maxRange, 5);
  });
});
