import { describe, it, expect } from 'vitest';
import { QuestGraph } from '../src/game/quests/questGraph.js';
import { createNav, bearing, angleDiff, compassPoint, formatDistance } from '../src/game/nav.js';

const pois = [
  { id: 'camp', kind: 'camp', pos: [0, 100], h: 0 },
  { id: 'stone', kind: 'echo-stone', pos: [200, 0], h: 0 },
  { id: 'shrine', kind: 'shrine', pos: [-250, -250], h: 0 },
  { id: 'ignored', kind: 'unknown-kind', pos: [0, 0], h: 0 },
];
const defs = [
  { id: 'main', kind: 'main', title: 'Main', summary: '', steps: [{ id: 'a', journal: '.', when: { event: 'x' }, goal: { poi: 'camp' } }] },
  { id: 'side', kind: 'side', title: 'Side', summary: '', steps: [{ id: 'a', journal: '.', when: { event: 'y' }, goal: { at: [40, 0], label: 'Tobin' } }],
    optional: [{ id: 'o', journal: '.', when: { event: 'z' }, goal: { dynamic: 'gate' } }] },
];
const none = () => ({ x: 0, z: 0, events: new Set(), restored: new Set() });

describe('compass geometry', () => {
  it('bearings are clockwise from north (+z); differences wrap', () => {
    expect(bearing(0, 0, 0, 10)).toBeCloseTo(0);
    expect(bearing(0, 0, 10, 0)).toBeCloseTo(Math.PI / 2);
    expect(bearing(0, 0, 0, -10)).toBeCloseTo(Math.PI);
    expect(bearing(0, 0, -10, 0)).toBeCloseTo(1.5 * Math.PI);
    expect(angleDiff(0.1, 2 * Math.PI - 0.1)).toBeCloseTo(0.2);
    expect(angleDiff(2 * Math.PI - 0.1, 0.1)).toBeCloseTo(-0.2);
    expect(compassPoint(0)).toBe('N'); expect(compassPoint(Math.PI / 2)).toBe('E');
    expect(compassPoint(Math.PI * 1.1)).toBe('SSW'); expect(compassPoint(-0.1)).toBe('N');
  });
  it('formats distances', () => {
    expect(formatDistance(37)).toBe('37 m'); expect(formatDistance(312)).toBe('310 m'); expect(formatDistance(1234)).toBe('1.2 km');
  });
});

describe('navigation registry', () => {
  it('discovers places by sighting radius; hidden kinds only up close; unknown kinds are skipped', () => {
    const graph = new QuestGraph(defs, {});
    const found = [];
    const nav = createNav({ pois, graph, onDiscover: (p) => found.push(p.id) });
    expect(nav.places.map((p) => p.id)).toEqual(['camp', 'stone', 'shrine']);
    nav.px = 0; nav.pz = 0; nav.update(0.1);
    expect(found).toEqual(['camp']);                 // 100 m: inside the camp's 380, outside the stone's 90
    nav.px = 150; nav.pz = 0; nav.update(0.1);
    expect(found).toEqual(['camp', 'stone']);        // within 90 m of the stone
    expect(graph.flags.has('known:stone')).toBe(true);
    nav.update(0.1); expect(found.length).toBe(2);   // once
  });
  it('resolves goals (main first, optional last), tracks the first main goal and cycles', () => {
    const graph = new QuestGraph(defs, {});
    const nav = createNav({ pois, graph, dynamic: { gate: () => ({ x: 0, z: -60, name: 'Gate 3' }) } });
    graph.tick(none());                    // both quests active
    nav.px = 0; nav.pz = 0; nav.update(0.3);
    expect(nav.goals.map((g) => g.id)).toEqual(['main:a', 'side:a', 'side:o']);
    expect(nav.tracked).toBe('main:a');
    const g = nav.trackedGoal;
    expect(g.name).toBe('A Camp'); expect(g.dist).toBeCloseTo(100); expect(g.rel).toBeCloseTo(0);
    nav.heading = Math.PI / 2; nav.update(0.3);
    expect(nav.trackedGoal.rel).toBeCloseTo(-Math.PI / 2);  // camp is now to the left
    expect(nav.goals[1].name).toBe('Tobin'); expect(nav.goals[2].name).toBe('Gate 3'); expect(nav.goals[2].optional).toBe(true);
    expect(nav.cycle()).toBe('side:a'); nav.update(0.3); expect(nav.tracked).toBe('side:a');
    nav.cycle(); nav.cycle(); nav.update(0.3); expect(nav.tracked).toBe('main:a');
  });
  it('falls back when the tracked goal ends, and restores known places from flags', () => {
    const graph = new QuestGraph(defs, {});
    const nav = createNav({ pois, graph });
    graph.tick(none()); nav.update(0.3);
    nav.track('side:a'); nav.update(0.3); expect(nav.tracked).toBe('side:a');
    const ev = none(); ev.events.add('y'); graph.tick(ev); nav.update(0.3);   // side quest step done → quest done
    expect(nav.tracked).toBe('main:a');
    graph.flags.add('known:shrine'); graph.flags.add('visited:shrine'); nav.sync();
    expect(nav.byId.get('shrine').known && nav.byId.get('shrine').visited).toBe(true);
  });
});
