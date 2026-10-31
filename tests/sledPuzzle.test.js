import { describe, it, expect } from 'vitest';
import { createSled, SLED, STATE } from '../src/game/puzzles/sled.js';

const cutAll = (s) => { for (let u = 0.5; u < SLED.length; u += 1) s.plough(u, 0); };
const run = (s, t) => { let r = 0; for (let i = 0; i < t * 10; i++) r = s.update(0.1) || r; return r; };

describe('the buried sled', () => {
  it('a channel, then the lip, frees it', () => {
    const s = createSled(); cutAll(s);
    expect(s.trigger()).toBe(true); expect(run(s, 5)).toBe(1); expect(s.state).toBe(STATE.FREED);
  });
  it('a slide with no channel fills what was cut and can be tried again', () => {
    const s = createSled(); s.plough(1, 0);
    s.trigger(); expect(run(s, 5)).toBe(-1); expect(s.channel()).toBe(0);
    expect(s.trigger()).toBe(false); run(s, SLED.retry); expect(s.trigger()).toBe(true);
  });
  it('a plough off the lane does not count', () => {
    const s = createSled(); s.plough(3, 9); s.plough(-1, 0); s.plough(SLED.length, 0);
    expect(s.channel()).toBe(0);
  });
  it('freed stays freed', () => {
    const s = createSled(); cutAll(s); s.trigger(); run(s, 5);
    expect(s.trigger()).toBe(false);
  });
});
