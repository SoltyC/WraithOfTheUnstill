// "The Western Edge": six glide rings down the slope west of the lake road (the rings are built sites,
// side-glide-ring-1…6, lit as they are flown through). Fly through them in order with the robe open; the
// first starts the clock and the last stops it. Best time kept (`glide.best`), medals at 30 / 25 / 21 s —
// the quest's steps read the variable; the runner's robe is earned at gold (systems/robes.js).

import { GlideCourse, medalFor, GLIDE_MEDALS } from '../../game/sideQuests.js';

export function addGlide(ctx) {
  const { g, vars, site, glow } = ctx, { chapter, hud, music, controller, capture } = g;
  const rings = [], idx = [];
  for (let k = 1; k <= 6; k++) {
    const pl = ctx.table['side-ring-' + k]; if (!pl) return { tick() {} };
    rings.push({ x: pl.pos[0], y: pl.y, z: pl.pos[1], r: pl.r }); idx.push(site('side-glide-ring-' + k));
  }
  const course = new GlideCourse(rings);
  const start = ctx.table['side-edge'];
  // The compass follows the next ring (its height: the waypoint sits 6 m above the goal's y).
  const goal = { x: 0, z: 0, y: 0, name: '' };
  g.navDynamic['next-ring'] = () => {
    const r = rings[course.next];
    goal.x = r.x; goal.z = r.z; goal.y = r.y - 6; goal.name = 'Ring ' + (course.next + 1) + ' of ' + rings.length; return goal;
  };
  const on = new Uint8Array(rings.length);   // rings flown through on this run (not saved)
  const lit = (k, v) => { on[k - 1] = v ? 1 : 0; };
  const lightAll = (v) => on.fill(v ? 1 : 0);
  const fmt = (s) => s.toFixed(1) + ' s';
  return {
    sync() { course.running = false; course.next = 0; lightAll(false); },
    tick(dt) {
      const p = controller.pos;
      for (let k = 0; k < idx.length; k++) if (idx[k] >= 0) glow[idx[k] * 4 + 3] += (on[k] - glow[idx[k] * 4 + 3]) * Math.min(1, dt * 6);
      // Only near the course (the sphere tests are cheap, but the quest need not run from afar).
      if (!course.running && ctx.dist2(p.x, p.z, start.pos[0], start.pos[1]) > 500 * 500) return;
      const was = course.next;
      const r = course.step(p.x, p.y, p.z, controller.glide.active, dt);
      if (r === 'start') { lightAll(false); lit(1, true); }
      else if (r === 'ring') lit(was + 1, true);
      else if (r === 'lost') { lightAll(false); hud.line('glide', ''); if (!capture) hud.notice('The Western Edge', 'You lost the line', 'Go back to the crest and start again.', 4); }
      else if (r === 'done') {
        lit(rings.length, true);
        const secs = Math.round(course.last * 10) / 10, prev = vars['glide.best'];
        vars['glide.time'] = secs;
        if (prev === undefined || secs < prev) vars['glide.best'] = secs;
        chapter.raise('glide:done'); music.sting('echo'); hud.line('glide', '');
        const m = medalFor(secs, GLIDE_MEDALS);
        if (!capture) hud.notice('The Western Edge', fmt(secs) + (m ? ' · ' + m : ''), prev === undefined || secs < prev ? 'Your best. Gold is under 21 seconds, silver 25, bronze 30.' : 'Best: ' + fmt(prev), 7);
      }
      if (course.running && !capture) hud.line('glide', 'Ring ' + (course.next + 1) + ' of ' + rings.length + ' · ' + fmt(course.t));
    },
  };
}
