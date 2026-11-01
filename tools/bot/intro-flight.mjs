#!/usr/bin/env node
// The new-game flight in real Chrome: the camera's height over the whole dive, and how hard it ever changes.
//   node tools/bot/intro-flight.mjs
import { connectWinChrome } from '../winchrome/connect.mjs';

const { browser, close } = await connectWinChrome();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__wraith && (window.__wraith.ready || window.__wraith.error), null, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));
const r = await page.evaluate(async () => {
  const g = window.__wraith.g, c = g.camera, L = []; const tc = g.titleCam;
  if (!tc || !tc.active) return { error: 'title camera not running' };
  const p = tc.dive(); let on = true; p.then(() => { on = false; });
  const t0 = performance.now();
  while (on && performance.now() - t0 < 30000) { await new Promise((q) => requestAnimationFrame(q)); L.push([performance.now() - t0, c.position.x, c.position.y, c.position.z]); }
  const v = []; for (let i = 1; i < L.length; i++) { const dt = (L[i][0] - L[i - 1][0]) / 1000 || 1 / 60; v.push([(L[i][2] - L[i - 1][2]) / dt, Math.hypot(L[i][1] - L[i - 1][1], L[i][3] - L[i - 1][3]) / dt, dt]); }
  let acc = 0, firstJump = 0;
  const smooth = v.filter((q) => q[2] > 0.008); let rises = 0;
  for (let i = 1; i < smooth.length; i++) { acc = Math.max(acc, Math.abs(smooth[i][0] - smooth[i - 1][0])); if (smooth[i][0] > 1.5 && smooth[i - 1][0] <= 1.5) rises++; }
  for (let i = 0; i < 6 && i < v.length; i++) firstJump = Math.max(firstJump, Math.abs(v[i][0]));
  const ys = []; for (let i = 0; i < L.length; i += Math.ceil(L.length / 12)) ys.push(Math.round(L[i][2]));
  return { frames: L.length, secs: +(L.at(-1)[0] / 1000).toFixed(1), maxFrameChange: +acc.toFixed(2), rises, firstFramesV: +firstJump.toFixed(1), heights: ys };
});
console.log(JSON.stringify(r), errs.slice(0, 3).join(' | '));
await ctx.close(); await close();
