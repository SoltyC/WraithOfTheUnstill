// The restored world in play (docs/gameplay-design.md §7; data/restored.json, data/quests/*-restored.json): what a
// Warden's release adds to play. The streams themselves are lift in the glide (game/restored/streams.js, fed by
// character/playerSystem.js); this system makes what stands round them and the things to do: the banners that mark a
// stream (built once their biome is restored), the Shelf course (frost), the Wind Road (meadow), and Dunn's and Ketil's
// requests (the chaff, the lantern). Each is its own module under restored/; this one makes what they share and runs them.
// The quests read all of it as events (`stream:<biome>`, `road:done`, `chaff:cleared`, `lantern:lit`), flags and variables.

import data from '../../data/restored.json';
import { addShelf } from './restored/summit.js';
import { addRoad } from './restored/road.js';
import { addChaff } from './restored/chaff.js';
import { addLantern } from './restored/lantern.js';

const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

/** @param {any} g  shared boot context */
export function addRestoredSystem(g) {
  const { loop, chapter, controller, clock, hud, capture, ws } = g;
  const graph = chapter.graph, flags = graph.flags;
  g.restoredData = data;   // for the bots and the dev overlay
  const sitesIdx = new Map((g.archSites || []).map((s, i) => [s.id, i]));
  const SITES = g.archSites, A = g.architecture.sites;
  const restored = (biome) => ws.restoration[biome] === 'restored';
  /** The kit the parts share. */
  const ctx = {
    g, data, graph, flags, vars: graph.vars, table: chapter.table, A, glow: g.architecture.glow, dist2, restored,
    site: (id) => (sitesIdx.has(id) ? sitesIdx.get(id) : -1),
    /** The seated height of a site once it is shown, else `fallback`. */
    seatY: (i, fallback) => (i >= 0 && A[i * 4 + 3] > 0.5 ? A[i * 4 + 1] : fallback),
  };
  // Places of the frost course are goals the compass can follow (the meadow's `side-` ones are registered by sideQuests.js).
  for (const id of ['rw-shelf']) {
    const pl = chapter.table[id]; if (!pl) continue;
    const goal = { x: pl.pos[0], z: pl.pos[1], y: pl.h ?? 0, name: pl.name || '' };
    g.navDynamic['place:' + id] = () => goal;
  }

  // What stands: shown once its biome is restored (or its request done), every quarter second.
  const rules = [];
  const rule = (id, f) => { const i = ctx.site(id); if (i >= 0) rules.push({ s: SITES[i], f }); };
  for (const b of data.banners) rule(b.id, () => !restored(b.stream.startsWith('frost') ? 'frost' : 'meadow'));
  rule('rw-shelf-cairn', () => !restored('frost'));
  data.summit.rings.forEach((r, k) => rule('rw-ring-' + (k + 1), () => !restored('frost')));
  rule('rw-varo-pennant', () => !flags.has('restored:shelf-thanked'));
  rule('side-rw-windsock', () => !flags.has('meadow:road-thanked'));
  rule('side-rw-chaff', () => flags.has('meadow:chaff-cleared') || !restored('meadow'));
  rule('side-rw-sacks', () => !flags.has('meadow:chaff-cleared'));
  rule('side-rw-lantern', () => !restored('meadow'));
  const show = () => { for (let i = 0; i < rules.length; i++) rules[i].s.hidden = rules[i].f(); };
  show();

  // Riding a stream for a moment is remembered: the land answers once per biome (Remembrance), and the stream is named.
  const st = g.streams, gl = controller.glide, rode = new Float32Array(data.streams.length);
  const watch = (dt) => {
    if (!gl.active || st.best < 0 || st.total < 1.5) return;
    rode[st.best] += dt;
    if (rode[st.best] < 2) return;
    const s = st.list[st.best], key = 'rode:' + s.id;
    if (flags.has(key)) return;
    flags.add(key); chapter.raise('stream:' + s.biome);
    if (!capture) hud.notice(s.name, 'The wind lifts the robe', 'Fly along the face, not at it. Gusts lift harder than lulls.', 6);
  };

  const parts = [addShelf(ctx), addRoad(ctx), addChaff(ctx), addLantern(ctx)];
  const navSync = g.navSync;
  g.navSync = () => { navSync?.(); show(); rode.fill(0); for (const p of parts) p.sync?.(); };
  loop.add({ name: 'restored', update: () => {
    const dt = clock.dt;
    if ((clock.frame & 15) === 0) show();
    watch(dt);
    for (const p of parts) p.tick(dt);
  } });
}
