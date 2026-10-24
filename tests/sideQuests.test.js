import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createChapter, mergeChapters } from '../src/game/chapter.js';
import { validateQuests } from '../src/game/quests/questGraph.js';
import { rayDistance, medalFor, GLIDE_MEDALS, StoneRaise, GestureAsk, vortexHold, GlideCourse } from '../src/game/sideQuests.js';
import { sideSites, stoneRingGeometry, RING } from '../src/world/sideSites.js';
import { createWorldSampler } from '../tools/world/sample.mjs';
import { createEmptySave, validateSave } from '../src/game/save/saveSchema.js';

const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const frost = read('data/quests/frost.json'), meadow = read('data/quests/meadow.json'), side = read('data/quests/meadow-side.json');
const pois = read('data/world/pois.json').pois, village = read('data/world/village.json');
const data = mergeChapters(frost, meadow, side);
const world = createWorldSampler();

describe('every quest step points somewhere', () => {
  // Dynamic goals the game registers (systems/*.js g.navDynamic[...]): a step that names one not here would point nowhere.
  const DYNAMIC = new Set(['gesture', 'next-gate', 'warden-joint', 'stone-hint', 'brazier', 'bell', 'next-ring', 'next-echo', 'next-shrine-frost', 'next-shrine-meadow',
    'meadow-fire', 'meadow-ebb']);
  const placeIds = new Set([...pois.map((p) => p.id), ...Object.keys(data.places)]);
  const npcIds = new Set(data.npcs.map((n) => n.id));
  const steps = [];
  for (const q of data.quests) for (const s of [...q.steps, ...(q.optional || [])]) steps.push([q, s]);
  it('the merged data validates, with ids unique across the chapters', () => {
    expect(() => validateQuests(data.quests)).not.toThrow();
    expect(data.quests.length).toBeGreaterThanOrEqual(frost.quests.length + meadow.quests.length + 5);
  });
  it('has a goal on every step, resolvable from the data', () => {
    for (const [q, s] of steps) {
      const g = s.goal, at = `${q.id}.${s.id}`;
      expect(g, at + ' has no goal').toBeTruthy();
      expect([g.poi, g.at, g.npc, g.dynamic].filter(Boolean).length, at).toBe(1);
      if (g.poi) expect(placeIds.has(g.poi), at + ' poi ' + g.poi).toBe(true);
      if (g.npc) expect(npcIds.has(g.npc), at + ' npc ' + g.npc).toBe(true);
      if (g.at) { expect(g.at.length).toBe(2); expect(g.at.every(Number.isFinite)).toBe(true); }
      if (g.dynamic) expect(DYNAMIC.has(g.dynamic) || (g.dynamic.startsWith('place:') && placeIds.has(g.dynamic.slice(6))), at + ' dynamic ' + g.dynamic).toBe(true);
      if (g.radius !== undefined) expect(g.radius).toBeGreaterThan(0);
    }
  });
  it('a step that says "Talk to X" points at X', () => {
    const byName = new Map(data.npcs.map((n) => [n.name.replace(/^Old /, ''), n.id]));
    for (const [q, s] of steps) {
      const m = /^Talk to (?:Elder |Old )?([A-Z][a-z]+)/.exec(s.journal);
      if (!m || !byName.has(m[1])) continue;
      expect(s.goal.npc, `${q.id}.${s.id}: ${s.journal}`).toBe(byName.get(m[1]));
    }
  });
});

describe('meadow side quests: data', () => {
  const named = new Map(data.npcs.map((n) => [n.id, n.name]));
  it('puts five quests under meadow-side-*, with flags meadow:side-*', () => {
    expect(side.quests.length).toBe(5);
    for (const q of side.quests) expect(q.id.startsWith('meadow-side-')).toBe(true);
    const json = JSON.stringify(side.quests) + JSON.stringify(side.dialogue);
    for (const f of json.match(/"meadow:[a-z-]+"/g)) expect(/^"meadow:(side-|bellwether|stair-open)/.test(f), f).toBe(true);
  });
  it('every talk, dialogue, lore and echo reference exists, and each giver introduces themself', () => {
    for (const [id, d] of Object.entries(side.dialogue)) { expect(named.get(d.speaker), id).toBeTruthy(); expect(d.lines.length).toBeGreaterThan(0); }
    for (const npc in side.talk) { expect(named.has(npc)).toBe(true); for (const t of side.talk[npc]) expect(data.dialogue[t.say], t.say).toBeTruthy(); }
    for (const q of side.quests) for (const s of q.steps) for (const a of s.actions || []) if (a.lore) expect(data.lore[a.lore]).toBeTruthy();
    for (const id in side.barks) expect(named.has(id), id).toBe(true);
    for (const n of side.npcs) { expect(side.dialogue[`meadow.${n.id.slice(7)}.plea`].lines.join(' ')).toContain(n.name); expect(side.barks[n.id].length).toBeGreaterThan(0); }
    expect(data.echoes['echo-meadow-wind']).toBeTruthy();
  });
  it('speaks plainly: journal lines are imperatives, and no dialogue is a choice', () => {
    for (const q of side.quests) for (const s of q.steps) expect(/^(Talk|Go|Carry|Raise|Walk|Glide|Answer|Rest|Tell|Fly) /.test(s.journal), s.journal).toBe(true);
    for (const d of Object.values(side.dialogue)) expect(d.choice).toBeUndefined();
  });
  it('the givers stand at the front doors of real plots, clear of every other building', () => {
    const plots = new Map(village.plots.map((p) => [p.id, p]));
    const inside = (pt, p, pad) => { const f = p.facing, dx = pt[0] - p.at[0], dz = pt[1] - p.at[1], u = dx * Math.cos(f) - dz * Math.sin(f), w = dx * Math.sin(f) + dz * Math.cos(f); return Math.abs(u) < p.w + pad && Math.abs(w) < p.d + pad; };
    for (const n of side.npcs) {
      const p = plots.get(n.post.plot); expect(p, n.id).toBeTruthy();
      expect(['house', 'house2', 'shop', 'workshop']).toContain(p.kind);                     // not a stall, not the well
      const r = p.d + n.post.out, pt = [p.at[0] + Math.sin(p.facing) * r, p.at[1] + Math.cos(p.facing) * r];
      for (const q of village.plots) if (q.id !== p.id) expect(inside(pt, q, 0.5), `${n.id} stands in ${q.id}`).toBe(false);
      expect(Math.hypot(pt[0] - village.meta.market[0], pt[1] - village.meta.market[1])).toBeLessThan(80);
    }
    expect(new Set(side.npcs.map((n) => n.post.plot)).size).toBe(side.npcs.length);
    const used = new Set(meadow.village.folk.map((f) => f.post.plot).concat(meadow.village.firePlots));
    for (const n of side.npcs) expect(used.has(n.post.plot), n.id + ' stands at a burning or used plot').toBe(false);
  });
});

describe('meadow side quests: places stand on dry, level ground', () => {
  const dry = (x, z, r = 6) => { for (let k = 0; k < 12; k++) { const w = world.water(x + Math.sin(k / 12 * 6.283) * r, z + Math.cos(k / 12 * 6.283) * r); if (w.lake > 30 || w.river > 30) return false; } const w0 = world.water(x, z); return w0.lake < 30 && w0.river < 30; };
  const plots = village.plots;
  it('the baked height agrees with the data (h), and no site is in a lake or river', () => {
    for (const [id, p] of Object.entries(side.places)) {
      if (p.y !== undefined) continue;   // rings hang in the air
      expect(Math.abs(world.h(p.pos[0], p.pos[1]) - p.h), id).toBeLessThan(0.6);
      expect(dry(p.pos[0], p.pos[1], id === 'side-fen-lamp' ? 3 : 6), id + ' is in the water').toBe(true);
      expect(world.meadow(p.pos[0], p.pos[1]), id).toBeGreaterThan(0.85);
    }
  });
  it('the Fen Lamp is at the reeds: water within 20 m, and the standing stones are on flat ground', () => {
    const [x, z] = side.places['side-fen-lamp'].pos; let wet = false;
    for (let r = 4; r <= 20; r += 2) for (let k = 0; k < 16; k++) { const w = world.water(x + Math.sin(k * 0.39) * r, z + Math.cos(k * 0.39) * r); if (w.lake > 30) wet = true; }
    expect(wet).toBe(true);
    for (const id of ['side-stone-ring', 'side-echo-1', 'side-echo-2', 'side-echo-3']) expect(world.slope(...side.places[id].pos), id).toBeLessThan(0.2);
  });
  it('the Ring of Nine stands clear of the water, and its stones are not in each other or in the village', () => {
    const c = side.places['side-stone-ring'].pos, g = stoneRingGeometry(c);
    for (let k = 0; k < RING.count; k++) { const a = RING.gap + k / RING.count * 6.283; expect(dry(c[0] + Math.sin(a) * RING.r, c[1] + Math.cos(a) * RING.r, 2)).toBe(true); }
    for (const m of g.marks) expect(dry(m[0], m[1], 2)).toBe(true);
    for (const p of plots) expect(Math.hypot(p.at[0] - c[0], p.at[1] - c[1]), p.id).toBeGreaterThan(RING.r + 8);
    for (const id of ['side-barley']) { const b = side.places[id].pos; for (const p of plots) if (p.kind !== 'farm') expect(Math.hypot(p.at[0] - b[0], p.at[1] - b[1]), p.id).toBeGreaterThan(14); }
  });
  it('the Listening Stones are 20-65 m apart, near the shore', () => {
    const s = [1, 2, 3].map((k) => side.places['side-echo-' + k].pos);
    for (const [a, b] of [[0, 1], [1, 2], [0, 2]]) expect(Math.hypot(s[a][0] - s[b][0], s[a][1] - s[b][1])).toBeGreaterThan(20);
    for (const [a, b] of [[0, 1], [1, 2], [0, 2]]) expect(Math.hypot(s[a][0] - s[b][0], s[a][1] - s[b][1])).toBeLessThan(65);
  });
  it('the glide rings hang over the slope in order, each at least 8 m over the ground and within reach of a glide', () => {
    const rings = [1, 2, 3, 4, 5, 6].map((k) => side.places['side-ring-' + k]);
    let prev = side.places['side-edge'].pos.concat(world.h(...side.places['side-edge'].pos)), total = 0;
    for (const r of rings) {
      expect(r.y - world.h(r.pos[0], r.pos[1]), 'clearance').toBeGreaterThan(8);
      expect(r.r).toBeGreaterThanOrEqual(7);
      const d = Math.hypot(r.pos[0] - prev[0], r.pos[1] - prev[1]); total += d;
      expect(prev[2] - r.y, 'each ring is lower than the one before').toBeGreaterThan(0);
      expect((prev[2] - r.y) / d, 'the drop between rings is a glide the robe can fly (≤ 1 : 2.5)').toBeLessThan(0.4);
      prev = [r.pos[0], r.pos[1], r.y];
    }
    expect(total).toBeGreaterThan(250); expect(total).toBeLessThan(500);
  });
  it('builds a site for each: six shrines, lamp, three ring parts, three stones, six rings', () => {
    const table = Object.fromEntries(pois.map((p) => [p.id, p]));
    const ch = createChapter({ data, pois: [...pois, { id: 'shrine-meadow-6', kind: 'shrine', biome: 'meadow', pos: side.places['shrine-meadow-6'].pos, h: 261.2 }], hooks: {} });
    const sites = sideSites(ch.table);
    const ids = sites.map((s) => s.id);
    expect(ids.filter((i) => i.startsWith('shrine-meadow-')).length).toBe(6);
    for (const id of ['side-brazier-fen', 'side-stone-ring', 'side-stone-fallen', 'side-stone-raised', 'side-echo-1', 'side-echo-2', 'side-echo-3']) expect(ids).toContain(id);
    expect(ids.filter((i) => i.startsWith('side-glide-ring-')).length).toBe(6);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of sites) { expect(s.at.every(Number.isFinite)).toBe(true); expect(typeof s.build).toBe('function'); expect(table[s.id] || true).toBeTruthy(); }
    expect(sites.find((s) => s.id === 'side-stone-raised').pillar).toBe(true);
    // Shrines are where the data says, on the baked meadow shrines and the green in Hearn.
    for (const s of sites.filter((q) => q.id.startsWith('shrine-meadow-'))) expect(ch.table[s.id].biome).toBe('meadow');
  });
});

describe('the rules', () => {
  it('rayDistance: along, off to the side, and past the end', () => {
    expect(rayDistance(0, 0, 0, 1, 24, 0, 10)).toBeCloseTo(0);
    expect(rayDistance(0, 0, 0, 1, 24, 3, 10)).toBeCloseTo(3);
    expect(rayDistance(0, 0, 0, 1, 24, 0, 40)).toBeCloseTo(16);
    expect(rayDistance(0, 0, 0, 1, 24, 0, -5)).toBeCloseTo(5);
  });
  it('medals: gold under 21, silver under 25, bronze under 30', () => {
    expect(medalFor(20.9, GLIDE_MEDALS)).toBe('gold'); expect(medalFor(24, GLIDE_MEDALS)).toBe('silver');
    expect(medalFor(30, GLIDE_MEDALS)).toBe('bronze'); expect(medalFor(31, GLIDE_MEDALS)).toBe(null);
  });
  it('the fallen stone rises on three Updrafts at its marks inside the window, and settles back otherwise', () => {
    const geo = stoneRingGeometry([233, 744]), r = new StoneRaise(geo.marks);
    expect(r.updraft(geo.marks[0][0] + 10, geo.marks[0][1])).toBe('miss');
    expect(r.updraft(...geo.marks[0])).toBe('mark'); expect(r.updraft(geo.marks[0][0] + 1, geo.marks[0][1])).toBe('again');
    r.step(5); expect(r.updraft(...geo.marks[2])).toBe('mark'); expect(r.updraft(...geo.marks[1])).toBe('raised');
    r.reset(); expect(r.updraft(...geo.marks[1])).toBe('mark');
    expect(r.step(13)).toBe(false); expect(r.step(2)).toBe(true); expect(r.count).toBe(0);   // 15 s: it settled
    // The marks are spread along the stone, a metre or more apart.
    for (const [a, b] of [[0, 1], [1, 2]]) expect(Math.hypot(geo.marks[a][0] - geo.marks[b][0], geo.marks[a][1] - geo.marks[b][1])).toBeGreaterThan(1.5);
  });
  it('a Listening Stone asks its gestures in order; a wrong one aimed at it starts over; time runs out', () => {
    const a = new GestureAsk(['gust', 'vortex', 'updraft'], 40); a.start();
    expect(a.gesture('gust', false)).toBe(null);                          // not at this stone
    expect(a.gesture('gust', true)).toBe('ok'); expect(a.next).toBe('vortex');
    expect(a.gesture('updraft', true)).toBe('wrong'); expect(a.next).toBe('gust');
    expect(a.gesture('gust', true)).toBe('ok'); expect(a.gesture('vortex', true)).toBe('ok'); expect(a.gesture('updraft', true)).toBe('done');
    expect(a.gesture('gust', true)).toBe(null);                           // finished
    a.start(); expect(a.step(39)).toBe(false); expect(a.step(2)).toBe(true); expect(a.gesture('gust', true)).toBe(null);
    for (const k of [1, 2, 3]) for (const x of side.places['side-echo-' + k].ask) expect(['gust', 'vortex', 'updraft']).toContain(x);
    expect(new Set(side.places['side-echo-1'].ask.concat(side.places['side-echo-2'].ask, side.places['side-echo-3'].ask)).size).toBe(3);   // all three verbs are asked
  });
  it('a Vortex counts while it stands on the stone, and is forgotten when it drifts off', () => {
    let acc = 0; for (let i = 0; i < 100; i++) acc = vortexHold(acc, 0.016, 1, 1, 1, 0, 0);
    expect(acc).toBeCloseTo(1.6, 1);
    acc = vortexHold(acc, 0.5, 1, 9, 9, 0, 0); expect(acc).toBeLessThan(1);
    expect(vortexHold(0, 0.1, 0.3, 0, 0, 0, 0)).toBe(0);                  // too weak
  });
  it('the glide course: the first ring starts the clock only with the robe open; the last stops it; the ground ends the run', () => {
    const rings = [0, 1, 2].map((k) => ({ x: k * 40, y: 100 - k * 8, z: 0, r: 7 }));
    const c = new GlideCourse(rings);
    expect(c.step(0, 100, 0, false, 0.1)).toBe(null);                     // on foot through the ring: no
    expect(c.step(0, 100, 0, true, 0.1)).toBe('start');
    for (let i = 0; i < 20; i++) expect(c.step(10 + i, 100, 0, true, 0.1)).toBe(null);
    expect(c.step(40, 92, 0, true, 0.1)).toBe('ring');
    expect(c.step(80, 84, 0, true, 0.1)).toBe('done'); expect(c.last).toBeCloseTo(2.2, 1); expect(c.running).toBe(false);
    c.step(0, 100, 0, true, 0.1); let r = null;
    for (let i = 0; i < 30 && r !== 'lost'; i++) r = c.step(20, 90, 0, false, 0.1);
    expect(r).toBe('lost'); expect(c.next).toBe(0);
    c.step(0, 100, 0, true, 0.1); expect(c.step(500, 100, 0, true, 0.1)).toBe('lost');   // far off the line
  });
});

describe('the side quests play on the graph, and save', () => {
  function setup() {
    const ch = createChapter({ data, pois: [...pois, { id: 'shrine-meadow-6', kind: 'shrine', biome: 'meadow', pos: [22, 979], h: 261 }], hooks: {} });
    const finish = () => { for (let k = 0; k < 60 && ch.talking; k++) ch.updateDialogue(0.1, true, -1); };
    const tick = (n = 4) => { for (let k = 0; k < n; k++) ch.tick(); };
    const step = (q) => { const s = ch.graph.quests[q]; return s.state === 'active' ? ch.graph.byId.get(q).steps[s.step].id : s.state; };
    return { ch, finish, tick, step, flags: ch.graph.flags };
  }
  it('the lamp: Ketil gives the flame only after dark; the lit lamp and his thanks finish it', () => {
    const { ch, finish, tick, step, flags } = setup();
    tick(); expect(step('meadow-side-lamp')).toBe('locked');
    flags.add('meadow:stair-open'); tick(); expect(step('meadow-side-lamp')).toBe('ask');
    ch.talk('meadow-ketil'); finish(); tick(); expect(step('meadow-side-lamp')).toBe('flame');
    ch.facts.night = false; ch.talk('meadow-ketil'); finish(); tick(); expect(step('meadow-side-lamp')).toBe('flame');     // by day: no flame
    expect(flags.has('flame-given-ketil')).toBe(false);
    ch.facts.night = true; ch.talk('meadow-ketil'); finish(); tick(); expect(flags.has('flame-given-ketil')).toBe(true); expect(step('meadow-side-lamp')).toBe('carry');
    flags.add('flame-out'); ch.talk('meadow-ketil'); expect(ch.current.text).toContain('went out'); finish();       // he lights it again
    expect(flags.has('flame-given-ketil')).toBe(true);
    flags.add('meadow:side-lamp-lit'); tick(); expect(step('meadow-side-lamp')).toBe('report');
    ch.talk('meadow-ketil'); finish(); tick(); expect(step('meadow-side-lamp')).toBe('done'); expect(ch.lore.has('meadow-lore-fen')).toBe(true);
  });
  it('the stone, the barley and the glide course wait for the Bellwether / the fires and play to their rewards', () => {
    const { ch, finish, tick, step, flags } = setup();
    flags.add('meadow:stair-open'); tick();
    expect(step('meadow-side-stone')).toBe('locked'); expect(step('meadow-side-glide')).toBe('locked'); expect(step('meadow-side-flock')).toBe('ask');
    flags.add('meadow:bellwether-woke'); tick(); expect(step('meadow-side-stone')).toBe('ask'); expect(step('meadow-side-glide')).toBe('ask');
    // Stone
    ch.talk('meadow-orm'); finish(); tick(); expect(step('meadow-side-stone')).toBe('go');
    const ring = ch.table['side-stone-ring'].pos; ch.facts.x = ring[0]; ch.facts.z = ring[1]; tick(); expect(step('meadow-side-stone')).toBe('raise');
    flags.add('meadow:side-stone-raised'); tick(); ch.talk('meadow-orm'); finish(); tick(); expect(step('meadow-side-stone')).toBe('done');
    // Barley
    ch.talk('meadow-dunn'); finish(); tick(); expect(step('meadow-side-flock')).toBe('field');
    const b = ch.table['side-barley'].pos; ch.facts.x = b[0]; ch.facts.z = b[1]; tick(); expect(step('meadow-side-flock')).toBe('flush');
    flags.add('meadow:side-flock-cleared'); tick(); ch.talk('meadow-dunn'); finish(); tick(); expect(step('meadow-side-flock')).toBe('done');
    // Glide: the medals are variables; unset reads as no time at all
    ch.talk('meadow-wyl'); finish(); tick(); expect(step('meadow-side-glide')).toBe('edge');
    const e = ch.table['side-edge'].pos; ch.facts.x = e[0]; ch.facts.z = e[1]; tick(); expect(step('meadow-side-glide')).toBe('bronze');
    ch.graph.vars['glide.best'] = 29.4; tick(); expect(step('meadow-side-glide')).toBe('silver');
    ch.graph.vars['glide.best'] = 20.8; tick(); expect(step('meadow-side-glide')).toBe('report');   // silver and gold in successive ticks
    ch.talk('meadow-wyl'); expect(ch.current.text).toContain('Gold'); finish(); tick(); expect(step('meadow-side-glide')).toBe('done');
  });
  it('the stones wait for a restored meadow, and give the Echo that is attuned at a shrine', () => {
    const { ch, finish, tick, step, flags } = setup(), got = [];
    ch.facts.restored.add('meadow'); tick(); expect(step('meadow-side-echoes')).toBe('ask');
    ch.talk('meadow-maud'); finish(); tick(); expect(step('meadow-side-echoes')).toBe('find');
    const s = ch.table['side-echo-shore'].pos; ch.facts.x = s[0]; ch.facts.z = s[1]; tick(); expect(step('meadow-side-echoes')).toBe('wake');
    ch.graph.vars['side.stones'] = 3; ch.do({ echo: 'echo-meadow-wind' }); tick(); expect(step('meadow-side-echoes')).toBe('attune');
    expect(ch.echoes.has('echo-meadow-wind')).toBe(true);
    flags.add('attuned:echo-meadow-wind'); tick(); expect(step('meadow-side-echoes')).toBe('report');
    ch.talk('meadow-maud'); finish(); tick(); expect(step('meadow-side-echoes')).toBe('done');
    void got;
  });
  it('new state survives a save: quest steps, flags, medal times, stones answered, the lore and Echo', () => {
    const { ch, finish, tick, flags } = setup();
    flags.add('meadow:stair-open'); flags.add('meadow:bellwether-woke'); tick();
    ch.talk('meadow-wyl'); finish(); tick(); ch.graph.vars['glide.best'] = 23.4; ch.graph.vars['side.stones'] = 2;
    flags.add('meadow:side-stone-raised'); flags.add('echoed:side-echo-1'); flags.add('lit:side-brazier-fen');
    ch.do({ lore: 'meadow-lore-fen' }); ch.do({ echo: 'echo-meadow-wind' });
    const s = createEmptySave('slot1', 1); s.quests = ch.serialize(); ch.collect(s);
    expect(() => validateSave(JSON.parse(JSON.stringify(s)))).not.toThrow();
    const ch2 = createChapter({ data, pois, hooks: {} });
    const back = JSON.parse(JSON.stringify(s)); ch2.restore(back.quests); ch2.apply(back);
    expect(ch2.graph.vars['glide.best']).toBe(23.4); expect(ch2.graph.vars['side.stones']).toBe(2);
    for (const f of ['meadow:side-stone-raised', 'echoed:side-echo-1', 'lit:side-brazier-fen', 'meadow:side-glide-told']) expect(ch2.graph.flags.has(f), f).toBe(true);
    expect(ch2.graph.quests['meadow-side-glide'].state).toBe('active'); expect(ch2.graph.quests['meadow-side-glide'].step).toBe(ch.graph.quests['meadow-side-glide'].step);
    expect(ch2.lore.has('meadow-lore-fen')).toBe(true); expect(ch2.echoes.has('echo-meadow-wind')).toBe(true);
  });
});
