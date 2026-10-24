// The meadow's side quests in play (data/quests/meadow-side.json, rules in game/sideQuests.js): the
// Fen Lamp carried by night, the Ring of Nine's fallen stone, the Sedgerunners in the barley, the glide
// course on the Western Edge and the Listening Stones. Each mechanic is its own module under side/; this
// one makes what they share (the places' sites, their nav goals, the interaction targets) and runs them.
// The quests read all of it as events (`use:<id>`, `echo:<id>`), flags and variables, like the frost ones.

import { addLamp } from './side/lamp.js';
import { addStone } from './side/stone.js';
import { addFlock } from './side/flock.js';
import { addGlide } from './side/glide.js';
import { addEchoes } from './side/echoes.js';

const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

/** @param {any} g  shared boot context */
export function addSideQuestSystem(g) {
  const { loop, chapter, nav, controller, clock } = g;
  const graph = chapter.graph, table = chapter.table;
  const sitesIdx = new Map((g.archSites || []).map((s, i) => [s.id, i]));
  const A = g.architecture.sites;
  /** The shared kit of the mechanics. */
  const ctx = {
    g, graph, flags: graph.flags, vars: graph.vars, table, A, glow: g.architecture.glow, dist2,
    /** Index of a built site, or -1. */
    site: (id) => (sitesIdx.has(id) ? sitesIdx.get(id) : -1),
    /** The seated height of a site once it is shown, else `fallback`. */
    seatY: (i, fallback) => (i >= 0 && A[i * 4 + 3] > 0.5 ? A[i * 4 + 1] : fallback),
    /** The step the quest is on (null if not active). */
    stepOf(q) { const st = graph.quests[q]; if (!st || st.state !== 'active') return null; return graph.byId.get(q).steps[st.step]?.id ?? null; },
    /** Distance from the Wraith to a place, or Infinity. */
    away(id) { const p = table[id]; return p ? Math.hypot(p.pos[0] - controller.pos.x, p.pos[1] - controller.pos.z) : Infinity; },
  };
  // Every place of the side quests is a goal the compass can follow (`goal: { dynamic: 'place:<id>' }`), at its height.
  for (const id in table) {
    if (!id.startsWith('side-') && id !== 'shrine-meadow-6') continue;
    const pl = table[id], goal = { x: pl.pos[0], z: pl.pos[1], y: pl.h ?? 0, name: pl.name || '' };
    g.navDynamic['place:' + id] = () => goal;
  }
  // The nearest shrine not yet rested at (the frost quest "The Stones Remember" asks for all five).
  for (const biome of ['frost', 'meadow']) {
    const list = g.pois.filter((p) => p.kind === 'shrine' && p.biome === biome), o = { x: 0, z: 0, y: 0, name: 'A shrine to rest at' };
    g.navDynamic['next-shrine-' + biome] = () => {
      let best = 1e18, b = null;
      for (const p of list) { if (chapter.shrines.has(p.id)) continue; const d = dist2(p.pos[0], p.pos[1], nav.px, nav.pz); if (d < best) { best = d; b = p; } }
      if (!b) return null; o.x = b.pos[0]; o.z = b.pos[1]; o.y = b.h; return o;
    };
  }
  const parts = [addLamp(ctx), addStone(ctx), addFlock(ctx), addGlide(ctx), addEchoes(ctx)];
  const navSync = g.navSync;
  g.navSync = () => { navSync?.(); for (const p of parts) p.sync?.(); };
  loop.add({ name: 'sideQuests', update: () => { const dt = clock.dt; for (const p of parts) p.tick(dt); } });
}
