#!/usr/bin/env node
// Load phases with pipeline replay: two loads in one Chrome profile (the first records, the second
// replays). src/core/pipelineCache.js; `?pipelines=0` is the load without it.
//   node tools/winchrome/load-replay.mjs [query=spot=p8-meadow-golden&title=0&gfx=high]
import { connectWinChrome } from './connect.mjs';

const query = process.argv[2] || 'spot=p8-meadow-golden&title=0&gfx=high';
const { browser, close } = await connectWinChrome();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
try {
  for (let i = 0; i < 3; i++) {
    const page = await ctx.newPage();
    const errors = []; page.on('console', (m) => { if (m.type() === 'error' || /pipelines/.test(m.text())) errors.push(m.text().slice(0, 300)); });
    await page.goto('http://localhost:4173/?' + query);
    await page.waitForFunction(() => window.__wraith && (window.__wraith.ready || window.__wraith.error), null, { timeout: 240000 });
    await new Promise((r) => setTimeout(r, 2500)); // the store is written after settling
    const r = await page.evaluate(() => { const w = window.__wraith; return { times: w.loadTimes, replayed: w.pipelinesReplayed, fresh: w.pipelinesNew, late: w.gpuStats?.late?.length, err: w.error }; });
    console.log('load', i + 1, JSON.stringify(r), errors.slice(0, 4).join(' | '));
    await page.close();
  }
} finally { await ctx.close(); await close(); }
