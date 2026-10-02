// Photo-spot capture (BRIEF §12.1, §17 gates).
//   node tools/capture/capture.mjs [--spots=a,b] [--out=screenshots/phase-01] [--repeat=2]
//                                  [--width=2560 --height=1440] [--channel=chrome] [--headed] [--skip-build]
// Each spot loads in a fresh context with ?spot=<id>&capture=1 (frozen clock, no overlay).
// With --repeat=2 (default) every spot is captured twice and compared; the run fails if any
// pair differs, which is the "captures are reproducible" gate check.

import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, parseArgs, startServer, launchBrowser, openGame, machineInfo } from './harness.mjs';

const args = parseArgs();
const spotsFile = JSON.parse(await fs.readFile(path.join(ROOT, 'data/photo-spots.json'), 'utf8'));
const ids = args.spots ? String(args.spots).split(',') : spotsFile.spots.map((s) => s.id);
const out = path.resolve(ROOT, args.out || 'screenshots/phase-01');
const repeat = Number(args.repeat ?? 2);
const width = Number(args.width ?? 2560), height = Number(args.height ?? 1440);
await fs.mkdir(out, { recursive: true });

const server = await startServer({ skipBuild: !!args['skip-build'] });
const browser = await launchBrowser(args);
const report = { date: new Date().toISOString(), width, height, repeat, spots: [], machine: null, reproducible: true };
const gpuErrors = [];

/** Compare two PNGs pixel by pixel inside the browser (no image deps in Node). */
async function diffPngs(page, a, b) {
  return page.evaluate(async ([a64, b64]) => {
    const load = async (s) => { const img = new Image(); img.src = 'data:image/png;base64,' + s; await img.decode(); return img; };
    const [ia, ib] = await Promise.all([load(a64), load(b64)]);
    const c = new OffscreenCanvas(ia.width, ia.height);
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, ia.width, ia.height).data;
    x.clearRect(0, 0, ia.width, ia.height); x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, ib.width, ib.height).data;
    let diff = 0, max = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      if (d > 0) diff++;
      if (d > max) max = d;
    }
    return { diffPixels: diff, maxDelta: max, total: da.length / 4 };
  }, [a.toString('base64'), b.toString('base64')]);
}

/** Highlight check (BRIEF §5.8: blown-out white is the primary failure mode). */
async function exposureStats(page, png) {
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = new OffscreenCanvas(img.width, img.height); const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, img.width, img.height).data;
    let clipped = 0, sum = 0, max = 0; const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const m = Math.max(d[i], d[i + 1], d[i + 2]);
      if (m >= 253) clipped++;
      if (m > max) max = m;
      sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    }
    return { clippedPct: +(100 * clipped / n).toFixed(3), meanLuma: +(sum / n).toFixed(1), maxChannel: max };
  }, png.toString('base64'));
}

const statPage = await browser.newPage();
try {
  for (const id of ids) {
    const shots = [];
    let timing = 0;
    for (let r = 0; r < Math.max(1, repeat); r++) {
      const t0 = Date.now();
      const { page, context, logs } = await openGame(browser, server.url, 'spot=' + encodeURIComponent(id) + '&capture=1', { width, height });
      if (!report.machine) report.machine = await machineInfo(page);
      const late = await page.evaluate(() => window.__wraith.gpuStats.late.length);
      const buf = await page.screenshot({ type: 'png', timeout: 0 }); // software GPU frames can take > 30 s at 1440p
      shots.push(buf);
      timing = Date.now() - t0;
      const errors = logs.filter((l) => l.startsWith('error') || l.startsWith('pageerror'));
      if (errors.length) console.warn(`[${id}] console errors:\n  ` + errors.slice(0, 3).join('\n  '));
      // GPU validation errors mean the frame is wrong even if it looks plausible: fail the run.
      if (logs.some((l) => l.includes('[gpu] uncaptured error') || l.includes('[gpu] device lost'))) { gpuErrors.push(id); report.reproducible = false; }
      if (late) console.warn(`[${id}] ${late} late pipeline(s) during capture`);
      await context.close();
    }
    const file = path.join(out, id + '.png');
    await fs.writeFile(file, shots[0]);
    const entry = { id, file: path.relative(ROOT, file), ms: timing, identical: true };
    if (shots.length > 1) {
      entry.identical = shots.every((s) => s.equals(shots[0]));
      if (!entry.identical) {
        const page = await browser.newPage();
        entry.diff = await diffPngs(page, shots[0], shots[1]);
        await page.close();
        report.reproducible = false;
      }
    }
    entry.exposure = await exposureStats(statPage, shots[0]);
    report.spots.push(entry);
    console.log(`${id}: ${entry.file}  ${entry.identical ? 'reproducible (byte-identical)' : 'DIFFERS ' + JSON.stringify(entry.diff)}  ${(timing / 1000).toFixed(1)}s  clipped ${entry.exposure.clippedPct}%  mean luma ${entry.exposure.meanLuma}`);
  }
} finally {
  await browser.close();
  await server.close();
}
await fs.writeFile(path.join(out, 'capture-report.json'), JSON.stringify(report, null, 2));
report.gpuErrors = gpuErrors;
if (gpuErrors.length) console.log('GPU VALIDATION ERRORS in: ' + gpuErrors.join(', '));
console.log(report.reproducible ? 'ALL CAPTURES REPRODUCIBLE' : 'CAPTURES NOT REPRODUCIBLE (or GPU errors)');
process.exit(report.reproducible ? 0 : 1);
