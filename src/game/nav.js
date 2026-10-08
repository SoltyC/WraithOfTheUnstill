// Navigation (user decision 2026-10-08, recorded in DECISIONS.md; BRIEF §11 keeps the map and has
// no minimap, §12 has no HUD by default — the compass is the one persistent, switchable element).
//
// One registry feeds the compass, the world waypoint, the light beams and the map:
//   • places: the baked POIs (monastery, camp, shrines, Echo stones, the den …). A place is
//     *known* once the Wraith has come within its sighting radius, or a quest reveals it; known
//     places show on the compass and the map. Hidden kinds (Echo stones) are only sensed up close.
//   • goals: what the active quests point at (their step's `goal`, resolved to a position), with the
//     one the player tracks marked. Optional objectives are goals too, drawn quieter.
// Everything per frame is a field write on preallocated entries (no allocation in update()).

/** Per kind: compass icon, the name when no better is known, sighting radius (m), and whether the
 *  place is hidden until sensed. */
export const KINDS = {
  monastery: { icon: 'arch', name: 'The Monastery', sight: 700 },
  camp: { icon: 'tents', name: 'A Camp', sight: 380 },
  spring: { icon: 'drop', name: 'A Spring', sight: 260 },
  overlook: { icon: 'stone', name: 'An Overlook', sight: 300 },
  'warden-arena': { icon: 'ring', name: 'The Warden', sight: 420 },
  shrine: { icon: 'diamond', name: 'A Shrine', sight: 300 },
  'echo-stone': { icon: 'spark', name: 'An Echo Stone', sight: 90, hidden: true },
  den: { icon: 'claw', name: 'A Den', sight: 200 },
  settlement: { icon: 'tents', name: 'A Settlement', sight: 500 },
};

const TAU = Math.PI * 2;
/** Bearing (rad, 0 = north = +z, clockwise) from (ax, az) to (bx, bz). */
export function bearing(ax, az, bx, bz) { const b = Math.atan2(bx - ax, bz - az); return b < 0 ? b + TAU : b; }
/** Signed difference a − b wrapped to (−π, π]. */
export function angleDiff(a, b) { let d = a - b; d -= Math.round(d / TAU) * TAU; return d; }

/** 16-point compass name for a heading in radians. */
const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export function compassPoint(rad) { const b = ((rad % TAU) + TAU) % TAU; return POINTS[Math.round(b / (TAU / 16)) % 16]; }

/** Distance text: "86 m", "1.2 km". */
export function formatDistance(m) { return m < 1000 ? Math.round(m / (m < 100 ? 1 : 5)) * (m < 100 ? 1 : 5) + ' m' : (m / 1000).toFixed(1) + ' km'; }

/**
 * @param {{ pois: any[], names?: Record<string, string>, graph: import('./quests/questGraph.js').QuestGraph,
 *           dynamic?: Record<string, () => ({ x: number, z: number, name?: string } | null)>,
 *           onDiscover?: (poi: any) => void }} opts
 */
export function createNav({ pois, names = {}, graph, dynamic = {}, onDiscover }) {
  const places = pois.filter((p) => KINDS[p.kind]).map((p) => ({
    id: p.id, kind: p.kind, icon: KINDS[p.kind].icon, name: names[p.id] || KINDS[p.kind].name, x: p.pos[0], z: p.pos[1], y: p.h,
    sight: KINDS[p.kind].sight, hidden: !!KINDS[p.kind].hidden,
    known: false, dist: 0.5, bearing: 0.5, rel: 0.5, visited: false,
  }));
  const byId = new Map(places.map((p) => [p.id, p]));
  /** Resolved goals (entries reused between frames by quest+step id). */
  const goalPool = new Map();
  /** Active goals this frame (array reused), and the tracked id. */
  const goals = [];
  let tracked = null, manual = null;
  let sinceGoals = 99;

  const self = {
    places, goals, byId,
    /** Fields set each frame by the owner: player position and the camera's heading (rad). */
    px: 0.5, pz: 0.5, heading: 0.5 - 0.5,
    get tracked() { return tracked; },
    isKnown(id) { return graph.flags.has('known:' + id); },
    /** Mark a place known (a quest reveal or a sighting). */
    know(id) { const p = byId.get(id); if (p && !p.known) { graph.flags.add('known:' + id); p.known = true; return true; } return false; },
    /** Mark a place visited (a shrine rested at, an Echo stone attuned): it stops drawing the eye. */
    visit(id) { const p = byId.get(id); if (p) { p.visited = true; graph.flags.add('visited:' + id); } },
    /** After a load: known and visited come back from the world flags. */
    sync() { for (const p of places) { p.known = graph.flags.has('known:' + p.id); p.visited = graph.flags.has('visited:' + p.id); } tracked = null; manual = null; sinceGoals = 99; },

    /** Pick the goal the player follows (null: the default, the first main goal). */
    track(id) { manual = id; },
    /** Cycle the tracked goal (the Track key); returns the new tracked id. */
    cycle() {
      if (goals.length === 0) return null;
      let k = goals.findIndex((g) => g.id === tracked);
      k = (k + 1) % goals.length;
      manual = tracked = goals[k].id;
      return manual;
    },

    /**
     * Per frame (cheap): distances and bearings, sightings, the goals of the active quests
     * (re-resolved a few times a second), the tracked one.
     */
    update(dt) {
      const px = this.px, pz = this.pz, h = this.heading;
      for (let i = 0; i < places.length; i++) {
        const p = places[i], dx = p.x - px, dz = p.z - pz;
        p.dist = Math.sqrt(dx * dx + dz * dz);
        p.bearing = bearing(px, pz, p.x, p.z);
        p.rel = angleDiff(p.bearing, h);
        if (!p.known && p.dist < p.sight) {
          if (graph.flags.has('known:' + p.id)) p.known = true;
          else { p.known = true; graph.flags.add('known:' + p.id); onDiscover?.(p); }
        }
      }
      sinceGoals += dt;
      if (sinceGoals > 0.25) { sinceGoals = 0; this.resolveGoals(); }
      for (let i = 0; i < goals.length; i++) {
        const g = goals[i], dx = g.x - px, dz = g.z - pz;
        g.dist = Math.sqrt(dx * dx + dz * dz);
        g.bearing = bearing(px, pz, g.x, g.z);
        g.rel = angleDiff(g.bearing, h);
      }
    },

    /** Re-read the active quests' goals into `goals` (stable entries; main before side before optional). */
    resolveGoals() {
      const list = graph.goals();
      goals.length = 0;
      const order = (a) => (a.optional ? 2 : a.kind === 'main' ? 0 : 1);
      list.sort((a, b) => order(a) - order(b));
      for (const q of list) {
        const key = q.quest + ':' + q.step;
        let pos = null, name = q.goal.label || null;
        if (q.goal.poi) { const p = byId.get(q.goal.poi); if (p) { pos = p; name = name || p.name; } }
        else if (q.goal.at) pos = { x: q.goal.at[0], z: q.goal.at[1] };
        else if (q.goal.dynamic && dynamic[q.goal.dynamic]) { const d = dynamic[q.goal.dynamic](); if (d) { pos = d; name = name || d.name; } }
        if (!pos) continue;
        let g = goalPool.get(key);
        if (!g) { g = { id: key, quest: q.quest, title: q.title, x: 0, z: 0, y: 0, name: '', radius: 30, optional: false, main: false, dist: 0.5, bearing: 0.5, rel: 0.5 }; goalPool.set(key, g); }
        g.x = pos.x; g.z = pos.z; g.y = pos.y ?? pos.h ?? 0; g.name = name || q.title; g.radius = q.goal.radius ?? 30; g.optional = q.optional; g.main = q.kind === 'main';
        goals.push(g);
      }
      // The tracked goal: the player's choice while it is still active, else the first main goal, else the first.
      let t = manual && goals.find((g) => g.id === manual) ? manual : null;
      if (!t) { manual = null; const m = goals.find((g) => g.main && !g.optional) || goals[0]; t = m ? m.id : null; }
      tracked = t;
    },
    /** The tracked goal's entry, or null. */
    get trackedGoal() { if (!tracked) return null; for (let i = 0; i < goals.length; i++) if (goals[i].id === tracked) return goals[i]; return null; },
  };
  self.sync();
  return self;
}
