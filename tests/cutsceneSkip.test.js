import { describe, expect, it } from 'vitest';
import { canSkipCutscene, finishCutscene, markCutsceneSeen } from '../src/game/cutsceneSkip.js';

describe('cutscene viewing history', () => {
  it('remembers the cutscene only when playback completes', () => {
    const flags = new Set();
    expect(canSkipCutscene(flags, 'bakehouse')).toBe(false);
    finishCutscene(1, 0, () => {}, () => markCutsceneSeen(flags, 'bakehouse'));
    expect(flags.has('seen:bakehouse')).toBe(true);
    expect(canSkipCutscene(flags, 'bakehouse')).toBe(true);
    expect(canSkipCutscene(flags, 'tide')).toBe(false);
    expect(canSkipCutscene(flags, undefined)).toBe(false);
  });

  it("never offers to skip the Listener's release, even after it is seen", () => {
    const flags = new Set();
    markCutsceneSeen(flags, 'release');
    expect(flags.has('seen:release')).toBe(true);
    expect(canSkipCutscene(flags, 'release')).toBe(false);
  });

  it('runs each remaining cut once in order before the end callback', () => {
    const events = ['opening'];
    const shots = ['opening', 'warn', 'evacuate', 'return'];
    finishCutscene(shots.length, 0, (i) => events.push(shots[i]), () => events.push('end'));
    expect(events).toEqual(['opening', 'warn', 'evacuate', 'return', 'end']);
  });
});
