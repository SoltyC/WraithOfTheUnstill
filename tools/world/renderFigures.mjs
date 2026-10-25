// Renders every SVG in docs/phase-9/figures/ to a PNG beside it (headless Chromium from the
// playwright package), so the figures show anywhere the markdown is read.
// `node tools/world/renderFigures.mjs [name ...]` (no names: all of them).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../docs/phase-9/figures/');
const only = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg') && (!only.length || only.includes(f.replace(/\.svg$/, ''))));
const browser = await chromium.launch();
const page = await browser.newPage();
for (const f of files) {
  const svg = fs.readFileSync(dir + f, 'utf8');
  const w = +svg.match(/width="(\d+)"/)[1], h = +svg.match(/height="(\d+)"/)[1];
  await page.setViewportSize({ width: w, height: h });
  await page.goto(pathToFileURL(dir + f).href);
  await page.waitForTimeout(150);
  await page.screenshot({ path: dir + f.replace(/\.svg$/, '.png') });
  console.log('rendered', f, w + 'x' + h);
}
await browser.close();
