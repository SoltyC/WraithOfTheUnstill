// "The Shelf Stream": the frost's summit glide course (data/restored.json `summit`, data/quests/frost-restored.json).
// Six glide rings hang over the bowl east of the monastery, the first off the Shelf's edge. The Wraith runs off the edge
// and glides through them in order; the last stops the clock. Each ring after the first is higher than a still-air glide
// can reach from the one before, so the course cannot be flown without the Shelf stream (the wind climbing the face): ride
// it, bank the height, then glide on. Best time kept (`shelf.best`); medals from the data. Not a copy of the Shapers' Run:
// there is no racing line down a slope, the line goes up as well as down.

import { GlideCourse, medalFor } from '../../game/sideQuests.js';

export function addShelf(ctx) {
  const { g, vars, site, glow, data, table, flags } = ctx, { chapter, hud, music, controller, capture, sfx, SFX, interactables } = g;
  const R = data.summit.rings, rings = [], idx = [];
  for (let k = 0; k < R.length; k++) { rings.push({ x: R[k].pos[0], y: R[k].y, z: R[k].pos[1], r: R[k].r }); idx.push(site('rw-ring-' + (k + 1))); }
  const medals = data.summit.medals, course = g.shelfCourse = new GlideCourse(rings, { grace: 3, far: 420 });
  const start = table['rw-shelf'];
  const goal = { x: 0, z: 0, y: 0, name: '' };
  g.navDynamic['next-shelf-ring'] = () => {
    const r = rings[course.next];
    goal.x = r.x; goal.z = r.z; goal.y = r.y - 6; goal.name = 'Ring ' + (course.next + 1) + ' of ' + rings.length; return goal;
  };
  /** The rings hang over the ground the game really seats them on (a baked height can differ by metres from the streamed ground). */
  const reseat = () => { for (let k = 0; k < idx.length; k++) if (idx[k] >= 0 && ctx.A[idx[k] * 4 + 3] > 0.5) rings[k].y = ctx.A[idx[k] * 4 + 1]; };
  const on = new Uint8Array(rings.length);
  const lightAll = (v) => on.fill(v ? 1 : 0);
  const fmt = (s) => s.toFixed(1) + ' s';
  // The cairn on the Shelf says what the course is (once read it stays quiet).
  const ci = site('rw-shelf-cairn');
  const cairn = { kind: 'cairn', id: 'rw-shelf-cairn', verb: 'Read', name: 'Shelf cairn', x: start.pos[0], y: start.h, z: start.pos[1], r: 3.6, h: 1.3, hidden: true,
    onUse: () => {
      chapter.raise('use:rw-shelf-cairn'); music.sting('echo');
      hud.notice('The Shelf', 'Six rings hang over the bowl', 'Run off the edge and open the robe (hold Traverse). Climb the face under the ridge to get your height back.', 9);
    } };
  interactables.push(cairn);
  return {
    sync() { course.running = false; course.next = 0; lightAll(false); },
    tick(dt) {
      const live = ctx.restored('frost');
      cairn.hidden = !live; cairn.y = ctx.seatY(ci, start.h);
      for (let k = 0; k < idx.length; k++) if (idx[k] >= 0) glow[idx[k] * 4 + 3] += (on[k] - glow[idx[k] * 4 + 3]) * Math.min(1, dt * 6);
      if (!live) { if (course.running) { course.running = false; course.next = 0; lightAll(false); hud.line('shelf', ''); } return; }
      if (!course.running) reseat();
      const p = controller.pos;
      if (!course.running && ctx.dist2(p.x, p.z, start.pos[0], start.pos[1]) > 400 * 400) return;
      const was = course.next;
      const r = course.step(p.x, p.y, p.z, controller.glide.active, dt);
      if (r === 'start') { lightAll(false); on[0] = 1; music.sting('echo'); }
      else if (r === 'ring') { on[was] = 1; sfx.x = p.x; sfx.y = p.y; sfx.z = p.z; sfx.gain = 0.5; sfx.play(SFX.CHIME); }
      else if (r === 'lost') { lightAll(false); hud.line('shelf', ''); if (!capture) hud.notice('The Shelf Stream', 'You lost the line', 'Go back to the cairn and start again.', 4); }
      else if (r === 'done') {
        on[rings.length - 1] = 1;
        const secs = Math.round(course.last * 10) / 10, prev = vars['shelf.best'];
        vars['shelf.time'] = secs;
        if (prev === undefined || secs < prev) vars['shelf.best'] = secs;
        chapter.raise('shelf:done'); music.sting('echo'); hud.line('shelf', '');
        const m = medalFor(secs, medals);
        if (!capture) hud.notice('The Shelf Stream', fmt(secs) + (m ? ' · ' + m : ''), prev === undefined || secs < prev ? 'Your best. Gold is under ' + medals.gold + ' seconds, silver ' + medals.silver + ', bronze ' + medals.bronze + '.' : 'Best: ' + fmt(prev), 7);
      }
      if (course.running && !capture) hud.line('shelf', 'Ring ' + (course.next + 1) + ' of ' + rings.length + ' · ' + fmt(course.t));
    },
  };
}
