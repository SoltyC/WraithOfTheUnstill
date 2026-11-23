// Clues: things in the world the Wraith can look at (docs/direction.md §2.2 "the way is found"; the meadow's Doran story,
// docs/storyline.md). Chapter data `clues` (game/chapter.js merges them): each has a place (a poi with an offset, a point
// on the manor's frame with a height, or x/z), a condition for being there (the quest graph's `when`), a short text shown
// when looked at, and actions (the quest graph's `then`: flags, knowledge). A clue seen from afar (r > 6: a window high in
// a wall) only offers itself while the camera is turned toward it (chapter.js `look`).

import { manorWorld, MANOR } from '../world/manor.js';

/** @param {any} g  shared boot context */
export function addClueSystem(g) {
  const { chapter, hud, loop, ground } = g;
  const C = chapter.data.clues || {};
  const list = [];
  for (const id in C) {
    const c = C[id], at = c.at;
    let x = at.x ?? 0, z = at.z ?? 0, y = null;
    if (at.poi) { const p = chapter.table[at.poi].pos; x = p[0] + (at.dx || 0); z = p[1] + (at.dz || 0); }
    else if (at.manor) { [x, z] = manorWorld(at.manor[0], at.manor[1]); y = MANOR.y + (at.y || 0); }
    const r = c.r || 2.6;
    const t = { kind: 'clue', id, verb: c.verb || 'Look', name: c.name, x, y: y ?? 0, z, r, h: 0.6, hidden: true, look: r > 6 ? 0.95 : undefined, onUse: () => use(c) };
    g.interactables.push(t);
    list.push({ c, t, fixedY: y !== null, seated: false });
  }
  function use(c) {
    hud.notice('Noticed', c.title || c.name, c.text, 9);
    for (const a of c.then || []) chapter.do(a);
  }
  let acc = 0;
  loop.add({ name: 'clues', update: () => {
    acc += g.clock.dt; if (acc < 0.25) return; acc = 0;
    for (const e of list) {
      e.t.hidden = !chapter.graph.test(e.c.when, chapter.facts);
      // On the ground where it stands (once that ground is known).
      if (!e.fixedY && !e.seated && !e.t.hidden) { ground.qx = e.t.x; ground.qz = e.t.z; if (ground.covers()) { ground.sample(); e.t.y = ground.h + 0.8; e.seated = true; } }
    }
  } });
}
