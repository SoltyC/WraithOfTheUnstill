// Carry the Flame (side quest, user request 2026-10-09: quests that are gameplay): Isolde lights
// the Wraith's lantern from hers, at night. The flame gutters with time, faster when the Wraith
// surfs or runs or the snow is falling, and a blow knocks most of it out; at nothing it dies and
// Isolde must light it again. Carried, it lights the four cold braziers — three by the shrines and
// one at the edge of the Warden's arena (the Wraith re-forms beside that one once lit). Its light
// draws the Shaped. The lantern hangs from the Wraith's hand and lights the snow round it.

import { BRAZIERS } from '../world/architecture.js';

const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
export const flameTuning = { life: 300, surf: 5, run: 1.6, snow: 2, blow: 0.4, drawAfter: 50 };

/** @param {any} g  shared boot context */
export function addFlameSystem(g) {
  const { loop, controller, chapter, nav, hud, music, combat, clock, params, weather, shaped, sfx, SFX, wraithView, capture } = g;
  const graph = chapter.graph, flags = graph.flags, vars = graph.vars;
  const T = flameTuning;
  const f = g.flame = { carrying: false, strength: 0.5 - 0.5, carryT: 0.5 - 0.5, drawn: false };
  const sitesIdx = new Map((g.archSites || []).map((s, i) => [s.id, i]));
  const A = g.architecture.sites, glow = g.architecture.glow;

  // ── Braziers ───────────────────────────────────────────────────────────────────────────────
  const braziers = [];
  for (const br of BRAZIERS) {
    const i = sitesIdx.get(br.id); if (i === undefined) continue;
    const s = g.archSites[i];
    const t = { kind: 'brazier', id: br.id, verb: 'Light', name: 'Brazier', x: s.at[0], y: 0, z: s.at[1], r: 3.2, h: 1.1, site: i, hidden: true,
      onUse: () => {
        if (flags.has('lit:' + br.id)) return;
        if (!f.carrying) { hud.notice('Brazier', 'Cold for nine winters', 'A carried flame could light it. Isolde keeps one at the fire.', 5); return; }
        flags.add('lit:' + br.id); flags.add('used:' + br.id); vars.braziers = (vars.braziers || 0) + 1;
        chapter.raise('use:' + br.id); music.sting('echo');
        sfx.x = t.x; sfx.y = t.y + 1; sfx.z = t.z; sfx.gain = 1; sfx.play(SFX.WHOOSH);
        hud.notice('Brazier', br.id === 'brazier-4' ? 'Lit beside the Held Snow' : 'The flame leans toward the Warden', br.id === 'brazier-4' ? 'If you fall in the Warden\'s arena, you will rise here.' : vars.braziers + ' of ' + BRAZIERS.length + ' lit', 5);
        if (vars.braziers >= BRAZIERS.length) { f.carrying = false; hud.notice('Carry the Flame', 'Every brazier burns', 'Isolde will play tonight.', 6); }
      } };
    braziers.push(t); g.interactables.push(t);
  }
  const bz = { x: 0.5, z: 0.5, name: 'A cold brazier' };
  g.navDynamic.brazier = () => {
    let best = 1e18, b = null;
    for (const t of braziers) { if (flags.has('lit:' + t.id)) continue; const d = dist2(t.x, t.z, nav.px, nav.pz); if (d < best) { best = d; b = t; } }
    if (!b) return null; bz.x = b.x; bz.z = b.z; return bz;
  };

  // ── The lantern at the Wraith's hand ───────────────────────────────────────────────────────
  const prop = g.props?.wraith;
  let lastHealth = combat.health;
  function give() {
    f.carrying = true; f.strength = 1; f.carryT = 0; f.drawn = false;
    flags.delete('flame-out'); flags.add('flame-carried');
    chapter.raise('flame:taken');
    if (!capture) hud.notice('Isolde\'s flame', 'Carried in your lantern', 'It gutters if you hurry and dies if you are struck. Snow eats at it.', 7);
  }
  function out(why) {
    f.carrying = false; f.strength = 0; flags.add('flame-out');
    if (!capture) hud.notice('The flame is out', why, 'Isolde can light it again, at night.', 6);
  }

  loop.add({ name: 'flame', update: () => {
    const dt = clock.dt, p = controller.pos;
    if (flags.has('flame-given')) { flags.delete('flame-given'); give(); }
    // Not carried (a load, a fall) while braziers wait: it counts as out, so Isolde will relight it.
    if (!f.carrying && flags.has('flame-carried') && (vars.braziers || 0) < BRAZIERS.length && !flags.has('flame-out')) flags.add('flame-out');
    // Braziers: seated with their sites; hidden until Isolde has spoken of them or the Wraith is near.
    for (const t of braziers) {
      if (A[t.site * 4 + 3] > 0.5) t.y = A[t.site * 4 + 1];
      t.hidden = flags.has('lit:' + t.id) || !(flags.has('met-isolde') || dist2(t.x, t.z, p.x, p.z) < 12 * 12);
    }
    if (f.carrying) {
      f.carryT += dt;
      const sp = Math.hypot(controller.vel.x, controller.vel.z);
      const rate = (controller.surf.active ? T.surf : sp > 4 ? T.run : 1) * (weather.snow > 0.5 ? T.snow : 1);
      f.strength -= rate * dt / T.life;
      if (combat.health < lastHealth - 0.5) f.strength -= T.blow;
      if (combat.dying > 0) out('You fell, and it went with you.');
      else if (f.strength <= 0) out('It guttered and died.');
      // Its light draws the Shaped (once a carry, after a while, at night).
      const tod = params.v.timeOfDay, night = tod < 6 || tod > 18.5;
      if (f.carrying && night && !f.drawn && f.carryT > T.drawAfter) {
        f.drawn = true;
        const a = Math.atan2(controller.vel.x, controller.vel.z) + Math.PI;
        shaped.spawn('hound', p.x + Math.sin(a + 0.5) * 20, p.z + Math.cos(a + 0.5) * 20);
        shaped.spawn('hound', p.x + Math.sin(a - 0.5) * 22, p.z + Math.cos(a - 0.5) * 22);
        if (!capture) hud.notice('Shaped', 'Drawn by the light', 'Keep the flame from them.', 4);
      }
    }
    lastHealth = combat.health;
    // The lantern: at the left hand, its ember as bright as the flame; and its light on the snow.
    if (prop) {
      const o = prop.index * 4;
      if (f.carrying) {
        const b = wraithView.wraith.body;
        A[o] = b.ha[0]; A[o + 1] = b.ha[1] - 0.02; A[o + 2] = b.ha[2]; A[o + 3] = 1;
        glow[o + 1] = 0.25 + 0.75 * f.strength * (0.9 + 0.1 * Math.sin(clock.simTime * 13));
        const L = g.content.clipmap.spellLights;
        if (L[23] <= 0) { L[16] = b.ha[0]; L[17] = b.ha[1] + 0.2; L[18] = b.ha[2]; L[19] = 9; L[20] = 1; L[21] = 0.55; L[22] = 0.24; L[23] = 1.1 * f.strength; }
      } else A[o + 3] = 0;
    }
    if (!capture) hud.line('flame', f.carrying ? 'Isolde\'s flame · ' + (f.strength > 0.6 ? 'steady' : f.strength > 0.3 ? 'guttering' : 'almost out') : '', f.carrying && f.strength <= 0.3);
  } });
}
