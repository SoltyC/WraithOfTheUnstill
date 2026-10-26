// "The Lantern on the Green": Ketil's paper lantern hangs on a post by the Green Shrine (data/restored.json `lantern`). After
// dark an Updraft cast under it lifts it on the wind: it rises ninety metres over fourteen seconds and stays aloft, glowing,
// every night after (`meadow:lantern-lit`, the event `lantern:lit`). By day the wind will not take it.

import { lanternRise } from '../../game/restored/rules.js';

const FLAG = 'meadow:lantern-lit', REACH = 4.5;

export function addLantern(ctx) {
  const { g, flags, data, site, glow } = ctx, { chapter, hud, music, gale, controller, clock, sfx, SFX, capture, wind, archSites } = g;
  const l = data.lantern, li = site('side-rw-lantern');
  if (li < 0) return { tick() {} };
  const s = archSites[li];
  let t = -1, nag = 0;
  const night = () => chapter.facts.night;
  return {
    sync() { t = flags.has(FLAG) ? l.seconds : -1; nag = 0; },
    tick(dt) {
      nag -= dt;
      const lit = flags.has(FLAG);
      if (lit && t < l.seconds) t = l.seconds;
      if (t >= 0 && t < l.seconds) {
        t += dt;
        if ((clock.frame & 7) === 0) wind.burst(l.pos[0], l.pos[1], 0.7 * (1 - t / l.seconds));
        if (t >= l.seconds && !lit) {
          flags.add(FLAG); chapter.raise('lantern:lit'); music.sting('echo');
          if (!capture) hud.notice('The lantern', 'It is aloft', 'Tell Ketil.', 6);
        }
      }
      // Up the hook's height: sinking by a negative amount lifts the site (the architecture seats pillars by seatY - sink).
      s.sink = t < 0 ? 0 : -l.rise * lanternRise(t, l.seconds);
      glow[li * 4 + 3] = !s.hidden && ctx.restored('meadow') ? 1 : 0;
      if (t >= 0 || lit || !flags.has('meadow:lantern-told') || !ctx.restored('meadow')) return;
      if (!gale.updraftEvent) return;
      const p = controller.pos;
      if (ctx.dist2(gale.updraftX, gale.updraftZ, l.pos[0] + 0.5, l.pos[1]) > REACH * REACH || ctx.dist2(p.x, p.z, l.pos[0], l.pos[1]) > 30 * 30) return;
      if (!night()) { if (nag <= 0 && !capture) { hud.notice('The lantern', 'The wind will not take it by day', 'Come back after dark.', 4); nag = 6; } return; }
      t = 0; music.sting('echo');
      sfx.x = l.pos[0]; sfx.y = l.h + 2; sfx.z = l.pos[1]; sfx.gain = 1.0; sfx.play(SFX.WHOOSH);
      wind.burst(l.pos[0], l.pos[1], 2.0);
    },
  };
}
