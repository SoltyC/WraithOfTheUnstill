import { startServer, launchBrowser, openGame } from './tools/capture/harness.mjs';
const s = await startServer({ skipBuild: true });
const b = await launchBrowser({});
const { page, logs } = await openGame(b, s.url, 'spot=p1-monastery-golden&capture=1', { width: 960, height: 540 });
const errs = logs.filter(l => /error|pageerror/i.test(l));
console.log(errs.length, 'errors'); console.log(errs.slice(0, 2).join('\n---\n').slice(0, 2500));
await page.screenshot({ path: '/tmp/claude-1000/-home-sol/c2a57822-8fd7-4c37-9e03-12729f07a8b3/scratchpad/atmo.png' });
await b.close(); await s.close();
