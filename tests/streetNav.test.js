import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createStreetNav, followRoute, walkTo } from '../src/game/streetNav.js';

// An L of street: east along z = 0 from (0,0) to (60,0), then north along x = 60 to (60,60).
const L = [{ id: 'a', pts: [[0, 0], [20, 0], [40, 0], [60, 0]] }, { id: 'b', pts: [[60, 0], [60, 20], [60, 40], [60, 60]] }];
const fig = (x, z) => ({ x, z, vx: 0, vz: 0, yaw: 0 });

describe('street graph', () => {
  it('joins consecutive points, touching streets and dead ends', () => {
    const nav = createStreetNav(L);
    expect(nav.nodes.length).toBe(8);
    expect(nav.edges[nav.nearestNode(20, 0)].length).toBe(2);
    expect(nav.nodePath(nav.nearestNode(0, 0), nav.nearestNode(60, 60)).length).toBe(8);
    // a dead end 5 m from another street joins it
    const T = createStreetNav([{ pts: [[0, 0], [30, 0]] }, { pts: [[34, 3], [34, 40]] }]);
    expect(T.nodePath(T.nearestNode(0, 0), T.nearestNode(34, 40))).toBeTruthy();
  });
  it('builds from the real village', () => {
    const v = JSON.parse(fs.readFileSync('data/world/village.json', 'utf8'));
    const nav = createStreetNav(v.roads);
    expect(nav.nodes.length).toBeGreaterThan(100);
    const m = [93.28, 925.8], r = nav.route(m[0] + 80, m[1] + 80, m[0], m[1]);
    expect(r[r.length - 1]).toEqual(m);
  });
});

describe('routes', () => {
  it('turns the corner instead of cutting across', () => {
    const nav = createStreetNav(L);
    const r = nav.route(2, 1, 58, 58);
    expect(r.some((p) => p[0] === 60 && p[1] === 0)).toBe(true);
    expect(r[r.length - 1]).toEqual([58, 58]);
  });
  it('goes straight for a short hop, with no streets, or when the detour is silly', () => {
    const nav = createStreetNav(L);
    expect(nav.route(0, 0, 8, 3)).toEqual([[8, 3]]);
    expect(createStreetNav([]).route(0, 0, 100, 100)).toEqual([[100, 100]]);
    expect(nav.route(30, 1, 30, 20)).toEqual([[30, 20]]); // both near the same street point: no gain from the detour
  });
  it('caches per node pair and caps the cache', () => {
    const nav = createStreetNav(L, { short: 12, join: 3, end: 6, reach: 1.2, regoal: 2, cache: 2, budget: 2 });
    nav.route(1, 1, 59, 59); nav.route(2, 2, 58, 58);
    expect(nav.searches).toBe(1);
    nav.route(1, 1, 59, 30); nav.route(1, 1, 30, 1); nav.route(21, 1, 59, 59);
    expect(nav.cacheSize).toBeLessThanOrEqual(2);
  });
});

describe('following', () => {
  it('advances through waypoints and arrives', () => {
    const nav = createStreetNav(L), st = fig(2, 1), route = nav.route(2, 1, 58, 58);
    let sp = 1, t = 0;
    for (; t < 200 && sp > 0; t += 0.1) sp = followRoute(st, route, 0, 3, 0.1);
    expect(sp).toBe(0);
    expect(Math.hypot(st.x - 58, st.z - 58)).toBeLessThan(0.1);
    expect(st.routeI).toBe(route.length - 1);
    expect(t).toBeLessThan(60);
  });
  it('walkTo keeps to the street, re-routes only when the goal moves, and respects the budget', () => {
    const nav = createStreetNav(L), st = fig(2, 1);
    let maxX = 0;
    for (let k = 0; k < 400; k++) { walkTo(nav, st, 58, 58, 0, 3, 0.1); maxX = Math.max(maxX, st.x); if (k === 5) expect(st.z).toBeLessThan(5); }
    expect(nav.spent).toBe(1);
    expect(Math.hypot(st.x - 58, st.z - 58)).toBeLessThan(0.2);
    walkTo(nav, st, 58.5, 58, 0, 3, 0.1); expect(nav.spent).toBe(1);
    walkTo(nav, st, 10, 40, 0, 3, 0.1); expect(nav.spent).toBe(2);
    const o = fig(0, 0);
    nav.spent = 2; walkTo(nav, o, 50, 50, 0, 3, 0.1);
    expect(o.route).toBeUndefined(); expect(o.x).toBeGreaterThan(0); // straight step, no search
    nav.newFrame(); expect(nav.spent).toBe(0);
  });
});
