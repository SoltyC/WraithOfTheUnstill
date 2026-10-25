// Screenshots of the economy's codex pages (trade, forge, pouch, arms) from a running preview
// (DOM pages: the bot's canvas `shot` does not paint them). Software WebGPU: images only.
//   npx vite preview --port 4176 --host 0.0.0.0 &     node tools/capture/economy-pages.mjs [url]
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, launchBrowser, openGame } from './harness.mjs';

const url = process.argv[2] || 'http://localhost:4176/';
const out = path.join(ROOT, 'screenshots/economy');
await fs.mkdir(out, { recursive: true });
const browser = await launchBrowser({});
try {
  const { page } = await openGame(browser, url, 'title=0', { width: 1600, height: 900 });
  await page.waitForFunction(() => window.__wraith.clock.frame > 8, null, { timeout: 600000 });
  const shot = async (name) => { await page.waitForTimeout(900); await page.screenshot({ path: path.join(out, name + '.png') }); console.log('shot', name); };
  await page.evaluate(() => {
    const g = window.__wraith.g, inv = g.inventory, gr = g.chapter.graph;
    inv.addMarks(212); inv.give('sickles'); inv.give('maul'); inv.equip('staff');
    inv.addMaterial('rime-core', 5); inv.addMaterial('hedge-heart', 3); inv.addMaterial('turf-amber', 1);
    inv.addItem('salve', 2); inv.addItem('tea', 1); inv.addItem('bread', 2); inv.addThread(); inv.consume('flask'); inv.sel = 'salve';
    inv.upgrade('staff'); inv.upgrade('staff'); inv.upgrade('maul');
    for (const id of ['meadow-side-lamp']) gr.quests[id].state = 'done';
    gr.flags.add('meadow:stair-open');
    g.economy.trade.buy('corin', 'salve');
  });
  const open = (name, arg) => page.evaluate(([n, a]) => { window.__wraith.g.menus.open(n, a); }, [name, arg]);
  const click = (sel, text) => page.evaluate(([s, t]) => { const b = [...document.querySelectorAll(s)].find((x) => !t || x.textContent.includes(t)); b?.click(); return !!b; }, [sel, text]);
  await open('trade', { id: 'corin', tab: 'buy' }); await shot('trade-corin-buy');
  await click('.codex-list button', 'Ember tea'); await shot('trade-corin-tea');
  await open('trade', { id: 'corin', tab: 'sell' }); await shot('trade-corin-sell');
  await open('trade', { id: 'osk', tab: 'buy' }); await shot('trade-osk');
  await open('forge', { id: 'garrow' }); await shot('forge-staff');
  await click('.codex-list button', 'Shaper maul'); await shot('forge-maul');
  await page.evaluate(() => { const inv = window.__wraith.g.inventory; inv.upgrade('staff'); inv.infuse('staff', 'frost'); });
  await open('forge', { id: 'garrow', pick: 'staff' }); await shot('forge-staff-infusion');
  await open('journal', 'pouch'); await shot('journal-pouch');
  await open('journal', 'arms'); await shot('journal-arms');
  await open('journal', 'robes'); await shot('journal-robes');
} finally { await browser.close(); }
