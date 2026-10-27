// Remembrance in play (game/remembrance.js, data/remembrance.json): the one place the world answers a
// remembered thing. `remember(id)` fires the reactions: a quiet notice, a soft chime, the places the entry
// reveals made known on the compass and the map, and for a view the wind lifting where it was seen. The
// triggers are wired here and nowhere else: world events pass through chapter.raise (talk, nooks, use),
// casts come from the bending system, and states (places sighted, Shaped sketched, shrines rested at,
// Wardens released, Flow) are polled twice a second. After a load the first poll is silent (what was
// already true is remembered without a toast).

import { createRemembrance } from '../game/remembrance.js';

/** Event names of a cast, by the surface under the Wraith (built once: a cast allocates nothing). */
const CAST = {
  snow: { sweep: 'cast:snow:frost', crystal: 'cast:snow:frost', ribbon: 'cast:snow:frost', gust: 'cast:snow:gale', updraft: 'cast:any:updraft', vortex: 'cast:any:vortex', shard: 'cast:snow:stone', ridge: 'cast:snow:stone', bloom: 'cast:any:bloom' },
  grass: { sweep: 'cast:grass:frost', crystal: 'cast:grass:frost', ribbon: 'cast:grass:frost', gust: 'cast:grass:gale', updraft: 'cast:any:updraft', vortex: 'cast:any:vortex', shard: 'cast:grass:stone', ridge: 'cast:grass:stone', bloom: 'cast:any:bloom' },
};

/** @param {any} g  shared boot context */
export function addRemembranceSystem(g) {
  const { loop, chapter, hud, sfx, SFX, controller, clock, ws, capture } = g;
  const flags = chapter.graph.flags, vars = chapter.graph.vars;
  /** A `has` state as a check, made once. */
  const resolve = (has) => {
    const at = has.indexOf(':'), kind = at < 0 ? '' : has.slice(0, at), key = has.slice(at + 1);
    switch (kind) {
      case 'lore': return () => chapter.lore.has(key);
      case 'shrine': return () => chapter.shrines.has(key);
      case 'echo': return () => chapter.echoes.has(key);
      case 'restored': return () => ws.restoration[key] === 'restored';
      case 'flow': { const tier = +key; return () => g.flow !== undefined && g.flow.tier >= tier; }
      default: return () => flags.has(has) || !!vars[has];
    }
  };
  const rem = g.remembrance = createRemembrance({
    flags, resolve,
    onRemember(e, ctx) {
      if (ctx && ctx.silent) return;
      hud.notice('Remembered', e.title, null, 5);
      if (capture) return;
      const p = controller.pos;
      sfx.x = p.x; sfx.y = p.y + 1.5; sfx.z = p.z; sfx.gain = 0.45; sfx.play(SFX.CHIME);
      // The world answers: the places an entry reveals are known on the compass and the map.
      if (e.reveal) for (const id of e.reveal) { flags.add('known:' + id); g.nav?.know(id); }
      // A view lifts the wind where it was seen.
      if (ctx && ctx.x !== undefined && e.group === 'land') g.wind?.burst(ctx.x, ctx.z, 1.2);
    },
  });
  // Events: everything the quests hear (talk:<npc>, nook:<id>, use:<id>, echo:<id>, warden:released …) reaches the entries too.
  const raise = chapter.raise;
  chapter.raise = function (e) { raise.call(this, e); rem.event(e); };
  /** A bend was cast (systems/bending.js): 'sweep' | 'crystal' | 'ribbon' | 'gust' | 'updraft' | 'vortex' | 'shard' | 'ridge' | 'bloom'. */
  rem.cast = (verb) => { rem.event(CAST[ws.biome === 'meadow' ? 'grass' : 'snow'][verb]); };
  /** A frozen Shaped shattered (game/combat/combat.js). */
  rem.shattered = () => rem.event('react:shatter');
  if (g.combat) g.combat.onShatter = rem.shattered;

  let quiet = true;   // the next poll only learns (a load, or the first frame)
  const silent = { silent: true };
  { const prev = g.navSync; g.navSync = () => { prev?.(); quiet = true; }; }
  loop.add({ name: 'remembrance', update: () => {
    if ((clock.frame & 31) !== 0) return;
    rem.poll(quiet ? silent : undefined);
    quiet = false;
  } });
}
