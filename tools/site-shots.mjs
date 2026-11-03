// Screenshots of the promotional site (site/) at points along its scroll: `node tools/site-shots.mjs [url] [w,h]`.
// Scrolls like a visitor (the stage is driven by the scroll), waits for the eased scroll and the frames, and shoots.
import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.argv[2] || 'http://localhost:4174/';
const [w, h] = (process.argv[3] || '1440,900').split(',').map(Number);
const tag = process.argv[4] || 'scroll';
const libs = `${process.env.HOME}/.local/wraith-libs/root/usr/lib/x86_64-linux-gnu`;
if (fs.existsSync(libs)) process.env.LD_LIBRARY_PATH = `${libs}:${process.env.LD_LIBRARY_PATH || ''}`;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 });
await page.goto(url, { waitUntil: 'networkidle' });
const stops = await page.evaluate(() => [...document.querySelectorAll('.ch')].map((el) => ({ id: el.id, top: el.offsetTop, h: el.offsetHeight })));
const vh = h, out = 'screenshots/site';
fs.mkdirSync(out, { recursive: true });
const shots = [];
const at = async (name, y) => { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(1600); const f = `${out}/${tag}-${name}.png`; await page.screenshot({ path: f }); shots.push(f); };
await page.waitForTimeout(2600);
await at('0-title', 0);
for (const s of stops) {
  const span = Math.max(1, s.h - vh);
  await at(`${s.id}-a`, s.top + span * 0.35);
  if (s.id === 'frost' || s.id === 'walker') await at(`${s.id}-slit`, s.top + span * 0.86);
}
await at('z-outro', await page.evaluate(() => document.body.scrollHeight) - vh);
// The touch check: on a phone, a swipe scrolls the page (nothing captures it).
if (w < 700) {
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
  await page.mouse.move(w / 2, h * 0.7); await page.mouse.wheel(0, 900); await page.waitForTimeout(600);
  console.log('scrollY after a swipe-sized scroll:', await page.evaluate(() => scrollY));
}
console.log(shots.join('\n'));
await browser.close();
