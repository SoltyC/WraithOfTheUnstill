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
    const places = new Set(pois.map((p) => p.id));
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
  /** An encounter broken (what systems/encounters.js does). */
  const clear = (ch, id) => { ch.graph.flags.add('cleared:' + id); ch.raise('encounter:' + id + ':clear'); };

  it('plays from waking to the Warden release, first snow and the bell', () => {
    const { ch, got, at, finish, tick } = setup();
    tick();
    expect(ch.graph.quests['empty-robe'].state).toBe('active');
    at('monastery'); ch.talk('aud'); tick(); finish();
    expect(ch.graph.flags.has('met-aud')).toBe(true);
    ch.graph.vars.verbStones = 1; tick();
    expect(ch.graph.quests['empty-robe'].step).toBe(2);              // the cloister fight
    clear(ch, 'cloister'); tick();
    at('shrine-frost-1'); ch.raise('shrine:shrine-frost-1'); tick();
    expect(got.shrine).toContain('shrine-frost-1');
    expect(ch.graph.flags.has('known:camp-frost')).toBe(true);
    ch.raise('run:done'); tick(); tick();
    expect(ch.graph.quests['pilgrims-fire'].state).toBe('active');
    // Maren will not talk of the Warden while the hounds are at the fire.
    ch.graph.flags.add('fighting:camp-raid');
    at('camp-frost'); ch.talk('maren'); tick(); finish();
    ch.graph.flags.delete('fighting:camp-raid');
    expect(ch.graph.flags.has('met-maren')).toBe(false);
    clear(ch, 'camp-raid'); tick();
    ch.talk('maren'); tick(); finish(); tick(); tick();
    expect(ch.graph.flags.has('camp-hearth')).toBe(true);
    expect(ch.graph.quests['watching-stone'].state).toBe('active');
    expect(ch.graph.quests['trail-in-snow'].state).toBe('active');
    expect(ch.graph.quests['den-mother'].state).toBe('active');
    clear(ch, 'varo-hounds'); tick();
    at('varo-rise'); ch.talk('varo'); tick(); finish(); tick();
    expect(ch.graph.flags.has('known:warden-frost')).toBe(true);
    expect(ch.graph.quests['watching-stone'].step).toBe(2);          // the seedling
    ch.graph.flags.add('seedling-broken'); tick();
    ch.talk('varo'); tick(); finish(); tick(); tick();
    expect(got.echo).toContain('echo-frost-hold');
    expect(ch.graph.quests['held-snow'].state).toBe('active');
    ch.raise('warden:released'); tick();
    expect(ch.graph.quests['held-snow'].state).toBe('done');
    expect(ch.current.text).toMatch(/first snow/);
    finish();
    ch.facts.restored.add('frost');
    at('camp-frost'); tick(); tick();
    ch.talk('maren'); tick(); finish(); tick();
    expect(ch.graph.quests['first-snow'].step).toBe(2);              // the bell
    ch.raise('use:bell'); tick();
    expect(ch.graph.quests['first-snow'].state).toBe('done');
    expect(got.lore).toContain('lore-bell');
  });

  it('reaching the fire early finishes the opening and starts the raid (Maren only speaks of hounds that are there)', () => {
    const { ch, at, finish, tick } = setup();
    tick();
    at('monastery'); ch.talk('aud'); tick(); finish();
    at('camp-frost'); tick(6);
    expect(ch.graph.quests['empty-robe'].state).toBe('done');
    expect(ch.graph.quests['pilgrims-fire'].state).toBe('active');
    ch.talk('maren'); expect(ch.current.text).toMatch(/come again/); finish();
    ch.graph.flags.add('fighting:camp-raid');
    ch.talk('maren'); expect(ch.current.text).toMatch(/Not now/); finish();
  });

  it('pays the optional objectives of the first quest', () => {
    const { ch, got, tick } = setup();
    tick();
    ch.graph.vars.verbStones = 3; ch.graph.vars['run.gates'] = 5; tick();
    expect(got.echo).toContain('echo-frost-sweep');
    expect(ch.current?.text).toMatch(/ridge breathes/);
  });

  it('never stalls when the Warden is released early', () => {
    const { ch, at, finish, tick } = setup();
    tick();
    at('monastery'); ch.talk('aud'); tick(); finish();
    ch.graph.vars.verbStones = 1; tick();
    ch.graph.flags.add('cleared:cloister'); tick();
    at('shrine-frost-1'); ch.raise('shrine:shrine-frost-1'); tick();
    ch.raise('run:done'); tick(); tick();
    ch.graph.flags.add('cleared:camp-raid'); tick();
    at('camp-frost'); ch.talk('maren'); tick(); finish(); tick(); tick();
    ch.facts.restored.add('frost'); tick(); tick(); tick(); tick(); tick(); tick();
    expect(ch.graph.quests['watching-stone'].state).toBe('done');
    expect(ch.graph.quests['held-snow'].state).toBe('done');
    expect(ch.graph.quests['first-snow'].state).toBe('active');
  });

  it('the child: led home (escorted) earns the Echo; left listening reveals stones instead', () => {
    const lead = setup();
    lead.ch.graph.flags.add('met-maren'); lead.tick();
    lead.at('spring-frost'); lead.tick();
    clear(lead.ch, 'spring-hounds'); lead.tick();
    lead.ch.talk('tobin'); lead.tick(); lead.finish(0); lead.tick();
    expect(lead.ch.graph.flags.has('escorting')).toBe(true);
    // Maren has nothing for him until he is home (the escort sets this in play).
    lead.at('camp-frost'); lead.ch.talk('maren'); lead.tick(); lead.finish();
    expect(lead.got.echo).not.toContain('echo-frost-reach');
    lead.ch.graph.flags.add('tobin-home'); lead.ch.graph.flags.delete('escorting');
    lead.ch.talk('maren'); lead.tick(); lead.finish(); lead.tick();
    expect(lead.got.echo).toContain('echo-frost-reach');
    expect(lead.ch.graph.quests['trail-in-snow'].state).toBe('done');
    const listen = setup();
    listen.ch.graph.flags.add('met-maren'); listen.tick();
    listen.at('spring-frost'); listen.tick();
    clear(listen.ch, 'spring-hounds'); listen.tick();
    listen.ch.talk('tobin'); listen.tick(); listen.finish(1); listen.tick(); listen.tick();
    expect(listen.ch.graph.flags.has('tobin-listened')).toBe(true);
    expect(listen.ch.graph.flags.has('known:echo-frost-4')).toBe(true);
    expect(listen.got.echo).not.toContain('echo-frost-reach');
    expect(listen.ch.graph.quests['trail-in-snow'].state).toBe('done');
  });

  it('the den mother: the sled reveals the den; breaking it and telling Maren pays out', () => {
    const { ch, got, at, finish, tick } = setup();
    ch.graph.flags.add('met-maren'); tick();
    ch.graph.flags.add('used:sled-wreck'); tick();
    expect(ch.graph.flags.has('known:den-frost')).toBe(true);
    clear(ch, 'den'); tick();
    at('camp-frost'); ch.talk('maren'); tick(); finish(); tick();
    expect(ch.graph.quests['den-mother'].state).toBe('done');
    expect(got.lore).toContain('lore-hounds');
  });

  it('the Run pays its medals on the best time', () => {
    const { ch, got, tick } = setup();
    tick(); ch.graph.quests['empty-robe'].state = 'done'; tick();
    expect(ch.graph.quests['shapers-run'].state).toBe('active');
    ch.graph.vars['run.best'] = 52; tick(4);
    expect(ch.graph.quests['shapers-run'].step).toBe(0);
    ch.graph.vars['run.best'] = 39; tick(4);
    expect(got.lore).toContain('lore-shapers-run');
    expect(got.echo).not.toContain('echo-frost-surf');
    ch.graph.vars['run.best'] = 33.4; tick(4);
    expect(got.echo).toContain('echo-frost-surf');
  });

  it('echo stones and the carried flame pay out through variables and flags', () => {
    const { ch, got, finish, tick } = setup();
    ch.graph.flags.add('met-aud'); ch.graph.flags.add('met-isolde'); tick();
    ch.graph.vars.stones = 3; tick();
    expect(ch.graph.flags.has('known:echo-frost-6')).toBe(true);
    ch.graph.vars.stones = 6; tick();
    expect(got.echo).toContain('echo-frost-still');
    // The flame: Isolde gives it only after dark.
    ch.facts.night = false; ch.talk('isolde'); tick(); finish();
    expect(ch.graph.flags.has('flame-given')).toBe(false);
    ch.facts.night = true; ch.talk('isolde'); tick(); finish();
    expect(ch.graph.flags.has('flame-given')).toBe(true);
    ch.graph.flags.add('flame-carried'); tick();
    ch.graph.vars.braziers = 4; tick();
    ch.talk('isolde'); tick(); finish(); tick();
    expect(ch.graph.quests['slow-songs'].state).toBe('done');
    expect(ch.graph.flags.has('known:echo-frost-5')).toBe(true);
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
