import { describe, it, expect } from 'vitest';
import { createSunGate, STAGE, EV, SG } from '../src/game/puzzles/sunGate.js';
import { GRAMMAR } from '../src/game/puzzles/grammar.js';

const step = (s, sunX = 1, sunY = 0.5, t = 0.1) => { let ev = 0; for (let i = 0; i < t / 0.05; i++) ev |= s.update(0.05, sunX, sunY); return ev; };
/** Turn mirror k until `test` holds (up to a full circle). */
function turnUntil(s, k, test, sunX = 1) {
  for (let i = 0; i < 8; i++) { step(s, sunX); if (test()) return true; s.turn(k); }
  step(s, sunX); return test();
}
const toCombine = (s, sunX = 1) => { expect(turnUntil(s, 0, () => s.stage >= STAGE.COMBINE, sunX)).toBe(true); };
/** The first mirror sending the beam south, into the basin. */
const intoBasin = (s, sunX = 1) => { expect(turnUntil(s, 0, () => s.lens.lit, sunX)).toBe(true); };

describe('the Sun Gate', () => {
  it('teach: one mirror lights the first glyph, morning or afternoon', () => {
    for (const sunX of [1, -1]) { const s = createSunGate(); toCombine(s, sunX); expect(s.stage).toBe(STAGE.COMBINE); }
  });
  it('the second mirror does not turn before the teach is done', () => {
    const s = createSunGate(); s.turn(1); expect(s.turns[1]).toBe(0);
  });
  it('sleeps at night', () => {
    const s = createSunGate(); step(s, 1, -0.2); expect(s.points).toBe(0); expect(s.night).toBe(true);
  });
  it('combine: the ice lens bends the beam to the second mirror, and melts in the beam', () => {
    const s = createSunGate(); toCombine(s);
    s.freeze(0, 20); intoBasin(s);
    expect(s.lens.on).toBe(true); expect(s.m2.lit).toBe(true);
    let ev = 0; for (let t = 0; t < GRAMMAR.lensMelt + 1; t += 0.1) ev |= step(s);
    expect(ev & EV.LENS_MELT).toBeTruthy(); expect(s.lens.on).toBe(false); expect(s.m2.lit).toBe(false);
  });
  const toTwist = (s) => { toCombine(s); s.freeze(0, 20); intoBasin(s); expect(turnUntil(s, 1, () => s.stage === STAGE.TWIST)).toBe(true); };
  it('combine ends at the second glyph, and the fall starts', () => {
    const s = createSunGate(); toTwist(s); step(s); expect(s.fall.on).toBe(true);
  });
  it('twist: the eye is blocked until the frozen column is shattered', () => {
    const s = createSunGate(); toTwist(s);
    s.freeze(0, 20); expect(turnUntil(s, 1, () => s.m2.lit && s.fall.lit)).toBe(true);
    expect(s.eye.lit).toBe(false);
    s.freeze(-16, 35); expect(s.strike()).toBe(true); step(s, 1, 0.5, SG.eyeHold + 0.5);
    expect(s.stage).toBe(STAGE.DONE);
  });
  it('a column thaws back to a running fall, so the twist can be tried again', () => {
    const s = createSunGate(); toTwist(s); s.freeze(-16, 35);
    for (let t = 0; t < SG.columnLife + 1; t += 1) step(s, 1, 0.5, 1);
    expect(s.strike()).toBe(false);
  });
  it('a shattered fall closes again, longer with a Gust', () => {
    const s = createSunGate(); toTwist(s); s.freeze(-16, 35); s.strike(); s.gust();
    expect(s.clear).toBe(SG.clearTime + SG.gustExtra);
    for (let t = 0; t < SG.clearTime + SG.gustExtra + 1; t += 1) step(s, 1, 0.5, 1);
    expect(s.fall.on).toBe(true);
  });
  it('a solved gate keeps its beam at night', () => {
    const s = createSunGate(); s.restore(STAGE.DONE); step(s, 1, -0.3); expect(s.stage).toBe(STAGE.DONE); expect(s.points).toBeGreaterThan(0);
    expect(s.eye.lit).toBe(true);
  });
});
