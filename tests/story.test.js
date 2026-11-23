import { describe, it, expect } from 'vitest';
import { createStory, COMMUNITIES } from '../src/game/story.js';
import { QuestGraph } from '../src/game/quests/questGraph.js';

const graph = () => new QuestGraph([], {});

describe('the story state (docs/storyline.md §4)', () => {
  it('keeps fates, places, word, knowledge and held Wardens in the graph (so the save keeps them)', () => {
    const g = graph(), s = createStory(g);
    expect(s.fateOf('doran')).toBe('alive');
    s.fate('doran', 'gone', 'frost-shrine-3');
    expect(s.fateOf('doran')).toBe('gone'); expect(s.whereOf('doran')).toBe('frost-shrine-3');
    s.fate('doran', 'alive', null);
    expect(s.fateOf('doran')).toBe('alive'); expect(s.whereOf('doran')).toBe(null);
    expect(s.word('hearn', 3)).toBe(2); expect(s.word('hearn', -5)).toBe(-2);
    s.know('frost-library'); expect(s.knows('frost-library')).toBe(true);
    s.held('listener', 'kept'); expect(s.heldOf('listener')).toBe('kept'); expect(s.heldOf('walker')).toBe('held');
    const saved = JSON.parse(JSON.stringify(g.serialize()));
    const g2 = graph(); g2.restore(saved);
    const s2 = createStory(g2);
    expect(s2.wordOf('hearn')).toBe(-2); expect(s2.knows('frost-library')).toBe(true); expect(s2.heldOf('listener')).toBe('kept');
  });
  it('word travels with people part of the way', () => {
    const s = createStory(graph());
    s.word('hearn', -2);
    expect(s.carryWord('hearn', 'wellhouse')).toBe(-1);
    expect(() => s.word('nowhere', 1)).toThrow();
    expect(COMMUNITIES).toContain('steamhaven');
  });
  it('records the order biomes are restored in, once each', () => {
    const s = createStory(graph());
    expect(s.restored('frost', 0)).toBe(1);
    expect(s.restored('dunes', 3)).toBe(2);
    expect(s.restored('frost', 9)).toBe(1);
    expect(s.orderOf('meadow')).toBe(0);
    expect(s.snapshot().order).toEqual({ frost: 1, dunes: 2 });
  });
});
