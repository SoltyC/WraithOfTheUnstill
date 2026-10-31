// The renderer main thread during a load (CPU profile over CDP): self time by function, and who calls the uploads.
//   node tools/winchrome/load-profile.mjs
import fs from 'node:fs';
import { connectWinChrome } from './connect.mjs';
const { browser, close } = await connectWinChrome();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 2000 });
await cdp.send('Profiler.start');
await page.goto('http://localhost:4173/?spot=p8-meadow-golden&title=0&gfx=high');
await page.waitForFunction(() => window.__wraith && (window.__wraith.ready || window.__wraith.error), null, { timeout: 180000 });
const { profile } = await cdp.send('Profiler.stop');
const lt = await page.evaluate(() => window.__wraith.loadTimes);
// Self time by function, only samples between frame1 and frame4 (timeDeltas are µs from startTime).
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const t0 = profile.startTime; let t = t0; const self = new Map(); let idle = 0, total = 0;
const nav = await page.evaluate(() => performance.timeOrigin);
for (let i = 0; i < profile.samples.length; i++) {
  t += profile.timeDeltas[i];
  const n = byId.get(profile.samples[i]); const name = n.callFrame.functionName || '(anon)';
  const url = (n.callFrame.url || '').split('/').pop();
  const key = name + ' ' + url + ':' + n.callFrame.lineNumber;
  self.set(key, (self.get(key) || 0) + profile.timeDeltas[i]);
  total += profile.timeDeltas[i]; if (name === '(idle)' || name === '(program)') idle += profile.timeDeltas[i];
}
console.log('loadTimes', JSON.stringify(lt));
console.log('total ms', (total / 1000) | 0, 'idle+program ms', (idle / 1000) | 0);
const callers = new Map(); const parentOf = new Map(); for (const n of profile.nodes) for (const c of (n.children || [])) parentOf.set(c, n.id);
let tt = 0; for (let i = 0; i < profile.samples.length; i++) { const n = byId.get(profile.samples[i]); if (n.callFrame.functionName !== 'setRawData') continue; let p = byId.get(parentOf.get(n.id)), chain = []; for (let d = 0; d < 4 && p; d++) { chain.push((p.callFrame.functionName || '(anon)') + ' ' + (p.callFrame.url || '').split('/').pop() + ':' + p.callFrame.lineNumber); p = byId.get(parentOf.get(p.id)); } const k = chain.join(' <- '); callers.set(k, (callers.get(k) || 0) + profile.timeDeltas[i]); }
console.log('setRawData callers:\n' + [...callers].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ((v / 1000) | 0) + ' ms  ' + k).join('\n'));
console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => ((v / 1000) | 0) + ' ms  ' + k).join('\n'));
await ctx.close(); await close();
