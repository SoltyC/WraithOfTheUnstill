// "The Wind Road": Wyl's flight from the hill foot on Hearn's east edge to the Western Edge's first ring, never touching
// the ground (data/restored.json `road`, game/restored/rules.js RoadRun). The Hearn wind (a stream on the hill's west
// wall) lifts the glide past the manor hill; the Lake Ridge wind tops it up over the water; the glide through the first
// ring ends it. It starts by itself when the Wraith glides low near the foot; the ground for three seconds ends it.
// Done once flies the flag `meadow:road-flown` (the banners and Wyl answer); flying it again does nothing new.

import { RoadRun } from '../../game/restored/rules.js';

export function addRoad(ctx) {
  const { g, flags, vars, data, table } = ctx, { chapter, hud, music, controller, capture, ground, sfx, SFX } = g;
  const road = g.roadRun = new RoadRun(data.road.checks, data.road.start);
  const goal = { x: 0, z: 0, y: 0, name: '' };
  g.navDynamic['next-road'] = () => {
    const c = road.running ? data.road.checks[road.stage] : null;
    if (!c) { const s = table['side-rw-road-start']; goal.x = s.pos[0]; goal.z = s.pos[1]; goal.y = s.h; goal.name = 'The Hill Foot'; return goal; }
    goal.x = c.pos[0]; goal.z = c.pos[1]; goal.y = c.y !== undefined ? c.y - 6 : (table['side-rw-road-start'].h + 160); goal.name = c.name; return goal;
  };
  const fmt = (s) => Math.round(s) + ' s';
  return {
    sync() { road.running = false; road.stage = 0; },
    tick(dt) {
      if (!ctx.restored('meadow')) return;
      const p = controller.pos, s = data.road.start;
      if (!road.running && ctx.dist2(p.x, p.z, s.pos[0], s.pos[1]) > (s.r + 20) * (s.r + 20)) return;
      ground.qx = p.x; ground.qz = p.z; ground.sample();
      const r = road.step(p.x, p.y, p.z, p.y - ground.h, controller.glide.active, dt);
      if (r === 'start') { music.sting('echo'); if (!capture && !flags.has('meadow:road-flown')) hud.notice('The Wind Road', 'Stay in the air', 'Climb the Hearn wind past the manor hill, cross the lake, and fly through the first ring at the Western Edge.', 7); }
      else if (r === 'check') { music.sting('echo'); sfx.x = p.x; sfx.y = p.y; sfx.z = p.z; sfx.gain = 0.5; sfx.play(SFX.CHIME); if (!capture) hud.notice('The Wind Road', data.road.checks[road.stage - 1].name, 'Next: ' + data.road.checks[road.stage].name + '.', 4); }
      else if (r === 'lost') { hud.line('road', ''); if (!capture && road.t > 8) hud.notice('The Wind Road', 'You touched down', 'Go back to the hill foot and start again.', 4); }
      else if (r === 'done') {
        hud.line('road', ''); music.sting('echo');
        vars['road.time'] = Math.round(road.last);
        if (!flags.has('meadow:road-flown')) { flags.add('meadow:road-flown'); chapter.raise('road:done'); if (!capture) hud.notice('The Wind Road', 'Flown in ' + fmt(road.last), 'Tell Wyl.', 7); }
        else if (!capture) hud.notice('The Wind Road', 'Flown in ' + fmt(road.last), null, 5);
      }
      if (road.running && !capture) hud.line('road', 'The Wind Road · ' + data.road.checks[road.stage].name + ' · ' + fmt(road.t));
    },
  };
}
