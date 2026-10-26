// The journal's Remembrance tab: what the Wraith has observed, by what it was about (the land, the Shaped,
// the Wardens, the people), and the living reaction table: surface by element, each cell filling in the
// words of the game's own rule (game/combat/reactions.js) the first time the Wraith has bent it onto that
// ground. Only what is remembered is listed: it is a book of things seen, never a checklist.

import { GROUPS } from '../../game/remembrance.js';
import { REACTIONS } from '../../game/combat/reactions.js';
import { BUILT, ELEMENT_NAMES } from '../../game/elements.js';

const SURFACE_NAMES = { snow: 'Snow', grass: 'Grass' };

/** The table page: rows are the surfaces the Wraith can bend today, columns the elements it has. */
function tablePage(pg, el, rem) {
  el('h2', null, pg, 'What the World Answers');
  el('p', 'summary', pg, 'Each ground answers each element in its own way. A cell fills the first time you bend it.');
  const t = el('table', 'rem-table', pg), head = el('tr', null, t);
  el('th', null, head);
  const cols = [...BUILT];
  for (const c of cols) el('th', null, head, ELEMENT_NAMES[c]);
  for (const s of Object.keys(SURFACE_NAMES)) {
    const row = el('tr', null, t);
    el('th', null, row, SURFACE_NAMES[s]);
    for (const c of cols) {
      const e = rem.cell(s, c), td = el('td', e && rem.has(e.id) ? 'on' : null, row);
      td.textContent = e && rem.has(e.id) ? REACTIONS[s][c].result : '·';
    }
  }
}

/** Lists the Remembrance tab through the journal's list page (`listPage` from menus.js, `el` its element helper). */
export function remembranceTab({ el, listPage, rem }) {
  const have = rem.list();
  const groups = GROUPS.map(([id, label]) => [label, have.filter((e) => e.group === id).map((e) => ({ ...e, title: e.title }))]);
  // The reaction table is always the first page of its group.
  const react = groups.find((g) => g[0] === GROUPS.find((x) => x[0] === 'reactions')[1]);
  react[1].unshift({ id: 'table', title: 'The Table', table: true });
  listPage(groups, (pg, it) => {
    if (it.table) { tablePage(pg, el, rem); return; }
    el('h2', null, pg, it.title);
    el('p', null, pg, it.text);
  }, 'Nothing remembered yet.');
}
