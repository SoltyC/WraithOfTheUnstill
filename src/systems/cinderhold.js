// Cinderhold (world/cinderhold.js; data/quests/ember.json; docs/phase-11/ember-design.md §4.1). The guild decides, two votes
// of three; the miners do what the guild says.
//   Teg (the measurer) votes to go once shown the bell in the deep seam (`ember:cin-reading`, then shown: `ember:teg-yes`).
//   Vell (the purse) votes to go when going costs less than staying: three Sow families on the road (no figs, no bread),
//     or the mountain at Breathing (systems/emberClock.js) — `ember:vell-yes`.
//   Morcant (the head, npc ember-orrin) votes yes only on a deal: the Wraith has seen the tithe cage (`know:tithe`) and promises to forget it;
//     the guild opens the lower tube to the coast, and the cage goes down one last time (`ember:tithe-kept`, `ember:tube-open`).
// Two votes: `ember:cin-vote` — everyone goes, masters too, by the lower tube (into the south gallery; out at the coast).
// Or the Wraith shows Bron the cage (`ember:tithe-exposed`): the miners bring up the debtors below (`ember:debtors-up`, Cole's
// father among them) and leave on foot, round the mountain, to the headland camp; the guild stays, and seals the lower tube
// behind them (`ember:tube-sealed`). Either is `ember:cin-decided`.

import { CINDER_PTS, cinderWorld } from '../world/cinderhold.js';
import { CAMP } from '../world/sow.js';

const MASTERS = ['orrin', 'teg', 'vell'], MINERS = ['bron', 'wyn', 'ifor', 'gethin'];
/** Overland to the camp: down the flank and the valley's head. */
const OVERLAND = [[1820, -2060], [1500, -2250], [1150, -2380], [900, -2470], [760, -2560]];

/** The guild's vote (pure: tested). */
export function guildVotes(flags) { return ['ember:teg-yes', 'ember:vell-yes', 'ember:orrin-yes'].filter((f) => flags.has(f)).length; }

/** @param {any} g  shared boot context */
export function addCinderholdSystem(g) {
  const { chapter, loop, controller, clock, hud, capture, sfx, SFX } = g;
  if (!chapter.table['cin-orrin'] || !g.archSites) return;
  const flags = chapter.graph.flags, vars = chapter.graph.vars, has = (f) => flags.has(f);
  const W = (k) => cinderWorld(CINDER_PTS[k]);
  const cage = g.archSites.findIndex((s) => s.id === 'cin-cage');
  const say = (t, s, x, secs = 7) => { if (!capture) hud.notice(t, s, x, secs); };
  const people = new Map();

  function goTo(n, tx, tz, dt, sp) {
    const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
    if (d < 0.25) { n.vx = 0; n.vz = 0; return d; }
    const s = Math.min(sp, d * 2.5);
    n.vx = dx / d * s; n.vz = dz / d * s; n.x += n.vx * dt; n.z += n.vz * dt; n.yaw = Math.atan2(dx, dz);
    return d;
  }
  /** Leaving: by the lower tube (walk into the south gallery, then, out of sight, out at the coast: the camp) or overland. */
  function leave(n, dt, k) {
    const a = 0.2 + k * 0.5, slot = [CAMP.at[0] + Math.cos(a) * 11, CAMP.at[1] + Math.sin(a) * 11];
    const pd = Math.hypot(controller.pos.x - n.x, controller.pos.z - n.z);
    const mouth = W('galleryS'), inMouth = [mouth[0] - 0.8, mouth[1] + (k % 3 - 1) * 0.9];   // (just inside the mouth, between its piers)
    const route = has('ember:tithe-exposed') ? [...OVERLAND, slot] : [inMouth, slot];
    n.leg ??= 0;
    const last = n.leg >= route.length - 1, [tx, tz] = route[Math.min(n.leg, route.length - 1)];
    // (Into the tube: once inside its mouth and out of the Wraith's sight, the next the world sees of them is at the camp.)
    if (!has('ember:tithe-exposed') && n.leg === 1 && !n.atCamp && pd > 70) { n.x = slot[0]; n.z = slot[1]; n.atCamp = true; n.placed = false; }
    const d = goTo(n, tx, tz, dt, pd > 120 ? 9 : 1.5);
    if (!last && d < 1.2) n.leg++;
    n.hide = !has('ember:tithe-exposed') && n.leg === 1 && !n.atCamp && Math.hypot(n.x - mouth[0], n.z - mouth[1]) < 3.5;
    if (last && d < 0.4) { n.yaw = Math.atan2(CAMP.at[0] - n.x, CAMP.at[1] - n.z); n.noLook = false; n.hunch = 0.35; } else { n.noLook = true; n.hunch = 0.2; }
  }
  function brain(id, k) {
    const home = chapter.table['cin-' + ({ ifor: 'miner1', gethin: 'miner2' }[id] || id)].pos;
    let t = 0;
    return (n, dt) => {
      people.set(id, n);
      const master = MASTERS.includes(id);
      const goes = has('ember:cin-vote') ? true : has('ember:tithe-exposed') ? !master : false;
      if (goes) return leave(n, dt, MASTERS.concat(MINERS).indexOf(id));
      n.hide = false;
      // Teg to the bell, Bron to the cage, with the Wraith.
      const showing = id === 'teg' && has('ember:teg-showing') && !has('ember:teg-yes') ? W('thermo') : id === 'bron' && has('ember:bron-showing') && !has('ember:tithe-exposed') ? W('shaft') : null;
      if (showing) {
        const tx = showing[0] - 2.4, tz = showing[1] - (id === 'bron' ? 2.4 : 0);
        const d = goTo(n, tx, tz, dt, 1.3); n.noLook = d > 1;
        const pd = Math.hypot(controller.pos.x - showing[0], controller.pos.z - showing[1]);
        if (d < 1 && pd < 12) {
          if (id === 'teg') { flags.add('ember:teg-yes'); chapter.say('ember.teg.shown'); }
          else { flags.add('ember:tithe-exposed'); flags.add('ember:debtors-up'); flags.add('ember:tube-sealed'); flags.add('ember:cin-decided'); chapter.raise('ember:cin-decided'); chapter.say('ember.bron.shown'); }
        }
        return;
      }
      // At work: a slow pace about their place.
      t += dt;
      const ox = Math.sin(t * 0.13 + k) * 1.5, oz = Math.cos(t * 0.11 + k * 2) * 1.2;
      const d = goTo(n, home[0] + ox, home[1] + oz, dt, 0.6);
      n.noLook = d > 0.6; n.hunch = master ? 0.1 : 0.3;
    };
  }
  let set = false, acc = 0;
  loop.add({ name: 'cinderhold', update: () => {
    if (!set && g.npcs) {
      MASTERS.concat(MINERS).forEach((id, k) => { const n = g.npcs.find((q) => q.id === 'ember-' + id); if (n) n.brain = brain(id, k); });
      set = true;
    }
    acc += clock.dt; if (acc < 0.25) return; acc = 0;
    // Vell: when leaving costs less than staying.
    const road = vars['ember:sow-road'] || 0;
    if (!has('ember:vell-yes') && (road >= 3 || (vars['ember:stage'] || 0) >= 3)) flags.add('ember:vell-yes');
    if (!has('ember:cin-vote') && !has('ember:tithe-exposed') && guildVotes(flags) >= 2) {
      flags.add('ember:cin-vote'); flags.add('ember:cin-decided'); flags.add('ember:tube-open'); chapter.raise('ember:cin-decided');
      if (!has('ember:tithe-kept')) flags.add('ember:debtors-left');
      const [x, z] = W('shaft'); sfx.x = x; sfx.y = controller.pos.y; sfx.z = z; sfx.gain = 1; sfx.play(SFX.TOLL);
      say('Cinderhold', 'The guild has voted', 'The lift bell rings the shifts up. Cinderhold goes by the lower tube, to the coast.', 8);
    }
    if (has('ember:tithe-kept')) flags.add('ember:debtors-left');
    // The cage: gone down for good once the tithe is kept and the vote is in.
    if (cage >= 0) g.archSites[cage].hidden = has('ember:tithe-kept') && has('ember:cin-vote');
  } });
  g.cinderhold = { people, votes: () => guildVotes(flags) };
}
