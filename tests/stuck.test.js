import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { mergeChapters } from '../src/game/chapter.js';

const read = (f) => JSON.parse(fs.readFileSync('data/quests/' + f, 'utf8'));
const data = mergeChapters(read('frost.json'), read('meadow.json'), read('meadow-side.json'), read('frost-restored.json'), read('meadow-restored.json'), read('dunes.json'));
const stuck = read('stuck.json');

describe('The stuck layer data (data/quests/stuck.json)', () => {
  it('names real quest steps, with times, speakers and plain lines', () => {
    for (const [key, e] of Object.entries(stuck)) {
      if (!key.includes('/')) continue;
      const [qid, sid] = key.split('/'), q = data.quests.find((x) => x.id === qid);
      expect(q, key).toBeTruthy();
      expect(q.steps.some((s) => s.id === sid), key).toBe(true);
      expect(e.after).toBeGreaterThanOrEqual(30);
      expect(e.by).toBeTruthy();
      expect(e.lines.length).toBeGreaterThan(0);
      for (const l of e.lines) expect(l.length).toBeLessThan(140);
      if (e.near !== undefined) expect(q.steps.find((s) => s.id === sid).goal, key + ' has a goal to be near').toBeTruthy();
    }
  });
});
