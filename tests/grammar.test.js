import { describe, it, expect } from 'vitest';
import { GRAMMAR, sunlit, frostPatches, traceBeam, sandClock, boomPitch, phrase } from '../src/game/puzzles/grammar.js';

describe('G4: sun and shade', () => {
  const flat = () => 0, wall = (x) => (x > 20 && x < 30 ? 100 : 0);
  it('flat ground is in the sun by day, and not at night', () => {
    expect(sunlit(0, 0, 0, 0.5, 0.5, 0, flat)).toBe(true);
    expect(sunlit(0, 0, 0, 0.5, -0.1, 0, flat)).toBe(false);
  });
  it('a wall toward the sun shades, the same wall away from it does not', () => {
    expect(sunlit(0, 0, 0, 1, 0.3, 0, wall)).toBe(false);
    expect(sunlit(0, 0, 0, -1, 0.3, 0, wall)).toBe(true);
  });
  it('a patch in sun lasts about 60 s and one in shade far longer', () => {
    const f = frostPatches(4), a = f.add(0, 0, 3), b = f.add(50, 0, 3);
    f.shade[b] = 1;
    for (let t = 0; t < 59; t += 1) f.update(1);
    expect(f.holds(0, 0)).toBe(true);
    f.update(2);
    expect(f.holds(0, 0)).toBe(false); expect(f.life[a]).toBe(0);
    expect(f.holds(50, 0)).toBe(true);
  });
  it('freezing the same spot again renews it, and a full pool reuses a slot', () => {
    const f = frostPatches(2), a = f.add(0, 0, 3); f.update(30);
    expect(f.add(1, 0, 3)).toBe(a); expect(f.life[a]).toBe(1);
    f.add(50, 0, 3); f.add(90, 0, 3); expect(f.holds(90, 0)).toBe(true);
  });
});

describe('G6: light travels', () => {
  const out = new Float64Array(32);
  const glyph = { kind: 'glyph', x: 40, z: 40, r: 2 };
  it('a mirror at 45° sends it round the corner to the glyph', () => {
    const m = { kind: 'mirror', x: 40, z: 0, r: 2, yaw: -Math.PI / 4 };
    const site = { parts: [m, glyph] };
    traceBeam(0, 0, 1, 0, site, out);
    expect(m.lit).toBe(true); expect(glyph.lit).toBe(true); expect(site.hit).toBe(glyph);
  });
  it('a wrong turn misses, and light does not reflect off the back', () => {
    const m = { kind: 'mirror', x: 40, z: 0, r: 2, yaw: Math.PI / 2 };
    const site = { parts: [m, glyph] };
    traceBeam(0, 0, 1, 0, site, out);
    expect(m.lit).toBe(true); expect(glyph.lit).toBe(false);
  });
  it('a sandfall blocks it until it is gone', () => {
    const b = { kind: 'block', x: 20, z: 0, r: 2, on: true }, g = { kind: 'glyph', x: 40, z: 0, r: 2 };
    const site = { parts: [b, g] };
    traceBeam(0, 0, 1, 0, site, out); expect(g.lit).toBe(false);
    b.on = false; traceBeam(0, 0, 1, 0, site, out); expect(g.lit).toBe(true);
  });
  it('an ice lens bends it, and does nothing once melted', () => {
    const l = { kind: 'lens', x: 20, z: 0, r: 2, bend: -Math.PI / 2, on: true };
    const up = { kind: 'glyph', x: 20, z: 30, r: 2 }, on = { kind: 'glyph', x: 60, z: 0, r: 2 };
    const site = { parts: [l, up, on] };
    traceBeam(0, 0, 1, 0, site, out); expect(up.lit).toBe(true); expect(on.lit).toBe(false);
    l.on = false; traceBeam(0, 0, 1, 0, site, out); expect(on.lit).toBe(true);
  });
  it('stops after the bounce limit between two facing mirrors', () => {
    const a = { kind: 'mirror', x: 0, z: 0, r: 2, yaw: Math.PI / 2 }, b = { kind: 'mirror', x: 30, z: 0, r: 2, yaw: -Math.PI / 2 };
    const n = traceBeam(15, 0, 1, 0, { parts: [a, b] }, out);
    expect(n / 2).toBeLessThanOrEqual(GRAMMAR.maxBounces + 2);
  });
});

describe('G1–G3: sand goes where the chute goes', () => {
  const run = (c, s) => { for (let t = 0; t < s; t += 0.1) c.step(0.1); };
  it('an open chute fills the bowl below, and a shut one does not', () => {
    const c = sandClock([{ level: 1, source: true }, { level: 0 }], [{ from: 0, to: 1, open: false }]);
    run(c, 10); expect(c.bowls[1].level).toBe(0);
    c.chutes[0].open = true; run(c, 5); expect(c.bowls[1].level).toBeCloseTo(1, 1);
  });
  it('a frozen breach keeps the sand in, and a thawed one loses it', () => {
    const bowls = [{ level: 1, source: true }, { level: 0 }, { level: 0 }];
    const c = sandClock(bowls, [{ from: 0, to: 1, open: true }, { from: 1, to: -1, open: true, frozen: false }, { from: 1, to: 2, open: true }]);
    run(c, 2.5); const leak = bowls[2].level;
    expect(leak).toBeLessThan(0.4);
    bowls[1].level = 0; bowls[2].level = 0; c.chutes[1].frozen = true; run(c, 2.5); expect(bowls[2].level).toBeGreaterThan(leak * 1.5);
  });
  it('sand is conserved between bowls, and a split follows its weights', () => {
    const b = [{ level: 1 }, { level: 0 }, { level: 0 }];
    const c = sandClock(b, [{ from: 0, to: 1, open: true, weight: 3 }, { from: 0, to: 2, open: true, weight: 1 }]);
    run(c, 3);
    expect(b[0].level + b[1].level + b[2].level).toBeCloseTo(1, 6);
    expect(b[1].level).toBeCloseTo(b[2].level * 3, 6);
  });
  it('a draining cradle empties, so nothing is ever stuck', () => {
    const b = [{ level: 1, drain: true }];
    run(sandClock(b, []), 6); expect(b[0].level).toBe(0);
  });
});

describe('G7: sand sings', () => {
  it('bigger avalanches are lower', () => {
    expect(boomPitch(10000)).toBeLessThan(boomPitch(10));
    expect(boomPitch(1e12)).toBe(0.5);
  });
  it('the phrase must be in order and before each boom fades', () => {
    const p = phrase([0, 2, 1]);
    expect(p.play(0, 0)).toBe(1); expect(p.play(2, 5)).toBe(2); expect(p.play(1, 10)).toBe(3); expect(p.done).toBe(true);
    const q = phrase([0, 2, 1]);
    q.play(0, 0); q.play(2, 7); expect(q.at).toBe(0);
    q.play(0, 10); q.tick(17); expect(q.at).toBe(0);
  });
  it('a wrong note starts it over, keeping a new first note', () => {
    const p = phrase([0, 2, 1]);
    p.play(0, 0); p.play(1, 1); expect(p.at).toBe(0);
    p.play(0, 2); p.play(0, 3); expect(p.at).toBe(1);
  });
});
