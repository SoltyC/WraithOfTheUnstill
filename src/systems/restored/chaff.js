// "The Chaff": Dunn's threshing floor (data/restored.json `chaff`). Once Dunn has asked, a Gust aimed across the floor with
// the wind behind it carries the chaff off; against the wind it only swirls. Three good Gusts clear it: the heaps go and
// the sacks of grain stand at the floor's edge (`meadow:chaff-cleared`, the event `chaff:cleared`). Reading the wind is
// the whole of it: the grass and the pennants show where it blows.

import { Winnow, withWind } from '../../game/restored/rules.js';
import { rayDistance } from '../../game/sideQuests.js';
import { gustTuning } from '../../game/bending/gale.js';

const FLAG = 'meadow:chaff-cleared';

export function addChaff(ctx) {
  const { g, flags, data } = ctx, { chapter, hud, music, gale, controller, sfx, SFX, capture, arm, wind } = g;
  const f = data.chaff, w = new Winnow(f.hits);
  const seen = new Uint32Array(8);
  let sorry = 0;
  return {
    sync() { w.reset(); seen.fill(0); sorry = 0; },
    tick(dt) {
      sorry -= dt;
      const p = controller.pos;
      if (flags.has(FLAG) || !flags.has('meadow:chaff-told') || !ctx.restored('meadow')) { for (let k = 0; k < seen.length && k < gale.gustId.length; k++) seen[k] = gale.gustId[k]; return; }
      if (ctx.dist2(p.x, p.z, f.pos[0], f.pos[1]) > 40 * 40) { for (let k = 0; k < seen.length && k < gale.gustId.length; k++) seen[k] = gale.gustId[k]; return; }
      for (let k = 0; k < gale.gustId.length; k++) {
        const id = gale.gustId[k];
        if (id === seen[k]) continue;
        seen[k] = id;
        if (!gale.gustActive[k]) continue;
        const dx = gale.gustDX[k], dz = gale.gustDZ[k];
        const aimed = rayDistance(p.x + dx * 0.6, p.z + dz * 0.6, dx, dz, gustTuning.range, f.pos[0], f.pos[1]) < f.r;
        wind.sx = f.pos[0]; wind.sz = f.pos[1]; wind.sample();
        const r = w.gust(aimed, withWind(dx, dz, wind.outX, wind.outZ));
        if (r === 'against') { if (sorry <= 0 && !capture) { hud.notice('The chaff', 'It only swirls', 'Cast the Gust the way the wind blows.', 4); sorry = 4; } }
        else if (r === 'hit' || r === 'done') {
          wind.burst(f.pos[0], f.pos[1], 1.6); music.sting('echo');
          sfx.x = f.pos[0]; sfx.y = f.h + 1; sfx.z = f.pos[1]; sfx.gain = 1.0; sfx.play(SFX.WHOOSH);
          if (r === 'hit' && !capture) hud.notice('The chaff', 'It lifts', w.count + ' of ' + w.need, 3);
          if (r === 'done') {
            flags.add(FLAG); chapter.raise('chaff:cleared'); arm.shake += 0.01;
            for (let a = 0; a < 4; a++) wind.burst(f.pos[0] + Math.sin(a * 1.57) * 4, f.pos[1] + Math.cos(a * 1.57) * 4, 2.2);
            if (!capture) hud.notice('The threshing floor', 'The chaff is gone', 'Tell Dunn.', 6);
          }
        }
        break;
      }
    },
  };
}
