import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { ENTRIES, GROUPS, checkEntries, createRemembrance, flagOf } from '../src/game/remembrance.js';
import { REACTIONS } from '../src/game/combat/reactions.js';
import { QuestGraph } from '../src/game/quests/questGraph.js';
import { createEmptySave } from '../src/game/save/saveSchema.js';
import { encodeSave, decodeSave } from '../src/game/save/saveCodec.js';
import { NOOKS } from '../src/game/nooks.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
const make = (over = {}) => {
  const flags = new Set(), seen = [];
  const rem = createRemembrance({ flags, onRemember: (e, ctx) => seen.push([e.id, ctx]), ...over });
  return { flags, seen, rem };
};

describe('Remembrance data', () => {
  it('has 30 to 51 sound entries across every group', () => {
    expect(ENTRIES.length).toBeGreaterThanOrEqual(30);
    expect(ENTRIES.length).toBeLessThanOrEqual(51);
    expect(checkEntries()).toEqual([]);
    for (const [id] of GROUPS) expect(ENTRIES.some((e) => e.group === id), id).toBe(true);
  });
  it('flags checkEntries finds: a duplicate, an unknown group, none or two triggers', () => {
    const e = { id: 'a', group: 'land', title: 't', text: 'x'.repeat(60), on: 'nook:x' };
    expect(checkEntries([e, { ...e }], GROUPS)).toContain('duplicate a');
    expect(checkEntries([{ ...e, group: 'nope' }], GROUPS)[0]).toMatch(/group/);
    expect(checkEntries([{ ...e, on: undefined }], GROUPS)[0]).toMatch(/exactly one/);
    expect(checkEntries([{ ...e, has: 'k' }], GROUPS)[0]).toMatch(/exactly one/);
  });
  it('ties every nook payoff `rem` to an entry that listens for that nook', () => {
    const byId = new Map(ENTRIES.map((e) => [e.id, e]));
    for (const n of NOOKS.filter((x) => x.payoff.rem)) {
      expect(byId.has(n.payoff.rem), n.id).toBe(true);
      expect(byId.get(n.payoff.rem).on, n.id).toBe('nook:' + n.id);
    }
    const ids = new Set(NOOKS.map((n) => n.id));
    for (const e of ENTRIES.filter((x) => x.on && x.on.startsWith('nook:'))) expect(ids.has(e.on.slice(5)), e.id).toBe(true);
  });
  it('reveals only places that exist', () => {
    const known = new Set(read('data/world/pois.json').pois.map((p) => p.id));
    for (const f of ['frost', 'meadow', 'meadow-side', 'frost-restored', 'meadow-restored']) for (const id in read(`data/quests/${f}.json`).places || {}) known.add(id);
    for (const e of ENTRIES) for (const id of e.reveal || []) expect(known.has(id), e.id + ' reveals ' + id).toBe(true);
  });
  it('fills the reaction table from the game\'s own rule, one entry per cell', () => {
    const cells = ENTRIES.filter((e) => e.cell);
    expect(cells.length).toBeGreaterThanOrEqual(4);
    for (const e of cells) expect(REACTIONS[e.cell[0]][e.cell[1]].result.length, e.id).toBeGreaterThan(0);
    expect(new Set(cells.map((e) => e.cell.join(':'))).size).toBe(cells.length);
  });
});

describe('Remembrance unlocking', () => {
  it('unlocks an entry once into the flag rem:<id>', () => {
    const { rem, flags, seen } = make();
    expect(rem.remember('v-fire')).toBe(true);
    expect(flags.has('rem:v-fire')).toBe(true);
    expect(flagOf('v-fire')).toBe('rem:v-fire');
    expect(rem.remember('v-fire')).toBe(false);
    expect(rem.remember('no-such-entry')).toBe(false);
    expect(seen.map((s) => s[0])).toEqual(['v-fire']);
    expect(rem.has('v-fire')).toBe(true);
    expect(rem.count).toBe(1);
  });
  it('answers world events, once, and passes the context along', () => {
    const { rem, seen } = make();
    rem.event('talk:aud');
    rem.event('talk:aud');
    rem.event('nobody:home');
    rem.event('nook:nook-f-fire-view', { x: 1, z: 2 });
    expect(seen.map((s) => s[0])).toEqual(['p-aud', 'v-fire']);
    expect(seen[1][1]).toEqual({ x: 1, z: 2 });
  });
  it('polls states with checks built once, and a silent pass reports without a reaction context of its own', () => {
    const state = { sketch: false };
    const { rem, seen } = make({ resolve: (has) => (has === 'sketch:hound' ? () => state.sketch : () => false) });
    rem.poll();
    expect(rem.count).toBe(0);
    state.sketch = true;
    rem.poll({ silent: true });
    expect(rem.list().map((e) => e.id)).toEqual(['s-hound']);
    expect(seen[0][1]).toEqual({ silent: true });
    rem.poll();
    expect(rem.count).toBe(1);
  });
  it('names the entry of a reaction cell and lists in file order', () => {
    const { rem } = make();
    expect(rem.cell('snow', 'frost').id).toBe('r-snow-frost');
    expect(rem.cell('snow', 'tide')).toBeUndefined();
    rem.remember('r-snow-gale'); rem.remember('v-fire');
    expect(rem.list().map((e) => e.id)).toEqual(['v-fire', 'r-snow-gale']);
  });
});

describe('Remembrance and the save', () => {
  it('round-trips through the quest graph and the save codec', async () => {
    const graph = new QuestGraph([], {});
    const rem = createRemembrance({ flags: graph.flags });
    rem.remember('v-fire'); rem.remember('p-aud'); rem.remember('r-grass-gale');
    graph.flags.add('nook:nook-f-fire-view');
    const s = createEmptySave('slot1', 1);
    const q = graph.serialize();
    s.quests = { quests: q.quests, flags: q.flags, vars: q.vars };
    const back = await decodeSave(await encodeSave(s));
    const graph2 = new QuestGraph([], {});
    graph2.restore(back.quests);
    const rem2 = createRemembrance({ flags: graph2.flags });
    expect(rem2.list().map((e) => e.id)).toEqual(['v-fire', 'p-aud', 'r-grass-gale']);
    expect(graph2.flags.has('rem:v-fire')).toBe(true);
    expect(rem2.remember('v-fire')).toBe(false);          // not remembered twice after a load
    expect(graph2.flags.has('nook:nook-f-fire-view')).toBe(true);
  });
});
