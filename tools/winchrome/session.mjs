// Helpers for scripted play checks in the Windows Chrome (real GPU): open the game, wait for the
// world to settle, step frames, teleport, take screenshots.
import { connectWinChrome } from './connect.mjs';

export async function openSession({ url = 'http://localhost:4173/', query = 'title=0', width = 1280, height = 720 } = {}) {
  const { browser, close } = await connectWinChrome();
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.goto(url + '?' + query);
  await page.waitForFunction(() => window.__wraith && (window.__wraith.ready || window.__wraith.error), null, { timeout: 180000 });
  const err = await page.evaluate(() => window.__wraith.error);
  if (err) throw new Error(err);
  const s = {
    page, logs,
    frames: (n) => page.evaluate((n) => new Promise((r) => { let k = n; const f = () => (--k <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n),
    async settle() { await page.waitForFunction(() => window.__wraith.game.worldSettled(), null, { timeout: 120000 }); },
    async teleport(x, z) { await page.evaluate(([x, z]) => window.__wraith.game.teleport(x, z), [x, z]); await s.frames(5); await s.settle(); await s.frames(10); },
    eval: (fn, arg) => page.evaluate(fn, arg),
    shot: (path) => page.screenshot({ path }),
    async close() { await ctx.close(); await close(); },
  };
  return s;
}
