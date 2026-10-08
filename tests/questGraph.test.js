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
    expect(h.quests.wake).toEqual({ state: 'active', step: 1, opt: [] });
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

describe('optional objectives, variables and goals', () => {
  const defs = [{
    id: 'run', kind: 'main', title: 'Run', summary: '',
    steps: [{ id: 'go', journal: 'Go down.', when: { event: 'run:done' }, goal: { poi: 'camp' } }, { id: 'talk', journal: 'Talk.', when: { event: 'talk' }, goal: { at: [5, 5], label: 'Maren' } }],
    optional: [{ id: 'perfect', journal: 'Pass every gate.', when: { var: { name: 'run.gates', gte: 9 } }, actions: [{ echo: 'e1' }, { addVar: { name: 'bonus', by: 2 } }], goal: { dynamic: 'next-gate' } }],
  }];
  const pois = { camp: { pos: [0, 0] } };
  const none = { x: 0, z: 0, events: new Set(), restored: new Set() };
  it('runs an optional objective once, in parallel with the steps', () => {
    const g = new QuestGraph(defs, pois);
    g.tick(none);
    expect(g.goals().map((x) => [x.step, x.optional])).toEqual([['go', false], ['perfect', true]]);
    g.vars['run.gates'] = 8; g.tick(none);
    expect(g.quests.run.opt).toEqual([]);
    g.vars['run.gates'] = 9;
    const out = g.tick(none).map((a) => a.echo || a.optionalDone || null).filter(Boolean);
    expect(out).toEqual(['e1', 'run']);
    expect(g.vars.bonus).toBe(2);
    g.tick(none);
    expect(g.vars.bonus).toBe(2); // not again
    expect(g.goals().map((x) => x.step)).toEqual(['go']);
    expect(g.journal()[0].optional).toEqual([{ id: 'perfect', line: 'Pass every gate.', done: true }]);
  });
  it('saves variables and optional progress, and reveals places as flags', () => {
    const g = new QuestGraph(defs, pois);
    g.tick(none); g.vars.x = 3; g.vars['run.gates'] = 9; g.tick(none);
    g.perform({ reveal: ['camp', 'shrine-1'] });
    const saved = JSON.parse(JSON.stringify(g.serialize()));
    const h = new QuestGraph(defs, pois);
    h.restore(saved);
    expect(h.vars.x).toBe(3);
    expect(h.quests.run.opt).toEqual(['perfect']);
    expect(h.flags.has('known:camp') && h.flags.has('known:shrine-1')).toBe(true);
  });
  it('rejects a goal with no target and a var condition with no bound', () => {
    expect(() => validateQuests([{ id: 'a', kind: 'side', steps: [{ id: 's', journal: 'x', when: {}, goal: {} }] }])).toThrow(/goal/);
    expect(() => validateQuests([{ id: 'a', kind: 'side', steps: [{ id: 's', journal: 'x', when: { var: { name: 'n' } } }] }])).toThrow(/var/);
  });
});
