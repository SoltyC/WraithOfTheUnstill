// Shared Playwright harness: build + preview server, browser launch with WebGPU, game page.
//
// Browser selection:
//   default            Playwright's bundled Chromium headless shell (works anywhere; in WSL/CI
//                      this runs WebGPU on SwiftShader — images valid, timings NOT valid)
//   --channel=chrome   installed Google Chrome (use on the target Windows machine for perf)
//   --headed           headed window (real GPU path on Windows)

import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

export async function startServer({ skipBuild = false } = {}) {
  if (!skipBuild) await build({ root: ROOT, logLevel: 'warn' });
  const server = await preview({ root: ROOT, logLevel: 'warn', preview: { port: 4173, strictPort: false, host: '127.0.0.1' } });
  const url = server.resolvedUrls.local[0];
  return { url, close: () => new Promise((r) => server.httpServer.close(r)) };
}

/**
 * Extra shared libraries for the bundled Chromium on machines without root (e.g. this WSL box:
 * libgbm/libasound/libwayland-server unpacked from .debs). Set WRAITH_CHROME_LIBS or use the
 * default ~/.local/wraith-libs/root/usr/lib/x86_64-linux-gnu when it exists.
 */
function browserEnv() {
  const dir = process.env.WRAITH_CHROME_LIBS || path.join(os.homedir(), '.local/wraith-libs/root/usr/lib/x86_64-linux-gnu');
  if (process.platform !== 'linux' || !fs.existsSync(dir)) return undefined;
  return { ...process.env, LD_LIBRARY_PATH: dir + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '') };
}

/**
 * Headless Linux without a GPU: WebGPU must run on SwiftShader-Vulkan with ANGLE on SwiftShader,
 * otherwise the canvas has no SharedImage backing and getCurrentTexture() destroys the device
 * ("Could not find SharedImageBackingFactory ... Webgpu"). Found by flag sweep, 2026-10-02.
 */
const SWIFTSHADER_FLAGS = ['--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--disable-vulkan-surface', '--use-angle=swiftshader'];

export async function launchBrowser(args = {}) {
  const software = process.platform === 'linux' && !args.channel && !args['real-gpu'];
  return chromium.launch({
    env: browserEnv(),
    channel: args.channel || undefined,
    headless: !args.headed,
    args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info', (args.natives ? '--js-flags=--expose-gc --allow-natives-syntax' : '--js-flags=--expose-gc'), '--hide-scrollbars', ...(software ? SWIFTSHADER_FLAGS : [])],
  });
}

/** Open the game and wait until it reports ready (or captureReady in capture mode). */
export async function openGame(browser, baseUrl, query, { width = 2560, height = 1440, timeout = 3600000 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.goto(baseUrl + (query ? '?' + query : ''));
  const flag = query && query.includes('capture=1') ? 'captureReady' : 'ready';
  try {
    await page.waitForFunction((f) => (window.__wraith && (window.__wraith[f] || window.__wraith.error)), flag, { timeout, polling: 250 });
  } catch (e) {
    console.error(logs.join('\n'));
    throw e;
  }
  const err = await page.evaluate(() => window.__wraith.error);
  if (err) { console.error(logs.join('\n')); throw new Error('game failed to boot: ' + err); }
  return { page, context, logs };
}

export async function machineInfo(page) {
  return page.evaluate(() => ({ userAgent: navigator.userAgent, adapter: window.__wraith.gpuStats.adapterInfo || '(adapter info unavailable)' }));
}
