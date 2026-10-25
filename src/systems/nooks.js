// The nooks in play (data/nooks.json, built by world/nookSites.js): thirty-odd small finds along the natural
// routes. Each is an interaction (Read, Look out, Look, Dig, Cross) that pays something on the first use:
// a lore fragment spoken as a line (cairns, tableaux, glints), a Remembrance entry and a swell (views), or
// the place a marker points at made known to the compass and the map (markers). A nook is hidden from
// the compass until found; found, it keeps a quiet mark there and a mark on the parchment map.
// Found nooks are world flags (`nook:<id>`, with known:/visited: for the compass), so they save with the quests.

import { NOOKS, foundFlag } from '../game/nooks.js';

/** TODO(economy): pay a nook's `reward: { marks }` into the inventory once it has a currency (docs/gameplay-design.md
 *  §11.4, build order §13). The data carries the amounts already; no currency code lives here. */
function payReward(reward) { return reward; }

const GLOW_FOUND = 0.8;

/** @param {any} g  shared boot context */
export function addNookSystem(g) {
  const { loop, chapter, nav, hud, music, sfx, SFX, controller, clock, capture } = g;
  const flags = chapter.graph.flags, vars = chapter.graph.vars, A = g.architecture.sites, ground = g.ground, sites = g.archSites;
  const sitesIdx = new Map(sites.map((s, i) => [s.id, i]));
  const list = [];
  for (const n of NOOKS) {
    const i = sitesIdx.has(n.id) ? sitesIdx.get(n.id) : -1;
    if (i < 0) continue;
    // What is read at a nook is dialogue and lore of the chapter, so subtitles and the Lore tab carry it.
    const text = n.payoff.lore?.text || n.payoff.say;
    if (text) chapter.data.dialogue[n.id] = { speaker: null, lines: [text] };
    if (n.payoff.lore) chapter.data.lore[n.id] = n.payoff.lore;
    chapter.data.names[n.id] ||= n.name;
    const e = { n, i, glow: 0, t: { kind: 'nook', id: n.id, verb: n.verb, name: n.name, x: n.pos[0], y: n.h, z: n.pos[1], r: n.shape === 'log' ? 4.2 : 3.2, h: 1.2, hidden: false, onUse: null } };
    e.t.onUse = () => use(e);
    list.push(e); g.interactables.push(e.t);
  }
  const foundOf = (n) => flags.has(foundFlag(n.id));

  function use(e) {
    const { n } = e, p = n.payoff;
    if (foundOf(n)) return;
    flags.add(foundFlag(n.id));
    nav.know(n.id); nav.visit(n.id);
    vars['nooks.found'] = (vars['nooks.found'] || 0) + 1;
    chapter.raise('nook:' + n.id);
    const ctx = { x: n.pos[0], z: n.pos[1], site: e.i };
    if (p.lore) chapter.do({ lore: n.id });
    if (p.lore || p.say) chapter.say(n.id);
    if (p.guide) for (const id of p.guide) { flags.add('known:' + id); nav.know(id); }
    if (p.rem) { music.sting('echo'); g.wind?.burst(n.pos[0], n.pos[1], 1.4); g.remembrance?.remember(p.rem, ctx); }
    if (p.reward) payReward(p.reward);
    if (!capture) { sfx.x = n.pos[0]; sfx.y = n.h + 1; sfx.z = n.pos[1]; sfx.gain = n.kind === 'glint' ? 0.8 : 0.5; sfx.play(n.kind === 'glint' ? SFX.CRUNCH : SFX.CHIME); }
    if (n.kind === 'glint') g.wind?.burst(n.pos[0], n.pos[1], 0.9);
  }

  /** Re-seat a nook on the fine ground once the Wraith is near: the architecture seats a far site on the coarse ground, which lies a metre or so low on a crest (and a nook is small). */
  const FIT = 120 * 120;
  function fit(e) {
    const dx = e.n.pos[0] - controller.pos.x, dz = e.n.pos[1] - controller.pos.z;
    if (dx * dx + dz * dz > FIT || A[e.i * 4 + 3] < 0.5) return;
    ground.qx = e.n.pos[0]; ground.qz = e.n.pos[1];
    if (!ground.covers()) return;
    ground.sample();
    if (Math.abs(ground.h - A[e.i * 4 + 1]) < 0.05) return;
    A[e.i * 4 + 1] = ground.h; sites[e.i].seatY = ground.h;
    if (g.solids) g.solids.sites[e.i].seat = ground.h;
  }
  let sinceSync = 99;
  loop.add({ name: 'nooks', update: () => {
    const dt = clock.dt;
    sinceSync += dt;
    // Found nooks stop offering themselves (also after a load), and their glyphs take a steady light.
    const sync = sinceSync > 0.25;
    if (sync) sinceSync = 0;
    for (let k = 0; k < list.length; k++) {
      const e = list[k];
      if (sync) { e.t.hidden = foundOf(e.n); fit(e); }
      const want = e.t.hidden ? GLOW_FOUND : 0;
      if (e.glow !== want) {
        e.glow += (want - e.glow) * Math.min(1, dt * 2.5);
        if (Math.abs(want - e.glow) < 0.01) e.glow = want;
        sites[e.i].glow = e.glow;   // (the architecture system eases the glyph light to the site's `glow`)
      }
      if (A[e.i * 4 + 3] > 0.5) e.t.y = A[e.i * 4 + 1];
    }
  } });
  g.nooks = { list, count: () => list.length, found: () => vars['nooks.found'] || 0 };
}
