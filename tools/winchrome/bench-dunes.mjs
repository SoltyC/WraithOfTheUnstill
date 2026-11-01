#!/usr/bin/env node
// `?bench=dunes` on the target GPU at 2560×1440 (src/core/bench.js): surf, Ridge spam, the fight, the front.
//   node tools/winchrome/bench-dunes.mjs [gfx=high]
import { connectWinChrome } from './connect.mjs';

const gfx = process.argv[2] || 'high';
const { browser, close } = await connectWinChrome();
const ctx = await browser.newContext({ viewport: { width: 2560, height: 1440 } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(String(e.stack || e.message).slice(0, 400)));
await page.goto(`http://localhost:4173/?bench=dunes&stone=1&title=0&res=${process.env.RES || "2560x1440"}&gfx=${gfx}&spot=p9b-clear&benchSeconds=12${process.argv[3] || ''}`);
await page.waitForFunction(() => window.__wraith && (window.__wraith.benchResult || window.__wraith.error), null, { timeout: 200000 }).catch(() => console.log('timed out'));
const r = await page.evaluate(() => { const b = window.__wraith.benchResult; return b ? { late: b.scene.latePipelines, phases: b.phases } : { err: window.__wraith.error }; });
console.log(gfx, JSON.stringify(r, (k, v) => (k === 'hitches' || k === 'timeline' || Array.isArray(v) && v.length > 8 ? undefined : typeof v === 'number' ? +v.toFixed(2) : v)).slice(0, 1800));
if (errors.length) console.log(errors.slice(0, 3).join('\n'));
await ctx.close(); await close();
