import { describe, it, expect } from 'vitest';
import frost from '../data/quests/frost.json';
import meadow from '../data/quests/meadow.json';
import side from '../data/quests/meadow-side.json';
import { mergeChapters } from '../src/game/chapter.js';
import { TRADERS } from '../src/game/economy/traders.js';
import { CONSUMABLES, MATERIALS } from '../src/game/economy/items.js';
import { FORGE_COST } from '../src/game/weapons/tiers.js';
import { backPay } from '../src/game/economy/rewards.js';
import { QuestGraph } from '../src/game/quests/questGraph.js';

const data = mergeChapters(frost, meadow, side);
const rewardsOf = (q) => [...q.steps.flatMap((s) => s.actions || []), ...(q.optional || []).flatMap((s) => s.actions || []), ...(q.onDone || [])];
const sum = (qs, f) => qs.flatMap(rewardsOf).reduce((n, a) => n + f(a), 0);
const marks = (a) => a.marks || 0;
const tier3 = FORGE_COST[1].marks + FORGE_COST[2].marks + FORGE_COST[3].marks;
const biome = (id) => (id.startsWith('meadow') ? 'meadow' : 'frost');

describe('the economy\'s faucets (docs §11.4 targets)', () => {
  const main = (b) => data.quests.filter((q) => q.kind === 'main' && biome(q.id) === b);
  const sides = (b) => data.quests.filter((q) => q.kind === 'side' && biome(q.id) === b);
  it('each biome\'s main path pays about 1.5x a weapon\'s first three tiers', () => {
    for (const b of ['frost', 'meadow']) {
      const m = sum(main(b), marks);
      expect(m).toBeGreaterThanOrEqual(tier3 * 1.45);
      expect(m).toBeLessThanOrEqual(tier3 * 1.6);
    }
  });
  it('side quests pay the most of all (docs: quests and sites pay the most)', () => {
    for (const b of ['frost', 'meadow']) expect(sum(sides(b), marks)).toBeGreaterThan(sum(main(b), marks) * 0.5);
    const total = sum(data.quests, marks);
    expect(total).toBeGreaterThan(1000);
  });
  it('every quest of the first two chapters pays something', () => {
    for (const q of data.quests) expect(sum([q], marks) + sum([q], (a) => (a.give ? 1 : 0)) + sum([q], (a) => (a.thread ? 1 : 0)), q.id).toBeGreaterThan(0);
  });
  it('the whole of both chapters buys one weapon to tier 5 and a second to tier 2, with marks to spare for the pouch', () => {
    const all = sum(data.quests, marks), full = FORGE_COST.slice(1).reduce((n, c) => n + c.marks, 0);
    const two = FORGE_COST[1].marks + FORGE_COST[2].marks;
    expect(all).toBeGreaterThan(full + two);
    expect(all).toBeLessThan((full + two) * 2);                   // not enough to buy everything: choices stay choices
  });
  it('materials: every kind a quest gives is one the forge asks for, and the supply is short of every tier', () => {
    const supply = {};
    for (const a of data.quests.flatMap(rewardsOf)) if (a.give) for (const id in a.give) { expect(MATERIALS[id], id).toBeTruthy(); supply[id] = (supply[id] || 0) + a.give[id]; }
    const need = {};
    for (const c of FORGE_COST.slice(1)) for (const id in c.mats) need[id] = (need[id] || 0) + c.mats[id];
    for (const id in supply) expect(need[id], id + ' is wanted by the forge').toBeGreaterThan(0);
    expect(supply['hedge-heart']).toBeGreaterThanOrEqual(need['hedge-heart']);       // one weapon can be finished
    expect(supply['hedge-heart']).toBeLessThan(need['hedge-heart'] * 2);              // but not two
    expect(supply['rime-core']).toBeGreaterThanOrEqual(8);
  });
  it('threads and flask upgrades come from deeds, and stay under the caps', () => {
    const threads = data.quests.flatMap(rewardsOf).filter((a) => a.thread).length, flasks = data.quests.flatMap(rewardsOf).filter((a) => a.flask).length;
    expect(threads).toBe(4);              // frost Warden, den mother, Shapers' Run gold, the Bellwether (the dunes' Warden adds the fifth)
    expect(flasks).toBe(2);
  });
});

describe('traders and talk', () => {
  it('every stock line is a real consumable, and every condition names real quests', () => {
    const ids = new Set(data.quests.map((q) => q.id));
    for (const t of Object.values(TRADERS)) for (const l of t.stock) {
      expect(CONSUMABLES[l.id], l.id).toBeTruthy();
      if (l.when?.quest) expect(ids.has(l.when.quest), l.when.quest).toBe(true);
    }
  });
  it('every { trade } names a trader or the smith, and each trader can be reached by talk', () => {
    const named = [];
    for (const npc in data.talk) for (const t of data.talk[npc]) if (t.trade) named.push([npc, t.trade]);
    for (const d of Object.values(data.dialogue)) for (const a of d.then || []) if (a.trade) named.push(['dialogue', a.trade]);
    for (const [, id] of named) expect(TRADERS[id] || id === 'garrow', id).toBeTruthy();
    for (const id of [...Object.keys(TRADERS), 'garrow']) expect(named.some(([, t]) => t === id), id).toBe(true);
    for (const [npc] of named) if (npc !== 'dialogue') expect(data.npcs.some((n) => n.id === npc)).toBe(true);
  });
  it('the sled-trader is at the frost camp and Corin and Garrow keep shop only once the fires are out', () => {
    const osk = data.npcs.find((n) => n.id === 'osk');
    expect(osk.home.poi).toBe('camp-frost');
    for (const npc of ['meadow-corin', 'meadow-garrow']) expect(JSON.stringify(data.talk[npc][0].when)).toContain('meadow:stair-open');
  });
});

describe('back-pay for old saves', () => {
  it('a save partway through the Burning Night is paid for the steps it finished', () => {
    const pay = (q) => backPay(data.quests, q).reduce((n, a) => n + (a.marks || 0), 0);
    const g = new QuestGraph(data.quests, {});
    const i = g.stepIndex('meadow-the-burning-night', 'thanks');
    expect(pay({ 'meadow-the-burning-night': { state: 'active', step: i + 1 } })).toBe(40 + 60);
    expect(pay({ 'meadow-the-burning-night': { state: 'done', step: 9 } })).toBe(345);
  });
});
