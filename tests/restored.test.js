import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { mergeChapters } from '../src/game/chapter.js';
import { validateQuests } from '../src/game/quests/questGraph.js';
import { Streams, windFactor } from '../src/game/restored/streams.js';
import { RoadRun, Winnow, withWind, lanternRise } from '../src/game/restored/rules.js';
import { restoredSites } from '../src/world/restoredSites.js';
import { createWorldSampler } from '../tools/world/sample.mjs';
import { windAt } from '../tools/world/lift.mjs';
import { flyCourse } from '../tools/world/courseSim.mjs';
import { ENTRIES } from '../src/game/remembrance.js';
import { FORGE_COST } from '../src/game/weapons/tiers.js';
import { CONSUMABLES } from '../src/game/economy/items.js';

const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const D = read('data/restored.json');
const frost = read('data/quests/frost.json'), meadow = read('data/quests/meadow.json'), side = read('data/quests/meadow-side.json');
const fr = read('data/quests/frost-restored.json'), mr = read('data/quests/meadow-restored.json');
const before = mergeChapters(frost, meadow, side), data = mergeChapters(frost, meadow, side, fr, mr);
const NEW = [...fr.quests, ...mr.quests];
const world = createWorldSampler();
const rewards = (q) => [...q.steps.flatMap((s) => s.actions || []), ...(q.onDone || [])];
const marks = (qs) => qs.flatMap(rewards).reduce((n, a) => n + (a.marks || 0), 0);
const src = (f) => fs.readFileSync(f, 'utf8');

describe('restored-world data is sound', () => {
  it('validates with the old chapters, ids unique, talkFirst in front of the old lines', () => {
    expect(() => validateQuests(data.quests)).not.toThrow();
    expect(data.quests.length).toBe(before.quests.length + 4);
    expect(data.talk.varo[0].say).toBe('varo.wind.after');
    expect(data.talk.varo.at(-1).say).toBe('varo.again');
    expect(() => mergeChapters(frost, { talkFirst: { nobody: [] } })).toThrow(/no talk table/);
  });
  it('every stream, banner, ring and check stands on the baked ground it names, in the right biome', () => {
    for (const s of D.streams) {
      expect(s.pts.length, s.id).toBeGreaterThanOrEqual(2);
      expect(s.width).toBeGreaterThan(20); expect(s.rise).toBeGreaterThan(3); expect(s.rise).toBeLessThan(9); expect(s.top).toBeGreaterThan(60);
      for (const [x, z] of s.pts) expect(world.meadow(x, z) > 0.5, `${s.id} ${x},${z}`).toBe(s.biome === 'meadow');
    }
    const ids = new Set(D.streams.map((s) => s.id));
    for (const b of D.banners) { expect(ids.has(b.stream), b.id).toBe(true); expect(Math.abs(world.h(...b.pos) - b.h), b.id).toBeLessThan(0.3); }
    for (const r of D.summit.rings) { expect(Math.abs(world.h(...r.pos) - r.h)).toBeLessThan(0.3); expect(r.y - r.h).toBeGreaterThan(5); expect(r.r).toBeGreaterThanOrEqual(8); }
    for (const c of [...D.road.checks, D.road.start]) expect(world.meadow(...c.pos) > 0.5).toBe(true);
    for (const p of [D.chaff, D.lantern]) { expect(Math.abs(world.h(...p.pos) - p.h)).toBeLessThan(0.3); const w = world.water(...p.pos); expect(w.lake + w.river).toBe(0); expect(world.slope(...p.pos)).toBeLessThan(0.3); }
  });
  it('the pennants fly the way the baked wind blows where they stand', () => {
    for (const [biome, at] of [['frost', D.banners[0].pos], ['meadow', D.banners[2].pos]]) {
      const w = windAt(at[0], at[1]); expect(w[0] * D.wind[biome][0] + w[1] * D.wind[biome][1], biome).toBeGreaterThan(0.97);
    }
  });
  it('the sites are unique and every one a system looks for exists', () => {
    const sites = restoredSites({ ...before.places, 'rw-shelf': fr.places['rw-shelf'], 'varo-rise': { pos: [960, 2350] }, 'side-rw-road-start': mr.places['side-rw-road-start'] }, D, D.wind);
    const ids = sites.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const want = ['rw-shelf-cairn', 'side-rw-floor', 'side-rw-chaff', 'side-rw-sacks', 'side-rw-lantern-stand', 'side-rw-lantern', 'side-rw-windsock', 'rw-varo-pennant', ...D.summit.rings.map((_, k) => 'rw-ring-' + (k + 1)), ...D.banners.map((b) => b.id)];
    for (const id of want) expect(ids, id).toContain(id);
    for (const s of sites) { expect(s.hidden === true || s.id.includes('floor') || s.id.includes('stand') || s.id.includes('chaff'), s.id).toBe(true); expect(s.id).toMatch(/^(rw-|side-rw-)/); }
    expect(sites.length).toBeLessThan(40);
  });
});

describe('the streams', () => {
  const st = (r) => new Streams(D.streams, { frost: r, meadow: r });
  const onLine = (id) => { const s = D.streams.find((q) => q.id === id); return [s.pts[1][0], s.pts[1][1]]; };
  it('lift on the line, less beside it, none beyond the width, none above the ceiling', () => {
    const s = st(1), [x, z] = onLine('frost-shelf');
    const mid = s.rise(x, 20, z, 1), side = s.rise(x + 40, 20, z, 1), far = s.rise(x + 90, 20, z, 1), high = s.rise(x, 140, z, 1);
    expect(mid).toBeGreaterThan(4); expect(mid).toBeLessThanOrEqual(5.5 + 1e-9);
    expect(side).toBeLessThan(mid); expect(side).toBeGreaterThan(0);
    expect(far).toBe(0); expect(high).toBe(0);
  });
  it('is nothing while the biome is stilled, and follows the restoration in between', () => {
    const [x, z] = onLine('meadow-hill');
    expect(st(0).rise(x, 20, z, 1)).toBe(0);
    expect(st(0.01).rise(x, 20, z, 1)).toBe(0);
    expect(st(0.5).rise(x, 20, z, 1)).toBeCloseTo(st(1).rise(x, 20, z, 1) * 0.5, 6);
    const frostOnly = new Streams(D.streams, { frost: 1, meadow: 0 });
    expect(frostOnly.rise(x, 20, z, 1)).toBe(0);
  });
  it('breathes with the wind: a gust lifts harder, a lull lets down', () => {
    const s = st(1), [x, z] = onLine('meadow-hill');
    expect(s.rise(x, 20, z, 1.5)).toBeGreaterThan(s.rise(x, 20, z, 1) * 1.4);
    expect(s.rise(x, 20, z, 0.4)).toBeLessThan(s.rise(x, 20, z, 1) * 0.5);
    expect(windFactor(0.5)).toBe(1); expect(windFactor(0)).toBe(0.4); expect(windFactor(9)).toBe(1.5);
  });
  it('is lift enough to climb (above a still-air glide\'s sink) in a mean wind', () => {
    for (const s of D.streams) expect(s.rise * 0.8, s.id).toBeGreaterThan(1.8 + 1.5);
  });
});

describe('the courses need the streams', () => {
  const rings = D.summit.rings.map((r) => ({ pos: r.pos, y: r.y, r: r.r }));
  it('a still-air glide cannot make the legs that climb: each is higher or farther than a 7:1 glide', () => {
    let needing = 0;
    for (let k = 0; k + 1 < rings.length; k++) {
      const a = rings[k], b = rings[k + 1], drop = a.y - b.y, dist = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]);
      if (drop < dist / 7.2) needing++;
    }
    expect(needing).toBeGreaterThanOrEqual(2);
  });
  it('the soaring pilot flies the Shelf course in the restored frost, inside the medals, and cannot with it stilled', () => {
    const ok = flyCourse(rings, D.streams, { restore: 1 }), no = flyCourse(rings, D.streams, { restore: 0 });
    expect(ok.reached).toBe(rings.length);
    expect(ok.t).toBeLessThan(D.summit.medals.bronze); expect(ok.t).toBeGreaterThan(D.summit.medals.gold * 0.7);
    expect(no.reached).toBeLessThan(rings.length);
    const m = D.summit.medals; expect(m.gold).toBeLessThan(m.silver); expect(m.silver).toBeLessThan(m.bronze); expect(m.bronze).toBeLessThanOrEqual(m.gold * 2);
  });
  it('the soaring pilot flies the Wind Road in the restored meadow, and cannot with it stilled', () => {
    const checks = D.road.checks.map((c) => ({ ...c, y: c.y ?? world.h(...c.pos) + c.agl + 12 }));
    const start = [128, 1060, world.h(128, 1060) + 3, 1.57], st = D.streams.filter((s) => s.biome === 'meadow');
    const ok = flyCourse(checks, st, { restore: 1, start, max: 900 }), no = flyCourse(checks, st, { restore: 0, start, max: 900 });
    expect(ok.reached).toBe(checks.length); expect(no.reached).toBe(0);
  });
});

describe('the rules', () => {
  it('a Gust helps only with the wind', () => {
    expect(withWind(1, 0, 1, 0)).toBe(true); expect(withWind(0.7, 0.7, 1, 0)).toBe(true);
    expect(withWind(0, 1, 1, 0)).toBe(false); expect(withWind(-1, 0, 1, 0)).toBe(false);
    const w = new Winnow(3);
    expect(w.gust(false, true)).toBe(null); expect(w.gust(true, false)).toBe('against'); expect(w.count).toBe(0);
    expect(w.gust(true, true)).toBe('hit'); expect(w.gust(true, true)).toBe('hit'); expect(w.gust(true, true)).toBe('done');
  });
  it('the Road starts low near the foot, wants every check in order, and ends on the ground', () => {
    const r = new RoadRun(D.road.checks, D.road.start), s = D.road.start.pos, c = D.road.checks;
    expect(r.step(s[0], 270, s[1], 3, false, 0.1)).toBe(null);                 // on foot: nothing
    expect(r.step(s[0] + 300, 270, s[1], 3, true, 0.1)).toBe(null);           // too far
    expect(r.step(s[0], 400, s[1], 120, true, 0.1)).toBe(null);               // too high to be a start
    expect(r.step(s[0], 270, s[1], 3, true, 0.1)).toBe('start');
    expect(r.step(c[1].pos[0], 300, c[1].pos[1], 40, true, 0.1)).toBe(null);  // out of order
    expect(r.step(c[0].pos[0], 440, c[0].pos[1], 30, true, 0.1)).toBe('check');
    expect(r.step(c[1].pos[0], 300, c[1].pos[1], 40, true, 0.1)).toBe('check');
    expect(r.step(c[2].pos[0], c[2].y, c[2].pos[1], 5, true, 0.1)).toBe('done');
    expect(r.running).toBe(false); expect(r.last).toBeGreaterThan(0);
    r.step(s[0], 270, s[1], 3, true, 0.1);
    for (let i = 0; i < 40; i++) if (r.step(s[0], 270, s[1], 0, false, 0.1) === 'lost') break;
    expect(r.running).toBe(false);
  });
  it('the lantern rises slowly, then quickly, then settles', () => {
    expect(lanternRise(0, 14)).toBe(0); expect(lanternRise(14, 14)).toBe(1); expect(lanternRise(99, 14)).toBe(1);
    expect(lanternRise(7, 14)).toBeCloseTo(0.5, 6); expect(lanternRise(2, 14)).toBeLessThan(0.1); expect(lanternRise(12, 14)).toBeGreaterThan(0.9);
  });
});

describe('the requests pass the quest template', () => {
  const byId = (id) => data.quests.find((q) => q.id === id);
  const steps = NEW.flatMap((q) => q.steps.map((s) => [q, s]));
  const dialogueFlags = new Set(Object.values(data.dialogue).flatMap((d) => (d.then || []).filter((a) => a.setFlag).map((a) => a.setFlag)));
  it('is gated on the restoration: nothing offers itself to a stilled biome', () => {
    for (const q of fr.quests) expect(q.start.restored).toBe('frost');
    for (const q of mr.quests) { expect(q.start.restored).toBe('meadow'); expect(q.start.flag, q.id + ' continues an earlier errand').toMatch(/^meadow:side-.*-thanked$/); }
    for (const [npc, list] of Object.entries({ ...fr.talkFirst, ...mr.talkFirst })) {
      const offer = list.find((e) => /^(varo\.wind|meadow\.\w+\.(road|chaff|lantern))$/.test(e.say));
      expect(offer, npc).toBeTruthy(); expect(offer.when.restored, npc + ' offers only restored').toBeTruthy();
      expect(list.at(-1)).toBe(offer);
    }
    for (const list of Object.values(mr.barksFirst)) for (const e of list) expect(e.when.restored).toBe('meadow');
    for (const list of Object.values(fr.barksFirst)) for (const e of list) expect(e.when.flag).toMatch(/^restored:/);
  });
  it('is not a fetch: a verb ends each request that only a mechanic can set, not a conversation', () => {
    const mech = { 'shelf-stream': 'shelf.best', 'meadow-wind-road': 'meadow:road-flown', 'meadow-chaff': 'meadow:chaff-cleared', 'meadow-lantern': 'meadow:lantern-lit' };
    for (const q of NEW) {
      const s = q.steps.find((x) => JSON.stringify(x.when).includes(mech[q.id]));
      expect(s, q.id).toBeTruthy();
      expect(dialogueFlags.has(mech[q.id]), q.id + ' mechanic flag set by talk').toBe(false);
      expect(q.steps.filter((x) => x.when.near).length, q.id).toBeLessThanOrEqual(1);
    }
    for (const d of Object.values({ ...fr.dialogue, ...mr.dialogue })) expect(d.choice).toBeUndefined();            // at most one choice: there are none here
  });
  it('has a goal on every step that resolves, journal text starting with a verb', () => {
    const places = new Set([...read('data/world/pois.json').pois.map((p) => p.id), ...Object.keys(data.places)]);
    const npcs = new Set(data.npcs.map((n) => n.id)), dyn = new Set(['next-shelf-ring', 'next-road']);
    for (const [q, s] of steps) {
      const g = s.goal, at = q.id + '.' + s.id;
      expect(g, at).toBeTruthy();
      if (g.npc) expect(npcs.has(g.npc), at).toBe(true);
      if (g.dynamic) expect(dyn.has(g.dynamic) || places.has(g.dynamic.replace('place:', '')), at).toBe(true);
      expect(s.journal, at).toMatch(/^(Talk|Go|Fly|Winnow|Take|Tell|Climb)\b/);
    }
  });
  it('the medals in the quest and in Varo\'s mouth are the data\'s', () => {
    const m = D.summit.medals, q = byId('shelf-stream');
    for (const k of ['bronze', 'silver', 'gold']) expect(q.steps.find((s) => s.id === k).when.var.lte).toBe(m[k]);
    const say = (id) => fr.talkFirst.varo.find((e) => e.say === id).when.var.lte;
    expect([say('varo.wind.gold'), say('varo.wind.silver'), say('varo.wind.bronze')]).toEqual([m.gold, m.silver, m.bronze]);
    expect(q.steps.find((s) => s.id === 'gold').journal).toContain(String(m.gold));
  });
  it('every place a quest reaches for is on dry, walkable ground', () => {
    for (const p of [...Object.values(fr.places), ...Object.values(mr.places)]) {
      expect(Math.abs(world.h(...p.pos) - p.h), p.name).toBeLessThan(0.3);
      const w = world.water(...p.pos); expect(w.lake + w.river, p.name).toBe(0);
    }
  });
});

describe('rewards stay inside the economy', () => {
  const tier3 = FORGE_COST[1].marks + FORGE_COST[2].marks + FORGE_COST[3].marks;
  const full = FORGE_COST.slice(1).reduce((n, c) => n + c.marks, 0), two = FORGE_COST[1].marks + FORGE_COST[2].marks;
  it('adds under a seventh to the marks of the first two chapters, each request paying little', () => {
    const old = marks(before.quests), add = marks(NEW);
    expect(add).toBeGreaterThan(0); expect(add).toBeLessThanOrEqual(old / 7);
    for (const q of NEW) expect(marks([q]), q.id).toBeLessThanOrEqual(51);
    expect(old + add, 'still not enough to buy everything').toBeLessThan((full + two) * 2);
    expect(add, 'not a way to finish the forge').toBeLessThan(tier3);
  });
  it('gives no thread, no flask, no material, and at most two loaves in all (nothing to grind for)', () => {
    const all = NEW.flatMap(rewards);
    expect(all.filter((a) => a.thread || a.flask || a.give)).toHaveLength(0);
    const items = all.filter((a) => a.item).flatMap((a) => Object.entries(a.item));
    for (const [id, n] of items) { expect(CONSUMABLES[id], id).toBeTruthy(); expect(n).toBeLessThanOrEqual(2); }
    expect(items.reduce((n, [, k]) => n + k, 0)).toBeLessThanOrEqual(2);
  });
  it('pays each request once: marks come from steps and onDone of a quest that runs once, and no repeatable mechanic pays', () => {
    for (const f of ['src/systems/restored.js', 'src/systems/restored/summit.js', 'src/systems/restored/road.js', 'src/systems/restored/chaff.js', 'src/systems/restored/lantern.js']) expect(src(f), f).not.toMatch(/economy|reward|marks/);
  });
});

describe('the world hears what the systems raise', () => {
  it('every Remembrance entry of the restored world has a trigger a system raises', () => {
    const events = { 'stream:frost': 'src/systems/restored.js', 'stream:meadow': 'src/systems/restored.js', 'road:done': 'src/systems/restored/road.js', 'chaff:cleared': 'src/systems/restored/chaff.js' };
    for (const [e, f] of Object.entries(events)) {
      expect(ENTRIES.some((x) => x.on === e), e).toBe(true);
      expect(src(f), e).toContain(e.includes(':') && e.startsWith('stream') ? "'stream:'" : `'${e}'`);
    }
    expect(ENTRIES.length).toBeLessThanOrEqual(60);
  });
});

describe('a hop into rising air opens the robe', () => {
  it('a jump on still ground does not; a jump in a stream does', async () => {
    const { Glide } = await import('../src/character/glide.js');
    const hop = (rise) => { const g = new Glide(); Object.assign(g, { want: true, airborne: true, height: 0.8, rise }); g.engage(3, 1, 0, 0); return g.active; };
    expect(hop(0)).toBe(false); expect(hop(0.4)).toBe(false); expect(hop(3)).toBe(true);
    const low = new Glide(); Object.assign(low, { want: true, airborne: true, height: 0.2, rise: 3 }); low.engage(3, 1, 0, 0); expect(low.active).toBe(false);
  });
});
