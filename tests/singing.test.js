import { describe, it, expect } from 'vitest';
import { createSinging, STAGE, NOTE, SD, LAYOUT } from '../src/game/puzzles/singing.js';

const { LOW, MIDDLE, HIGH } = NOTE;
const adv = (s, from, to) => { for (let t = from; t < to; t += 0.1) s.update(0.1, t); return to; };
const m = LAYOUT.lips[MIDDLE];

describe('the Singing Dunes', () => {
  it('teach: the first boom is enough', () => {
    const s = createSinging(); expect(s.slide(HIGH, 0)).toBe(true); expect(s.stage).toBe(STAGE.COMBINE);
  });
  it('the low boom sets the middle off in sympathy, out of order', () => {
    const s = createSinging(); s.slide(HIGH, 0); adv(s, 0, 9);
    s.slide(LOW, 9); const e = adv(s, 9, 10);
    expect(s.lastNote).toBe(MIDDLE); expect(s.song.at).toBe(0); expect(e).toBe(10);
  });
  it('twist solved: freeze the middle, low, high, then strike the crust', () => {
    const s = createSinging(); s.slide(HIGH, 0); let t = adv(s, 0, 9);
    s.freeze(m[0], m[1]); s.slide(LOW, t); t = adv(s, t, t + 4); expect(s.song.at).toBe(1);
    s.slide(HIGH, t); t = adv(s, t, t + 4); expect(s.song.at).toBe(2); expect(s.stage).toBe(STAGE.TWIST);
    expect(s.strike(t)).toBe(true); expect(s.stage).toBe(STAGE.DONE);
  });
  it('a frozen face is silent', () => {
    const s = createSinging(); s.slide(HIGH, 0); s.freeze(m[0], m[1]); expect(s.slide(MIDDLE, 1)).toBe(false);
  });
  it('too slow loses the phrase', () => {
    const s = createSinging(); s.slide(HIGH, 0); let t = adv(s, 0, 9);
    s.freeze(m[0], m[1]); s.slide(LOW, t); t = adv(s, t, t + SD.fade + 1); expect(s.song.at).toBe(0);
  });
  it('mastery: the phrase in one ride, and a dismount loses it', () => {
    const s = createSinging();
    s.ride(LOW, 0, true); s.ride(HIGH, 3, true); s.ride(MIDDLE, 4, false); expect(s.run.at).toBe(0);
    s.ride(LOW, 5, true); s.ride(HIGH, 8, true); expect(s.ride(MIDDLE, 11, true)).toBe(true);
  });
  it('a face that slid needs time to slide again', () => {
    const s = createSinging(); s.slide(HIGH, 0); expect(s.slide(HIGH, 1)).toBe(false); adv(s, 1, 1 + SD.reset + 0.5); expect(s.slide(HIGH, 10)).toBe(true);
  });
});
