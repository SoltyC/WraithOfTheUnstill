// The economy's codex pages (docs §11.3-11.5), in the parchment style of the other pages: a
// trader's stall (buy and sell), the smith's forge (a weapon's five tiers, its infusion) and the
// journal's Pouch and Arms. Every transaction re-draws the page with a one-line result.

import { CONSUMABLES, MATERIALS, FLASK, HEALTH } from '../../game/economy/items.js';
import { TRADERS } from '../../game/economy/traders.js';
import { forgeStatus, forge, infuse, costLine, INFUSIONS } from '../../game/economy/forge.js';
import { TIER_INFO } from '../../game/weapons/tiers.js';
import { weaponDefs } from '../../game/weapons/defs.js';

const WHY = { marks: 'Not enough marks.', materials: 'Missing materials.', 'sold out': 'Sold out for now. It returns after a rest at a shrine.', 'pouch full': 'The pouch holds no more of these.', closed: 'Not on offer yet.', max: 'Fully forged.' };

/** @param {{ g: any, el: Function, head: Function, foot: Function, tabs: Function, listPage: Function, sheet: HTMLElement, open: Function }} u */
export function createEconomyPages(u) {
  const { g, el, head, foot, tabs, listPage, sheet, open } = u;
  const inv = () => g.inventory;
  const marksLine = (parent) => el('div', 'marks-line', parent, inv().marks + ' marks');

  /** A trader's stall. arg: { id, tab: 'buy' | 'sell', msg? }. */
  function tradePage(arg) {
    const id = typeof arg === 'string' ? arg : arg.id, tab = (arg && arg.tab) || 'buy', msg = arg && arg.msg;
    const T = TRADERS[id], tr = g.economy.trade;
    head(T.name, T.place);
    tabs([['buy', 'Buy'], ['sell', 'Sell']], tab, (k) => open('trade', { id, tab: k }));
    el('div', 'codex-rule', sheet);
    const go = (extra) => open('trade', { id, tab, ...extra });
    if (tab === 'buy') {
      const lines = tr.lines(id);
      listPage([['Stock', lines.map((l) => ({ ...l, title: l.name + '  ·  ' + l.price, done: l.qty <= 0 }))]], (pg, l) => {
        el('h2', null, pg, l.name); el('div', 'summary', pg, l.price + ' marks  ·  ' + (l.qty > 0 ? l.qty + ' left' : 'none left') + '  ·  you carry ' + l.carried + ' of ' + l.room);
        el('p', null, pg, l.text);
        const why = tr.buyBlock(id, l.id);
        const b = el('button', 'robe-wear', pg, why ? WHY[why] : 'Buy for ' + l.price);
        if (why) b.disabled = true; else b.onclick = () => { tr.buy(id, l.id); g.sfx?.play?.(g.SFX.CHIME); go({ msg: 'Bought ' + l.name.toLowerCase() + '.' }); };
        marksLine(pg);
        if (msg) el('p', 'echo-effect', pg, msg);
      }, T.lines);
    } else {
      const items = tr.sellable();
      listPage([['Carried', items.map((i) => ({ ...i, title: i.name + ' × ' + i.have + '  ·  ' + i.price }))]], (pg, i) => {
        el('h2', null, pg, i.name); el('div', 'summary', pg, 'They pay ' + i.price + ' marks each  ·  you carry ' + i.have);
        el('p', null, pg, (MATERIALS[i.id] || CONSUMABLES[i.id]).text);
        if (MATERIALS[i.id]) el('p', 'echo-effect', pg, 'The smith in Hearn uses these. Sell only what you will not forge.');
        const b = el('button', 'robe-wear', pg, 'Sell one for ' + i.price);
        b.onclick = () => { tr.sell(i.id); g.sfx?.play?.(g.SFX.CHIME); go({ msg: 'Sold ' + i.name.toLowerCase() + '.' }); };
        marksLine(pg);
        if (msg) el('p', 'echo-effect', pg, msg);
      }, 'Nothing here that a trader wants. Weapons are never sold.');
    }
    foot([['Esc', 'leave']]);
  }

  /** The forge. arg: { id (the smith), pick?: weapon id, msg? }. */
  function forgePage(arg) {
    const smith = (arg && arg.id) || 'garrow', msg = arg && arg.msg, pick = arg && arg.pick;
    head('The Forge of Hearn', 'Garrow, the smith');
    el('div', 'codex-rule', sheet);
    const owned = inv().owned.filter((w) => TIER_INFO[w.id]).map((w) => ({ id: w.id, title: weaponDefs[w.id].name + '  ·  tier ' + w.tier, tier: w.tier }));
    const body = el('div', 'codex-body', sheet);
    const list = el('div', 'codex-list', body), pg = el('div', 'codex-page', body);
    el('div', 'group', list, 'Weapons');
    let first = null, chosen = null;
    for (const w of owned) {
      const b = el('button', null, list, w.title);
      b.onclick = () => { for (const x of list.querySelectorAll('button')) x.classList.remove('on'); b.classList.add('on'); pg.replaceChildren(); render(pg, w); };
      first ||= b; if (w.id === pick) chosen = b;
    }
    (chosen || first).click();
    function render(page, w) {
      const d = weaponDefs[w.id], s = forgeStatus(inv(), w.id);
      el('h2', null, page, d.name); el('div', 'summary', page, 'Tier ' + s.tier + ' of 5');
      const ladder = el('div', 'tiers', page);
      for (let t = 1; t <= 5; t++) {
        const info = TIER_INFO[w.id][t], row = el('div', 'tier' + (t <= s.tier ? ' done' : t === s.next ? ' next' : ''), ladder);
        el('b', null, row, ['I', 'II', 'III', 'IV', 'V'][t - 1]);
        el('span', 'tname', row, info.name);
        el('span', 'kind', row, info.move ? 'new move' : 'weight');
        el('div', 'ttext', row, info.text);
      }
      if (s.next) {
        el('p', 'cost', page, 'Tier ' + s.next + ': ' + costLine(s.cost) + '  ·  you have ' + inv().marks + ' marks');
        const b = el('button', 'robe-wear', page, s.block ? WHY[s.block] : 'Forge tier ' + s.next + (s.info.move ? ' (a new move)' : ' (weight only)'));
        if (s.block) b.disabled = true;
        else b.onclick = () => { forge(inv(), w.id); g.sfx?.play?.(g.SFX.CLANG); open('forge', { id: smith, pick: w.id, msg: d.name + ' is tier ' + (s.tier + 1) + '. ' + s.info.name + '.' }); };
      }
      if (s.tier >= 3) {
        el('h2', 'sub', page, 'Infusion');
        const cur = inv().infusion(w.id), unlocked = g.elements ? g.elements.unlocked : new Set(['frost']);
        const row = el('div', 'infuse', page);
        for (const e of [null, ...INFUSIONS]) {
          const ok = e === null || unlocked.has(e), b = el('button', 'robe-wear' + (cur === e ? ' on' : ''), row, e === null ? 'None' : e[0].toUpperCase() + e.slice(1));
          if (!ok) { b.disabled = true; b.title = 'Not yet bent'; } else b.onclick = () => { infuse(inv(), w.id, e); open('forge', { id: smith, pick: w.id, msg: e ? 'The ' + d.name.toLowerCase() + ' takes ' + e + '.' : 'The infusion is drawn out.' }); };
        }
        el('p', null, page, 'Its blows apply the element lightly: frost chills and then freezes on the third, gale throws foes and feeds a breath of focus.');
      }
      if (msg) el('p', 'echo-effect', page, msg);
      marksLine(page);
    }
    foot([['Esc', 'leave']]);
  }

  /** The journal's Pouch tab: marks, flask, threads, the pouch, materials. */
  function pouchTab(parent) {
    const I = inv();
    el('h2', null, parent, 'The pouch'); el('div', 'summary', parent, I.marks + ' marks  ·  ' + I.threads + ' of ' + HEALTH.maxThreads + ' health threads');
    el('p', null, parent, FLASK.name + ' × ' + I.flask.charges + ' of ' + I.flask.max + '. ' + FLASK.text);
    for (const id in CONSUMABLES) {
      if (I.pouch[id] <= 0) continue;
      const p = el('p', null, parent, CONSUMABLES[id].name + ' × ' + I.pouch[id] + '. ' + CONSUMABLES[id].text);
      if (I.sel === id) p.classList.add('echo-effect');
    }
    const mats = Object.keys(MATERIALS).filter((id) => I.materials[id] > 0);
    if (mats.length) { el('h2', 'sub', parent, 'Materials'); for (const id of mats) el('p', null, parent, MATERIALS[id].name + ' × ' + I.materials[id] + '. ' + MATERIALS[id].text); }
    const d = g.economy.drop;
    if (d.active) el('p', 'echo-effect', parent, d.marks + ' marks lie where you fell. Walk back to the glow.');
    el('p', 'summary', parent, 'R uses the marked item, C moves the mark. The flask fills at every shrine.');
  }

  /** The journal's Arms tab: the weapons owned, their tier, what each tier does. */
  function armsTab() {
    const I = inv();
    return I.owned.map((w) => ({ ...w, title: weaponDefs[w.id].name + (w.tier ? '  ·  tier ' + w.tier : ''), done: false }));
  }
  function armsPage(pg, w) {
    const I = inv(), d = weaponDefs[w.id];
    el('h2', null, pg, d.name); el('div', 'summary', pg, (I.carried.includes(w.id) ? 'Carried' : 'Owned') + (w.tier ? '  ·  forged to tier ' + w.tier : '') + (w.infusion ? '  ·  infused with ' + w.infusion : ''));
    const info = TIER_INFO[w.id];
    if (info) for (let t = 1; t <= w.tier; t++) el('p', 'past', pg, 'Tier ' + t + ': ' + info[t].name + '. ' + info[t].text);
    if (!w.tier) el('p', null, pg, 'As found. The smith in Hearn can forge it.');
    const b = el('button', 'robe-wear', pg, I.equipped === w.id ? 'In hand' : 'Take in hand');
    if (I.equipped === w.id) b.disabled = true; else b.onclick = () => { I.equip(w.id); open('journal', 'arms'); };
  }

  return { trade: tradePage, forge: forgePage, pouchTab, armsTab, armsPage };
}
