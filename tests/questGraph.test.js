import { describe, it, expect } from 'vitest';
import { QuestGraph, validateQuests } from '../src/game/quests/questGraph.js';

const POIS = { shrine: { pos: [100, 200] }, monastery: { pos: [0, 0] } };
const facts = (over = {}) => ({ x: 0, z: 0, events: new Set(), restored: new Set(), night: false, ...over });
const DEFS = [
  { id: 'wake', kind: 'main', title: 'Waking', summary: 's', steps: [
    { id: 'rise', journal: 'I rose.', when: { event: 'woke' }, actions: [{ setFlag: 'awake' }] },
    { id: 'shrine', journal: 'I reached the shrine.', when: { near: { poi: 'shrine', r: 10 } }, actions: [{ shrine: 'shrine' }, { autosave: true }] },
  ], onDone: [{ echo: 'first-light' }] },
  { id: 'side', kind: 'side', title: 'A trail', summary: 's', start: { quest: 'wake', questStep: 'rise' }, steps: [
    { id: 'night', journal: 'At night.', when: { night: true, flag: 'awake' } },
  ] },
];

describe('quest graph', () => {
  it('starts, advances step by step on conditions, and reports actions in order', () => {
    const g = new QuestGraph(DEFS, POIS);
    let out = [...g.tick(facts())];
    expect(out).toEqual([{ questStarted: 'wake' }]);
    out = [...g.tick(facts({ events: new Set(['woke']) }))];
    expect(out).toEqual([{ setFlag: 'awake' }, { stepDone: 'wake', step: 'rise' }, { questStarted: 'side' }]);
    expect(g.flags.has('awake')).toBe(true);
    // Not near the shrine yet; daytime: nothing.
    expect(g.tick(facts({ x: 50, z: 50 })).length).toBe(0);
    out = [...g.tick(facts({ x: 105, z: 195 }))];
    expect(out).toEqual([{ shrine: 'shrine' }, { autosave: true }, { stepDone: 'wake', step: 'shrine' }, { echo: 'first-light' }, { questDone: 'wake' }]);
    expect([...g.tick(facts({ night: true }))]).toEqual([{ stepDone: 'side', step: 'night' }, { questDone: 'side' }]);
  });

  it('round-trips through a save and survives unknown or removed quests', () => {
    const g = new QuestGraph(DEFS, POIS);
    g.tick(facts()); g.tick(facts({ events: new Set(['woke']) }));
    const saved = JSON.parse(JSON.stringify(g.serialize()));
    saved.quests.gone = { state: 'active', step: 3 };
    const h = new QuestGraph(DEFS, POIS);
    h.restore(saved);
    expect(h.quests.wake).toEqual({ state: 'active', step: 1 });
    expect(h.flags.has('awake')).toBe(true);
    expect(h.quests.gone).toBeUndefined();
    expect(h.journal().map((j) => j.lines.length)).toEqual([2, 1]);
  });

  it('rejects malformed data with a path', () => {
    expect(() => validateQuests([{ id: 'a', kind: 'main', steps: [{ id: 's', journal: 'x', when: { nere: {} } }] }])).toThrow(/unknown condition key "nere"/);
    expect(() => validateQuests([{ id: 'a', kind: 'main', steps: [{ id: 's', journal: 'x', when: { quest: 'b' } }] }])).toThrow(/unknown quest "b"/);
    expect(() => validateQuests([{ id: 'a', kind: 'main', steps: [{ id: 's', journal: 'x', actions: [{ setFlag: 'f', echo: 'e' }] }] }])).toThrow(/exactly one/);
  });

  it('ticks without allocating once nothing changes', () => {
    const g = new QuestGraph(DEFS, POIS);
    const f = facts();
    g.tick(f);
    const a = g.tick(f), b = g.tick(f);
    expect(a).toBe(b);
    expect(b.length).toBe(0);
  });
});
