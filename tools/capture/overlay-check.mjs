// Dev overlay check (Phase 0 gate: "the overlay works").
//   node tools/capture/overlay-check.mjs [--skip-build]
// 1. Boots with the overlay hidden, presses F1 → overlay must open; ` → close; F1 → open.
// 2. Waits for stats to populate and screenshots the overlay (clean late-pipeline log).
// 3. Creates a compute pipeline after loading → the detector must log it and raise the red flag.
// 4. Flips a system toggle and a slider through the UI and verifies the state changed.

import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, parseArgs, startServer, launchBrowser, openGame } from './harness.mjs';

const args = parseArgs();
const out = path.join(ROOT, 'screenshots/phase-00');
await fs.mkdir(out, { recursive: true });
const server = await startServer({ skipBuild: !!args['skip-build'] });
const browser = await launchBrowser(args);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${detail}`); };
try {
  const { page } = await openGame(browser, server.url, 'spot=p0-start-golden', { width: 2560, height: 1440 });
  await page.waitForTimeout(2500); // loading fade
  const isOpen = () => page.evaluate(() => document.getElementById('dev-overlay').classList.contains('open'));
  // Wait on state, not wall time: software-GPU frames can take a second at 1440p.
  const waitOpen = async (want) => {
    try { await page.waitForFunction((w) => document.getElementById('dev-overlay').classList.contains('open') === w, want, { timeout: 30000 }); return true; } catch { return false; }
  };
  check('overlay hidden by default', !(await isOpen()));
  await page.keyboard.press('F1');
  check('F1 opens overlay', await waitOpen(true));
  await page.keyboard.press('Backquote');
  check('` closes overlay', await waitOpen(false));
  await page.keyboard.press('F1');
  await waitOpen(true);
  await page.waitForFunction(() => window.__wraith.frameStats.count > 30, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const stats = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#dev-overlay .stat-grid .k')].map((k) => [k.textContent, k.nextSibling.textContent])));
  check('stats populated', stats.fps !== '–' && Number(stats.draws) > 0 && stats.tris !== '–', JSON.stringify(stats));
  const lateText = await page.evaluate(() => document.querySelector('#dev-overlay .ok, #dev-overlay .late')?.textContent);
  check('late-pipeline log clean after loading', /clean/.test(lateText), lateText);
  await page.screenshot({ path: path.join(out, 'overlay-open.png') });

  // Late pipeline: must be caught and flagged.
  await page.evaluate(() => {
    const d = window.__wraith.gpuStats.device;
    d.createComputePipeline({ label: 'deliberate-late-test', layout: 'auto', compute: { module: d.createShaderModule({ code: '@compute @workgroup_size(1) fn main() {}' }), entryPoint: 'main' } });
  });
  await page.waitForTimeout(600);
  const flag = await page.evaluate(() => ({ shown: document.getElementById('late-flag').classList.contains('on'), text: document.getElementById('late-flag').textContent, n: window.__wraith.gpuStats.late.length }));
  check('late pipeline detected and flagged red', flag.shown && flag.n === 1, JSON.stringify(flag));
  await page.screenshot({ path: path.join(out, 'overlay-late-pipeline.png') });

  // UI controls drive state.
  await page.evaluate(() => { const l = [...document.querySelectorAll('#dev-overlay label.toggle')].find((x) => x.textContent.trim() === 'terrain'); l.querySelector('input').click(); });
  const terrainOff = await page.evaluate(() => !window.__wraith.game.scene.getMeshByName('testTerrain').isEnabled());
  check('system toggle disables terrain', terrainOff);
  await page.evaluate(() => { const l = [...document.querySelectorAll('#dev-overlay label.toggle')].find((x) => x.textContent.trim() === 'terrain'); l.querySelector('input').click(); });
  await page.evaluate(() => { const r = [...document.querySelectorAll('#dev-overlay .row')].find((x) => x.textContent.includes('Time of day')).querySelector('input'); r.value = '21'; r.dispatchEvent(new Event('input')); });
  const tod = await page.evaluate(() => window.__wraith.params.v.timeOfDay);
  check('time-of-day slider drives the world', tod === 21, String(tod));
} finally {
  await browser.close();
  await server.close();
}
await fs.writeFile(path.join(out, 'overlay-check.json'), JSON.stringify(results, null, 2));
process.exit(results.every((r) => r.ok) ? 0 : 1);
