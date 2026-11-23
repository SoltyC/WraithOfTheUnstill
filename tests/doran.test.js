import { describe, it, expect } from 'vitest';
import { doranFate } from '../src/systems/doran.js';

const F = (...f) => new Set(f);
describe("Doran's fate at the Bellwether's release (docs/storyline.md, the meadow)", () => {
  it('told Hild: cast out north, whatever else', () => {
    expect(doranFate(F('meadow:doran-told', 'meadow:doran-goodbye'), { days: 5, 'doran.goodbyeDay': 1 }).fate).toBe('gone');
  });
  it('told him of Bryn and waited a night: he came back down', () => {
    expect(doranFate(F('meadow:doran-goodbye'), { days: 3, 'doran.goodbyeDay': 2 })).toEqual({ fate: 'moved', where: 'dunes' });
  });
  it('told him and did not wait, or kept the secret: lost with her', () => {
    expect(doranFate(F('meadow:doran-goodbye'), { days: 2, 'doran.goodbyeDay': 2 }).fate).toBe('dead');
    expect(doranFate(F('meadow:doran-kept'), { days: 9 }).fate).toBe('dead');
    expect(doranFate(F(), {}).fate).toBe('dead');
  });
});
