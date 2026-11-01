#!/usr/bin/env node
// Every gate shot of a prefix at 2560×1440 on the target GPU (src/core/shots.js: one fresh page per spot).
//   node tools/winchrome/gate-shots.mjs [prefix=p9g-] [dir=phase-09-gate]
import fs from 'node:fs';
import { connectWinChrome } from './connect.mjs';

const prefix = process.argv[2] || 'p9g-', dir = process.argv[3] || 'phase-09-gate';
const n = JSON.parse(fs.readFileSync('data/photo-spots.json')).spots.filter((s) => s.id.startsWith(prefix)).length;
const log = `screenshots/${dir}/shots-log.txt`;
fs.rmSync(log, { force: true });
const { browser, close } = await connectWinChrome();
const ctx = await browser.newContext({ viewport: { width: 2560, height: 1440 } });
const page = await ctx.newPage();
await page.goto(`http://localhost:4173/?shots=${prefix}&capture=1&res=2560x1440&dir=${dir}&title=0`);
const t0 = Date.now();
for (;;) {
  await new Promise((r) => setTimeout(r, 5000));
  const text = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
  const pngs = fs.existsSync(`screenshots/${dir}`) ? fs.readdirSync(`screenshots/${dir}`).filter((f) => f.startsWith(prefix) && f.endsWith('.png')).length : 0;
  if (/Shots done/.test(text) || Date.now() - t0 > (n + 1) * 150000) { console.log(pngs, 'of', n, '\n' + text.split('\n').slice(-6).join('\n')); break; }
}
await ctx.close(); await close();
