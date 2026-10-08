// Connect Playwright to the Windows Chrome (real GPU) from WSL through the broker.
// Chrome must be running headless with --remote-debugging-port (see launchWinChrome).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { startBroker } from './broker.mjs';

const CHROME = '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe';
export function launchWinChrome({ port = 9333, headed = false } = {}) {
  spawn(CHROME, [...(headed ? [] : ['--headless=new']), `--remote-debugging-port=${port}`, '--user-data-dir=C:\\Temp\\wraith-cdp',
    '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', 'about:blank'],
  { stdio: 'ignore', detached: true }).unref();
}
export async function connectWinChrome({ client = 9445, chrome = 9333 } = {}) {
  const broker = startBroker({ client, chrome });
  let info = null;
  for (let k = 0; k < 40 && !info; k++) {
    info = await fetch(`http://127.0.0.1:${client}/json/version`).then((r) => r.json()).catch(() => null);
    if (!info) { if (k === 0) launchWinChrome({ port: chrome }); await new Promise((r) => setTimeout(r, 500)); }
  }
  if (!info) throw new Error('Windows Chrome not reachable');
  const ws = info.webSocketDebuggerUrl.replace(/127\.0\.0\.1:\d+/, '127.0.0.1:' + client);
  const browser = await chromium.connectOverCDP(ws);
  return { browser, close: async () => { await browser.close().catch(() => {}); broker.close(); } };
}
