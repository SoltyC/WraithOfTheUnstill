// "The Fallen Stone": the ninth stone of the Ring of Nine lies on its side. Updrafts cast at its head,
// its middle and its foot lift it a little each; all three inside 14 s and it stands (the pillar site rises
// out of its socket, the lying one is hidden). Raised, it stays raised (`meadow:side-stone-raised`).

import { StoneRaise } from '../../game/sideQuests.js';
import { stoneRingGeometry } from '../../world/sideSites.js';

const FLAG = 'meadow:side-stone-raised', RISE = 3.6;

export function addStone(ctx) {
  const { g, flags, site, A } = ctx, { chapter, hud, music, sfx, SFX, gale, controller, clock, arm, capture } = g;
  const place = ctx.table['side-stone-ring'];
  const fi = site('side-stone-fallen'), ri = site('side-stone-raised');
  if (!place || fi < 0 || ri < 0) return { tick() {} };
  const geo = stoneRingGeometry(place.pos);
  const raise = new StoneRaise(geo.marks);
  const fallen = g.archSites[fi], raised = g.archSites[ri], sunk = raised.sink;   // the pillar starts sunk below the ground
  let state = 0, t = 0;   // 0 lying, 1 rising, 2 standing
  const apply = (s) => {
    state = s;
    fallen.hidden = s > 0;
    raised.sink = s === 2 ? 0 : s === 0 ? sunk : raised.sink;
  };
  function burst(x, z, k) {
    g.wind?.burst(x, z, k);
    sfx.x = x; sfx.y = place.h + 2; sfx.z = z; sfx.gain = 1.4; sfx.play(SFX.RUMBLE);
  }
  return {
    sync() { raise.reset(); t = 0; },
    tick(dt) {
      const want = flags.has(FLAG);
      if (state === 0 && want) apply(2);                  // a load: it stands
      else if (state === 2 && !want) apply(0);            // a load of an earlier save
      if (state === 1) {
        t += dt;
        const u = Math.min(1, t / RISE), e = u * u * (3 - 2 * u);
        raised.sink = sunk * (1 - e);
        if (clock.frame % 10 === 0) g.wind?.burst(geo.socket[0], geo.socket[1], 0.8 * (1 - u));
        if (u >= 1) { apply(2); flags.add(FLAG); chapter.raise('use:side-stone'); if (!capture) hud.notice('The Ring of Nine', 'The ninth stone stands', 'Tell Orm.', 6); music.sting('echo'); }
        return;
      }
      if (state !== 0) return;
      const p = controller.pos;
      const near = ctx.dist2(p.x, p.z, geo.fallen[0], geo.fallen[1]) < 45 * 45;
      if (raise.step(dt)) { if (!capture) hud.notice('The fallen stone', 'It settles back', 'Cast all three Updrafts inside fourteen seconds.', 4); hud.line('stone', ''); }
      if (!near) return;
      if (gale.updraftEvent) {
        const r = raise.updraft(gale.updraftX, gale.updraftZ);
        if (r === 'mark') { burst(gale.updraftX, gale.updraftZ, 1.6); music.sting('echo'); }
        else if (r === 'raised') { burst(geo.fallen[0], geo.fallen[1], 2.6); apply(1); t = 0; arm.shake += 0.02; hud.line('stone', ''); return; }
        else if (r === 'miss' && ctx.dist2(gale.updraftX, gale.updraftZ, geo.fallen[0], geo.fallen[1]) < 7 * 7 && !capture) hud.notice('The fallen stone', 'Cast closer', 'At its head, its middle and its foot.', 3);
      }
      if (!capture) hud.line('stone', raise.count > 0 ? 'The fallen stone · ' + raise.count + ' of 3 · ' + Math.max(0, Math.ceil(raise.window - raise.t)) + ' s' : '', raise.count > 0 && raise.window - raise.t < 4);
    },
  };
}
