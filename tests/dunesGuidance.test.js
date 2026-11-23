import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { walkerSys } from '../src/systems/longWalker.js';

const dunes = JSON.parse(fs.readFileSync('data/quests/dunes.json', 'utf8'));

// M2 (docs/direction.md): the player must know what the erg is for within a minute of the camp.
describe('the dunes say what they are for', () => {
  it('Sarai names the Walker, where it lies and what bringing it home does, right after the sled', () => {
    const t = dunes.dialogue['sarai.after'].lines.join(' ');
    for (const w of ['Long Walker', 'star dune', 'bring it home', 'well fills']) expect(t.toLowerCase()).toContain(w.toLowerCase());
  });
  it('the main quest starts when the sled is freed, and points at the Walker', () => {
    const q = dunes.quests.find((x) => x.id === 'dunes-follow-the-glass');
    expect(JSON.stringify(q.start)).toContain('dunes:sled-freed');
    expect(q.steps[0].goal.dynamic).toBe('walker');
  });
  it('every instrument makes the Walker easier to bring home', () => {
    expect(walkerSys.songSteer).toBeGreaterThan(1);
    expect(walkerSys.clockKneel).toBeGreaterThan(1);
    expect(walkerSys.sunPace).toBeLessThan(1);
  });
});
