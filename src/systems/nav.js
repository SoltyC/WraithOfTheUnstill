// Navigation in play (user decision 2026-10-08): feeds the registry (game/nav.js) the player and
// the camera heading each frame, announces places as they are discovered, lets the Track key
// cycle the followed goal, and drives the compass and the world waypoint (ui/hud/compass.js).

import { createNav } from '../game/nav.js';
import { createCompass } from '../ui/hud/compass.js';
import { nookPois } from '../game/nooks.js';

/** @param {any} g  shared boot context */
export function addNavSystem(g) {
  const { loop, scene, controller, arm, input, Action, clock, chapter, hud, music, releaseCam, capture } = g;
  /** Dynamic goals (named in the quest data), registered by the systems that know them. */
  const dynamic = g.navDynamic = {};
  // Where an NPC is now, for `goal: { npc }`: its live position (it walks), or its home place until it is made.
  const npcPos = new Map(), table = chapter.table;
  function npcAt(id) {
    const def = chapter.data.npcs.find((d) => d.id === id);
    if (!def) return null;
    let o = npcPos.get(id);
    if (!o) { o = { x: 0, z: 0, y: 0, name: def.name }; npcPos.set(id, o); }
    const n = g.npcs && g.npcs.find((q) => q.id === id);
    if (n) { o.x = n.x; o.z = n.z; o.y = n.shown || n.y ? n.y : nav.py; return o; }
    const h = def.home && table[def.home.poi];
    if (!h) return null;
    o.x = h.pos[0] + (def.home.dx || 0); o.z = h.pos[1] + (def.home.dz || 0); o.y = h.h ?? nav.py;
    return o;
  }
  g.pois.push(...nookPois());   // hidden from the compass until found (kind 'nook')
  const nav = g.nav = createNav({
    pois: g.pois, names: chapter.data.names || {}, graph: chapter.graph, dynamic, npcAt,
    onDiscover: (p) => { if (!capture) { hud.notice('Discovered', p.name, null, 5); } },
    onTrack: (t) => { if (!capture) hud.notice('Now', t.name, t.journal, 6); },
  });
  const compass = g.compass = createCompass();
  const sp = [0, 0];
  /** World point → screen px (null when behind the camera); the result array is reused. */
  function project(x, y, z) {
    const m = scene.getTransformMatrix().m;
    const w = x * m[3] + y * m[7] + z * m[11] + m[15];
    if (w <= 0.01) return null;
    sp[0] = ((x * m[0] + y * m[4] + z * m[8] + m[12]) / w * 0.5 + 0.5) * window.innerWidth;
    sp[1] = (1 - ((x * m[1] + y * m[5] + z * m[9] + m[13]) / w * 0.5 + 0.5)) * window.innerHeight;
    return sp;
  }
  loop.addLate({ name: 'nav', update: () => {
    const p = controller.pos;
    nav.px = p.x; nav.pz = p.z; nav.py = p.y; nav.heading = arm.yaw;
    nav.update(clock.realDt);
    if (input.pressed[Action.Track] && input.gameHasFocus) {
      const id = nav.cycle();
      if (id) { const t = nav.trackedGoal; if (t) hud.notice('Tracking', t.name, t.title, 3); }
    }
    compass.hidden = capture || !!(g.menus && (!g.menus.started || g.menus.open_)) || releaseCam.active;
    compass.update(nav, arm.yaw, p.x, p.z, clock.realDt, project);
  } });
  /** Called after a load: known/visited places come back from the world flags. */
  { const prev = g.navSync; g.navSync = () => { prev?.(); nav.sync(); }; } // chained: other systems hook loads too
}
