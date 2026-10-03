import { describe, it, expect } from 'vitest';
import { createFrostBending, sweepTuning, ribbonTuning, crystalTuning } from '../src/game/bending/frost.js';
import { BRUSH } from '../src/shaders/terrainState.wgsl.js';

function rig() {
  const stamps = [];
  const ts = { bx: 0, bz: 0, bdx: 0, bdz: 0, bl: 0, bw: 0, bd: 0, bc: 0, bk: 0, bwet: 0, bbias: 0, bberm: 0,
    stamp() { stamps.push({ x: this.bx, z: this.bz, k: this.bk, d: this.bd, w: this.bw, wet: this.bwet, l: this.bl }); this.bk = 0; } };
  let emitted = 0;
  const fx = { ex: 0, ey: 0, ez: 0, evx: 0, evy: 0, evz: 0, esize: 0, emit() { emitted++; } };
  const ground = { qx: 0, qz: 0, h: 0, sample() { this.h = 0; } };
  const f = createFrostBending({ ts, fx, ground });
  f.x = 0; f.y = 0; f.z = 0; f.aimX = 0; f.aimZ = 1; f.hx = 0.2; f.hy = 1.2; f.hz = 0.3; f.tx = 0; f.ty = 0; f.tz = 9;
  const run = (seconds, each) => { for (let t = 0; t < seconds; t += 1 / 60) { if (each) each(t); f.dt = 1 / 60; f.time += 1 / 60; f.update(); } };
  return { f, stamps, run, get emitted() { return emitted; } };
}

describe('frost bending', () => {
  it('Sweep ploughs a wet channel along the aim to its range, easing in and out', () => {
    const r = rig();
    r.f.castSweep = true;
    r.run(2);
    const p = r.stamps.filter((s) => s.k === BRUSH.PLOUGH);
    expect(p.length).toBeGreaterThan(20);
    const far = Math.max(...p.map((s) => s.z + s.l));
    expect(far).toBeGreaterThan(sweepTuning.range * 0.95);
    expect(far).toBeLessThan(sweepTuning.range + 1);
    expect(p[0].d).toBeLessThan(sweepTuning.depth * 0.6);             // eases in
    expect(Math.max(...p.map((s) => s.d))).toBeCloseTo(sweepTuning.depth, 2);
    expect(Math.min(...p.map((s) => s.wet))).toBeGreaterThan(0);       // slush
    expect(r.emitted).toBeGreaterThan(100);                            // the crescent of slush
  });
  it('Ribbon flies from the hand, lands near the aim and scores thin wet lines; it eases out on release', () => {
    const r = rig();
    r.f.ribbonHeld = true;
    r.run(1.5, (t) => { r.f.tx = 6 * Math.sin(t * 3); });               // sweep the aim: arcs
    const sc = r.stamps.filter((s) => s.k === BRUSH.SCORE);
    expect(sc.length).toBeGreaterThan(10);
    expect(Math.max(...sc.map((s) => s.w))).toBeLessThan(0.1);         // thin
    expect(sc.every((s) => s.wet > 0.5)).toBe(true);
    const xs = sc.map((s) => s.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(4);       // the line follows the aim
    expect(r.f.ribbonStrength).toBeGreaterThan(0.9);
    r.f.ribbonHeld = false;
    r.run(0.25);
    expect(r.f.ribbonStrength).toBeGreaterThan(0.2);                    // not a snap
    r.run(2);
    expect(r.f.ribbonStrength).toBeLessThan(0.05);
  });
  it('Ribbon still lands and scores on ground falling away (downhill, hand low)', () => {
    const r = rig();
    // Ground drops 0.25 m per metre away from the caster; the hand is 0.8 m up.
    const g = { qx: 0, qz: 0, h: 0, sample() { this.h = -0.25 * Math.hypot(this.qx, this.qz); } };
    const stamps = [];
    const ts = { stamp() { stamps.push(this.bk); this.bk = 0; } };
    const f = createFrostBending({ ts, fx: { emit() {} }, ground: g });
    f.hx = 0.3; f.hy = 0.8; f.hz = 0; f.tx = 2; f.tz = 8; g.qx = 2; g.qz = 8; g.sample(); f.ty = g.h;
    f.ribbonHeld = true;
    for (let t = 0; t < 1.5; t += 1 / 60) { f.dt = 1 / 60; f.time += 1 / 60; f.update(); }
    expect(stamps.filter((k) => k === BRUSH.SCORE).length).toBeGreaterThan(20);
  });
  it('Crystallize raises a formation and spreads permanent ice under it, with a light that fades', () => {
    const r = rig();
    r.f.tx = 3; r.f.tz = 7; r.f.castCrystal = true;
    r.run(0.05);
    expect(r.f.crystalsDirty).toBe(true);
    const rec = r.f.crystals;
    expect(rec[3]).toBeGreaterThan(0);                                  // birth time set
    expect(Math.hypot(rec[0] - 3, rec[2] - 7)).toBeLessThan(0.01);       // centre crystal at the aim
    r.run(1);
    const fr = r.stamps.filter((s) => s.k === BRUSH.FREEZE);
    expect(fr.length).toBeGreaterThan(10);
    expect(Math.max(...fr.map((s) => s.w))).toBeCloseTo(crystalTuning.iceRadius, 1);
    expect(r.f.lights[7]).toBeGreaterThan(0);
    r.run(crystalTuning.lightHold + crystalTuning.lightFade + 0.5);
    expect(r.f.lights[7]).toBe(0);
  });
});
