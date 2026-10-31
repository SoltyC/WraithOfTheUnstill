// The GPU process during a load (Chrome tracing over CDP): where Dawn spends its time (pipeline creation, shader compiles).
//   node tools/winchrome/load-trace.mjs
import { connectWinChrome } from './connect.mjs';
const { browser, close } = await connectWinChrome();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const cdp = await browser.newBrowserCDPSession();
const events = [];
cdp.on('Tracing.dataCollected', (e) => { for (const ev of e.value) events.push(ev); });
await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['gpu', 'gpu.dawn', 'dawn', 'disabled-by-default-gpu.dawn', 'disabled-by-default-dawn', 'webgpu', 'disabled-by-default-webgpu', 'disabled-by-default-gpu.dawn.validation', 'disabled-by-default-gpu.service'] }, transferMode: 'ReportEvents' });
await page.goto('http://localhost:4173/?spot=p8-meadow-golden&title=0&gfx=high');
await page.waitForFunction(() => window.__wraith && (window.__wraith.ready || window.__wraith.error), null, { timeout: 180000 });
const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
await cdp.send('Tracing.end'); await done;
// Sum complete-event durations by name (X events; and B/E pairs) across the trace.
const sum = new Map(), open = new Map();
for (const ev of events) {
  if (ev.ph === 'X' && ev.dur) sum.set(ev.name, (sum.get(ev.name) || 0) + ev.dur);
  else if (ev.ph === 'B') open.set(ev.tid + ev.name, ev.ts);
  else if (ev.ph === 'E' && open.has(ev.tid + ev.name)) { sum.set(ev.name, (sum.get(ev.name) || 0) + ev.ts - open.get(ev.tid + ev.name)); open.delete(ev.tid + ev.name); }
}
console.log('events', events.length); const want = [...sum].filter(([k]) => /ompile|ipeline|hader|Tint|DXC|FXC|Upload|Write|Queue|D3D|Dawn|Device/i.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 25); console.log(want.map(([k, v]) => ((v / 1000) | 0) + ' ms  ' + k).join('\n')); process.exit(0);
console.log([...sum].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => ((v / 1000) | 0) + ' ms  ' + k).join('\n'));
await ctx.close(); await close();
