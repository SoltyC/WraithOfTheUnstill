// Title camera check: boots with the title up, screenshots the orbit, then dives (sped up) while
// logging the camera's clearance over the terrain at every frame, and screenshots the end.
//   WRAITH_CHROME=… node tools/capture/title-check.mjs [--skip-build]
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, parseArgs, startServer, launchBrowser, openGame } from './harness.mjs';

const args = parseArgs();
const out = path.join(ROOT, 'screenshots/title');
await fs.mkdir(out, { recursive: true });
const server = await startServer({ skipBuild: !!args['skip-build'] });
const browser = await launchBrowser(args);
try {
  const { page } = await openGame(browser, server.url, '', { width: 480, height: 270 });
  await page.waitForFunction(() => window.__wraith?.ready, null, { timeout: 600000 });
  await page.waitForFunction(() => window.__wraith.clock.frame > 8, null, { timeout: 600000 });
  console.log('notices before start:', await page.evaluate(() => document.querySelectorAll('.notice').length));
  await page.screenshot({ path: path.join(out, 'orbit.png') });
  await page.evaluate(() => { window.__wraith.titleCam.timeScale = 12; });
  await page.evaluate(() => {
    const w = window.__wraith, g = w.game, log = (window.__clear = []);
    const hook = () => {
      const c = g.camera.position; g.ground.qx = c.x; g.ground.qz = c.z;
      if (g.ground.covers()) { g.ground.sample(); log.push([+c.x.toFixed(1), +c.y.toFixed(1), +c.z.toFixed(1), +(c.y - g.ground.h).toFixed(1)]); }
      if (!window.__done) requestAnimationFrame(hook);
    };
    requestAnimationFrame(hook);
  });
  const btn = await page.$('.title-screen button:has-text("Begin")');
  await btn.click();
  await page.waitForFunction(() => !window.__wraith.titleCam?.active, null, { timeout: 900000 });
  await page.evaluate(() => { window.__done = true; });
  const log = await page.evaluate(() => window.__clear);
  const min = log.reduce((m, r) => Math.min(m, r[3]), Infinity);
  console.log('samples', log.length, 'min clearance m', min);
  console.log(log.filter((_, i) => i % Math.max(1, Math.floor(log.length / 12)) === 0).map((r) => r.join(',')).join('\n'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, 'arrived.png') });
  console.log('started:', await page.evaluate(() => window.__wraith.game.camera && true));
} finally { await browser.close(); server.close?.(); }
