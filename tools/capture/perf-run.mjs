// Frame-time run for PERF.md.
//   node tools/capture/perf-run.mjs [--spot=p0-start-golden] [--seconds=20] [--channel=chrome --headed]
// Loads a spot (clock running, not capture mode), waits, then samples the in-game FrameStats.
// Only meaningful on the target machine with a real GPU (--channel=chrome --headed on Windows).

import { parseArgs, startServer, launchBrowser, openGame, machineInfo } from './harness.mjs';

const args = parseArgs();
const seconds = Number(args.seconds ?? 20);
const spot = args.spot || 'p0-start-golden';
const server = await startServer({ skipBuild: !!args['skip-build'] });
const browser = await launchBrowser(args);
try {
  const { page } = await openGame(browser, server.url, 'spot=' + spot, { width: Number(args.width ?? 2560), height: Number(args.height ?? 1440) });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { const f = window.__wraith.frameStats; f.count = 0; f.head = 0; });
  await page.waitForTimeout(seconds * 1000);
  const r = await page.evaluate(() => {
    const w = window.__wraith, f = w.frameStats; f.summarize();
    return { frames: f.count, avgMs: f.avgMs, medianMs: f.medianMs, p99Ms: f.p99Ms, maxMs: f.maxMs, fps: f.fps, low1Fps: f.low1Fps, hitches: f.hitches,
      draws: w.gpuStats.drawCallsLastFrame, latePipelines: w.gpuStats.late.length, gpuMB: (w.gpuStats.bufferBytes + w.gpuStats.textureBytes) / 1048576,
      res: w.game.engine.getRenderWidth() + 'x' + w.game.engine.getRenderHeight() };
  });
  console.log(JSON.stringify({ spot, seconds, machine: await machineInfo(page), ...r }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
