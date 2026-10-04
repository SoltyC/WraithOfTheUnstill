import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createChapter } from '../src/game/chapter.js';

const data = JSON.parse(fs.readFileSync('data/quests/frost.json', 'utf8'));
const pois = JSON.parse(fs.readFileSync('data/world/pois.json', 'utf8')).pois;

function setup() {
  const got = { echo: [], lore: [], shrine: [], autosave: 0, done: [] };
  const ch = createChapter({ data, pois, hooks: {
    echo: (id) => got.echo.push(id), lore: (id) => got.lore.push(id), shrine: (id) => got.shrine.push(id),
    autosave: () => got.autosave++, questDone: (q) => got.done.push(q.id),
  } });
  const at = (id) => { const p = ch.table[id].pos; ch.facts.x = p[0]; ch.facts.z = p[1]; };
  /** Play the current dialogue to its end (picking option `pick` at a choice). */
  const finish = (pick = 0) => { for (let k = 0; k < 50 && ch.talking; k++) ch.updateDialogue(0.1, true, ch.current?.options ? pick : -1); };
  const tick = (n = 4) => { for (let k = 0; k < n; k++) ch.tick(); };
  return { ch, got, at, finish, tick };
}

describe('frost chapter data', () => {
  it('references only dialogue, NPCs, places, Echoes and lore that exist', () => {
    const ids = new Set(data.npcs.map((n) => n.id));
    const places = new Set([...pois.map((p) => p.id), ...Object.keys(data.places)]);
    for (const n of data.npcs) expect(places.has(n.home.poi)).toBe(true);
    for (const npc in data.talk) {
      expect(ids.has(npc)).toBe(true);
      for (const t of data.talk[npc]) expect(data.dialogue[t.say], t.say).toBeTruthy();
    }
    const acts = [];
    for (const q of data.quests) { for (const s of q.steps) acts.push(...(s.actions || [])); acts.push(...(q.onDone || [])); }
    for (const d of Object.values(data.dialogue)) { acts.push(...(d.then || [])); for (const o of d.choice?.options || []) acts.push(...(o.then || [])); }
    for (const a of acts) {
      if (a.echo) expect(data.echoes[a.echo], a.echo).toBeTruthy();
      if (a.lore) expect(data.lore[a.lore], a.lore).toBeTruthy();
      if (a.say) expect(data.dialogue[a.say], a.say).toBeTruthy();
    }
    for (const d of Object.values(data.dialogue)) expect(d.choice?.options.length ?? 2).toBeLessThanOrEqual(2);
  });
});

describe('frost chapter flow', () => {
  it('plays from waking to the Warden release and first snow', () => {
    const { ch, got, at, finish, tick } = setup();
    tick();
    expect(ch.graph.quests['empty-robe'].state).toBe('active');
    at('monastery'); ch.talk('aud'); tick(); finish();
    expect(ch.graph.flags.has('met-aud')).toBe(true);
    at('shrine-frost-2'); ch.raise('shrine:shrine-frost-2'); tick();
    expect(got.shrine).toContain('shrine-frost-2');
    expect(got.autosave).toBe(1);
    at('camp-frost'); ch.talk('maren'); tick(); finish(); tick();
    expect(ch.graph.quests['empty-robe'].state).toBe('done');
    expect(ch.graph.quests['held-snow'].state).toBe('active');
    expect(ch.graph.quests['trail-in-snow'].state).toBe('active');
    at('varo-rise'); ch.talk('varo'); tick(); finish();
    ch.raise('warden:released'); tick();
    expect(ch.graph.quests['held-snow'].state).toBe('done');
    expect(ch.current.text).toMatch(/first snow/);
    finish();
    ch.facts.restored.add('frost');
    at('camp-frost'); tick();
    ch.talk('maren'); tick(); finish();
    expect(ch.graph.quests['first-snow'].state).toBe('done');
    expect(got.echo).toContain('echo-frost-hold');
  });

  it('never stalls when the Warden is released before Varo is met', () => {
    const { ch, at, finish, tick } = setup();
    tick();
    at('monastery'); ch.talk('aud'); tick(); finish();
    at('shrine-frost-2'); ch.raise('shrine:shrine-frost-2'); tick();
    ch.raise('warden:released'); ch.facts.restored.add('frost'); tick();
    at('camp-frost'); ch.talk('maren'); tick(); finish(); tick(4); finish(); tick(4);
    expect(ch.graph.quests['held-snow'].state).toBe('done');
    expect(ch.graph.quests['first-snow'].state).not.toBe('locked');
  });

  it('finds the lost child and is thanked', () => {
    const { ch, got, at, finish, tick } = setup();
    ch.graph.flags.add('met-maren'); tick();
    at('spring-frost'); ch.talk('tobin'); tick(); finish(1);
    expect(ch.graph.flags.has('tobin-listened')).toBe(true);
    at('camp-frost'); ch.talk('maren'); tick(); finish(); tick();
    expect(got.echo).toContain('echo-frost-reach');
    expect(ch.graph.quests['trail-in-snow'].state).toBe('done');
  });

  it('saves and restores quests, flags and progression', () => {
    const a = setup();
    a.at('monastery'); a.ch.talk('aud'); a.tick(); a.finish();
    a.ch.lore.add('lore-spring');
    const s = { progression: {}, journal: {}, quests: a.ch.serialize() };
    a.ch.collect(s);
    const b = setup();
    b.ch.restore(s.quests); b.ch.apply(s);
    expect(b.ch.graph.quests['empty-robe']).toEqual(a.ch.graph.quests['empty-robe']);
    expect(b.ch.graph.flags.has('met-aud')).toBe(true);
    expect([...b.ch.lore]).toEqual(['lore-spring']);
  });
});
