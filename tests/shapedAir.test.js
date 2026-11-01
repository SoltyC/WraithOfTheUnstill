import { describe, it, expect } from 'vitest';
import { inReach, REACH_UP } from '../src/game/shaped/behaviours.js';

describe('close blows and height', () => {
  it('reach a Wraith standing level or on a low step', () => {
    expect(inReach(10, 10)).toBe(true);
    expect(inReach(11, 10)).toBe(true);
  });
  it('do not reach a Wraith lifted above the enemy', () => {
    expect(inReach(10 + REACH_UP + 0.1, 10)).toBe(false);
    expect(inReach(18, 10)).toBe(false);
  });
  it('still reach a Wraith below the enemy', () => {
    expect(inReach(8, 10)).toBe(true);
  });
});
