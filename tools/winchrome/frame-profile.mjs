#!/usr/bin/env node
// The renderer main thread during play (CPU profile over CDP): self time by function over N seconds.
//   node tools/winchrome/frame-profile.mjs [spot=p9b-clear] [seconds=6]
import { connectWinChrome } from './connect.mjs';

const spot = process.argv[2] || 'p9b-clear', secs = Number(process.argv[3] || 6);
const { browser, close } = await connectWinChrome();
const ctx = await browser.newContext({ viewport: { width: 2560, height: 1440 } });
const page = await ctx.newPage();
await page.goto(`http://localhost:4173/?spot=${spot}&title=0&res=2560x1440&gfx=high`);
await page.waitForFunction(() => window.__wraith && (window.__wraith.ready || window.__wraith.error), null, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 4000));
const cdp = await ctx.newCDPSession(page);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
const frames = await page.evaluate((s) => new Promise((r) => { let n = 0; const t0 = performance.now(), d = []; let last = t0; const f = (t) => { d.push(t - last); last = t; n++; if (t - t0 > s * 1000) r({ n, median: d.sort((a, b) => a - b)[n >> 1] }); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), secs);
const { profile } = await cdp.send('Profiler.stop');
// A speed-up can be draws that failed: nothing else in this output would show it.
const gpuErrors = await page.evaluate(() => window.__wraith.gpuStats?.gpuErrors ?? 'unknown');
if (gpuErrors !== 0) console.log(`GPU ERRORS: ${gpuErrors}: these timings are not valid`);
const byId = new Map(profile.nodes.map((n) => [n.id, n])), self = new Map(); let total = 0;
for (let i = 0; i < profile.samples.length; i++) {
  const n = byId.get(profile.samples[i]), key = (n.callFrame.functionName || '(anon)') + ' ' + (n.callFrame.url || '').split('/').pop() + ':' + n.callFrame.lineNumber;
  self.set(key, (self.get(key) || 0) + profile.timeDeltas[i]); total += profile.timeDeltas[i];
}
console.log('frames', JSON.stringify(frames), 'ms/frame by function:');
console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 22).map(([k, v]) => (v / 1000 / frames.n).toFixed(2) + '  ' + k).join('\n'));
const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
for (const want of ['setArray', 'writeBuffer', '_copyBuffer', 'bind']) {
  const by = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    let n = byId.get(profile.samples[i]);
    if (n.callFrame.functionName !== want) continue;
    const chain = []; let id = n.id;
    for (let k = 0; k < 5 && parent.has(id); k++) { id = parent.get(id); const c = byId.get(id).callFrame; chain.push(c.functionName || 'anon'); }
    const key = chain.join(' < '); by.set(key, (by.get(key) || 0) + profile.timeDeltas[i]);
  }
  console.log('callers of', want); console.log([...by].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => '  ' + (v / 1000 / frames.n).toFixed(2) + ' ' + k).join('\n'));
}
const counts = await page.evaluate(() => { const g = window.__wraith.g, s = g.scene; const mats = s.materials; return { materials: mats.length, frozen: mats.filter((m) => m.isFrozen).length, meshes: s.meshes.length, active: s.getActiveMeshes().length, rtt: s.customRenderTargets.length, list: s.customRenderTargets.map((r) => (r.renderList || []).length), snapshot: g.engine.snapshotRendering, mode: g.engine.snapshotRenderingMode }; });
console.log(JSON.stringify(counts));
await ctx.close(); await close();
