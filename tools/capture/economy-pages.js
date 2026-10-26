// Page-shot harness for the economy's codex pages: the real page code (ui/menus/trade.js, codex.js)
// and styles over a stubbed game, no world. Driven by tools/capture/economy-pages.mjs.
import '../../src/ui/base.css';
import '../../src/ui/hud/hud.css';
import '../../src/ui/menus/menus.css';
import { el, createCodex } from '../../src/ui/menus/codex.js';
import { createEconomyPages } from '../../src/ui/menus/trade.js';
import { createInventory } from '../../src/game/inventory.js';
import { createTrade } from '../../src/game/economy/trade.js';
import { createDrop } from '../../src/game/economy/drop.js';

const inventory = createInventory();
const trade = createTrade({ inventory, test: (c) => !c || !c.quest || c.quest === 'meadow-side-lamp' });
const g = { inventory, economy: { trade, drop: createDrop() }, elements: { unlocked: new Set(['frost']) }, sfx: null };
const veil = el('div', 'codex-veil on', document.body), sheet = el('div', 'parchment', veil);
const { head, foot, listPage, tabs } = createCodex(sheet);
let econ;
function open(name, arg) {
  sheet.replaceChildren();
  if (name === 'journal') {
    head('Journal', 'What the Wraith has carried');
    tabs([['quests', 'Journeys'], ['lore', 'Lore'], ['echoes', 'Echoes'], ['beasts', 'Bestiary'], ['robes', 'Robes'], ['arms', 'Arms'], ['pouch', 'Pouch']], arg, (k) => open('journal', k));
    el('div', 'codex-rule', sheet);
    if (arg === 'arms') listPage([['Weapons', econ.armsTab()]], (pg, w) => econ.armsPage(pg, w), 'Only the staff.');
    else econ.pouchTab(el('div', 'codex-page wide', sheet));
    foot([['J', 'close'], ['M', 'map'], ['Esc', 'back']]);
  } else econ[name](arg);
}
econ = createEconomyPages({ g, el, head, foot, tabs, listPage, sheet, open });
window.__pages = {
  open,
  /** Set the stubbed game up as a fortnight into the meadow. */
  setup() {
    const i = inventory;
    i.addMarks(212); i.give('sickles'); i.give('maul'); i.equip('staff');
    i.addMaterial('rime-core', 5); i.addMaterial('hedge-heart', 3); i.addMaterial('turf-amber', 1);
    i.addItem('salve', 2); i.addItem('tea', 1); i.addItem('bread', 2); i.addThread(); i.consume('flask'); i.sel = 'salve';
    i.upgrade('staff'); i.upgrade('staff'); i.upgrade('maul');
    trade.buy('corin', 'salve');
  },
  upTierAndInfuse() { inventory.upgrade('staff'); g.elements.unlocked.add('gale'); inventory.infuse('staff', 'frost'); },
  dropMarks() { g.economy.drop.marks = 64; },
};
