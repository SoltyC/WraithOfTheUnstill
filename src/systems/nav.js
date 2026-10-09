// Navigation in play (user decision 2026-10-08): feeds the registry (game/nav.js) the player and
// the camera heading each frame, announces places as they are discovered, lets the Track key
// cycle the followed goal, and drives the compass and the world waypoint (ui/hud/compass.js).

import { createNav } from '../game/nav.js';
import { createCompass } from '../ui/hud/compass.js';

/** @param {any} g  shared boot context */
export function addNavSystem(g) {
  const { loop, scene, controller, arm, input, Action, clock, chapter, hud, music, releaseCam, capture } = g;
  /** Dynamic goals (named in the quest data), registered by the systems that know them. */
  const dynamic = g.navDynamic = {};
  const nav = g.nav = createNav({
    pois: g.pois, names: chapter.data.names || {}, graph: chapter.graph, dynamic,
    onDiscover: (p) => { if (!capture) { hud.notice('Discovered', p.name, null, 5); } },
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
    nav.px = p.x; nav.pz = p.z; nav.heading = arm.yaw;
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
