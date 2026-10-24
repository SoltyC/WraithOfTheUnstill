// "The Stones That Listen": three stones on the lake shore, each asking for Gale gestures in order (a Gust
// along the stone, a Vortex held on it, an Updraft under it). Press E at a stone to listen; it asks for
// its sequence within 40 s, and a gesture aimed at it but wrong starts it over. Each stone answered lights
// and sends the wind out over the shore; the third gives the Echo of the Turning Wind (data: echoes, effect
// in game/echoes.js). Answered stones are flags (`echoed:side-echo-n`) and the count a variable (`side.stones`).

import { GestureAsk, rayDistance, vortexHold } from '../../game/sideQuests.js';
import { gustTuning } from '../../game/bending/gale.js';

const WORD = { gust: 'Gust (click)', vortex: 'Vortex (hold click)', updraft: 'Updraft (F)' };
const AIM = 5.5;   // m from the stone a gesture counts as aimed at it (the view ray meets the ground a little short of a tall stone)

export function addEchoes(ctx) {
  const { g, flags, vars, site, seatY, glow } = ctx, { chapter, hud, music, gale, controller, nav, sfx, SFX, arm, capture } = g;
  const stones = [];
  for (let k = 1; k <= 3; k++) {
    const id = 'side-echo-' + k, pl = ctx.table[id], i = site(id);
    if (!pl || i < 0) return { tick() {} };
    const s = { id, k, pl, i, ask: new GestureAsk(pl.ask), hold: 0, armed: true, t: null };
    s.t = { kind: 'stone', id, verb: 'Listen', name: 'Listening Stone', x: pl.pos[0], y: pl.h, z: pl.pos[1], r: 3.6, h: 1.4, onUse: () => listen(s) };
    stones.push(s); g.interactables.push(s.t);
  }
  const gustSeen = new Uint32Array(8);
  let cur = null;
  // The compass follows the nearest stone that has not answered.
  const goal = { x: 0, z: 0, y: 0, name: '' };
  g.navDynamic['next-echo'] = () => {
    let best = 1e18, b = null;
    for (const s of stones) { if (flags.has('echoed:' + s.id)) continue; const d = ctx.dist2(s.pl.pos[0], s.pl.pos[1], nav.px, nav.pz); if (d < best) { best = d; b = s; } }
    if (!b) return null; goal.x = b.pl.pos[0]; goal.z = b.pl.pos[1]; goal.y = b.pl.h; goal.name = b.pl.name; return goal;
  };
  const sentence = (s) => s.ask.ask.map((a, j) => (j < s.ask.i ? '✓ ' : '') + WORD[a]).join(', then ');
  function listen(s) {
    if (flags.has('echoed:' + s.id)) { hud.notice('Listening Stone', 'Quiet now', null, 3); return; }
    if (cur && cur !== s) cur.ask.active = false;
    cur = s; s.ask.start(); s.hold = 0;
    chapter.raise('use:' + s.id); music.sting('echo');
    if (!capture) hud.notice('Listening Stone', 'It asks for the wind', 'Make it a ' + s.ask.ask.map((a) => WORD[a]).join(', then ') + ', aimed at the stone.', 7);
  }
  function answer(s) {
    flags.add('echoed:' + s.id); flags.add('lit:' + s.id); nav.visit?.(s.id);
    vars['side.stones'] = (vars['side.stones'] || 0) + 1;
    chapter.raise('echo:' + s.id); music.sting('echo');
    // The wind answers: bursts ringed round the stone (the meadow grass runs in waves), the stone's glyphs lit.
    for (let a = 0; a < 6; a++) g.wind?.burst(s.pl.pos[0] + Math.sin(a * 1.047) * 5, s.pl.pos[1] + Math.cos(a * 1.047) * 5, 2.4);
    sfx.x = s.pl.pos[0]; sfx.y = s.pl.h + 2; sfx.z = s.pl.pos[1]; sfx.gain = 1.3; sfx.play(SFX.CHIME); sfx.play(SFX.WHOOSH);
    arm.shake += 0.01;
    if (!capture) hud.notice('The stone answers', vars['side.stones'] + ' of 3', null, 5);
    if (vars['side.stones'] >= 3) chapter.do({ echo: 'echo-meadow-wind' });
    cur = null; hud.line('echoes', '');
  }
  function gesture(kind, aimed) {
    const s = cur; if (!s) return;
    const r = s.ask.gesture(kind, aimed);
    if (r === 'done') answer(s);
    else if (r === 'wrong') { if (!capture) hud.notice('Listening Stone', 'The echo wavers', 'It asked for ' + WORD[s.ask.next] + '. Start again.', 4); }
    else if (r === 'ok') music.sting('echo');
  }
  return {
    sync() { cur = null; for (const s of stones) { s.ask.active = false; s.hold = 0; } gustSeen.fill(0); },
    tick(dt) {
      for (const s of stones) {
        const lit = flags.has('echoed:' + s.id);
        s.t.y = seatY(s.i, s.pl.h);
        glow[s.i * 4] += ((lit ? 1 : cur === s ? 0.6 : 0.1) - glow[s.i * 4]) * Math.min(1, dt * 3);
      }
      const s = cur;
      if (!s) {
        for (let k = 0; k < gustSeen.length && k < gale.gustId.length; k++) gustSeen[k] = gale.gustId[k];
        return;
      }
      const p = controller.pos;
      if (ctx.dist2(p.x, p.z, s.pl.pos[0], s.pl.pos[1]) > 60 * 60) { s.ask.active = false; cur = null; hud.line('echoes', ''); if (!capture) hud.notice('Listening Stone', 'The echo fades', 'Listen again, and stay near.', 4); return; }
      if (s.ask.step(dt)) { cur = null; hud.line('echoes', ''); if (!capture) hud.notice('Listening Stone', 'The echo fades', 'Listen again; it will wait.', 4); return; }
      // A new Gust (its id changes): it goes from the Wraith along the aim; does it pass the stone?
      for (let k = 0; k < gale.gustId.length; k++) {
        const id = gale.gustId[k];
        if (id === gustSeen[k]) continue;
        gustSeen[k] = id;
        if (!gale.gustActive[k]) continue;
        const dx = gale.gustDX[k], dz = gale.gustDZ[k];
        gesture('gust', rayDistance(p.x + dx * 0.6, p.z + dz * 0.6, dx, dz, gustTuning.range, s.pl.pos[0], s.pl.pos[1]) < AIM);
        break;
      }
      if (gale.updraftEvent) gesture('updraft', ctx.dist2(gale.updraftX, gale.updraftZ, s.pl.pos[0], s.pl.pos[1]) < AIM * AIM);
      // One Vortex is one gesture: it must die away before another counts.
      if (gale.vortexStrength < 0.3) s.armed = true;
      s.hold = s.armed ? vortexHold(s.hold, dt, gale.vortexStrength, gale.vortexX, gale.vortexZ, s.pl.pos[0], s.pl.pos[1]) : 0;
      if (s.hold > 1.4) { s.hold = 0; s.armed = false; gesture('vortex', true); }
      if (cur && !capture) hud.line('echoes', 'Listening Stone: ' + sentence(s) + ' · ' + Math.ceil(s.ask.left) + ' s', s.ask.left < 8);
    },
  };
}
