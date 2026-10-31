import { describe, it, expect } from 'vitest';
import { createHourglass, STAGE, BOWL, HG, LAYOUT } from '../src/game/puzzles/hourglass.js';

const run = (h, s, shade = false, leftShade = false) => { let e = 0; for (let t = 0; t < s; t += 0.1) e |= h.update(0.1, shade, leftShade); return e; };
const L = LAYOUT, mid = [(L.middle[0] + L.left[0]) / 2, (L.middle[1] + L.left[1]) / 2];

describe('the Hourglass', () => {
  it('teach: an open sluice with a breach loses most of its sand; freezing the breach fills the bowl', () => {
    const a = createHourglass(); a.strike(); run(a, 1.5); const leaky = a.bowls[BOWL.MIDDLE].level;
    const b = createHourglass(); b.freeze(...L.breach); b.strike(); run(b, 1.5);
    expect(b.bowls[BOWL.MIDDLE].level).toBeGreaterThanOrEqual(leaky);
  });
  it('a Sweep in the middle bowl only counts after the teach, and on the right side', () => {
    const h = createHourglass(); h.plough(2, 18); expect(h.cuts).toBe(0);
    h.freeze(...L.breach); h.strike(); run(h, 30); expect(h.stage).toBeGreaterThanOrEqual(STAGE.COMBINE);
    h.plough(-5, 18); expect(h.cuts).toBe(0); h.plough(2, 18); expect(h.cuts).toBe(1);
  });
  it('twist: without freezing the left chute, sand in the left cradle holds the door', () => {
    const h = createHourglass(); h.freeze(...L.breach); h.strike(); run(h, 20);
    for (let i = 0; i < 3; i++) h.plough(2, 18);
    run(h, 2); expect(h.stage).toBe(STAGE.TWIST);
    for (let t = 0; t < 60; t += 5) { h.freeze(...L.breach); run(h, 5); }
    // Unfrozen, the left takes a share too, and is well past the limit long before the right fills.
    expect(h.bowls[BOWL.LEFT].level).toBeGreaterThan(0.05);
  });
  it('twist solved: freeze the left chute, fill the right cradle', () => {
    const h = createHourglass(); h.freeze(...L.breach); h.strike(); run(h, 8);
    for (let i = 0; i < 3; i++) h.plough(2, 18);
    expect(h.bowls[BOWL.LEFT].level).toBeGreaterThan(0.25); h.freeze(...mid); h.freeze(...L.breach); run(h, 2);
    expect(h.left.frozen).toBe(true);
    let done = false; for (let t = 0; t < 58 && !done; t += 2) { h.freeze(...L.breach); run(h, 2); done = h.stage === STAGE.DONE; }
    expect(done).toBe(true);
  });
  it('the left chute thaws in sun and keeps in shade', () => {
    const a = createHourglass(), b = createHourglass(); a.freeze(...mid); b.freeze(...mid);
    run(a, 61, false, false); run(b, 61, false, true);
    expect(a.left.frozen).toBe(false); expect(b.left.frozen).toBe(true);
  });
  it('leaving drains the cradles and shuts the sluice, so nothing is stuck', () => {
    const h = createHourglass(); h.strike(); h.bowls[BOWL.LEFT].level = 1;
    for (let t = 0; t < 8; t += 0.1) h.drain(0.1);
    expect(h.bowls[BOWL.LEFT].level).toBe(0); expect(h.sluice.open).toBe(false);
  });
});
