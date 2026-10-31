// The GPU process during a load (Chrome tracing over CDP): where Dawn spends its time (pipeline creation, shader compiles).
//   node tools/winchrome/load-trace.mjs
import { connectWinChrome } from './connect.mjs';
const { browser, close } = await connectWinChrome();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const URL0 = 'http://localhost:4173/?spot=p8-meadow-golden&title=0&gfx=high';
// `replay`: load once first, so the traced load replays that load's pipelines.
if (process.argv[2] === 'replay') {
  const p0 = await ctx.newPage(); await p0.goto(URL0);
  await p0.waitForFunction(() => window.__wraith && (window.__wraith.ready || window.__wraith.error), null, { timeout: 180000 });
  await new Promise((r) => setTimeout(r, 2500)); await p0.close();
}
const page = await ctx.newPage();
const cdp = await browser.newBrowserCDPSession();
const events = [];
cdp.on('Tracing.dataCollected', (e) => { for (const ev of e.value) events.push(ev); });
await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['gpu', 'gpu.dawn', 'dawn', 'disabled-by-default-gpu.dawn', 'disabled-by-default-dawn', 'webgpu', 'disabled-by-default-webgpu', 'disabled-by-default-gpu.dawn.validation', 'disabled-by-default-gpu.service'] }, transferMode: 'ReportEvents' });
await page.goto(URL0);
await page.waitForFunction(() => window.__wraith && (window.__wraith.ready || window.__wraith.error), null, { timeout: 180000 });
const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
await cdp.send('Tracing.end'); await done;
// Sum complete-event durations by name (X events; and B/E pairs) across the trace.
const sum = new Map(), open = new Map(), tids = new Map();
for (const ev of events) {
  if (ev.ph === 'X' && ev.dur && /Pipeline/.test(ev.name)) { const k = ev.name + ' on ' + ev.pid + '/' + ev.tid; const t = tids.get(k) || [0, 0, Infinity, 0]; t[0] += ev.dur; t[1]++; t[2] = Math.min(t[2], ev.ts); t[3] = Math.max(t[3], ev.ts + ev.dur); tids.set(k, t); }
  if (ev.ph === 'X' && ev.dur) sum.set(ev.name, (sum.get(ev.name) || 0) + ev.dur);
  else if (ev.ph === 'B') open.set(ev.tid + ev.name, ev.ts);
  else if (ev.ph === 'E' && open.has(ev.tid + ev.name)) { sum.set(ev.name, (sum.get(ev.name) || 0) + ev.ts - open.get(ev.tid + ev.name)); open.delete(ev.tid + ev.name); }
}
console.log('events', events.length); const want = [...sum].filter(([k]) => /ompile|ipeline|hader|Tint|DXC|FXC|Upload|Write|Queue|D3D|Dawn|Device/i.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 25); console.log(want.map(([k, v]) => ((v / 1000) | 0) + ' ms  ' + k).join('\n')); process.exit(0);
console.log([...sum].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => ((v / 1000) | 0) + ' ms  ' + k).join('\n'));
const t0 = Math.min(...[...tids.values()].map((t) => t[2]));
console.log('pipeline events by thread (ms, count, first s, last s):\n' + [...tids].sort((a, b) => b[1][0] - a[1][0]).slice(0, 24).map(([k, t]) => ((t[0] / 1000) | 0) + ' ms  x' + t[1] + '  ' + ((t[2] - t0) / 1e6).toFixed(1) + '–' + ((t[3] - t0) / 1e6).toFixed(1) + ' s  ' + k).join('\n'));
console.log(JSON.stringify(await page.evaluate(() => [window.__wraith.loadTimes, window.__wraith.pipelinesReplayed])));
await ctx.close(); await close();
