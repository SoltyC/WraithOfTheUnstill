import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createChapter, mergeChapters } from '../src/game/chapter.js';
import { LEAD, CHILD, makePath, pathAt, newGuide, leadStep, newChild, childStep, frontOf, projectOnPath } from '../src/game/villagers.js';
import { createSolids } from '../src/world/solids.js';
import { clock, pinTime, unpinTime, advanceClock } from '../src/core/clock.js';
import { params } from '../src/core/params.js';

const frost = JSON.parse(fs.readFileSync('data/quests/frost.json', 'utf8'));
const meadow = JSON.parse(fs.readFileSync('data/quests/meadow.json', 'utf8'));
const pois = JSON.parse(fs.readFileSync('data/world/pois.json', 'utf8')).pois;
const village = JSON.parse(fs.readFileSync('data/world/village.json', 'utf8'));
const data = mergeChapters(frost, meadow);

function setup() {
  const ch = createChapter({ data, pois, hooks: {} });
  const at = (id) => { const p = ch.table[id].pos; ch.facts.x = p[0]; ch.facts.z = p[1]; };
  const finish = (pick = 0) => { for (let k = 0; k < 60 && ch.talking; k++) ch.updateDialogue(0.1, true, ch.current?.options ? pick : -1); };
  const tick = (n = 3) => { for (let k = 0; k < n; k++) ch.tick(); };
  const flag = (f) => ch.graph.flags.has(f);
  return { ch, at, finish, tick, flag };
}

describe('meadow chapter data', () => {
  it('loads beside frost as one graph with meadow-* ids', () => {
    const { ch } = setup();
    expect(ch.graph.quests['empty-robe']).toBeTruthy();
    expect(ch.graph.quests['meadow-the-burning-night']).toBeTruthy();
    for (const q of meadow.quests) expect(q.id.startsWith('meadow-')).toBe(true);
    for (const n of meadow.npcs) expect(n.id.startsWith('meadow-')).toBe(true);
    for (const id of Object.keys(meadow.dialogue)) expect(id.startsWith('meadow.')).toBe(true);
  });
  it('refuses a duplicate id when merging', () => {
    expect(() => mergeChapters(frost, { dialogue: { 'aud.wake': { speaker: 'aud', lines: ['x'] } } })).toThrow();
  });
  it('has no unnamed speakers, and every talk/dialogue reference exists', () => {
    const named = new Map(data.npcs.map((n) => [n.id, n.name]));
    for (const [id, d] of Object.entries(meadow.dialogue)) {
      expect(named.get(d.speaker), id).toBeTruthy();
      expect(d.lines.length, id).toBeGreaterThan(0);
      for (const o of d.choice?.options || []) expect(o.text).toBeTruthy();
      expect(d.choice?.options.length ?? 2).toBeLessThanOrEqual(2);
    }
    for (const npc in meadow.talk) { expect(named.has(npc)).toBe(true); for (const t of meadow.talk[npc]) expect(data.dialogue[t.say], t.say).toBeTruthy(); }
    const acts = [];
    for (const q of meadow.quests) for (const s of [...q.steps, ...(q.optional || [])]) acts.push(...(s.actions || []));
    for (const d of Object.values(meadow.dialogue)) acts.push(...(d.then || []));
    for (const a of acts) { if (a.lore) expect(data.lore[a.lore]).toBeTruthy(); if (a.say) expect(data.dialogue[a.say]).toBeTruthy(); }
    const folk = new Set(meadow.village.folk.map((f) => f.id));
    for (const id in meadow.barks) expect(named.has(id) || folk.has(id), id).toBe(true);
  });
  it('speaks plainly: every named speaker introduces themself, objectives start with a verb', () => {
    for (const q of meadow.quests) for (const s of [...q.steps, ...(q.optional || [])]) expect(/^[A-Z][a-z]+ /.test(s.journal), s.journal).toBe(true);
    const first = { 'meadow.wenna.plea': 'Wenna', 'meadow.marit.plea': 'Marit', 'meadow.ebb.cower': 'Ebb', 'meadow.hild.fires': 'Hild', 'meadow.corin.search': 'Corin', 'meadow.doran.block': 'Doran' };
    for (const [id, name] of Object.entries(first)) expect(meadow.dialogue[id].lines.join(' ')).toContain(name);
  });
  it('pins its places and fire plots to village.json', () => {
    expect(meadow.village.market).toEqual(village.meta.market.map((v) => Math.round(v * 100) / 100));
    expect(pois.find((p) => p.id === 'stair-foot').pos).toEqual(village.meta.foot);
    const plots = new Map(village.plots.map((p) => [p.id, p]));
    expect(meadow.village.firePlots.length).toBeGreaterThanOrEqual(12);
    expect(meadow.village.firePlots.length).toBeLessThanOrEqual(16);
    for (const id of meadow.village.firePlots) expect(['house', 'house2', 'shop', 'barn', 'workshop']).toContain(plots.get(id).kind);
    expect(meadow.village.firePlots).toContain(meadow.village.childPlot);
    expect(plots.get(meadow.village.childPlot).kind).toBe('house2');
    expect(meadow.places['meadow-ebb-house'].pos).toEqual(plots.get('p77').at);
    const hf = frontOf(plots.get(meadow.village.hallPlot), 1.5);
    expect(Math.hypot(hf[0] - meadow.places['meadow-hall'].pos[0], hf[1] - meadow.places['meadow-hall'].pos[1])).toBeLessThan(2);
    for (const f of meadow.village.folk) expect(plots.has(f.post.plot), f.id).toBe(true);
    expect(meadow.village.folk.length + meadow.npcs.length).toBeGreaterThanOrEqual(10);
    expect(meadow.village.folk.length + meadow.npcs.length).toBeLessThanOrEqual(16);
  });
  it('the guide path runs from the road head to the square', () => {
    const lists = meadow.village.guidePath.map((id) => village.roads.find((r) => r.id === id).pts.slice());
    for (const l of lists) l.reverse();
    const path = makePath(lists), head = meadow.places['meadow-road'].pos, M = meadow.village.market;
    expect(Math.hypot(path.pts[0][0] - head[0], path.pts[0][1] - head[1])).toBeLessThan(1);
    const end = path.pts[path.pts.length - 1];
    expect(Math.hypot(end[0] - M[0], end[1] - M[1])).toBeLessThan(6);
    expect(path.length).toBeGreaterThan(200);
  });
});

describe('the burning night', () => {
  it('plays from the road to the open stair', () => {
    const { ch, at, finish, tick, flag } = setup();
    const Q = () => ch.graph.quests['meadow-the-burning-night'];
    at('camp-frost'); tick();
    expect(Q().state).toBe('locked');
    at('meadow-road'); tick();
    expect(Q().state).toBe('active');
    ch.talk('meadow-wenna'); tick(); finish(); tick();
    expect(flag('meadow:guide-lead')).toBe(true);
    expect(Q().step).toBe(1);
    ch.graph.flags.add('meadow:arrived'); tick();
    expect(Q().step).toBe(2);
    // Marit points at the house.
    ch.talk('meadow-marit'); tick(); finish();
    expect(flag('meadow:marit-told')).toBe(true);
    ch.graph.flags.add('meadow:fires-out'); tick();
    expect(Q().step).toBe(3);
    // Hild will not give leave while Ebb is inside.
    ch.talk('meadow-hild'); tick(); finish(); tick();
    expect(flag('meadow:stair-open')).toBe(false);
    ch.graph.flags.add('meadow:ebb-saved'); tick();
    expect(Q().step).toBe(4);
    ch.talk('meadow-hild'); tick(); finish(); tick();
    expect(flag('meadow:stair-open')).toBe(true);
    expect(Q().state).toBe('done');
    // The side beat stays open: Corin's brother is on the hill.
    ch.talk('meadow-corin'); tick(); finish(); tick();
    const S = ch.graph.quests['meadow-the-missing'];
    expect(S.state).toBe('active');
    expect(S.step).toBeGreaterThanOrEqual(2);
  });
  it('the stair is closed until the flag and Doran says why', () => {
    const { ch, tick, finish, flag } = setup();
    tick();
    expect(meadow.dialogue['meadow.doran.block'].lines.join(' ')).toContain('Not since');
    ch.talk('meadow-doran'); expect(ch.current.text).toContain('Doran');
    finish();
    ch.graph.flags.add('meadow:stair-open');
    ch.talk('meadow-doran'); expect(ch.current.text).toContain('Elder Hild says you may climb');
    expect(flag('meadow:stair-open')).toBe(true);
  });
  it('saves and restores with the new flags', () => {
    const { ch, tick } = setup();
    ch.facts.x = 168; ch.facts.z = 1180; tick();
    ch.graph.flags.add('meadow:arrived');
    const s = JSON.parse(JSON.stringify(ch.serialize()));
    const b = setup();
    b.ch.restore(s);
    expect(b.ch.graph.flags.has('meadow:arrived')).toBe(true);
    expect(b.ch.graph.quests['meadow-the-burning-night'].state).toBe('active');
  });
});

describe('lead the way', () => {
  const path = makePath([[[0, 0], [0, 100], [60, 160]]]);
  it('runs ahead when the Wraith is close and waits when it is far', () => {
    const g = newGuide(path);
    for (let k = 0; k < 120; k++) leadStep(g, g.x, g.z - 3, 1 / 30, path);
    expect(g.s).toBeGreaterThan(8);
    const s0 = g.s;
    for (let k = 0; k < 60; k++) leadStep(g, g.x, g.z - 80, 1 / 30, path);
    expect(g.s).toBe(s0);
    expect(g.waiting).toBe(true);
    for (let k = 0; k < 60; k++) leadStep(g, g.x, g.z - 4, 1 / 30, path);
    expect(g.s).toBeGreaterThan(s0 + 5);
    expect(g.waiting).toBe(false);
  });
  it('slows as the Wraith lags and arrives at the end of the path', () => {
    const a = newGuide(path), b = newGuide(path);
    for (let k = 0; k < 90; k++) { leadStep(a, a.x, a.z - 2, 1 / 30, path); leadStep(b, b.x, b.z - (LEAD.wait - 3), 1 / 30, path); }
    expect(b.s).toBeLessThan(a.s * 0.5);
    for (let k = 0; k < 3000 && !a.arrived; k++) leadStep(a, a.x, a.z, 1 / 30, path);
    expect(a.arrived).toBe(true);
    expect(a.s).toBeCloseTo(path.length, 3);
    expect(Math.hypot(pathAt(path, path.length)[0] - 60, pathAt(path, path.length)[1] - 160)).toBeLessThan(0.01);
    expect(projectOnPath(path, 0, 50)).toBeCloseTo(50, 3);
  });
});

describe('Ebb', () => {
  const ctx = (o = {}) => ({ wx: 0, wz: 0, follow: false, house: [100, 100], door: [96, 100], mother: [70, 100], raid: true, ...o });
  it('cowers until asked, then goes out the door and follows', () => {
    const c = newChild(100, 100); c.mode = 'cower';
    for (let k = 0; k < 30; k++) childStep(c, ctx({ wx: 90, wz: 100 }), 0.1);
    expect(c.mode).toBe('cower');
    expect(c.hunch).toBeGreaterThan(0.5);
    expect(c.x).toBe(100);
    // The Wraith stands within reach: the dwell counts.
    for (let k = 0; k < 20; k++) childStep(c, ctx({ wx: 98.5, wz: 100 }), 0.1);
    expect(c.dwell).toBeGreaterThan(CHILD.dwell);
    for (let k = 0; k < 80; k++) childStep(c, ctx({ wx: 88, wz: 100, follow: true }), 0.1);
    expect(c.mode).toBe('follow');
    expect(c.x).toBeLessThan(96);
    expect(c.hunch).toBeLessThan(0.3);
  });
  it('waits when left behind, and is handed to his mother once out of the house', () => {
    const c = newChild(96, 100); c.mode = 'follow';
    childStep(c, ctx({ wx: 96 - 30, wz: 100, follow: true }), 0.1);
    expect(c.waiting).toBe(true);
    const x0 = c.x; childStep(c, ctx({ wx: 96 - 30, wz: 100, follow: true }), 0.1);
    expect(c.x).toBe(x0);
    // The Wraith walks him to the mother; he is out after 12 m, saved within the hand-off distance.
    let wx = 96;
    for (let k = 0; k < 600 && !c.saved; k++) { wx = Math.max(68, wx - 0.05 * 3); childStep(c, ctx({ wx, wz: 100, follow: true }), 0.1); }
    expect(c.out).toBe(true);
    expect(c.saved).toBe(true);
    expect(c.mode).toBe('home');
  });
  it('is not saved while he is still near the burning house', () => {
    const c = newChild(96, 100); c.mode = 'follow';
    for (let k = 0; k < 50; k++) childStep(c, ctx({ wx: 90, wz: 100, follow: true, mother: [90, 100] }), 0.1);
    expect(c.out).toBe(false);
    expect(c.saved).toBe(false);
  });
});

describe('gating and the night', () => {
  it('a gate blocks the capsule only while on', () => {
    const so = createSolids([], { blockers: [], platforms: [] });
    const gate = so.addGate(0, 0, 10, 1, 0); // faces +z; 10 m across (x), 1 m along z
    const p = { x: 0, y: 0, z: -1.2 }, v = { x: 0, y: 0, z: 3 };
    so.push(p, v);
    expect(p.z).toBeCloseTo(-1.2, 5);                 // gate off: untouched
    gate.on = true;
    p.z = -0.5; so.push(p, v);
    expect(p.z).toBeLessThanOrEqual(-1.37);           // pushed out to the near side
    expect(v.z).toBeLessThanOrEqual(0);               // into-wall speed removed
    const q = { x: 0, y: 0, z: 0.4 }, w = { x: 0, y: 0, z: -3 };
    so.push(q, w);
    expect(q.z).toBeGreaterThanOrEqual(1.37);
    gate.on = false;
    const r = { x: 0, y: 0, z: -0.5 }; so.push(r, { x: 0, y: 0, z: 0 });
    expect(r.z).toBe(-0.5);
  });
  it('the clock pins to the hour by the short way, holds, and releases', () => {
    const was = params.v.timeOfDay; params.v.timeOfDay = 2; clock.realDt = 0.1;
    pinTime(22);
    for (let k = 0; k < 400; k++) advanceClock();
    expect(params.v.timeOfDay).toBeCloseTo(22, 1);
    const t = params.v.timeOfDay;
    for (let k = 0; k < 50; k++) advanceClock();
    expect(params.v.timeOfDay).toBeCloseTo(t, 3);
    unpinTime();
    const ts = params.v.timeScale; params.v.timeScale = 1; clock.dt = 0.1;
    for (let k = 0; k < 50; k++) advanceClock();
    expect(params.v.timeOfDay).not.toBeCloseTo(t, 4);
    params.v.timeScale = ts; params.v.timeOfDay = was;
  });
});
