// Street navigation for the people of Hearn: a graph over village.json `roads` (polylines of [x, z]),
// A* over it, and a follower that walks a route with stepToward's pacing. Pure (no Babylon, no game
// state); systems/villagers.js builds one graph and routes every long walk by it so villagers keep to
// the streets instead of crossing gardens and house walls in a straight line. tests/streetNav.test.js.

import { stepToward } from './villagers.js';

/** Tuning: walks shorter than `short` m go straight; points within `join` m of another street join it;
 *  a dead end joins the nearest other street within `end` m; a waypoint is passed within `reach` m;
 *  a goal that moved more than `regoal` m re-routes; `cache` routes kept; `budget` A* runs per frame. */
export const NAV = { short: 12, join: 3, end: 6, reach: 1.2, regoal: 2, cache: 512, budget: 2 };

const hyp = Math.hypot;

/** @param {Array<{pts:number[][]}|number[][]>} roads  @returns the street graph with route(), nearestNode(), ... */
export function createStreetNav(roads, T = NAV) {
  const P = [], E = [], ends = [], rid = [];
  roads.forEach((r, ri) => {
    const pts = r.pts || r; let prev = -1;
    for (let k = 0; k < pts.length; k++) {
      const i = P.length; P.push([pts[k][0], pts[k][1]]); E.push([]); rid.push(ri);
      if (prev >= 0) link(prev, i);
      if (k === 0 || k === pts.length - 1) ends.push(i);
      prev = i;
    }
  });
  const n = P.length;
  function link(a, b) {
    if (a === b || E[a].some((e) => e[0] === b)) return;
    const d = hyp(P[a][0] - P[b][0], P[a][1] - P[b][1]);
    E[a].push([b, d]); E[b].push([a, d]);
  }
  // Streets that touch (their points within `join` m) are one network; dead ends reach for the nearest other street.
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (rid[i] !== rid[j] && Math.abs(P[i][0] - P[j][0]) < T.join && hyp(P[i][0] - P[j][0], P[i][1] - P[j][1]) < T.join) link(i, j);
  }
  for (const i of ends) {
    let b = -1, bd = T.end;
    for (let j = 0; j < n; j++) { if (rid[j] === rid[i]) continue; const d = hyp(P[i][0] - P[j][0], P[i][1] - P[j][1]); if (d < bd) { bd = d; b = j; } }
    if (b >= 0) link(i, b);
  }

  const gS = new Float64Array(n), prevN = new Int32Array(n), seen = new Int32Array(n), shut = new Int32Array(n), open = new Int32Array(n);
  let stamp = 0;
  const cache = new Map();
  const nav = {
    nodes: P, edges: E, spent: 0, searches: 0,
    /** Index of the street point nearest (x, z), -1 if there are no streets. */
    nearestNode(x, z) {
      let b = -1, bd = 1e18;
      for (let i = 0; i < n; i++) { const d = (P[i][0] - x) ** 2 + (P[i][1] - z) ** 2; if (d < bd) { bd = d; b = i; } }
      return b;
    },
    /** Node ids a → b (A*, cached per pair), or null when they are not connected. Shared: do not modify. */
    nodePath(a, b) {
      const key = a * n + b, hit = cache.get(key);
      if (hit !== undefined) return hit;
      nav.searches++;
      stamp++; let no = 0;
      gS[a] = 0; seen[a] = stamp; prevN[a] = -1; open[no++] = a;
      let found = false;
      while (no > 0) {
        let bi = 0, bf = 1e18;
        for (let k = 0; k < no; k++) { const i = open[k], f = gS[i] + hyp(P[i][0] - P[b][0], P[i][1] - P[b][1]); if (f < bf) { bf = f; bi = k; } }
        const i = open[bi]; open[bi] = open[--no];
        if (i === b) { found = true; break; }
        shut[i] = stamp;
        for (const [j, d] of E[i]) {
          if (shut[j] === stamp) continue;
          const g = gS[i] + d;
          if (seen[j] !== stamp) { seen[j] = stamp; gS[j] = g; prevN[j] = i; open[no++] = j; }
          else if (g < gS[j]) { gS[j] = g; prevN[j] = i; }
        }
      }
      let path = null;
      if (found) { path = []; for (let i = b; i >= 0; i = prevN[i]) path.push(i); path.reverse(); }
      if (cache.size >= T.cache) cache.clear();
      cache.set(key, path);
      return path;
    },
    /** Waypoints [[x, z] …, goal] from (ax, az) to (bx, bz): along the streets, or just [goal] for a short hop,
     *  no streets, or when the street detour would be longer than walking straight. */
    route(ax, az, bx, bz) {
      const goal = [bx, bz], direct = hyp(bx - ax, bz - az);
      if (direct < T.short || !n) return [goal];
      const a = nav.nearestNode(ax, az), b = nav.nearestNode(bx, bz);
      const legs = hyp(P[a][0] - ax, P[a][1] - az) + hyp(P[b][0] - bx, P[b][1] - bz);
      if (a === b || legs >= direct) return [goal];
      const ids = nav.nodePath(a, b);
      if (!ids) return [goal];
      let s = 0, e = ids.length;
      // Drop an entry node behind us / an exit node past the goal (we are already nearer the next one).
      while (e - s > 1 && hyp(ax - P[ids[s + 1]][0], az - P[ids[s + 1]][1]) < hyp(P[ids[s]][0] - P[ids[s + 1]][0], P[ids[s]][1] - P[ids[s + 1]][1])) s++;
      while (e - s > 1 && hyp(bx - P[ids[e - 2]][0], bz - P[ids[e - 2]][1]) < hyp(P[ids[e - 1]][0] - P[ids[e - 2]][0], P[ids[e - 1]][1] - P[ids[e - 2]][1])) e--;
      const out = [];
      for (let k = s; k < e; k++) out.push(P[ids[k]]);
      out.push(goal);
      return out;
    },
    /** A random street point within r m of (x, z) into out [x, z]; false when there is none. */
    randomPoint(x, z, r, rnd, out) {
      let c = 0;
      for (let i = 0; i < n; i++) if ((P[i][0] - x) ** 2 + (P[i][1] - z) ** 2 < r * r) c++;
      if (!c) return false;
      let k = Math.floor(rnd() * c);
      for (let i = 0; i < n; i++) if ((P[i][0] - x) ** 2 + (P[i][1] - z) ** 2 < r * r && k-- === 0) { out[0] = P[i][0]; out[1] = P[i][1]; return true; }
      return false;
    },
    get cacheSize() { return cache.size; },
    /** Call once a frame: resets the search budget. */
    newFrame() { nav.spent = 0; },
  };
  return nav;
}

/**
 * Step st along `route` (waypoints, last = the goal) at up to `top` m/s: intermediate points are passed at
 * full pace within `reach` m (corners are cut a little), the goal is approached like stepToward (stopping
 * `gap` short, easing in). Returns the speed, 0 on arrival. Progress lives on st.routeI.
 */
export function followRoute(st, route, gap, top, dt, T = NAV) {
  let i = st.routeI | 0;
  const last = route.length - 1;
  while (i < last && hyp(route[i][0] - st.x, route[i][1] - st.z) < T.reach) i++;
  st.routeI = i;
  const w = route[i];
  if (i === last) return stepToward(st, w[0], w[1], gap, top, dt);
  // Aim a stride beyond the waypoint so stepToward's slow-down near its target never bites mid-route.
  const dx = w[0] - st.x, dz = w[1] - st.z, d = hyp(dx, dz) || 1, L = top / 1.4 + 1;
  return stepToward(st, st.x + dx / d * L, st.z + dz / d * L, 0, top, dt);
}

/**
 * Walk st to (tx, tz) by the streets: (re)routes when there is no route, the goal moved more than `regoal` m,
 * or the figure was moved (put) since its last step; the last waypoint tracks the live goal. Falls back to a
 * straight step when this frame's search budget (nav.newFrame) is spent. Returns the speed, 0 on arrival.
 */
export function walkTo(nav, st, tx, tz, gap, top, dt, T = NAV) {
  if (!st.route || (st.routeGoal[0] - tx) ** 2 + (st.routeGoal[1] - tz) ** 2 > T.regoal ** 2 || (st.rx - st.x) ** 2 + (st.rz - st.z) ** 2 > 9) {
    if (nav.spent >= T.budget) return stepToward(st, tx, tz, gap, top, dt);
    nav.spent++;
    st.route = nav.route(st.x, st.z, tx, tz); st.routeI = 0;
    if (!st.routeGoal) st.routeGoal = [0, 0];
    st.routeGoal[0] = tx; st.routeGoal[1] = tz;
  }
  const g = st.route[st.route.length - 1]; g[0] = tx; g[1] = tz;
  const sp = followRoute(st, st.route, gap, top, dt, T);
  st.rx = st.x; st.rz = st.z;
  return sp;
}
