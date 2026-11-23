import { describe, expect, it } from 'vitest';
import { QuestGraph } from '../src/game/quests/questGraph.js';
import { checkEntries, ENTRIES } from '../src/game/remembrance.js';
import { Builder } from '../src/world/architecture.js';
import ember from '../data/quests/ember.json';
import * as camp from '../src/world/refugeeKit.js';

const builders = [
  'tarpShelter', 'leanTo', 'loadedCart', 'handcart', 'barrow', 'bundles',
  'cookfire', 'bedrolls', 'washLine', 'pen', 'lookout',
];
const families = [
  ['aled', 'farm'], ['bethan', 'farm'], ['huw', 'farm'], ['ffion', 'farm'],
  ['gwil', 'farm'], ['mari', 'farm'], ['cinderhold', 'town'], ['chapel', 'chapel'],
];
const options = { seed: 79, mountain: [1630, 490], sea: [0, -1], radius: 45 };
const poses = ['sit', 'stand', 'crouch', 'lie', 'watch'];

/** The headland households at equal sizes, so camp counts can be compared. */
function groups(count, size = 12) {
  return families.slice(0, count).map(([id, kind]) => ({ id, kind, size }));
}

/** The triangles written for a headland in the same Builder that the game uses. */
function triangleCount(count, size) {
  const b = new Builder();
  for (const site of camp.campSites(groups(count, size), options)) site.build(b);
  return b.idx.length / 3;
}

describe('headland belongings', () => {
  it.each(builders)('%s is repeatable and changes shape with the seed', (what) => {
    // The same object on a different day, built fresh from its seed.
    const build = (seed) => {
      const b = new Builder();
      camp[what](b, 2, -3, 0.38, seed);
      return b;
    };
    const first = build(481);
    expect(first.pos.length).toBeGreaterThan(0);
    expect(first.pos.every(Number.isFinite)).toBe(true);
    expect(build(481).pos).toEqual(first.pos);
    expect(build(482).pos).not.toEqual(first.pos);
    expect(first.slots.length).toBeGreaterThan(0);
    expect(first.slots.every((slot) => poses.includes(slot.pose))).toBe(true);
  });
});

describe('headland clearings', () => {
  it.each([0, 1, 4, 8])('fits %i groups with clear walking lanes and places for people', (count) => {
    const layout = camp.campLayout(groups(count), options);
    expect(layout).toEqual(camp.campLayout(groups(count), options));
    expect(layout.plots).toHaveLength(count);
    const sites = camp.campSites(groups(count), options);
    const slots = [];
    for (const site of sites) {
      const b = new Builder();
      site.build(b);
      expect(b.slots ?? []).toEqual(site.slots);
      for (let i = 0; i < b.pos.length; i += 3) {
        expect(Math.hypot(b.pos[i], b.pos[i + 2])).toBeLessThanOrEqual(site.footprint + 0.01);
      }
      for (const slot of site.slots) {
        expect(poses).toContain(slot.pose);
        expect(Math.hypot(slot.x, slot.z)).toBeLessThanOrEqual(site.footprint);
        slots.push({ ...slot, x: slot.x + site.at[0] - 720, z: slot.z + site.at[1] + 2640 });
      }
    }
    expect(slots).toHaveLength(layout.slots.length);
    slots.forEach((slot, i) => {
      expect(slot.x).toBeCloseTo(layout.slots[i].x);
      expect(slot.z).toBeCloseTo(layout.slots[i].z);
      expect(slot.yaw).toBe(layout.slots[i].yaw);
      expect(slot.pose).toBe(layout.slots[i].pose);
    });
    for (const [i, plot] of layout.plots.entries()) {
      expect(Math.hypot(plot.x, plot.z) + plot.r).toBeLessThanOrEqual(options.radius);
      const others = layout.plots.slice(i + 1);
      for (const other of others) {
        const gap = Math.hypot(plot.x - other.x, plot.z - other.z) - plot.r - other.r;
        expect(gap).toBeGreaterThanOrEqual(2.5);
      }
      expect(plot.items.filter((item) => item.what === 'cookfire')).toHaveLength(1);
      for (const item of plot.items.filter((part) => part.what === 'tarpShelter' || part.what === 'leanTo')) {
        expect(Math.cos(item.yaw - plot.yaw)).toBeGreaterThanOrEqual(-1e-9);
        expect(Math.cos(item.yaw)).toBeGreaterThanOrEqual(-1e-9);
      }
    }
    if (!count) {
      expect(layout.middle.map((item) => item.what)).toEqual(['cookfire', 'bundles']);
      expect(layout.middle.map((item) => item.opt)).toEqual([
        { cold: true, large: true }, { abandoned: true },
      ]);
      expect(layout.lookout).toBeNull();
      expect(layout.slots).toEqual([]);
      const b = new Builder();
      sites[0].build(b);
      expect(b.lights).toEqual([]);
      return;
    }
    const [mx, mz] = options.mountain;
    const { x, z, yaw } = layout.lookout;
    const alignment = (Math.sin(yaw) * mx + Math.cos(yaw) * mz) / Math.hypot(mx, mz);
    expect(alignment).toBeGreaterThanOrEqual(Math.cos(Math.PI / 6));
    expect(Math.hypot(x, z)).toBeCloseTo(options.radius - 2);
    expect(sites[0].id).toBe('emb-camp');
  });

  it('adds a shelter for each four people and gives each community its own kind of cart', () => {
    // Count canvas roofs and branch lean-tos together as places to sleep.
    const shelters = (plot) => plot.items.filter((item) => ['tarpShelter', 'leanTo'].includes(item.what));
    expect(shelters(camp.campLayout(groups(1, 2)).plots[0])).toHaveLength(1);
    expect(shelters(camp.campLayout(groups(1, 9)).plots[0])).toHaveLength(3);
    expect(shelters(camp.campLayout(groups(1, 30)).plots[0])).toHaveLength(8);
    const { plots } = camp.campLayout(groups(8));
    expect(plots[0].items.map((item) => item.what)).toContain('loadedCart');
    expect(plots[6].items.map((item) => item.what)).toEqual(expect.arrayContaining(['handcart', 'barrow']));
    expect(plots[7].items.map((item) => item.what)).toEqual(expect.arrayContaining(['handcart', 'bedrolls']));
  });

  it.each([12, 30])('keeps eight plots of %i people under the triangle budget', (size) => {
    expect(triangleCount(8, size)).toBeLessThanOrEqual(40_000);
  });
});

describe('words at the headland', () => {
  const graph = new QuestGraph([], {});
  // The words the survivor actually gets under the chapter's first-match rule.
  const lineFor = (npc, flags) => {
    graph.flags = new Set(flags);
    return ember.talk[npc].find((talk) => graph.test(talk.when, {}))?.say;
  };

  it('gives all elders and kin five valid camp lines ahead of farm dialogue', () => {
    const npcs = ember.npcs.filter((npc) => npc.home?.poi.startsWith('sow-'));
    expect(npcs).toHaveLength(12);
    for (const npc of npcs) {
      const prefix = 'ember.' + npc.id.slice(6) + '.camp.';
      const family = npc.home.poi.split('-')[1];
      const after = ember.talk[npc.id].slice(0, 5);
      expect(after.map((talk) => talk.say)).toEqual(
        ['lied', 'lost', 'shown', 'rumour', 'home'].map((kind) => prefix + kind),
      );
      for (const { say, when } of after) {
        expect(when.flag).toContain('ember:after');
        expect(ember.dialogue[say]?.speaker).toBe(npc.id);
        expect(ember.dialogue[say].lines.every((line) => !line.includes('!'))).toBe(true);
      }
      const departure = 'ember:' + family + '-go';
      expect(lineFor(npc.id, ['ember:after', departure])).toBe(prefix + 'home');
      expect(lineFor(npc.id, [departure])?.startsWith(prefix)).not.toBe(true);
      expect(lineFor(npc.id, ['ember:after', departure, 'ember:' + family + '-stays'])
        ?.startsWith(prefix)).not.toBe(true);
      expect(lineFor(npc.id, ['ember:after', 'ember:' + family + '-lied'])).toBe(prefix + 'lied');
    }
  });

  it('chooses the lie, loss, shown sign, and exposed guild tithe in story order', () => {
    const base = ['ember:after', 'ember:bethan-go', 'ember:tithe-exposed'];
    const shown = [...base, 'ember:sign-bethan', 'ember:bethan-showing'];
    const loss = [...shown, 'ember:huw-stays'];
    expect(lineFor('ember-bethan', base)).toBe('ember.bethan.camp.rumour');
    expect(lineFor('ember-bethan', [...base, 'ember:sign-bethan'])).toBe('ember.bethan.camp.rumour');
    expect(lineFor('ember-bethan', shown)).toBe('ember.bethan.camp.shown');
    expect(lineFor('ember-bethan', loss)).toBe('ember.bethan.camp.lost');
    expect(lineFor('ember-bethan', [...loss, 'ember:bethan-lied'])).toBe('ember.bethan.camp.lied');
    expect(lineFor('ember-huw', ['ember:after', 'ember:huw-go', 'ember:lie-found']))
      .toBe('ember.huw.camp.rumour');
  });

  it('records both possible fates for each Ember community', () => {
    expect(checkEntries()).toEqual([]);
    const entries = ENTRIES.filter((entry) => entry.id.startsWith('ember-'));
    expect(entries).toHaveLength(16);
    for (const [id, kind] of families) {
      const fled = kind === 'farm' ? 'ember:' + id + '-go' : 'ember:fled-' + id;
      const stayed = kind === 'farm' ? 'ember:' + id + '-stays' : 'ember:lost-' + id;
      expect(entries.filter((entry) => [fled, stayed].includes(entry.has))).toEqual([
        expect.objectContaining({ id: 'ember-' + id + '-out', group: 'people', has: fled }),
        expect.objectContaining({ id: 'ember-' + id + '-stayed', group: 'people', has: stayed }),
      ]);
    }
  });
});
