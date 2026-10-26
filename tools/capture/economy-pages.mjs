// Screenshots of the economy's codex pages (trade, forge, pouch, arms): the real page code and styles
// over a stubbed game (economy-pages.html), through a vite dev server and the Playwright chromium.
//   node tools/capture/economy-pages.mjs        ->  screenshots/economy/*.png
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { ROOT, launchBrowser } from './harness.mjs';

const out = path.join(ROOT, 'screenshots/economy');
await fs.mkdir(out, { recursive: true });
// (node_modules may be a symlink into another checkout: its fonts must be allowed to be served)
const modules = await fs.realpath(path.join(ROOT, 'node_modules'));
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 4177, strictPort: false, host: '127.0.0.1', fs: { allow: [ROOT, modules] } } });
await server.listen();
const url = server.resolvedUrls.local[0] + 'tools/capture/economy-pages.html';
const browser = await launchBrowser({});
try {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__pages, null, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  const shot = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(out, name + '.png') }); console.log('shot', name); };
  const open = (n, a) => page.evaluate(([n, a]) => window.__pages.open(n, a), [n, a]);
  const click = (sel, text) => page.evaluate(([s, t]) => { const b = [...document.querySelectorAll(s)].find((x) => !t || x.textContent.includes(t)); b?.click(); return !!b; }, [sel, text]);
  await page.evaluate(() => window.__pages.setup());
  await open('trade', { id: 'corin', tab: 'buy' }); await shot('trade-corin-buy');
  await click('.codex-list button', 'Ember tea'); await shot('trade-corin-tea');
  await open('trade', { id: 'corin', tab: 'sell' }); await shot('trade-corin-sell');
  await open('trade', { id: 'osk', tab: 'buy' }); await shot('trade-osk');
  await open('forge', { id: 'garrow' }); await shot('forge-staff');
  await click('.codex-list button', 'Shaper maul'); await shot('forge-maul');
  await page.evaluate(() => window.__pages.upTierAndInfuse());
  await open('forge', { id: 'garrow', pick: 'staff' }); await shot('forge-staff-infusion');
  await page.evaluate(() => window.__pages.dropMarks());
  await open('journal', 'pouch'); await shot('journal-pouch');
  await open('journal', 'arms'); await shot('journal-arms');
} finally { await browser.close(); await server.close(); }
