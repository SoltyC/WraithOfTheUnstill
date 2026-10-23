import { describe, it, expect } from 'vitest';
import { createVillageFire, heatDamage, fireTuning, S, EV } from '../src/game/fire/villageFire.js';

// A centre building with one neighbour 7 m east and one 7 m west, plus a far one.
const plots = () => [
  { id: 'c', kind: 'house', at: [0, 0], facing: 0, w: 3.5, d: 3.5, y: 0, seed: 1 },
  { id: 'e', kind: 'house', at: [7, 0], facing: 0, w: 3.5, d: 3.5, y: 0, seed: 2 },
  { id: 'w', kind: 'house', at: [-7, 0], facing: 0, w: 3.5, d: 3.5, y: 0, seed: 3 },
  { id: 'far', kind: 'barn', at: [60, 0], facing: 0, w: 5, d: 4, y: 0, seed: 4 },
  { id: 'well', kind: 'well', at: [0, 20], facing: 0, w: 1, d: 1, y: 0, seed: 5 },
];
const DT = 1 / 30;
const WIND_E = { x: 1, z: 0, strength: 1 };
const CALM = { x: 1, z: 0, strength: 0 };
const run = (vf, secs, wind = CALM, each) => { for (let t = 0; t < secs; t += DT) vf.update(DT, wind, each); };
const burning = (vf, id) => vf.state[vf.indexOf(id)] === S.BURN || vf.state[vf.indexOf(id)] === S.IGNITE;

describe('village fire', () => {
  it('only buildings take fire', () => {
    const vf = createVillageFire(plots());
    expect(vf.N).toBe(4);
    expect(vf.indexOf('well')).toBe(-1);
  });

  it('ignites, steadies, then burns the structure down in about 3-4.5 min', () => {
    const vf = createVillageFire(plots());
    const c = vf.indexOf('c');
    expect(vf.ignite('c', 0)).toBe(true);
    expect(vf.ignite('c', 0)).toBe(false);
    run(vf, 12);
    expect(vf.state[c]).toBe(S.BURN);
    expect(vf.heat[c]).toBeGreaterThan(0.5);
    let t = 12;
    while (vf.state[c] !== S.DEAD && t < 400) { run(vf, 1); t++; }
    expect(t).toBeGreaterThan(175);
    expect(t).toBeLessThan(290);
    expect(vf.structure[c]).toBe(0);
    expect(vf.counts.lost).toBe(1);
    const kinds = []; for (let k = 0; k < vf.evCount; k++) kinds.push(vf.evKind[k]);
    expect(kinds).toContain(EV.IGNITED); expect(kinds).toContain(EV.COLLAPSED);
  });

  it('spread favours downwind', () => {
    const vf = createVillageFire(plots());
    vf.ignite('c', 0);
    const e = vf.indexOf('e'), w = vf.indexOf('w');
    let tE = -1, tW = -1;
    for (let t = 0; t < 200 && (tE < 0 || tW < 0); t += DT) {
      vf.update(DT, WIND_E);
      if (tE < 0 && vf.state[e] !== S.OUT) tE = t;
      if (tW < 0 && vf.state[w] !== S.OUT) tW = t;
    }
    expect(tE).toBeGreaterThan(0);
    expect(tW < 0 || tE < tW * 0.7).toBe(true);
    // Nothing reaches the far barn.
    expect(vf.state[vf.indexOf('far')]).toBe(S.OUT);
  });

  it('douse reduces heat and puts a small fire out (saved, with char kept)', () => {
    const vf = createVillageFire(plots());
    const c = vf.indexOf('c');
    vf.ignite('c', 0);
    run(vf, 14);
    const h0 = vf.heat[c];
    vf.douse(0, 0, 1, 0.2);
    vf.update(DT, CALM);
    expect(vf.heat[c]).toBeLessThan(h0 - 0.1);
    for (let t = 0; t < 12 && vf.state[c] !== S.OUT; t += DT) vf.update(DT, CALM, (v, dt) => v.douse(0, 0, 1, fireTuning.ribbonRate * dt));
    expect(vf.state[c]).toBe(S.OUT);
    expect(vf.heat[c]).toBe(0);
    expect(vf.counts.saved).toBe(1);
    expect(vf.structure[c]).toBeGreaterThan(0.8);
  });

  it('rain beats douse per second', () => {
    const a = createVillageFire(plots()), b = createVillageFire(plots());
    for (const v of [a, b]) { v.ignite('c', 0); run(v, 20); }
    const ha = a.heat[0], hb = b.heat[0];
    // (0.2 s: at the playtested rates both quench it within a second, which would tie)
    run(a, 0.2, CALM, (v, dt) => v.douse(0, 0, 1, fireTuning.ribbonRate * dt));
    run(b, 0.2, CALM, (v, dt) => v.rain(0, 0, fireTuning.rainRadius, fireTuning.rainRate));
    expect(hb - b.heat[0]).toBeGreaterThan(ha - a.heat[0]);
    // And rain reaches the roofs next door where the ribbon's footprint does not.
    const c = createVillageFire(plots());
    c.ignite('e', 0); run(c, 20);
    const he = c.heat[c.indexOf('e')];
    c.rain(0, 0, fireTuning.rainRadius, fireTuning.rainRate); c.update(DT, CALM);
    expect(c.heat[c.indexOf('e')]).toBeLessThan(he); // 7 m away, rain radius 5 + footprint
  });

  it('freeze halts spread and heat for its duration, then it burns again', () => {
    const vf = createVillageFire(plots());
    const c = vf.indexOf('c'), e = vf.indexOf('e');
    vf.ignite('c', 0); run(vf, 16, WIND_E);
    expect(vf.heat[c]).toBeGreaterThan(0.7);
    const charge = vf.state[e] === S.OUT ? 1 : 0;
    expect(charge).toBe(1); // not yet caught
    vf.freeze(0, 0, 4, 10);
    const s0 = vf.structure[c];
    run(vf, 9, WIND_E);
    expect(vf.heat[c]).toBeLessThan(0.2);
    expect(vf.structure[c]).toBeCloseTo(s0, 3);
    expect(vf.state[e]).toBe(S.OUT);
    run(vf, 12, WIND_E);        // melted
    expect(vf.state[c]).toBe(S.BURN);
    expect(vf.heat[c]).toBeGreaterThan(0.2);
  });

  it('fan raises heat and spreads downwind even in calm air', () => {
    const a = createVillageFire(plots()), b = createVillageFire(plots());
    for (const v of [a, b]) { v.ignite('c', 0); run(v, 8); }
    a.fan(0, 0, 1, 0, 0.3); a.update(DT, CALM); b.update(DT, CALM);
    expect(a.heat[0]).toBeGreaterThan(b.heat[0] + 0.2);
    // Fanned east for a while it catches the east house sooner than the unfanned fire.
    const tcatch = (v, fan) => { for (let t = 0; t < 300; t += DT) { v.update(DT, CALM, fan ? (x) => x.fan(0, 0, 1, 0, 0.02) : null); if (v.state[v.indexOf('e')] !== S.OUT) return t; } return 300; };
    const c1 = createVillageFire(plots()), c2 = createVillageFire(plots());
    c1.ignite('c', 0); c2.ignite('c', 0);
    expect(tcatch(c1, true)).toBeLessThan(tcatch(c2, false));
  });

  it('draw lowers heat and smoke but cannot put it out', () => {
    const a = createVillageFire(plots()), b = createVillageFire(plots());
    for (const v of [a, b]) { v.ignite('c', 0); run(v, 20); }
    run(a, 12, CALM, (v) => v.draw(0, 0, 4));
    run(b, 12, CALM);
    expect(a.heat[0]).toBeLessThan(b.heat[0]);
    expect(a.heat[0]).toBeGreaterThanOrEqual(fireTuning.drawFloor - 1e-6);
    expect(a.state[0]).toBe(S.BURN);
    expect(a.smoke[0]).toBeLessThan(b.smoke[0]);
  });

  it('char persists after the fire is out and clears on restoreAll', () => {
    const vf = createVillageFire(plots());
    const c = vf.indexOf('c');
    vf.ignite('c', 0); run(vf, 40);
    run(vf, 20, CALM, (v, dt) => v.rain(0, 0, 5, 2));
    expect(vf.state[c]).toBe(S.OUT);
    const ch = vf.char[c];
    expect(ch).toBeGreaterThan(0.05);
    run(vf, 120);
    expect(vf.char[c]).toBe(ch);
    vf.restoreAll();
    expect(vf.char[c]).toBe(0); expect(vf.structure[c]).toBe(1); expect(vf.counts.lost).toBe(0);
    expect(vf.ignite('c', 0)).toBe(true);
  });

  it('a burnt-out building stays charred (1.0) and cannot reignite', () => {
    const vf = createVillageFire(plots());
    vf.ignite('c', 0);
    for (let t = 0; t < 400 && vf.state[0] !== S.DEAD; t++) run(vf, 1);
    run(vf, 60);
    expect(vf.char[0]).toBeGreaterThan(0.95);
    expect(vf.heat[0]).toBe(0);
    expect(vf.ignite('c', 0)).toBe(false);
  });

  it('queries: heat and smoke near a fire, interior and door', () => {
    const vf = createVillageFire(plots());
    vf.ignite('c', 0); run(vf, 25);
    expect(vf.heatAt(0, 1, 0)).toBeGreaterThan(0.5);
    expect(vf.heatAt(0, 30, 0)).toBeLessThan(0.05);
    expect(vf.heatAt(40, 1, 0)).toBe(0);
    expect(vf.smokeAt(0, 0)).toBeGreaterThan(0.1);
    expect(vf.smokeAt(80, 80)).toBe(0);
    expect(vf.insideAt(0.5, 0.5)).toBe(0);
    expect(vf.insideAt(30, 0)).toBe(-1);
    const o = [0, 0]; vf.doorPoint(0, o);
    expect(vf.insideAt(o[0], o[1])).toBe(-1);
    expect(vf.emitterCount(0)).toBe(3);
  });

  it('heat damage floors health at 25 %', () => {
    let hp = 100;
    for (let i = 0; i < 6000; i++) hp -= heatDamage(1, 1 / 60, hp, 100);
    expect(hp).toBeCloseTo(25, 6);
    expect(heatDamage(1, 1, 25, 100)).toBe(0);
    expect(heatDamage(0.1, 1, 100, 100)).toBe(0);
    expect(heatDamage(0.5, 1, 100, 100)).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const go = () => { const v = createVillageFire(plots()); v.ignite('c', 0); run(v, 90, WIND_E); return Array.from(v.heat).concat(Array.from(v.structure), Array.from(v.state)); };
    expect(go()).toEqual(go());
  });

  it('update allocates nothing (typed arrays and counters reused)', () => {
    const vf = createVillageFire(plots());
    vf.ignite('c', 0);
    const refs = [vf.heat, vf.state, vf.counts, vf.act, vf.structure];
    const wind = { x: 1, z: 0.2, strength: 0.7 };
    run(vf, 20, wind);
    if (global.gc) {
      global.gc(); const m0 = process.memoryUsage().heapUsed;
      for (let i = 0; i < 20000; i++) vf.update(DT, wind);
      expect(process.memoryUsage().heapUsed - m0).toBeLessThan(2e6);
    }
    expect([vf.heat, vf.state, vf.counts, vf.act, vf.structure].every((a, i) => a === refs[i])).toBe(true);
  });

  it('spreads a building emitter along its ridge, door and window segments', () => {
    const vf = createVillageFire([{ id: 'r', kind: 'house', at: [10, 20], facing: 0.7, w: 8, d: 6, y: 0, seed: 9 }]);
    vf.ignite(0, 0); run(vf, 20);
    expect(vf.emitterCount(0)).toBe(3);
    const pos = [0, 0, 0], seg = [0, 0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const size = vf.emitter(0, k, pos); vf.emitterSegment(0, k, seg);
      expect(size).toBeGreaterThan(0);
      expect(Math.hypot(seg[0], seg[1])).toBeCloseTo(1, 5);
      expect(seg[2]).toBeGreaterThan(0.3);
      const mode = seg[3] >= 5 ? 1 : 0, phase = seg[3] - mode * 10;
      expect(mode).toBe(k === 0 ? 0 : 1);
      expect(phase).toBeGreaterThanOrEqual(0); expect(phase).toBeLessThan(1);
      if (k === 0) { // the ridge runs along the width, centred on the plot, ends inside the footprint
        expect(pos[0]).toBeCloseTo(10, 6); expect(pos[2]).toBeCloseTo(20, 6);
        expect(seg[2]).toBeLessThanOrEqual(vf.plots[0].w * 0.7);
        const ex = pos[0] + seg[0] * seg[2], ez = pos[2] + seg[1] * seg[2];
        expect(Math.hypot(ex - 10, ez - 20)).toBeLessThan(vf.plots[0].w * 0.7 + 1e-6);
      } else { // openings: flames burst away from the building centre
        const ox = -seg[1], oz = seg[0];
        expect((pos[0] - 10) * ox + (pos[2] - 20) * oz).toBeGreaterThan(0);
      }
    }
    // a hotter fire licks along more of the ridge
    const cool = [0, 0, 0, 0]; vf.emitterSegment(0, 0, cool);
    vf.heat[0] = 0.2; const lo = [0, 0, 0, 0]; vf.emitterSegment(0, 0, lo);
    expect(lo[2]).toBeLessThan(cool[2]);
  });
});
