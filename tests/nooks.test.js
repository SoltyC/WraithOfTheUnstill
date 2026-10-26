import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { NOOKS, nookPois, foundNookMarks, foundFlag } from '../src/game/nooks.js';
import { nookSites } from '../src/world/nookSites.js';
import { buildArchitecture, NO_SNOW } from '../src/world/architecture.js';
import { ARCH_SITES } from '../src/shaders/architecture.wgsl.js';
import { createNav, KINDS } from '../src/game/nav.js';
import { QuestGraph } from '../src/game/quests/questGraph.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'));

describe('nook data', () => {
  it('has unique ids, placed on the world, and one payoff kind each', () => {
    expect(NOOKS.length).toBeGreaterThanOrEqual(36);
    expect(new Set(NOOKS.map((n) => n.id)).size).toBe(NOOKS.length);
    for (const n of NOOKS) {
      expect(n.id).toMatch(n.biome === 'meadow' ? /^nook-m-/ : /^nook-f-/);
      expect(n.pos.every(Number.isFinite) && Number.isFinite(n.h) && Number.isFinite(n.facing), n.id).toBe(true);
      const p = n.payoff, kinds = ['lore', 'rem', 'guide'].filter((k) => p[k]);
      expect(kinds.length, n.id).toBe(1);
      if (p.lore) expect(p.lore.text.length, n.id).toBeGreaterThan(40);
      if (p.guide) expect(p.say, n.id).toBeTruthy();
      if (p.reward) expect(Object.keys(p.reward), n.id).toEqual(['marks']);   // the economy's hook: data only
    }
  });
  it('keeps nooks 40 m apart and a guide only to places that exist', () => {
    for (let i = 0; i < NOOKS.length; i++) for (let j = i + 1; j < NOOKS.length; j++) {
      expect(Math.hypot(NOOKS[i].pos[0] - NOOKS[j].pos[0], NOOKS[i].pos[1] - NOOKS[j].pos[1]), NOOKS[i].id + ' ' + NOOKS[j].id).toBeGreaterThan(39);
    }
    const known = new Set(read('data/world/pois.json').pois.map((p) => p.id));
    for (const f of ['frost', 'meadow', 'meadow-side']) for (const id in read(`data/quests/${f}.json`).places || {}) known.add(id);
    for (const n of NOOKS) for (const id of n.payoff.guide || []) expect(known.has(id), n.id + ' guides to ' + id).toBe(true);
  });
});

describe('nook sites', () => {
  const sites = nookSites(NOOKS), built = buildArchitecture(sites);
  it('builds a site for every nook, without NaN, over the ground and bounded', () => {
    expect(sites.length).toBe(NOOKS.length);
    for (let i = 0; i < sites.length; i++) {
      const r = built.ranges[i];
      expect(r.v1 - r.v0, sites[i].id).toBeGreaterThan(100);
      for (let v = r.v0; v < r.v1; v++) {
        const x = built.positions[v * 3], y = built.positions[v * 3 + 1], z = built.positions[v * 3 + 2];
        expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z), sites[i].id).toBe(true);
        expect(Math.abs(x) < 8 && Math.abs(z) < 8 && y > -2.6 && y < 4, sites[i].id).toBe(true);
      }
    }
    expect(built.positions.length / 3).toBeLessThan(150000);
  });
  it('keeps meadow nooks snow-free and fits the shader site table', () => {
    for (const s of sites) expect(NO_SNOW.test(s.id), s.id).toBe(s.id.startsWith('nook-m-'));
    expect(ARCH_SITES).toBeGreaterThanOrEqual(402 + sites.length);     // 402 sites before the nooks
  });
});

describe('nook discovery', () => {
  const setup = () => {
    const graph = new QuestGraph([], {}), found = [];
    const nav = createNav({ pois: nookPois(), graph, onDiscover: (p) => found.push(p.id) });
    return { graph, nav, found };
  };
  it('are hidden from the compass: never sensed, even standing on one', () => {
    expect(KINDS.nook.hidden).toBe(true);
    const { nav, found, graph } = setup();
    const n = NOOKS[0];
    nav.px = n.pos[0]; nav.pz = n.pos[1]; nav.update(0.1);
    expect(nav.places.length).toBe(NOOKS.length);
    expect(nav.places.every((p) => !p.known)).toBe(true);
    expect(found).toEqual([]);
    expect(graph.flags.size).toBe(0);
  });
  it('are known and quiet once found, and stay so after a load', () => {
    const { nav, graph } = setup();
    const n = NOOKS[1];
    graph.flags.add(foundFlag(n.id));
    expect(nav.know(n.id)).toBe(true); nav.visit(n.id);
    const p = nav.byId.get(n.id);
    expect(p.known && p.visited).toBe(true);
    expect(nav.places.filter((q) => q.known).length).toBe(1);
    // A load: a fresh registry over the saved flags.
    const g2 = new QuestGraph([], {}); g2.restore(graph.serialize());
    const nav2 = createNav({ pois: nookPois(), graph: g2 });
    expect(nav2.byId.get(n.id).known && nav2.byId.get(n.id).visited).toBe(true);
    expect(nav2.places.filter((q) => q.known).length).toBe(1);
  });
  it('show on the map only once found, in their own view', () => {
    const flags = new Set(), pois = nookPois();
    expect(foundNookMarks(pois, flags, 'frost')).toEqual([]);
    const fn = NOOKS.find((n) => n.biome === 'frost'), mn = NOOKS.find((n) => n.biome === 'meadow');
    flags.add(foundFlag(fn.id));
    expect(foundNookMarks(pois, flags, 'frost')).toEqual([{ x: fn.pos[0], z: fn.pos[1], name: null, kind: 'nook' }]);
    expect(foundNookMarks(pois, flags, 'meadow')).toEqual([]);
    flags.add(foundFlag(mn.id));
    expect(foundNookMarks(pois, flags, 'meadow').length).toBe(1);
  });
});
