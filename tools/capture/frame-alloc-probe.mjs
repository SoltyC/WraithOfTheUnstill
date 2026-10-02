// Diagnostic: drive the game's frame function synchronously inside the page (fast V8 warm-up),
// then sample allocations over 1000 frames with full source-mapped stacks.
//   node tools/capture/frame-alloc-probe.mjs [running|frozen]   (needs a prior build)
// Tiering differs from the rAF loop, so use heap-profile.mjs for gate numbers; this is for finding sites.
import { startServer, launchBrowser, openGame, ROOT } from './harness.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SourceMapConsumer } from 'source-map-js';
const s = await startServer({ skipBuild: true });
const b = await launchBrowser({});
const frozen = process.argv[2] === 'frozen';
const { page } = await openGame(b, s.url, 'grid=32', { width: 160, height: 90 });
await page.waitForTimeout(2500);
const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.enable');
// Drive the real frame function synchronously (stop rAF loop first).
const run = (n) => page.evaluate(([n, frozen]) => { const w = window.__wraith, g = w.game; g.engine.stopRenderLoop(); w.clock.frozen = frozen; for (let i = 0; i < n; i++) { g.engine.beginFrame(); g.loop._frame(); g.engine.endFrame(); } return w.clock.frame; }, [n, frozen]);
for (let k = 0; k < 10; k++) await run(1500);
await cdp.send('HeapProfiler.startSampling', { samplingInterval: 16, includeObjectsCollectedByMinorGC: true, includeObjectsCollectedByMajorGC: true });
await run(1000);
const { profile } = await cdp.send('HeapProfiler.stopSampling');
const parent = new Map(), byId = new Map();
(function walk(n, p) { byId.set(n.id, n); if (p) parent.set(n.id, p); for (const c of n.children) walk(c, n); })(profile.head, null);
const maps = new Map();
async function res(cf) { const m = /\/assets\/([^/?#]+\.js)/.exec(cf.url); if (!m) return cf.functionName + ':' + (cf.lineNumber + 1); if (!maps.has(m[1])) maps.set(m[1], new SourceMapConsumer(JSON.parse(await fs.readFile(path.join(ROOT, 'dist/assets', m[1] + '.map'), 'utf8')))); const p = maps.get(m[1]).originalPositionFor({ line: cf.lineNumber + 1, column: cf.columnNumber }); return (cf.functionName || '?') + ' ' + (p.source || '').replace(/^.*node_modules\//, '').replace(/^(\.\.\/)+/, '') + ':' + p.line; }
const agg = new Map(); let total = 0;
for (const smp of profile.samples) { total += smp.size; let n = byId.get(smp.nodeId), st = []; while (n && st.length < 5) { if (n.callFrame.functionName) st.push(await res(n.callFrame)); n = parent.get(n.id); } const k = st.join(' <- '); agg.set(k, (agg.get(k) || 0) + smp.size); }
console.log((frozen ? 'FROZEN clock' : 'running clock') + ': total', (total / 1000).toFixed(1), 'B/frame');
for (const [k, v] of [...agg].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log((v / 1000).toFixed(1).padStart(7), k.slice(0, 260));
await b.close(); await s.close();
