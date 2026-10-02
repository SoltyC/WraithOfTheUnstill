// Idle-loop allocation profile (Phase 0 gate: zero allocations per frame).
//   node tools/capture/heap-profile.mjs [--seconds=10] [--overlay] [--channel=chrome] [--skip-build]
//
// Boots the game normally (clock running, overlay hidden unless --overlay), lets it settle,
// then runs V8's sampling heap profiler with a tiny sampling interval and with objects
// collected by minor/major GC included, so short-lived garbage is counted too. Every sampled
// allocation is attributed to its full stack; allocations whose stack passes through the frame
// loop (Loop._frame) are "per-frame" allocations.

import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, parseArgs, startServer, launchBrowser, openGame, machineInfo } from './harness.mjs';
import { SourceMapConsumer } from 'source-map-js';

/** Resolve bundled frames back to source files/lines through the build's sourcemaps. */
const consumers = new Map();
async function resolveFrame(url, line, col) {
  const m = /\/assets\/([^/?#]+\.js)/.exec(url);
  if (!m) return null;
  if (!consumers.has(m[1])) {
    try { consumers.set(m[1], new SourceMapConsumer(JSON.parse(await fs.readFile(path.join(ROOT, 'dist/assets', m[1] + '.map'), 'utf8')))); }
    catch { consumers.set(m[1], null); }
  }
  const c = consumers.get(m[1]);
  if (!c) return null;
  const p = c.originalPositionFor({ line: line + 1, column: col });
  return p.source ? p.source.replace(/^.*node_modules\//, '').replace(/^(\.\.\/)+/, '') + ':' + p.line : null;
}

const args = parseArgs();
const seconds = Number(args.seconds ?? 10);
const query = ['grid=' + (args.grid ?? 96), args.overlay ? 'overlay=1' : ''].filter(Boolean).join('&');
const width = Number(args.width ?? 640), height = Number(args.height ?? 360);

const server = await startServer({ skipBuild: !!args['skip-build'] });
const browser = await launchBrowser(args);
let result;
try {
  const { page, logs } = await openGame(browser, server.url, query, { width, height });
  // Let the loading fade finish and V8 tier hot code up to optimized code: wait a frame count,
  // not wall time, so slow software-GPU runs warm up as much as fast ones.
  const settleFrames = Number(args['settle-frames'] ?? 3000);
  await page.waitForTimeout(2000);
  await page.waitForFunction((n) => window.__wraith.clock.frame >= n, settleFrames, { timeout: 900000, polling: 500 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  const f0 = await page.evaluate(() => window.__wraith.clock.frame);
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 16, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  await page.waitForTimeout(seconds * 1000);
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  const f1 = await page.evaluate(() => window.__wraith.clock.frame);
  const frames = f1 - f0;

  // Index nodes, then attribute each sample to its stack.
  const parent = new Map();
  const byId = new Map();
  (function walk(n, p) { byId.set(n.id, n); if (p) parent.set(n.id, p); for (const c of n.children) walk(c, n); })(profile.head, null);
  const resolved = new Map();
  for (const n of byId.values()) {
    const cf = n.callFrame;
    resolved.set(n.id, (await resolveFrame(cf.url, cf.lineNumber, cf.columnNumber)) || (cf.url.replace(/^.*\/(assets|src|node_modules)\//, '$1/') + ':' + (cf.lineNumber + 1)));
  }
  const site = (n) => `${n.callFrame.functionName || '(anonymous)'} ${resolved.get(n.id)}`;
  let total = 0, inLoop = 0, game = 0, engine = 0;
  const owner = new Map(); // site -> 'game' | 'engine' | 'other'
  const sites = new Map();
  const loopSites = new Map();
  for (const s of profile.samples) {
    const n = byId.get(s.nodeId);
    total += s.size;
    let p = n, loop = false, stack = [];
    while (p) { if (p.callFrame.functionName === '_frame') loop = true; if (stack.length < 6 && p.callFrame.functionName) stack.push(site(p)); p = parent.get(p.id); }
    const k = site(n);
    sites.set(k, (sites.get(k) || 0) + s.size);
    if (loop) {
      inLoop += s.size;
      const sk = stack.join(' <- ');
      loopSites.set(sk, (loopSites.get(sk) || 0) + s.size);
      // Owner = first frame with a resolved source (natives like next/slice belong to their caller).
      let q = n;
      while (q && !/^(src\/|@babylonjs)/.test(resolved.get(q.id) || '')) q = parent.get(q.id);
      const src = q ? resolved.get(q.id) : '';
      if (src.startsWith('src/')) game += s.size; else engine += s.size;
    }
  }
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => ({ site: k, bytes: v, bytesPerFrame: +(v / frames).toFixed(1) }));
  result = {
    date: new Date().toISOString(), seconds, frames, overlayOpen: !!args.overlay,
    machine: await machineInfo(page),
    samplingIntervalBytes: 16,
    totalBytes: total, bytesPerFrame: +(total / frames).toFixed(1),
    frameLoopBytes: inLoop, frameLoopBytesPerFrame: +(inLoop / frames).toFixed(1),
    gameBytesPerFrame: +(game / frames).toFixed(1), engineBytesPerFrame: +(engine / frames).toFixed(1),
    topSites: top(sites), topFrameLoopStacks: top(loopSites),
    errors: logs.filter((l) => l.startsWith('error') || l.startsWith('pageerror')),
  };
} finally {
  await browser.close();
  await server.close();
}
const outFile = path.join(ROOT, 'screenshots/phase-00', args.overlay ? 'heap-profile-overlay.json' : 'heap-profile.json');
await fs.mkdir(path.dirname(outFile), { recursive: true });
await fs.writeFile(outFile, JSON.stringify(result, null, 2));
console.log(`frames ${result.frames}  total ${result.bytesPerFrame} B/frame  frame-loop ${result.frameLoopBytesPerFrame} B/frame  (game src/: ${result.gameBytesPerFrame}, engine: ${result.engineBytesPerFrame})`);
for (const s of result.topFrameLoopStacks) console.log(`  ${s.bytesPerFrame} B/frame  ${s.site}`);
console.log('top sites overall:');
for (const s of result.topSites.slice(0, 8)) console.log(`  ${s.bytesPerFrame} B/frame  ${s.site}`);
console.log('wrote', path.relative(ROOT, outFile));
